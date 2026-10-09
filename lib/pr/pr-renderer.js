/**
 * Render a pull-request context model as Markdown, XML or JSON.
 *
 * Sections follow the long-context layout: the long material (commit log, changed files,
 * methods, diff, tests, file contents) first and the request (instructions, question) last.
 * XML wraps file and method bodies in <documents><document index="n"><source>…</source>
 * <document_content>…</document_content></document></documents>. Bodies are left as they
 * are (not entity-escaped) so the model reads the code verbatim; the result is prompt
 * markup, not a document for an XML parser.
 */

import path from 'path';

export const SECTION_ORDER = [
  'summary',
  'commits',
  'files',
  'methods',
  'diff',
  'tests',
  'contents',
  'request',
];

export const SECTION_LABELS = {
  summary: 'summary',
  commits: 'commits',
  files: 'files',
  methods: 'methods',
  diff: 'diff',
  tests: 'tests',
  contents: 'file contents',
  request: 'request',
};

const STATUS_WORDS = {
  A: 'added',
  M: 'modified',
  D: 'deleted',
  R: 'renamed',
  C: 'copied',
  T: 'type changed',
  U: 'unmerged',
};

const FENCE_LANGUAGES = {
  '.js': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.jsx': 'jsx',
  '.ts': 'typescript',
  '.mts': 'typescript',
  '.cts': 'typescript',
  '.tsx': 'tsx',
  '.py': 'python',
  '.go': 'go',
  '.java': 'java',
  '.rb': 'ruby',
  '.php': 'php',
  '.rs': 'rust',
  '.cs': 'csharp',
  '.kt': 'kotlin',
  '.kts': 'kotlin',
  '.swift': 'swift',
  '.c': 'c',
  '.h': 'c',
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.hpp': 'cpp',
  '.scala': 'scala',
  '.json': 'json',
  '.yml': 'yaml',
  '.yaml': 'yaml',
  '.md': 'markdown',
  '.sh': 'bash',
  '.bash': 'bash',
  '.html': 'html',
  '.css': 'css',
  '.scss': 'scss',
  '.sql': 'sql',
  '.toml': 'toml',
  '.xml': 'xml',
};

const BUDGET_NOTE = 'omitted to fit the token budget';

/** Fence language for a path */
export function fenceLanguage(filePath) {
  return FENCE_LANGUAGES[path.extname(filePath).toLowerCase()] || '';
}

/** A Markdown code block whose fence is longer than any backtick run inside it */
function fence(content, language = '') {
  const longest = Math.max(2, ...(content.match(/`+/g) || []).map((run) => run.length));
  const ticks = '`'.repeat(longest + 1);
  return `${ticks}${language}\n${content.replace(/\n$/, '')}\n${ticks}`;
}

/** Inline code span that survives backticks in the text */
function code(text) {
  const value = String(text);
  if (!value.includes('`')) return `\`${value}\``;
  return `\`\` ${value} \`\``;
}

const escapeCell = (text) => String(text).replace(/\|/g, '\\|').replace(/\n/g, ' ');

const escapeAttr = (text) =>
  String(text)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '&#10;');

const formatNumber = (n) => Number(n).toLocaleString('en-US');

function statusWord(file) {
  let word = STATUS_WORDS[file.status] || file.status;
  if ((file.status === 'R' || file.status === 'C') && file.similarity != null) {
    word += ` (${file.similarity}%)`;
  }
  if (file.untracked) word += ' (untracked)';
  return word;
}

const lineRange = (item) =>
  item.start === item.end ? `${item.start}` : `${item.start}-${item.end}`;

/** "line 4" or "lines 4-9" */
const linesLabel = (item) =>
  item.start === item.end ? `line ${item.start}` : `lines ${item.start}-${item.end}`;

/** Plain-text summary facts shared by every style */
export function summaryFacts(model) {
  const { stats } = model;
  const facts = [];
  if (model.mode === 'range') {
    facts.push(['Base', `${model.base.ref} (${model.base.short})`]);
    facts.push(['Head', `${model.head.ref} (${model.head.short})`]);
    facts.push(['Merge base', model.mergeBase.short]);
  } else {
    const head =
      model.mode === 'staged'
        ? 'staged changes (index)'
        : 'working tree (uncommitted changes, untracked files included)';
    facts.push(['Base', `${model.base.ref} (${model.base.short})`]);
    if (model.mergeBase && model.mergeBase.sha !== model.base.sha) {
      facts.push(['Merge base', model.mergeBase.short]);
    }
    facts.push(['Head', head]);
  }
  if (model.scope) facts.push(['Scope', model.scope]);
  facts.push(['Commits', String(stats.commits)]);

  const byStatus = Object.entries(stats.byStatus)
    .map(([status, count]) => `${count} ${STATUS_WORDS[status] || status}`)
    .join(', ');
  facts.push([
    'Files changed',
    `${stats.files}${byStatus ? ` (${byStatus})` : ''}, +${formatNumber(stats.additions)} -${formatNumber(stats.deletions)} lines`,
  ]);
  if (stats.excluded > 0) {
    facts.push(['Excluded by context filters', `${stats.excluded} (listed, content omitted)`]);
  }
  facts.push([
    'Changed methods',
    `${stats.changedMethods} (${stats.addedMethods} added, ${stats.changedMethods - stats.addedMethods} modified); deleted methods: ${stats.deletedMethods}`,
  ]);
  facts.push(['Related tests', String(stats.relatedTests)]);
  if (model.impact) facts.push(['Impact (heuristic)', model.impact.level]);
  if (model.tokens) {
    const parts = SECTION_ORDER.filter((name) => model.tokens.sections[name] != null).map(
      (name) => `${SECTION_LABELS[name]} ${formatNumber(model.tokens.sections[name])}`
    );
    facts.push(['Tokens', `~${formatNumber(model.tokens.total)} total; ${parts.join(', ')}`]);
  }
  if (!model.diffEnabled) facts.push(['Diff', 'not included (--no-diff)']);
  if (model.budget) {
    const dropped = model.budget.dropped.length
      ? `; dropped: ${model.budget.dropped.join('; ')}`
      : '';
    const over = model.budget.over ? ' (still over: the required sections alone exceed it)' : '';
    facts.push(['Budget', `${formatNumber(model.budget.limit)} tokens${over}${dropped}`]);
  }
  return facts;
}

// ---------------------------------------------------------------------------
// Markdown
// ---------------------------------------------------------------------------

const markdown = {
  summary(model) {
    const title =
      model.mode === 'range'
        ? `# Pull request context: ${code(model.head.ref)} into ${code(model.base.ref)}`
        : `# Change context: ${model.mode === 'staged' ? 'staged' : 'uncommitted'} changes`;
    const lines = summaryFacts(model).map(([key, value]) => `- ${key}: ${value}`);
    return `${title}\n\n## Summary\n\n${lines.join('\n')}`;
  },

  commit(commit, model) {
    let text = `### ${code(commit.short)} ${commit.subject}\n${commit.author}, ${commit.date}`;
    if (commit.body && !model.logBodiesDropped) {
      text += `\n\n${commit.body
        .split('\n')
        .map((line) => (line ? `> ${line}` : '>'))
        .join('\n')}`;
    }
    return text;
  },

  commits(model) {
    if (model.commits.length === 0 || model.logDropped) return null;
    const body = model.commits.map((commit) => markdown.commit(commit, model)).join('\n\n');
    return `## Commits (${model.commits.length})\n\n${body}`;
  },

  files(model) {
    if (model.filesDropped) return null;
    const head = `## Changed files (${model.files.length})`;
    if (model.files.length === 0) return `${head}\n\nNo changes.`;
    const rows = model.files.map((file) => {
      const name =
        file.oldPath && file.oldPath !== file.path && (file.status === 'R' || file.status === 'C')
          ? `${code(file.oldPath)} → ${code(file.path)}`
          : code(file.path);
      const note = file.excluded ? ` (content excluded by ${file.excluded})` : '';
      const added = file.binary ? 'binary' : file.additions;
      const deleted = file.binary ? '' : file.deletions;
      return `| ${statusWord(file)} | ${escapeCell(name + note)} | ${added} | ${deleted} |`;
    });
    return `${head}\n\n| Status | File | + | - |\n| --- | --- | ---: | ---: |\n${rows.join('\n')}`;
  },

  methodLabel(method) {
    return `${code(method.file)}: ${code(method.name)} (${linesLabel(method)}, ${method.change})`;
  },

  method(method) {
    return `### ${markdown.methodLabel(method)}\n\n${fence(method.source, fenceLanguage(method.file))}`;
  },

  methods(model) {
    if (model.methodsDropped) return null;
    if (model.methods.length === 0 && model.deletedMethods.length === 0) return null;
    const parts = [`## Changed methods (${model.methods.length})`];
    const withSource = model.methods.filter((m) => !m.sourceDropped);
    const withoutSource = model.methods.filter((m) => m.sourceDropped);
    if (withSource.length) parts.push(withSource.map(markdown.method).join('\n\n'));
    if (withoutSource.length) {
      const list = withoutSource.map((m) => `- ${markdown.methodLabel(m)}`).join('\n');
      parts.push(`### Changed methods, source ${BUDGET_NOTE}\n\n${list}`);
    }
    if (model.deletedMethods.length) {
      const list = model.deletedMethods
        .map((m) => `- ${code(m.file)}: ${code(m.name)} (${linesLabel(m)} at base)`)
        .join('\n');
      parts.push(`### Deleted methods (${model.deletedMethods.length})\n\n${list}`);
    }
    return parts.join('\n\n');
  },

  diff(model) {
    if (!model.diffEnabled) return null;
    const shown = model.diffs.filter((d) => !d.dropped);
    const excluded = model.files
      .filter((f) => f.excluded)
      .map((f) => `${code(f.path)} (${f.excluded})`);
    if (shown.length === 0 && excluded.length === 0) return null;
    const parts = ['## Diff'];
    if (shown.length) parts.push(fence(shown.map((d) => d.text).join('\n'), 'diff'));
    if (excluded.length) parts.push(`_Excluded by context filters: ${excluded.join(', ')}._`);
    return parts.join('\n\n');
  },

  testLine(test) {
    const note = test.excluded ? ` (content excluded by ${test.excluded})` : '';
    return `- ${code(test.path)}: ${test.reasons.join('; ')}${note}`;
  },

  testContent(test) {
    return `### ${code(test.path)}\n\n${fence(test.content, fenceLanguage(test.path))}`;
  },

  tests(model) {
    const listed = model.tests.filter((t) => !t.dropped);
    if (listed.length === 0) return null;
    const parts = [`## Related tests (${listed.length})`, listed.map(markdown.testLine).join('\n')];
    if (model.withTests) {
      parts.push(...listed.filter(hasTestContent).map(markdown.testContent));
    }
    return parts.join('\n\n');
  },

  content(item) {
    return `### ${code(item.path)}\n\n${fence(item.content, fenceLanguage(item.path))}`;
  },

  contents(model) {
    if (!model.withFiles) return null;
    const shown = model.contents.filter(hasContent);
    const notes = model.contents.filter((c) => c.note).map((c) => `${code(c.path)} (${c.note})`);
    if (shown.length === 0 && notes.length === 0) return null;
    const parts = [`## Changed file contents (${shown.length})`, ...shown.map(markdown.content)];
    if (notes.length) parts.push(`_Not included: ${notes.join(', ')}._`);
    return parts.join('\n\n');
  },

  request(model) {
    const parts = [];
    if (model.instructions) parts.push(`## Instructions\n\n${model.instructions.trim()}`);
    if (model.ask) parts.push(`## Question\n\n${model.ask.trim()}`);
    return parts.length ? parts.join('\n\n') : null;
  },
};

const hasContent = (item) => typeof item.content === 'string' && !item.dropped;
const hasTestContent = (test) => typeof test.content === 'string' && !test.contentDropped;

// ---------------------------------------------------------------------------
// XML
// ---------------------------------------------------------------------------

/** XML renderer with a running document index, unique across the whole output */
function createXml() {
  let index = 0;
  const document = (source, content) =>
    `<document index="${++index}">\n<source>${source}</source>\n<document_content>\n${content.replace(/\n$/, '')}\n</document_content>\n</document>`;
  const documents = (docs) => `<documents>\n${docs.join('\n')}\n</documents>`;
  const methodAttrs = (m) =>
    `file="${escapeAttr(m.file)}" name="${escapeAttr(m.name)}" lines="${lineRange(m)}" change="${m.change}"`;

  const xml = {
    summary(model) {
      const lines = summaryFacts(model).map(([key, value]) => `${key}: ${value}`);
      return `<summary>\n${lines.join('\n')}\n</summary>`;
    },

    commit(commit, model) {
      const body = commit.body && !model.logBodiesDropped ? `\n\n${commit.body}` : '';
      return `<commit sha="${commit.short}" author="${escapeAttr(commit.author)}" date="${commit.date}">\n${commit.subject}${body}\n</commit>`;
    },

    commits(model) {
      if (model.commits.length === 0 || model.logDropped) return null;
      const list = model.commits.map((c) => xml.commit(c, model)).join('\n');
      return `<commits count="${model.commits.length}">\n${list}\n</commits>`;
    },

    files(model) {
      if (model.filesDropped) return null;
      const rows = model.files.map((file) => {
        const attrs = [
          `status="${escapeAttr(statusWord(file))}"`,
          `path="${escapeAttr(file.path)}"`,
        ];
        if (file.oldPath && file.oldPath !== file.path) {
          attrs.push(`old_path="${escapeAttr(file.oldPath)}"`);
        }
        if (file.binary) attrs.push('binary="true"');
        else attrs.push(`additions="${file.additions}"`, `deletions="${file.deletions}"`);
        if (file.excluded) attrs.push(`content_excluded_by="${escapeAttr(file.excluded)}"`);
        return `<file ${attrs.join(' ')}/>`;
      });
      return `<changed_files count="${model.files.length}">\n${rows.join('\n')}\n</changed_files>`;
    },

    method(method) {
      const source = `${method.file}:${lineRange(method)} (${method.name}, ${method.change})`;
      return document(escapeAttr(source), method.source);
    },

    methods(model) {
      if (model.methodsDropped) return null;
      if (model.methods.length === 0 && model.deletedMethods.length === 0) return null;
      const parts = [`<changed_methods count="${model.methods.length}">`];
      const withSource = model.methods.filter((m) => !m.sourceDropped);
      const withoutSource = model.methods.filter((m) => m.sourceDropped);
      if (withSource.length) parts.push(documents(withSource.map(xml.method)));
      for (const method of withoutSource) {
        parts.push(`<method ${methodAttrs(method)} source="${BUDGET_NOTE}"/>`);
      }
      if (model.deletedMethods.length) {
        const rows = model.deletedMethods.map(
          (m) =>
            `<method file="${escapeAttr(m.file)}" name="${escapeAttr(m.name)}" base_lines="${lineRange(m)}"/>`
        );
        parts.push(
          `<deleted_methods count="${rows.length}">\n${rows.join('\n')}\n</deleted_methods>`
        );
      }
      parts.push('</changed_methods>');
      return parts.join('\n');
    },

    diff(model) {
      if (!model.diffEnabled) return null;
      const shown = model.diffs.filter((d) => !d.dropped);
      const excluded = model.files
        .filter((f) => f.excluded)
        .map((f) => `<excluded path="${escapeAttr(f.path)}" by="${escapeAttr(f.excluded)}"/>`);
      if (shown.length === 0 && excluded.length === 0) return null;
      const parts = ['<diff>'];
      if (shown.length) parts.push(shown.map((d) => d.text).join('\n'));
      parts.push(...excluded, '</diff>');
      return parts.join('\n');
    },

    testLine(test) {
      const excluded = test.excluded ? ` content_excluded_by="${escapeAttr(test.excluded)}"` : '';
      return `<test path="${escapeAttr(test.path)}" reasons="${escapeAttr(test.reasons.join('; '))}"${excluded}/>`;
    },

    testContent(test) {
      return document(escapeAttr(test.path), test.content);
    },

    tests(model) {
      const listed = model.tests.filter((t) => !t.dropped);
      if (listed.length === 0) return null;
      const parts = [`<related_tests count="${listed.length}">`, ...listed.map(xml.testLine)];
      const docs = model.withTests ? listed.filter(hasTestContent).map(xml.testContent) : [];
      if (docs.length) parts.push(documents(docs));
      parts.push('</related_tests>');
      return parts.join('\n');
    },

    content(item) {
      return document(escapeAttr(item.path), item.content);
    },

    contents(model) {
      if (!model.withFiles) return null;
      const shown = model.contents.filter(hasContent);
      const notes = model.contents
        .filter((c) => c.note)
        .map((c) => `<omitted path="${escapeAttr(c.path)}" reason="${escapeAttr(c.note)}"/>`);
      if (shown.length === 0 && notes.length === 0) return null;
      const parts = ['<changed_file_contents>'];
      if (shown.length) parts.push(documents(shown.map(xml.content)));
      parts.push(...notes, '</changed_file_contents>');
      return parts.join('\n');
    },

    request(model) {
      const parts = [];
      if (model.instructions) {
        parts.push(`<instructions>\n${model.instructions.trim()}\n</instructions>`);
      }
      if (model.ask) parts.push(`<question>\n${model.ask.trim()}\n</question>`);
      return parts.length ? parts.join('\n\n') : null;
    },
  };
  return xml;
}

// ---------------------------------------------------------------------------
// JSON
// ---------------------------------------------------------------------------

const json = {
  summary(model) {
    const summary = {
      mode: model.mode,
      base: model.base,
      head: model.head,
      mergeBase: model.mergeBase,
      scope: model.scope || null,
      stats: model.stats,
      impact: model.impact,
      diff: model.diffEnabled,
    };
    if (model.tokens) summary.tokens = model.tokens;
    if (model.budget) summary.budget = model.budget;
    return summary;
  },

  commit(commit, model) {
    const { sha, short, author, date, subject, body } = commit;
    return model.logBodiesDropped
      ? { sha, short, author, date, subject }
      : { sha, short, author, date, subject, body };
  },

  commits(model) {
    if (model.commits.length === 0 || model.logDropped) return null;
    return model.commits.map((commit) => json.commit(commit, model));
  },

  files(model) {
    if (model.filesDropped) return null;
    return model.files.map((file) => ({
      status: file.status,
      path: file.path,
      oldPath: file.oldPath,
      similarity: file.similarity,
      additions: file.additions,
      deletions: file.deletions,
      binary: file.binary,
      untracked: file.untracked || undefined,
      contentExcludedBy: file.excluded || undefined,
    }));
  },

  method(method) {
    const { file, name, start, end, change, changedLines } = method;
    return {
      file,
      name,
      start,
      end,
      change,
      changedLines,
      source: method.sourceDropped ? null : method.source,
    };
  },

  methods(model) {
    if (model.methodsDropped) return null;
    if (model.methods.length === 0 && model.deletedMethods.length === 0) return null;
    return {
      changed: model.methods.map(json.method),
      deleted: model.deletedMethods.map(({ file, name, start, end }) => ({
        file,
        name,
        start,
        end,
      })),
    };
  },

  diff(model) {
    if (!model.diffEnabled) return null;
    const files = [
      ...model.diffs.filter((d) => !d.dropped).map((d) => ({ path: d.path, diff: d.text })),
      ...model.files
        .filter((f) => f.excluded)
        .map((f) => ({ path: f.path, contentExcludedBy: f.excluded })),
    ];
    return files.length ? files : null;
  },

  testLine(test) {
    const entry = { path: test.path, reasons: test.reasons, changed: test.changed };
    if (test.excluded) entry.contentExcludedBy = test.excluded;
    return entry;
  },

  testContent(test) {
    return { path: test.path, content: test.content };
  },

  tests(model) {
    const listed = model.tests.filter((t) => !t.dropped);
    if (listed.length === 0) return null;
    return listed.map((test) => {
      const entry = json.testLine(test);
      if (model.withTests && hasTestContent(test)) entry.content = test.content;
      return entry;
    });
  },

  content(item) {
    return { path: item.path, content: item.content };
  },

  contents(model) {
    if (!model.withFiles) return null;
    const list = model.contents
      .filter((item) => hasContent(item) || item.note)
      .map((item) => (item.note ? { path: item.path, omitted: item.note } : json.content(item)));
    return list.length ? list : null;
  },

  request(model) {
    if (!model.instructions && !model.ask) return null;
    return { instructions: model.instructions || null, question: model.ask || null };
  },
};

const JSON_KEYS = {
  summary: 'summary',
  commits: 'commits',
  files: 'files',
  methods: 'methods',
  diff: 'diff',
  tests: 'relatedTests',
  contents: 'fileContents',
  request: 'request',
};

/**
 * Render every section
 * @param {object} model
 * @param {'markdown'|'xml'|'json'} style
 * @returns {{output: string, sections: Object<string, string>}} The output and each
 *   non-empty section's text (JSON: the section value serialized on its own)
 */
export function renderPrContext(model, style) {
  if (style === 'json') {
    const object = {};
    const sections = {};
    for (const name of SECTION_ORDER) {
      const value = json[name](model);
      if (value == null) continue;
      object[JSON_KEYS[name]] = value;
      sections[name] = JSON.stringify(value, null, 2);
    }
    return { output: `${JSON.stringify(object, null, 2)}\n`, sections };
  }

  const renderer = style === 'xml' ? createXml() : markdown;
  const sections = {};
  for (const name of SECTION_ORDER) {
    const text = renderer[name](model);
    if (text) sections[name] = text;
  }
  const body = SECTION_ORDER.filter((name) => sections[name])
    .map((name) => sections[name])
    .join('\n\n');
  const output = style === 'xml' ? `<pr_context>\n${body}\n</pr_context>\n` : `${body}\n`;
  return { output, sections };
}

/**
 * Text one item contributes to the output, for estimating what dropping it saves
 * @param {'content'|'testContent'|'testLine'|'method'|'commit'} kind
 * @param {object} item
 * @param {object} model
 * @param {'markdown'|'xml'|'json'} style
 * @returns {string}
 */
export function renderItem(kind, item, model, style) {
  if (style === 'json') return JSON.stringify(json[kind](item, model), null, 2);
  const renderer = style === 'xml' ? createXml() : markdown;
  return renderer[kind](item, model);
}

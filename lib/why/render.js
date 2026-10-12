/**
 * Output of `ctxman why`: Markdown (default, for pasting into an LLM), XML and JSON, and
 * fitting the document into a token budget by dropping the least useful material first
 */

import path from 'path';
import TokenUtils from '../utils/token-utils.js';
import { WhyError } from './errors.js';

export const STYLES = ['markdown', 'xml', 'json'];

/** Sections a budget can shorten */
export const DROP_ORDER = [
  'patches',
  'related',
  'tests',
  'coupling',
  'commits',
  'references',
  'notes',
  'ownership',
  'source',
];

/**
 * What a budget drops, first to last, as [section, items kept at least]. The first five
 * steps follow the documented priority (patches, related text, tests, coupling details,
 * older commits, keeping the newest one); the rest only run when the budget is smaller
 * than the core of the document
 */
const DROP_STEPS = [
  ['patches', 0],
  ['related', 0],
  ['tests', 0],
  ['coupling', 0],
  ['commits', 1],
  ['references', 0],
  ['notes', 0],
  ['ownership', 0],
  ['source', 0],
  ['commits', 0],
];

const OMITTED_LABELS = {
  patches: 'patches',
  related: 'related text snippets',
  tests: 'test files',
  coupling: 'co-changed files',
  commits: 'commits',
  references: 'references',
  notes: 'notes',
  ownership: 'blame authors',
  source: 'source lines',
};

const LANGUAGES = {
  '.js': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.jsx': 'jsx',
  '.ts': 'typescript',
  '.tsx': 'tsx',
  '.py': 'python',
  '.rb': 'ruby',
  '.rs': 'rust',
  '.go': 'go',
  '.java': 'java',
  '.kt': 'kotlin',
  '.kts': 'kotlin',
  '.cs': 'csharp',
  '.c': 'c',
  '.h': 'c',
  '.cc': 'cpp',
  '.cpp': 'cpp',
  '.hpp': 'cpp',
  '.swift': 'swift',
  '.scala': 'scala',
  '.php': 'php',
  '.md': 'markdown',
  '.yml': 'yaml',
  '.yaml': 'yaml',
  '.json': 'json',
  '.sh': 'bash',
  '.sql': 'sql',
};

/**
 * Flattened reference list, highest value first
 */
function flattenReferences(references) {
  return [
    ...references.issues.map((entry) => ({ type: 'issue', ...entry })),
    ...references.tickets.map((entry) => ({ type: 'ticket', ...entry })),
    ...references.cves.map((entry) => ({ type: 'cve', ...entry })),
    ...references.urls.map((entry) => ({ type: 'url', ...entry })),
    ...references.coAuthors.map((entry) => ({ type: 'co-author', ...entry })),
    ...references.reviewers.map((entry) => ({ type: 'reviewer', ...entry })),
  ];
}

/**
 * Number of droppable items per DROP_ORDER key
 * @param {object} data
 * @returns {Record<string, number>}
 */
export function countItems(data) {
  return {
    patches: data.history.commits.filter((commit) => commit.patch).length,
    related: data.related.length,
    tests: data.tests.length,
    coupling: data.coupling?.files.length ?? 0,
    commits: data.history.commits.length,
    references: flattenReferences(data.references).length,
    notes: data.notes.length,
    ownership: data.ownership?.authors.length ?? 0,
    source: data.target.source === null ? 0 : data.target.source.split('\n').length,
  };
}

/**
 * Copy of `data` with only the first `view[key]` items of each section
 * @param {object} data
 * @param {Record<string, number>} view
 * @returns {object}
 */
export function applyView(data, view) {
  const totals = countItems(data);
  const omitted = {};
  for (const key of DROP_ORDER) {
    if (view[key] < totals[key]) omitted[key] = totals[key] - view[key];
  }

  let patchesKept = 0;
  const commits = data.history.commits.slice(0, view.commits).map((commit) => {
    if (!commit.patch) return commit;
    const { patch, ...rest } = commit;
    return patchesKept++ < view.patches ? { ...rest, patch } : rest;
  });

  const kept = flattenReferences(data.references).slice(0, view.references);
  const pick = (type) =>
    kept.filter((entry) => entry.type === type).map(({ type: _type, ...entry }) => entry);
  const references = {
    issues: pick('issue'),
    tickets: pick('ticket'),
    cves: pick('cve'),
    urls: pick('url'),
    coAuthors: pick('co-author'),
    reviewers: pick('reviewer'),
  };

  let target = data.target;
  if (target.source !== null && view.source < totals.source) {
    target =
      view.source === 0
        ? { ...target, source: null, contentOmitted: 'omitted to fit the token budget' }
        : { ...target, source: target.source.split('\n').slice(0, view.source).join('\n') };
  }

  return {
    ...data,
    target,
    history: { ...data.history, commits },
    references,
    ownership: data.ownership && {
      ...data.ownership,
      authors: data.ownership.authors.slice(0, view.ownership),
    },
    coupling: data.coupling && {
      ...data.coupling,
      files: data.coupling.files.slice(0, view.coupling),
    },
    related: data.related.slice(0, view.related),
    notes: data.notes.slice(0, view.notes),
    tests: data.tests.slice(0, view.tests),
    omitted,
  };
}

/**
 * Render a (trimmed) document
 * @param {object} data - Output of applyView
 * @param {string} style - markdown | xml | json
 * @param {number|null} budget
 * @returns {string}
 */
export function render(data, style, budget = null) {
  if (style === 'json') return renderJson(data, budget);
  if (style === 'xml') return renderXml(data, budget);
  return renderMarkdown(data, budget);
}

/**
 * Render `data`, dropping material in DROP_ORDER until the text fits `budget` tokens
 * @param {object} data
 * @param {object} options
 * @param {string} options.style
 * @param {number|null} options.budget
 * @returns {{text: string, tokens: number, omitted: Record<string, number>}}
 */
export function renderWithinBudget(data, { style, budget }) {
  const fileName = `why.${style === 'markdown' ? 'md' : style}`;
  const count = (text) => TokenUtils.calculate(text, fileName);
  const totals = countItems(data);
  const attempt = (view) => {
    const trimmed = applyView(data, view);
    const text = render(trimmed, style, budget);
    return { text, tokens: count(text), omitted: trimmed.omitted };
  };

  let view = { ...totals };
  let result = attempt(view);
  if (!budget || result.tokens <= budget) return result;

  for (const [key, floor] of DROP_STEPS) {
    if (view[key] <= floor) continue;
    const without = attempt({ ...view, [key]: floor });
    if (without.tokens > budget) {
      view = { ...view, [key]: floor };
      result = without;
      continue;
    }
    // Largest number of items of this kind that still fits
    let low = floor;
    let high = view[key] - 1;
    let best = without;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      const candidate = attempt({ ...view, [key]: middle });
      if (candidate.tokens <= budget) {
        low = middle;
        best = candidate;
      } else {
        high = middle - 1;
      }
    }
    return best;
  }

  throw new WhyError(
    'BUDGET_TOO_SMALL',
    `--budget ${budget} is too small: the target summary alone needs ${result.tokens} tokens`,
    { minimum: result.tokens }
  );
}

// ---------------------------------------------------------------------------
// Markdown
// ---------------------------------------------------------------------------

function fence(text, language = '') {
  const longest = Math.max(0, ...[...text.matchAll(/`+/g)].map((match) => match[0].length));
  const marks = '`'.repeat(Math.max(3, longest + 1));
  return `${marks}${language}\n${text}\n${marks}`;
}

function code(text) {
  const value = String(text);
  const longest = Math.max(0, ...[...value.matchAll(/`+/g)].map((match) => match[0].length));
  const marks = '`'.repeat(longest + 1);
  const pad = value.startsWith('`') || value.endsWith('`') ? ' ' : '';
  return `${marks}${pad}${value}${pad}${marks}`;
}

const lineSpan = (start, end) => (start === end ? `line ${start}` : `lines ${start}-${end}`);
const day = (iso) => (iso ? iso.slice(0, 10) : 'unknown');
const percent = (share) => `${Math.round(share * 100)}%`;

function title(target) {
  if (target.symbol) return `${code(target.symbol)} in ${code(target.path)}`;
  if (target.wholeFile) return code(target.path);
  return `${code(target.path)} ${lineSpan(target.startLine, target.endLine)}`;
}

function omittedSummary(omitted) {
  return Object.entries(omitted)
    .map(([key, value]) => `${value} ${OMITTED_LABELS[key]}`)
    .join(', ');
}

function historyDescription(history) {
  switch (history.mode) {
    case 'range':
      return `that changed ${lineSpan(history.startLine, history.endLine)} (\`git log -L\`)`;
    case 'funcname':
      return `that changed the function (\`git log -L :${history.funcname}\`)`;
    case 'file':
      return 'that changed the file, following renames (`git log --follow`)';
    default:
      return '';
  }
}

function renderMarkdown(data, budget) {
  const out = [`# Why: ${title(data.target)}`, ''];
  out.push(
    'Context for explaining why this code looks the way it does, collected by `ctxman why` from the local git history and the repository (no network).',
    ''
  );
  for (const warning of data.warnings) out.push(`> **Warning:** ${warning}`);
  if (data.warnings.length) out.push('');
  if (Object.keys(data.omitted).length) {
    out.push(`> Trimmed to fit ${budget} tokens: omitted ${omittedSummary(data.omitted)}.`, '');
  }

  for (const section of [
    markdownTarget,
    markdownHistory,
    markdownReferences,
    markdownOwnership,
    markdownCoupling,
    markdownRelated,
    markdownNotes,
    markdownTests,
    markdownQuestion,
  ]) {
    const lines = section(data);
    if (lines.length) out.push(...lines, '');
  }
  return out.join('\n');
}

function markdownTarget({ target, repository, omitted }) {
  const out = ['## Target', '', `- File: ${code(target.path)}`];
  if (target.symbol) {
    const line = target.line ? `, declared on line ${target.line}` : '';
    out.push(`- Symbol: ${code(target.symbol)} (${target.kind}${line})`);
  }
  if (target.binary) out.push('- Content: binary file');
  else if (target.wholeFile) {
    out.push(
      `- Lines: whole file (${target.totalLines} line${target.totalLines === 1 ? '' : 's'})`
    );
  } else if (target.startLine === target.endLine && target.startLine !== null) {
    out.push(`- Line: ${target.startLine} of ${target.totalLines}`);
  } else if (target.startLine !== null) {
    out.push(`- Lines: ${target.startLine}-${target.endLine} of ${target.totalLines}`);
  }
  if (target.symbolsInRange.length) {
    out.push(`- Definitions in range: ${target.symbolsInRange.map(code).join(', ')}`);
  }
  out.push(`- Revision: ${target.revision}`);
  if (repository.remote) out.push(`- Repository: ${repository.remote}`);
  if (target.contentOmitted) out.push(`- Source: not shown (${target.contentOmitted})`);
  if (target.source !== null) {
    out.push('', fence(target.source, LANGUAGES[path.extname(target.path).toLowerCase()] ?? ''));
    if (omitted.source)
      out.push(`_${omitted.source} more lines not shown to fit the token budget._`);
  }
  return out;
}

function markdownHistory({ history, omitted }) {
  const out = ['## History', ''];
  if (history.mode === 'none') return [...out, `No committed history: ${history.reason}.`];

  const total = history.commits.length + (omitted.commits ?? 0);
  const since = history.since ? ` since ${history.since}` : '';
  const more = history.limitReached
    ? ` Showing the newest ${history.limit}; older commits exist (raise --limit).`
    : '';
  out.push(
    `${total} commit${total === 1 ? '' : 's'}${since} ${historyDescription(history)}, newest first.${more}`
  );
  history.commits.forEach((commit, index) => {
    out.push('', `### ${index + 1}. ${commit.subject || '(no subject)'}`, '');
    const meta = [code(commit.shortSha), day(commit.date), commit.author];
    if (commit.merge) meta.push('merge');
    if (commit.shallowBoundary) {
      meta.push(
        'shallow clone boundary: older history is missing, so it looks like it added the code'
      );
    }
    if (commit.refs?.length) meta.push(`refs: ${commit.refs.join(', ')}`);
    out.push(meta.join(' · '));
    if (commit.body) {
      out.push('', commit.body.replace(/^/gm, '> ').replace(/^> $/gm, '>'));
    }
    if (commit.patch) out.push('', fence(commit.patch, 'diff'));
  });
  if (omitted.commits) {
    out.push('', `_${omitted.commits} older commits not shown to fit the token budget._`);
  }
  return out;
}

function markdownReferences({ references, history, omitted }) {
  const entries = flattenReferences(references);
  // Nothing to say without commits, or when the budget dropped every reference
  if (!entries.length && (omitted.references || !history.commits.length)) return [];
  const out = ['## References', ''];
  if (!entries.length) {
    return [...out, 'No issue, pull request, ticket or URL references in these commits.'];
  }
  for (const entry of entries) {
    const where = `(${entry.commits.join(', ')})`;
    if (entry.type === 'issue') {
      const label = { pr: 'Pull request', mr: 'Merge request' }[entry.kind] ?? 'Issue';
      const closes = entry.closes ? ' (fixes / closes)' : '';
      out.push(`- ${label} ${entry.id}${closes}${entry.url ? `: ${entry.url}` : ''} ${where}`);
    } else if (entry.type === 'ticket') out.push(`- Ticket ${entry.id} ${where}`);
    else if (entry.type === 'cve') out.push(`- ${entry.id} ${where}`);
    else if (entry.type === 'url') out.push(`- URL ${entry.url} ${where}`);
    else if (entry.type === 'co-author') out.push(`- Co-authored-by: ${entry.value} ${where}`);
    else out.push(`- Reviewed-by: ${entry.value} ${where}`);
  }
  return out;
}

function markdownOwnership({ ownership, omitted }) {
  if (!ownership || !ownership.authors.length) return [];
  const scope =
    ownership.startLine === null
      ? 'the whole file'
      : lineSpan(ownership.startLine, ownership.endLine);
  const out = [
    '## Ownership',
    '',
    `\`git blame\` of ${scope} (${ownership.totalLines} lines), last changed ${day(ownership.lastChanged)}:`,
    '',
    '| Author | Lines | Share | Commits | Last touched |',
    '|---|---:|---:|---:|---|',
  ];
  for (const author of ownership.authors) {
    const name = author.name.replace(/\|/g, '\\|');
    out.push(
      `| ${name} | ${author.lines} | ${percent(author.share)} | ${author.commits} | ${day(author.lastTouched)} |`
    );
  }
  if (omitted.ownership) out.push(`| … ${omitted.ownership} more | | | | |`);
  return out;
}

function markdownCoupling({ coupling, target, omitted }) {
  if (!coupling || (!coupling.files.length && omitted.coupling)) return [];
  const skipped = coupling.skippedLargeCommits
    ? ` (${coupling.skippedLargeCommits} commit${coupling.skippedLargeCommits === 1 ? '' : 's'} with more than ${coupling.maxFilesPerCommit} files skipped)`
    : '';
  const out = [
    '## Co-change coupling',
    '',
    `Commits that changed ${code(target.path)}: ${coupling.targetChanges} examined (window: the last ${coupling.window})${skipped}.`,
  ];
  if (!coupling.files.length) return [...out, 'No other file changed in the same commits.'];
  out.push(
    'Files changed in the same commits (confidence = co-changes / changes of the target):',
    '',
    '| File | Co-changes | Confidence |',
    '|---|---:|---:|'
  );
  for (const file of coupling.files) {
    const gone = file.exists === false ? ' (no longer in the tree)' : '';
    out.push(`| ${code(file.path)}${gone} | ${file.count} | ${percent(file.confidence)} |`);
  }
  if (omitted.coupling) out.push(`| … ${omitted.coupling} more | | |`);
  return out;
}

function markdownRelated({ related }) {
  if (!related.length) return [];
  const labels = { adr: 'ADR', changelog: 'changelog', doc: 'doc', comment: 'comment' };
  return [
    '## Related text',
    '',
    ...related.map((entry) => {
      const heading = entry.heading ? `, "${entry.heading}"` : '';
      const where = code(`${entry.path}:${entry.line}`);
      return `- ${where} (${labels[entry.kind]}${heading}): ${entry.snippet}`;
    }),
  ];
}

function markdownNotes({ notes }) {
  if (!notes.length) return [];
  return [
    '## Notes in the target',
    '',
    ...notes.map(
      (note) =>
        `- Line ${note.line} ${note.tag}${note.author ? ` (${note.author})` : ''}: ${note.text}`
    ),
  ];
}

function markdownTests({ tests }) {
  if (!tests.length) return [];
  const out = ['## Tests', ''];
  for (const test of tests) {
    const what = test.references === 'symbol' ? 'references the symbol' : 'references the file';
    const count = `${test.totalMatches} matching line${test.totalMatches === 1 ? '' : 's'}`;
    out.push(`- ${code(test.path)} (${what}; ${count})`);
    for (const match of test.matches) out.push(`  - ${match.line}: ${code(match.text)}`);
  }
  return out;
}

function markdownQuestion({ question }) {
  if (!question) return [];
  return [
    '## Question',
    '',
    question,
    '',
    'Answer from the context above. Cite the commit hashes, references and file paths that support the answer, and say so when the history does not explain something.',
  ];
}

// ---------------------------------------------------------------------------
// XML
// ---------------------------------------------------------------------------

function xml(text) {
  return String(text)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function attributes(values) {
  return Object.entries(values)
    .filter(
      ([, value]) =>
        value !== null &&
        value !== undefined &&
        value !== '' &&
        !(Array.isArray(value) && value.length === 0)
    )
    .map(([key, value]) => ` ${key}="${xml(Array.isArray(value) ? value.join(' ') : value)}"`)
    .join('');
}

function renderXml(data, budget) {
  const { target, history } = data;
  const out = ['<why_context generator="ctxman why">'];
  if (Object.keys(data.omitted).length) {
    out.push(`<trimmed${attributes({ budget, ...data.omitted })}/>`);
  }
  for (const warning of data.warnings) out.push(`<warning>${xml(warning)}</warning>`);

  out.push(
    `<target${attributes({
      path: target.path,
      symbol: target.symbol,
      kind: target.kind,
      declaration_line: target.line,
      start_line: target.startLine,
      end_line: target.endLine,
      total_lines: target.totalLines,
      whole_file: target.wholeFile,
      revision: target.revision,
      repository: data.repository.remote,
      definitions_in_range: target.symbolsInRange,
      source_omitted: target.contentOmitted,
    })}>`
  );
  if (target.source !== null) {
    out.push(
      `<source${attributes({ omitted_lines: data.omitted.source })}>${xml(target.source)}</source>`
    );
  }
  out.push('</target>');

  out.push(
    `<history${attributes({
      mode: history.mode,
      start_line: history.startLine,
      end_line: history.endLine,
      since: history.since,
      limit: history.limit,
      limit_reached: history.limitReached,
      reason: history.reason,
    })}>`
  );
  for (const commit of history.commits) {
    out.push(
      `<commit${attributes({
        sha: commit.sha,
        short_sha: commit.shortSha,
        date: commit.date,
        author: commit.author,
        email: commit.email,
        merge: commit.merge || null,
        shallow_boundary: commit.shallowBoundary || null,
        refs: commit.refs,
      })}>`
    );
    out.push(`<subject>${xml(commit.subject)}</subject>`);
    if (commit.body) out.push(`<body>${xml(commit.body)}</body>`);
    if (commit.patch) out.push(`<patch>${xml(commit.patch)}</patch>`);
    out.push('</commit>');
  }
  out.push('</history>');

  out.push('<references>');
  for (const entry of flattenReferences(data.references)) {
    const commits = entry.commits;
    switch (entry.type) {
      case 'issue':
        out.push(
          `<issue${attributes({ id: entry.id, kind: entry.kind, closes: entry.closes || null, url: entry.url, commits })}/>`
        );
        break;
      case 'ticket':
      case 'cve':
        out.push(`<${entry.type}${attributes({ id: entry.id, commits })}/>`);
        break;
      case 'url':
        out.push(`<url${attributes({ href: entry.url, commits })}/>`);
        break;
      default: {
        const tag = entry.type === 'co-author' ? 'co_author' : 'reviewer';
        out.push(`<${tag}${attributes({ commits })}>${xml(entry.value)}</${tag}>`);
      }
    }
  }
  out.push('</references>');

  if (data.ownership) {
    const own = data.ownership;
    out.push(
      `<ownership${attributes({
        start_line: own.startLine,
        end_line: own.endLine,
        total_lines: own.totalLines,
        last_changed: own.lastChanged,
      })}>`
    );
    for (const author of own.authors) {
      out.push(
        `<author${attributes({
          name: author.name,
          lines: author.lines,
          share: author.share,
          commits: author.commits,
          last_touched: author.lastTouched,
        })}/>`
      );
    }
    out.push('</ownership>');
  }

  if (data.coupling) {
    const coupling = data.coupling;
    out.push(
      `<coupling${attributes({
        window: coupling.window,
        target_changes: coupling.targetChanges,
        skipped_large_commits: coupling.skippedLargeCommits,
      })}>`
    );
    for (const file of coupling.files) {
      out.push(
        `<file${attributes({
          path: file.path,
          count: file.count,
          confidence: file.confidence,
          exists: file.exists === false ? 'false' : null,
        })}/>`
      );
    }
    out.push('</coupling>');
  }

  out.push('<related>');
  for (const entry of data.related) {
    out.push(
      `<mention${attributes({
        path: entry.path,
        line: entry.line,
        kind: entry.kind,
        heading: entry.heading,
        mentions: entry.mentions,
      })}>${xml(entry.snippet)}</mention>`
    );
  }
  out.push('</related>');

  out.push('<notes>');
  for (const note of data.notes) {
    out.push(
      `<note${attributes({ line: note.line, tag: note.tag, author: note.author })}>${xml(note.text)}</note>`
    );
  }
  out.push('</notes>');

  out.push('<tests>');
  for (const test of data.tests) {
    out.push(
      `<test_file${attributes({
        path: test.path,
        references: test.references,
        total_matches: test.totalMatches,
      })}>`
    );
    for (const match of test.matches) {
      out.push(`<match${attributes({ line: match.line })}>${xml(match.text)}</match>`);
    }
    out.push('</test_file>');
  }
  out.push('</tests>');

  if (data.question) out.push(`<question>${xml(data.question)}</question>`);
  out.push('</why_context>');
  return out.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// JSON
// ---------------------------------------------------------------------------

function renderJson(data, budget) {
  const { question, omitted, ...rest } = data;
  const document = {
    generator: 'ctxman why',
    ...rest,
    trimmed: Object.keys(omitted).length ? { budget, omitted } : null,
    question: question ?? null,
  };
  return JSON.stringify(document, null, 2) + '\n';
}

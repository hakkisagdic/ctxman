/**
 * ctxman why - "why is the code like this?" context from local git history
 *
 * For a file, a symbol (`file:symbol`) or a line range (`file#L10-L40`) this collects the
 * commits that shaped it, the issues / tickets / URLs those commits reference, blame
 * ownership, files that change together with it, docs / ADRs / changelog entries / code
 * comments that mention it, TODO-style notes inside it and the tests that reference it,
 * and renders all of it as one document for an LLM (or a person). Everything comes from
 * the repository itself: no network access.
 */

import fs from 'fs';
import path from 'path';
import { isValidGitRef } from '../integrations/git/GitClient.js';
import { redactSecrets, formatRedactionSummary } from '../utils/secret-redactor.js';
import { WhyError } from './errors.js';
import {
  findRepositoryRoot,
  literalPathspec as literal,
  readRepositoryInfo,
  runGit,
  toGitPath,
  tryGit,
} from './git.js';
import { createPathFilter, isBinaryBuffer, isExportableText, resolveInsideRoot } from './paths.js';
import {
  closeMatches,
  funcnameRange,
  isValidSymbol,
  listDefinitions,
  mapRangeToOld,
  parseHunks,
  parseTargetSpec,
  resolveSymbol,
} from './target.js';
import { collectHistory, funcnamePattern } from './history.js';
import { mineReferences, parseRemote, referencesOf } from './references.js';
import { collectOwnership } from './ownership.js';
import { collectCoupling } from './coupling.js';
import { findNotes, searchRelated } from './search.js';
import { STYLES, renderWithinBudget } from './render.js';

export { WhyError, findRepositoryRoot, parseTargetSpec, parseRemote, mineReferences };

const DEFAULTS = {
  limit: 20,
  since: null,
  rev: null,
  patches: false,
  couplingWindow: 500,
  couplingTop: 10,
  maxFilesPerCommit: 50,
  maxRelated: 20,
  maxTests: 10,
  style: 'markdown',
  budget: null,
  ask: null,
  redact: true,
  cwd: null,
};

const MAX_NOTES = 50;
const NEVER_COMMITTED = 'the file is staged but has never been committed';

// File names too common to search for on their own: `index.js` becomes `cart/index.js`
const GENERIC_STEMS = new Set([
  'index',
  'main',
  'mod',
  '__init__',
  'init',
  'utils',
  'util',
  'helpers',
  'helper',
  'types',
  'constants',
  'config',
  'app',
  'lib',
  'server',
  'client',
  'setup',
  'common',
  'base',
  'core',
]);

/**
 * Validate a whole number option (numeric strings from the CLI or MCP are accepted)
 */
function integerOption(name, value, min, max) {
  const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new WhyError(
      'INVALID_OPTION',
      `${name} must be a whole number between ${min} and ${max} (got ${JSON.stringify(value)})`
    );
  }
  return number;
}

/**
 * Fill in defaults and validate options
 * @param {object} options
 * @returns {typeof DEFAULTS}
 */
function normalizeOptions(options) {
  const opts = { ...DEFAULTS };
  for (const [key, value] of Object.entries(options ?? {})) {
    if (value !== undefined && value !== null) opts[key] = value;
  }

  opts.limit = integerOption('limit', opts.limit, 1, 10000);
  opts.couplingWindow = integerOption('couplingWindow', opts.couplingWindow, 0, 100000);
  opts.couplingTop = integerOption('couplingTop', opts.couplingTop, 1, 1000);
  opts.maxFilesPerCommit = integerOption('maxFilesPerCommit', opts.maxFilesPerCommit, 1, 100000);
  opts.maxRelated = integerOption('maxRelated', opts.maxRelated, 0, 1000);
  opts.maxTests = integerOption('maxTests', opts.maxTests, 0, 1000);
  if (opts.budget !== null) opts.budget = integerOption('budget', opts.budget, 1, 100000000);

  if (!STYLES.includes(opts.style)) {
    throw new WhyError(
      'INVALID_OPTION',
      `style must be one of ${STYLES.join(', ')} (got ${JSON.stringify(opts.style)})`
    );
  }
  if (opts.since !== null) {
    const since = String(opts.since).trim();
    if (!since || since.length > 100 || since.startsWith('-') || !/^[\w .:+\-/,]+$/.test(since)) {
      throw new WhyError('INVALID_OPTION', `Invalid --since date: ${JSON.stringify(opts.since)}`);
    }
    opts.since = since;
  }
  if (opts.rev !== null && !isValidGitRef(opts.rev)) {
    throw new WhyError('INVALID_REF', `Invalid git reference: ${JSON.stringify(opts.rev)}`);
  }
  if (opts.ask !== null) {
    opts.ask = String(opts.ask).trim() || null;
  }
  opts.patches = Boolean(opts.patches);
  opts.redact = opts.redact !== false;
  return opts;
}

/**
 * Count the lines of a text the way an editor numbers them
 */
function countLines(content) {
  if (content === '') return 0;
  const lines = content.split('\n');
  return content.endsWith('\n') ? lines.length - 1 : lines.length;
}

/**
 * Terms to search the repository for: the symbol(s), the file name (with its directory
 * when the name alone is too common) and the module name tests import
 */
function searchTerms(relativePath, symbols) {
  const parts = relativePath.split('/');
  const base = parts[parts.length - 1];
  const ext = path.extname(base);
  const stem = ext ? base.slice(0, -ext.length) : base;
  const parent = parts.length > 1 ? parts[parts.length - 2] : null;
  const generic = GENERIC_STEMS.has(stem.toLowerCase());
  return {
    symbols,
    fileTerm: generic && parent ? `${parent}/${base}` : base,
    stem: generic ? (['index', 'mod', '__init__'].includes(stem) ? parent : null) : stem,
  };
}

/**
 * Replace secrets in every string of `value` (in place for arrays / objects)
 */
function redactDeep(value, counts) {
  if (typeof value === 'string') {
    const { text, findings } = redactSecrets(value);
    for (const type of findings) counts[type] = (counts[type] ?? 0) + 1;
    return text;
  }
  if (Array.isArray(value)) return value.map((item) => redactDeep(item, counts));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, redactDeep(item, counts)])
    );
  }
  return value;
}

/**
 * Normalize a target given as an object ({file, symbol} / {file, startLine, endLine})
 */
function objectTarget(target) {
  if (!target || typeof target !== 'object' || typeof target.file !== 'string') {
    throw new WhyError(
      'INVALID_TARGET',
      'target must be a string like "src/cart.js:total" or an object with a file property'
    );
  }
  const spec = { file: target.file };
  if (target.symbol) spec.symbol = target.symbol;
  if (target.startLine !== undefined) {
    spec.startLine = Number(target.startLine);
    spec.endLine = Number(target.endLine ?? target.startLine);
  }
  return spec;
}

/**
 * The project, its repository and the rules that apply to it
 */
function openProject(root, opts) {
  if (typeof root !== 'string' || !fs.statSync(root, { throwIfNoEntry: false })?.isDirectory()) {
    throw new WhyError('ROOT_NOT_FOUND', `Project root is not a directory: ${root}`);
  }
  const projectRoot = fs.realpathSync(root);
  const top = findRepositoryRoot(projectRoot);
  if (opts.rev && !tryGit(top, ['rev-parse', '--verify', '--quiet', `${opts.rev}^{commit}`])) {
    throw new WhyError('UNKNOWN_REF', `Unknown revision: ${opts.rev}`);
  }
  const info = readRepositoryInfo(top);
  const warnings = [];
  if (info.shallow) {
    warnings.push(
      'This is a shallow clone, so history is truncated at the clone depth: the oldest commit shown may not be where the code started (`git fetch --unshallow` fetches the rest).'
    );
  }
  return {
    projectRoot,
    top,
    base: opts.cwd ? path.resolve(projectRoot, opts.cwd) : projectRoot,
    rev: opts.rev,
    info,
    remote: parseRemote(info.remoteUrl),
    isExcluded: createPathFilter(projectRoot),
    warnings,
  };
}

/**
 * Point a missing file at the commit that removed (or renamed) it, if history has one
 * @param {object} project
 * @param {string} file - Target path, already checked to lie inside the project
 * @returns {string} Text to append to the error, or ''
 */
function deletedFileHint(project, file) {
  const gitPath = toGitPath(path.relative(project.top, path.resolve(project.base, file)));
  const last = tryGit(project.top, [
    'log',
    '-n',
    '1',
    '--format=%h',
    '--',
    literal(gitPath),
  ])?.trim();
  return last
    ? ` (deleted or renamed in ${last}; use --rev ${last}~1 to explain its last version)`
    : '';
}

/**
 * Locate the target file and read it (from the work tree, or at `rev`)
 */
function readTarget(project, target) {
  const { projectRoot, top, base, rev, isExcluded } = project;
  const spec =
    typeof target === 'string'
      ? parseTargetSpec(target, (file) =>
          Boolean(fs.statSync(path.resolve(base, file), { throwIfNoEntry: false })?.isFile())
        )
      : objectTarget(target);
  let located;
  try {
    located = resolveInsideRoot(projectRoot, base, spec.file, {
      mustExist: !rev,
      label: projectRoot === top ? 'the repository' : `the project directory ${projectRoot}`,
    });
  } catch (error) {
    if (error.code === 'FILE_NOT_FOUND') error.message += deletedFileHint(project, spec.file);
    throw error;
  }
  const { absolute, relative } = located;
  const relPath = toGitPath(relative);
  const gitPath = toGitPath(path.relative(top, absolute));

  let buffer;
  if (rev) {
    // `<rev>:<path>` names a blob only when the file existed there (a tree for a folder)
    const object = `${rev}:${gitPath}`;
    if (tryGit(top, ['cat-file', '-t', object])?.trim() !== 'blob') {
      throw new WhyError('FILE_NOT_FOUND', `${relPath} does not exist at ${rev}`);
    }
    buffer = runGit(top, ['cat-file', 'blob', object], { encoding: 'buffer' });
  } else {
    if (tryGit(top, ['ls-files', '--error-unmatch', '--', literal(gitPath)]) === null) {
      throw new WhyError(
        'NOT_TRACKED',
        `${relPath} is not tracked by git, so it has no history to explain (commit it first)`
      );
    }
    buffer = fs.readFileSync(absolute);
  }

  const binary = isBinaryBuffer(buffer);
  const content = binary ? '' : buffer.toString('utf-8');
  let contentOmitted = null;
  if (binary) contentOmitted = 'binary file';
  else if (!isExportableText(relPath)) {
    contentOmitted =
      'not a text source file under ctxman scanner rules, which keep binary and secret-bearing files such as .env or *.pem out of exports';
  } else if (isExcluded(relPath)) {
    contentOmitted = 'excluded by .gitignore, .contextignore or .contextinclude';
  }

  return {
    spec,
    relPath,
    gitPath,
    binary,
    content,
    lines: content.split('\n'),
    totalLines: countLines(content),
    contentOmitted,
  };
}

/**
 * The lines the target covers: a resolved symbol, an explicit range, or the whole file.
 * `range` is null for a whole file, and for a symbol only git's funcname rule found
 */
function selectLines(project, file) {
  const { spec, relPath, content, lines, totalLines, binary } = file;
  const wholeFile = !spec.symbol && spec.startLine === undefined;
  if (wholeFile) return { wholeFile, range: null, symbol: null, funcname: null };
  if (binary) {
    throw new WhyError(
      'BINARY_TARGET',
      `${relPath} is a binary file: only whole-file history is available`
    );
  }

  if (spec.startLine !== undefined) {
    const { startLine, endLine } = spec;
    if (
      !Number.isInteger(startLine) ||
      !Number.isInteger(endLine) ||
      startLine < 1 ||
      endLine < startLine
    ) {
      throw new WhyError('INVALID_RANGE', `Invalid line range: ${startLine}-${endLine}`);
    }
    if (startLine > totalLines) {
      throw new WhyError(
        'INVALID_RANGE',
        `Line ${startLine} is past the end of ${relPath} (${totalLines} lines)`
      );
    }
    if (endLine > totalLines) {
      project.warnings.push(
        `${relPath} has ${totalLines} lines; the range ends at line ${totalLines}.`
      );
    }
    return {
      wholeFile,
      range: { startLine, endLine: Math.min(endLine, totalLines) },
      symbol: null,
      funcname: null,
    };
  }

  if (!isValidSymbol(spec.symbol)) {
    throw new WhyError('INVALID_SYMBOL', `Invalid symbol name: ${JSON.stringify(spec.symbol)}`);
  }
  const symbol = resolveSymbol(content, relPath, spec.symbol);
  if (symbol) {
    if (symbol.matches > 1) {
      project.warnings.push(
        `${symbol.matches} definitions match ${spec.symbol}; using the one on line ${symbol.line}. Use Class.method or #L<start>-L<end> to pick another.`
      );
    }
    return {
      wholeFile,
      range: { startLine: symbol.startLine, endLine: Math.min(symbol.endLine, totalLines) },
      symbol,
      funcname: null,
    };
  }

  // Last resort for a plain name: git's own funcname matching (`git log -L :name:file`)
  const plain = !/\.|::|#/.test(spec.symbol);
  const funcname = funcnamePattern(spec.symbol);
  const probe = plain
    ? tryGit(project.top, [
        'log',
        '-n',
        '1',
        '-s',
        '--format=%H',
        '-L',
        `:${funcname}:${file.gitPath}`,
        ...(project.rev ? [project.rev] : []),
      ])
    : null;
  if (!probe?.trim()) {
    const candidates = closeMatches(content, relPath, spec.symbol);
    const hint = candidates.length ? ` Did you mean: ${candidates.join(', ')}?` : '';
    throw new WhyError(
      'SYMBOL_NOT_FOUND',
      `Symbol ${spec.symbol} not found in ${relPath}.${hint}`,
      {
        candidates,
      }
    );
  }
  const approximate = funcnameRange(lines, spec.symbol);
  project.warnings.push(
    `${spec.symbol} was not recognised as a definition; history comes from git's funcname matching (\`git log -L :${spec.symbol}:${relPath}\`), so the range is approximate.`
  );
  return {
    wholeFile,
    range: approximate,
    symbol: {
      kind: 'funcname match',
      line: approximate?.startLine ?? null,
      resolvedBy: 'git-funcname',
    },
    funcname,
  };
}

/**
 * Commits that touched the selection. Line numbers of a modified work tree file are
 * mapped onto HEAD first, since `git log -L` reads them in the committed version
 */
function historySection(project, file, selection, opts) {
  const { top, rev, warnings } = project;
  const { relPath, gitPath, contentOmitted } = file;
  const { range, funcname } = selection;
  const history = {
    mode: 'none',
    startLine: null,
    endLine: null,
    since: opts.since,
    limit: opts.limit,
    limitReached: false,
    commits: [],
  };

  const revArgs = rev ? [rev] : [];
  const lastCommit = tryGit(top, [
    'log',
    '-n',
    '1',
    '--format=%H',
    ...revArgs,
    '--',
    literal(gitPath),
  ]);
  if (!lastCommit?.trim()) {
    history.reason = NEVER_COMMITTED;
    return history;
  }

  if (funcname) {
    history.mode = 'funcname';
    history.funcname = funcname;
  } else if (range) {
    let committed = range;
    const diff = rev
      ? ''
      : (tryGit(top, [
          'diff',
          '-U0',
          '--no-ext-diff',
          '--no-color',
          'HEAD',
          '--',
          literal(gitPath),
        ]) ?? '');
    if (diff.trim()) {
      committed = mapRangeToOld(parseHunks(diff), range.startLine, range.endLine);
      if (committed) {
        warnings.push(
          `${relPath} has uncommitted changes: history follows lines ${committed.startLine}-${committed.endLine} of the committed version (HEAD).`
        );
      }
    }
    if (!committed) {
      history.reason = 'the selected lines are new, uncommitted changes';
      return history;
    }
    history.mode = 'range';
    history.startLine = committed.startLine;
    history.endLine = committed.endLine;
  } else {
    history.mode = 'file';
  }

  if (opts.patches && contentOmitted) {
    warnings.push('Patches not shown: the file content is not exported.');
  }
  try {
    // One commit more than the limit tells whether older commits exist
    const commits = collectHistory(top, {
      path: gitPath,
      mode: history.mode,
      startLine: history.startLine,
      endLine: history.endLine,
      funcname: history.funcname,
      rev,
      limit: opts.limit + 1,
      since: opts.since,
      patches: opts.patches && !contentOmitted,
    });
    history.limitReached = commits.length > opts.limit;
    history.commits = commits.slice(0, opts.limit);
    for (const commit of history.commits) {
      if (project.info.boundary.has(commit.sha)) commit.shallowBoundary = true;
    }
  } catch (error) {
    warnings.push(`git log failed: ${error.message.split('\n')[0]}`);
    history.mode = 'none';
    history.reason = 'git log failed';
  }
  return history;
}

/**
 * Files changed in the same commits as the target, limited to paths inside the project
 * root that the ignore rules keep
 */
function couplingSection(project, file, opts) {
  const { top, projectRoot, rev, isExcluded, warnings } = project;
  if (opts.couplingWindow === 0) return null;

  const prefix = toGitPath(path.relative(top, projectRoot));
  const toProject = (gitFile) => {
    if (prefix === '') return gitFile;
    return gitFile.startsWith(`${prefix}/`) ? gitFile.slice(prefix.length + 1) : null;
  };
  try {
    const raw = collectCoupling(top, {
      path: file.gitPath,
      window: opts.couplingWindow,
      maxFilesPerCommit: opts.maxFilesPerCommit,
      rev,
      keep: (gitFile) => {
        const inProject = toProject(gitFile);
        return inProject !== null && !isExcluded(inProject);
      },
    });
    return {
      ...raw,
      maxFilesPerCommit: opts.maxFilesPerCommit,
      totalFiles: raw.files.length,
      files: raw.files.slice(0, opts.couplingTop).map((entry) => {
        const inProject = toProject(entry.path);
        return {
          ...entry,
          path: inProject,
          exists: fs.existsSync(path.join(projectRoot, ...inProject.split('/'))),
        };
      }),
    };
  } catch (error) {
    warnings.push(`Co-change analysis failed: ${error.message.split('\n')[0]}`);
    return null;
  }
}

/**
 * Explain why code looks the way it does, from the local git history
 *
 * @param {string} root - Project directory inside a git work tree. Target paths must stay
 *   inside it; its .gitignore / .contextignore / .contextinclude apply
 * @param {string|{file: string, symbol?: string, startLine?: number, endLine?: number}} target
 *   `file`, `file:symbol` (function, method, class; `Class.method` too), `file#L10-L40`
 *   or `file:10-40`
 * @param {object} [options]
 * @param {number} [options.limit=20] - Commits to include
 * @param {string} [options.since] - Only commits after this date (git date syntax)
 * @param {string} [options.rev] - Explain the code as of this revision instead of the work tree
 * @param {boolean} [options.patches=false] - Include each commit's diff of the target
 * @param {number} [options.couplingWindow=500] - Commits of the file examined for co-changes (0 = off)
 * @param {number} [options.couplingTop=10] - Co-changed files listed
 * @param {number} [options.maxFilesPerCommit=50] - Larger commits are ignored for coupling
 * @param {number} [options.maxRelated=20] - Related text snippets listed
 * @param {number} [options.maxTests=10] - Test files listed
 * @param {'markdown'|'xml'|'json'} [options.style='markdown']
 * @param {number} [options.budget] - Maximum tokens of the output
 * @param {string} [options.ask] - Question appended at the end of the document
 * @param {boolean} [options.redact=true] - Mask secrets (lib/utils/secret-redactor.js)
 * @param {string} [options.cwd] - Directory relative target paths start from (default: root)
 * @returns {Promise<{text: string, style: string, tokens: number, budget: number|null,
 *   omitted: Record<string, number>, warnings: string[], data: object}>}
 */
export async function explainHistory(root, target, options = {}) {
  const opts = normalizeOptions(options);
  const project = openProject(root, opts);
  const file = readTarget(project, target);
  const selection = selectLines(project, file);
  const { wholeFile, range, symbol } = selection;
  const { spec, relPath, lines, totalLines, contentOmitted } = file;

  const history = historySection(project, file, selection, opts);
  const references = mineReferences(history.commits, project.remote);
  for (const commit of history.commits) commit.refs = referencesOf(references, commit.shortSha);

  // Blame of the current lines
  const covered = wholeFile || range !== null;
  let ownership = null;
  if (!file.binary && covered) {
    ownership = collectOwnership(project.top, {
      path: file.gitPath,
      startLine: range?.startLine,
      endLine: range?.endLine,
      rev: project.rev,
    });
    if (!ownership) project.warnings.push('git blame failed; ownership not available.');
  }

  const coupling = history.reason === NEVER_COMMITTED ? null : couplingSection(project, file, opts);

  // Definitions inside a line range double as search terms
  const symbolsInRange =
    range && !spec.symbol
      ? [
          ...new Set(
            listDefinitions(file.content, relPath)
              .filter((d) => d.line >= range.startLine && d.line <= range.endLine)
              .map((d) => d.name)
          ),
        ].slice(0, 10)
      : [];

  // Docs, comments and tests that mention the target (work tree)
  const member = spec.symbol ? spec.symbol.split(/\.|::|#/).pop() : null;
  const found = searchRelated(project.projectRoot, {
    ...searchTerms(relPath, member ? [member] : symbolsInRange.slice(0, 3)),
    target: {
      path: relPath,
      startLine: range ? range.startLine : null,
      endLine: range ? range.endLine : null,
    },
    isExcluded: project.isExcluded,
    maxRelated: opts.maxRelated,
    maxTests: opts.maxTests,
  });

  const shown = !contentOmitted && covered;
  const first = range?.startLine ?? 1;
  const last = range?.endLine ?? totalLines;
  const notes = shown ? findNotes(lines, first, last, relPath).slice(0, MAX_NOTES) : [];
  let source = null;
  if (shown) {
    source = wholeFile ? file.content.replace(/\n$/, '') : lines.slice(first - 1, last).join('\n');
  }

  const { info, remote, rev } = project;
  let data = {
    target: {
      path: relPath,
      symbol: spec.symbol ?? null,
      kind: symbol?.kind ?? null,
      line: symbol?.line ?? null,
      resolvedBy: symbol?.resolvedBy ?? null,
      startLine: range?.startLine ?? (wholeFile && totalLines ? 1 : null),
      endLine: range?.endLine ?? (wholeFile && totalLines ? totalLines : null),
      totalLines,
      wholeFile,
      binary: file.binary,
      revision:
        rev ?? (info.head ? `working tree (HEAD ${info.head.slice(0, 12)})` : 'working tree'),
      symbolsInRange,
      contentOmitted,
      source,
    },
    repository: {
      remote: remote?.provider ? remote.webUrl : null,
      provider: remote?.provider ?? null,
      shallow: info.shallow,
    },
    history,
    references,
    ownership,
    coupling,
    related: found.related,
    notes,
    tests: found.tests,
    warnings: project.warnings,
    question: opts.ask,
  };

  if (opts.redact) {
    const counts = {};
    data = redactDeep(data, counts);
    if (Object.keys(counts).length) {
      data.warnings.push(
        `Secrets masked as [REDACTED:<type>]: ${formatRedactionSummary(counts)} (use --no-redact to keep them).`
      );
    }
  }

  const rendered = renderWithinBudget(data, { style: opts.style, budget: opts.budget });
  return {
    text: rendered.text,
    style: opts.style,
    tokens: rendered.tokens,
    budget: opts.budget,
    omitted: rendered.omitted,
    warnings: data.warnings,
    data,
  };
}

export default explainHistory;

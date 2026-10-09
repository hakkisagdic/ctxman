/**
 * Pull-request / branch review context (`ctxman pr`)
 *
 * Collects everything a reviewer (human or model) needs about a branch in one document:
 * a summary, the commit log, the changed files, the full source of every method the diff
 * touches (plus the methods it deletes), the unified diff, related tests and, on request,
 * the changed files' full contents, followed by the question or instructions. A token
 * budget drops the least important material first.
 */

import fs from 'fs';
import path from 'path';
import { isValidGitRef } from '../integrations/git/GitClient.js';
import DiffAnalyzer from '../integrations/git/DiffAnalyzer.js';
import { Scanner } from '../core/Scanner.js';
import FileUtils from '../utils/file-utils.js';
import TokenUtils from '../utils/token-utils.js';
import { redactSecrets } from '../utils/secret-redactor.js';
import PrGit, { bufferToText } from './pr-git.js';
import {
  parseNameStatus,
  parseNumstat,
  splitDiff,
  parseHunks,
  syntheticAddedDiff,
  countLines,
} from './diff-parser.js';
import {
  supportsMethods,
  extractMethodRanges,
  findTouchedMethods,
  findDeletedMethods,
} from './method-mapper.js';
import { findRelatedTests, isTestFile } from './related-tests.js';
import { renderPrContext, renderItem } from './pr-renderer.js';

export const PR_STYLES = ['markdown', 'xml', 'json'];

const DEFAULTS = {
  base: null,
  head: null,
  staged: false,
  working: false,
  unified: 3,
  diff: true,
  withTests: false,
  withFiles: false,
  ask: null,
  instructions: null,
  budget: null,
  style: 'markdown',
  redact: true,
  maxFileBytes: 1024 * 1024,
  maxRelatedTests: 50,
};

// Test files read to look for imports and references: per file, and for all of them
const TEST_READ_LIMIT = 512 * 1024;
const TEST_READ_TOTAL = 64 * 1024 * 1024;
// ctxman's own run-time output (logs written by any ctxman command), never part of a change
const OWN_OUTPUT = /^\.ctxman\/(logs|temp|metrics)\//;
const FILTER_NAMES = {
  gitignore: '.gitignore',
  context: '.contextignore',
  'context-include': '.contextinclude',
};

/**
 * Check and complete the options
 * @param {object} options
 */
export function normalizePrOptions(options = {}) {
  const defined = Object.fromEntries(
    Object.entries(options).filter(([, value]) => value !== undefined)
  );
  const opts = { ...DEFAULTS, ...defined };

  if (!PR_STYLES.includes(opts.style)) {
    throw new Error(`Unknown style ${JSON.stringify(opts.style)} (use markdown, xml or json)`);
  }
  for (const key of ['base', 'head']) {
    if (opts[key] != null && !isValidGitRef(opts[key])) {
      throw new Error(`Invalid git reference for ${key}: ${JSON.stringify(opts[key])}`);
    }
  }
  if (opts.staged && opts.working) {
    throw new Error('--staged and --working cannot be used together');
  }
  if ((opts.staged || opts.working) && opts.head) {
    throw new Error('--head cannot be used with --staged or --working');
  }
  if (!Number.isInteger(opts.unified) || opts.unified < 0 || opts.unified > 10000) {
    throw new Error(`Invalid number of context lines: ${JSON.stringify(opts.unified)}`);
  }
  if (opts.budget != null && (!Number.isInteger(opts.budget) || opts.budget <= 0)) {
    throw new Error(`Invalid token budget: ${JSON.stringify(opts.budget)}`);
  }
  return opts;
}

/** Remote default branch (origin/HEAD), else main, else master */
function detectBaseRef(git) {
  const originHead = git.run(['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD'], {
    allowFail: true,
  });
  const candidates = [originHead && originHead.trim(), 'main', 'master'].filter(Boolean);
  for (const ref of candidates) {
    if (isValidGitRef(ref) && git.resolveCommit(ref)) return ref;
  }
  throw new Error('Could not find a base branch (origin/HEAD, main or master); pass --base <ref>');
}

/** Resolve what is compared with what */
function resolveRange(git, opts) {
  const mode = opts.staged ? 'staged' : opts.working ? 'working' : 'range';
  const resolve = (ref, what) => {
    const sha = git.resolveCommit(ref);
    if (!sha) throw new Error(`Unknown ${what} revision ${JSON.stringify(ref)}`);
    return sha;
  };
  const mergeBaseOf = (a, b) => {
    const out = git.run(['merge-base', a, b], { allowFail: true });
    if (!out || !out.trim()) {
      throw new Error(
        'Base and head have no common ancestor (in a shallow clone, fetch more history)'
      );
    }
    return out.trim();
  };

  if (mode === 'range') {
    const headRef = opts.head || 'HEAD';
    const headSha = resolve(headRef, 'head');
    const baseRef = opts.base || detectBaseRef(git);
    const baseSha = resolve(baseRef, 'base');
    let headName = headRef;
    if (headRef === 'HEAD') {
      const branch = git.run(['rev-parse', '--abbrev-ref', 'HEAD'], { allowFail: true });
      if (branch && branch.trim() && branch.trim() !== 'HEAD') headName = branch.trim();
    }
    const mergeBase = mergeBaseOf(baseSha, headSha);
    return { mode, baseRef, baseSha, headRef: headName, headSha, from: mergeBase, mergeBase };
  }

  const headSha = git.resolveCommit('HEAD');
  if (!headSha) throw new Error('The repository has no commits yet');
  const baseRef = opts.base || 'HEAD';
  const baseSha = resolve(baseRef, 'base');
  const mergeBase = baseSha === headSha ? headSha : mergeBaseOf(baseSha, headSha);
  return {
    mode,
    baseRef,
    baseSha,
    headRef: mode === 'staged' ? 'index' : 'working tree',
    headSha,
    from: mergeBase,
    mergeBase,
  };
}

/** Commits from `from` to `to`, oldest first */
function readCommits(git, from, to, pathspec) {
  if (from === to) return [];
  const out = git.run([
    'log',
    '--reverse',
    '--no-color',
    '--format=%x1e%H%x00%h%x00%an%x00%aI%x00%s%x00%b',
    `${from}..${to}`,
    '--',
    ...pathspec,
  ]);
  return out
    .split('\x1e')
    .filter((record) => record.trim())
    .map((record) => {
      const [sha, short, author, date, subject, body = ''] = record.split('\0');
      return { sha, short, author, date: date.slice(0, 10), subject, body: body.trim() };
    });
}

const isInside = (root, target) => {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
};

/** Read a working-tree file without following links out of the repository */
function readWorkingFile(realRoot, relativePath, maxBytes) {
  const fullPath = path.resolve(realRoot, relativePath);
  if (!isInside(realRoot, fullPath)) return { status: 'missing' };
  try {
    const stat = fs.lstatSync(fullPath);
    if (!stat.isFile()) return { status: 'not-blob' };
    if (!isInside(realRoot, fs.realpathSync(fullPath))) return { status: 'missing' };
    if (stat.size > maxBytes) return { status: 'too-large', size: stat.size };
    return { status: 'ok', text: bufferToText(fs.readFileSync(fullPath)), size: stat.size };
  } catch (_error) {
    return { status: 'missing' };
  }
}

/** Why the context filters keep a file's content out, or null */
function createExclusionCheck(rootPath, repoRoot) {
  const scanner = new Scanner(rootPath);
  const parser = scanner.gitIgnore;
  return (repoRelativePath) => {
    const relative = path
      .relative(rootPath, path.join(repoRoot, repoRelativePath))
      .split(path.sep)
      .join('/');
    if (relative.startsWith('../')) return 'scope';
    const segments = relative.split('/');
    if (segments.slice(0, -1).some((name) => FileUtils.isSkippedDirectory(name))) {
      return 'a skipped directory';
    }
    // The scanner never enters an ignored directory, so check the parents too (with an
    // include file, directories are only traversal hints, so only the file counts)
    const paths = parser.hasIncludeFile
      ? [relative]
      : [...segments.slice(0, -1).map((_, i) => segments.slice(0, i + 1).join('/')), relative];
    for (const candidate of paths) {
      if (scanner.shouldIgnore(candidate, path.join(rootPath, candidate))) {
        return FILTER_NAMES[parser._lastIgnoreReason] || 'context filters';
      }
    }
    return null;
  };
}

/** Labels for what the budget dropped, grouped by kind */
function describeDropped(dropped) {
  const list = (items) => {
    const shown = items.slice(0, 5).join(', ');
    return items.length > 5 ? `${shown}, +${items.length - 5} more` : shown;
  };
  const labels = [];
  if (dropped.contents.length) {
    labels.push(`full contents of ${dropped.contents.length} file(s) (${list(dropped.contents)})`);
  }
  if (dropped.testContents.length) {
    labels.push(
      `contents of ${dropped.testContents.length} related test(s) (${list(dropped.testContents)})`
    );
  }
  if (dropped.tests.length) labels.push(`${dropped.tests.length} related test path(s)`);
  if (dropped.diff.length) {
    labels.push(`diff of ${dropped.diff.length} file(s) (${list(dropped.diff)})`);
  }
  if (dropped.methodSources.length) {
    labels.push(
      `source of ${dropped.methodSources.length} changed method(s) (${list(dropped.methodSources)})`
    );
  }
  if (dropped.methods) labels.push('the changed methods list');
  if (dropped.commitBodies) labels.push('commit message bodies');
  if (dropped.commits) labels.push('the commit log');
  if (dropped.files) labels.push('the changed files list');
  return labels;
}

/**
 * Build the review context for a branch, the staged changes or the working tree
 * @param {string} [root=process.cwd()] - Project directory (inside a git work tree); a
 *   subdirectory limits the change to that directory
 * @param {object} [options]
 * @param {string} [options.base] - Base revision (default: origin/HEAD, else main, else master;
 *   HEAD with staged/working)
 * @param {string} [options.head='HEAD'] - Head revision
 * @param {boolean} [options.staged] - Compare the index with the base instead
 * @param {boolean} [options.working] - Compare the working tree (with untracked files)
 * @param {number} [options.unified=3] - Context lines in the diff
 * @param {boolean} [options.diff=true] - Include the unified diff
 * @param {boolean} [options.withTests] - Include related tests' contents
 * @param {boolean} [options.withFiles] - Include changed files' full contents
 * @param {string} [options.ask] - Question appended at the end
 * @param {string} [options.instructions] - Instructions appended at the end
 * @param {number} [options.budget] - Maximum tokens of the output
 * @param {'markdown'|'xml'|'json'} [options.style='markdown']
 * @param {boolean} [options.redact=true] - Mask secrets in contents, diff and commit messages
 * @returns {Promise<object>} `output` (the rendered text), `tokens`, per-section `sections`
 *   token counts, the collected `commits`, `files`, `methods`, `relatedTests`, `stats`,
 *   `budget` (limit, dropped, over), `redactions` and `warnings`
 */
export async function buildPrContext(root = process.cwd(), options = {}) {
  const opts = normalizePrOptions(options);
  const rootPath = path.resolve(root);
  if (!fs.existsSync(rootPath) || !fs.statSync(rootPath).isDirectory()) {
    throw new Error(`Not a directory: ${rootPath}`);
  }
  const repoTop = PrGit.findRepoRoot(rootPath);
  if (!repoTop) throw new Error(`Not inside a git repository: ${rootPath}`);
  const repoRoot = fs.realpathSync(repoTop);
  const realRootPath = fs.realpathSync(rootPath);
  const scope = path.relative(repoRoot, realRootPath).split(path.sep).join('/');
  const pathspec = scope ? [scope] : [];
  const git = new PrGit(repoRoot);
  const warnings = [];

  // --- what is compared --------------------------------------------------------------
  const range = resolveRange(git, opts);
  // `rev-parse --short` takes one revision and `show` lists a repeated one once, so map
  const shortSha = new Map(
    git
      .run(['show', '--no-patch', '--format=%H %h', range.baseSha, range.headSha, range.mergeBase])
      .trim()
      .split('\n')
      .map((line) => line.split(' '))
  );
  const commits = readCommits(git, range.from, range.headSha, pathspec);

  const diffArgs = ['--no-color', '--no-ext-diff', '--no-textconv', '-M'];
  if (range.mode === 'staged') diffArgs.push('--cached');
  diffArgs.push(range.from);
  if (range.mode === 'range') diffArgs.push(range.headSha);
  const tail = ['--', ...pathspec];
  const nameStatus = parseNameStatus(
    git.run(['diff', '--name-status', '-z', ...diffArgs, ...tail])
  );
  const numstat = parseNumstat(git.run(['diff', '--numstat', '-z', ...diffArgs, ...tail]));
  const patch = git.run([
    'diff',
    `--unified=${opts.unified}`,
    '--src-prefix=a/',
    '--dst-prefix=b/',
    ...diffArgs,
    ...tail,
  ]);
  const blocks = new Map();
  for (const block of splitDiff(patch)) blocks.set(block.newPath ?? block.oldPath, block);

  // --- head/base contents ---------------------------------------------------------------
  const headCache = new Map();
  const readHead = (paths, maxBytes = opts.maxFileBytes, maxTotalBytes = Infinity) => {
    const found = new Map();
    const todo = [];
    for (const p of new Set(paths)) {
      if (headCache.has(p)) found.set(p, headCache.get(p));
      else todo.push(p);
    }
    let results = [];
    if (range.mode === 'working') {
      let total = 0;
      results = todo.map((p) => {
        const entry = readWorkingFile(repoRoot, p, Math.min(maxBytes, maxTotalBytes - total));
        if (entry.status === 'ok') total += entry.size;
        return entry;
      });
    } else if (todo.length) {
      const prefix = range.mode === 'staged' ? ':' : `${range.headSha}:`;
      results = git.readBlobs(
        todo.map((p) => prefix + p),
        { maxBytes, maxTotalBytes }
      );
    }
    todo.forEach((p, i) => {
      found.set(p, results[i]);
      // A size limit depends on the caller, so only definite answers are kept
      if (results[i].status !== 'too-large') headCache.set(p, results[i]);
    });
    return found;
  };
  const readBase = (paths) => {
    const results = git.readBlobs(
      paths.map((p) => `${range.from}:${p}`),
      { maxBytes: opts.maxFileBytes }
    );
    return new Map(paths.map((p, i) => [p, results[i]]));
  };
  const textOf = (entry) => (entry && entry.status === 'ok' ? entry.text : null);

  // --- changed files ----------------------------------------------------------------------
  const isExcluded = createExclusionCheck(realRootPath, repoRoot);
  const files = nameStatus.map((entry) => {
    const stat = numstat.get(entry.path) || { additions: 0, deletions: 0, binary: false };
    return {
      ...entry,
      ...stat,
      untracked: false,
      block: blocks.get(entry.path) || blocks.get(entry.oldPath) || null,
      excluded: isExcluded(entry.path),
    };
  });
  if (range.mode === 'working') {
    const untracked = git
      .run(['ls-files', '-z', '--others', '--exclude-standard', ...tail])
      .split('\0')
      .filter((p) => p && !OWN_OUTPUT.test(p));
    const contents = readHead(untracked);
    for (const filePath of untracked) {
      const entry = contents.get(filePath);
      if (!entry || entry.status === 'missing' || entry.status === 'not-blob') continue;
      const text = textOf(entry);
      files.push({
        status: 'A',
        path: filePath,
        oldPath: null,
        similarity: null,
        additions: text ? countLines(text) : 0,
        deletions: 0,
        binary: entry.status === 'ok' && text === null,
        untracked: true,
        block:
          entry.status === 'ok'
            ? { oldPath: null, newPath: filePath, text: syntheticAddedDiff(filePath, text) }
            : null,
        excluded: isExcluded(filePath),
      });
    }
    files.sort((a, b) => a.path.localeCompare(b.path));
  }

  // --- redaction ------------------------------------------------------------------------
  const redactions = {};
  const redact = (text) => {
    if (!opts.redact || typeof text !== 'string') return text;
    const result = redactSecrets(text);
    for (const type of result.findings) redactions[type] = (redactions[type] || 0) + 1;
    return result.text;
  };

  // --- changed and deleted methods ------------------------------------------------------
  const methodFiles = files.filter(
    (f) => !f.excluded && !f.binary && (supportsMethods(f.path) || supportsMethods(f.oldPath || ''))
  );
  const headTexts = readHead(methodFiles.filter((f) => f.status !== 'D').map((f) => f.path));
  const withBase = new Set(
    methodFiles.filter((f) => f.oldPath && f.status !== 'A' && f.status !== 'C')
  );
  const baseTexts = readBase([...withBase].map((f) => f.oldPath));
  const methods = [];
  const deletedMethods = [];
  let tooLarge = 0;
  for (const file of methodFiles) {
    const headEntry = file.status === 'D' ? null : headTexts.get(file.path);
    const baseEntry = withBase.has(file) ? baseTexts.get(file.oldPath) : null;
    if (headEntry?.status === 'too-large' || baseEntry?.status === 'too-large') tooLarge++;
    const head = textOf(headEntry);
    const base = textOf(baseEntry);
    const headMethods =
      head != null && supportsMethods(file.path) ? extractMethodRanges(head, file.path) : [];
    const baseMethods =
      base != null && supportsMethods(file.oldPath) ? extractMethodRanges(base, file.oldPath) : [];
    const baseNames = new Set(baseMethods.map((m) => m.name));
    const hunks = file.block
      ? parseHunks(file.block.text)
      : { addedLines: [], deletionAnchors: [] };
    for (const method of findTouchedMethods(headMethods, hunks)) {
      methods.push({
        file: file.path,
        name: method.name,
        start: method.start,
        end: method.end,
        change: baseNames.has(method.name) ? 'modified' : 'added',
        changedLines: method.changedLines,
        source: redact(method.source),
        sourceDropped: false,
      });
    }
    const deleted =
      file.status === 'D' ? baseMethods : findDeletedMethods(baseMethods, headMethods, head ?? '');
    for (const method of deleted) {
      deletedMethods.push({
        file: file.oldPath,
        name: method.name,
        start: method.start,
        end: method.end,
      });
    }
  }
  if (tooLarge) {
    warnings.push(
      `${tooLarge} file(s) over ${opts.maxFileBytes} bytes were skipped for method analysis`
    );
  }

  // --- related tests ----------------------------------------------------------------------
  let candidates;
  if (range.mode === 'range') {
    candidates = git.run(['ls-tree', '-r', '-z', '--name-only', range.headSha, ...tail]);
  } else if (range.mode === 'staged') {
    candidates = git.run(['ls-files', '-z', '--cached', ...tail]);
  } else {
    candidates = git.run(['ls-files', '-z', '--cached', '--others', '--exclude-standard', ...tail]);
  }
  candidates = [...new Set(candidates.split('\0').filter(Boolean))];
  const testTexts = new Map();
  const readContents = (paths) => {
    const entries = readHead(paths, TEST_READ_LIMIT, TEST_READ_TOTAL);
    for (const [p, entry] of entries) testTexts.set(p, textOf(entry));
    return new Map([...entries].map(([p, entry]) => [p, textOf(entry)]));
  };
  const allRelated = findRelatedTests({
    candidates,
    changedFiles: files,
    // Helpers changed inside test files are not the code under test
    methodNames: [...methods, ...deletedMethods]
      .filter((m) => !isTestFile(m.file))
      .map((m) => m.name),
    readContents,
  });
  const related = allRelated.slice(0, opts.maxRelatedTests);
  if (opts.withTests) {
    const missing = related.map((t) => t.path).filter((p) => !testTexts.has(p));
    if (missing.length) readContents(missing);
  }
  const tests = related.map((test) => {
    const excluded = isExcluded(test.path);
    const content = opts.withTests && !excluded ? (testTexts.get(test.path) ?? null) : null;
    return {
      ...test,
      excluded,
      content: typeof content === 'string' ? redact(content) : null,
      contentDropped: false,
      dropped: false,
    };
  });

  // --- full contents ----------------------------------------------------------------------
  const contents = [];
  if (opts.withFiles) {
    const wanted = files.filter((f) => f.status !== 'D');
    const entries = readHead(wanted.filter((f) => !f.excluded).map((f) => f.path));
    for (const file of wanted) {
      if (file.excluded) {
        contents.push({ path: file.path, content: null, note: `excluded by ${file.excluded}` });
        continue;
      }
      const entry = entries.get(file.path);
      const text = textOf(entry);
      let note = null;
      if (entry?.status === 'too-large') note = `larger than ${opts.maxFileBytes} bytes`;
      else if (entry?.status === 'ok' && text === null) note = 'binary';
      else if (text === null) note = 'not readable';
      contents.push({ path: file.path, content: redact(text), note, dropped: false });
    }
  }

  // --- model --------------------------------------------------------------------------------
  const byStatus = {};
  for (const file of files) byStatus[file.status] = (byStatus[file.status] || 0) + 1;
  const impact = new DiffAnalyzer(repoRoot).calculateImpact(files.map((f) => f.path));
  const model = {
    mode: range.mode,
    base: { ref: range.baseRef, sha: range.baseSha, short: shortSha.get(range.baseSha) },
    head:
      range.mode === 'range'
        ? { ref: range.headRef, sha: range.headSha, short: shortSha.get(range.headSha) }
        : { ref: range.headRef, sha: null, short: null },
    mergeBase: { sha: range.mergeBase, short: shortSha.get(range.mergeBase) },
    scope,
    impact: { level: impact.level, score: impact.score },
    stats: {
      commits: commits.length,
      files: files.length,
      byStatus,
      additions: files.reduce((sum, f) => sum + f.additions, 0),
      deletions: files.reduce((sum, f) => sum + f.deletions, 0),
      excluded: files.filter((f) => f.excluded).length,
      changedMethods: methods.length,
      addedMethods: methods.filter((m) => m.change === 'added').length,
      deletedMethods: deletedMethods.length,
      relatedTests: tests.length,
    },
    commits: commits.map((c) => ({ ...c, subject: redact(c.subject), body: redact(c.body) })),
    files: files.map(
      ({
        status,
        path: filePath,
        oldPath,
        similarity,
        additions,
        deletions,
        binary,
        untracked,
        excluded,
      }) => ({
        status,
        path: filePath,
        oldPath,
        similarity,
        additions,
        deletions,
        binary,
        untracked,
        excluded,
      })
    ),
    methods,
    deletedMethods,
    diffEnabled: opts.diff,
    diffs: files
      .filter((f) => f.block && !f.excluded)
      .map((f) => ({ path: f.path, text: redact(f.block.text), dropped: false })),
    tests,
    withTests: opts.withTests,
    withFiles: opts.withFiles,
    contents,
    instructions: opts.instructions,
    ask: opts.ask,
    budget: opts.budget ? { limit: opts.budget, dropped: [], over: false } : null,
    tokens: null,
    logBodiesDropped: false,
    logDropped: false,
    filesDropped: false,
    methodsDropped: false,
  };
  if (allRelated.length > related.length) {
    warnings.push(
      `${allRelated.length} related tests found; the first ${related.length} are listed`
    );
  }

  // --- render within the budget ------------------------------------------------------------
  const count = (text) => TokenUtils.calculate(text, 'pr-context.md');
  const dropped = {
    contents: [],
    testContents: [],
    tests: [],
    diff: [],
    methodSources: [],
    methods: false,
    commitBodies: false,
    commits: false,
    files: false,
  };
  const measure = () => {
    if (model.budget) model.budget.dropped = describeDropped(dropped);
    model.tokens = null;
    let { sections } = renderPrContext(model, opts.style);
    const counts = {};
    for (const [name, text] of Object.entries(sections)) counts[name] = count(text);
    const sum = () => Object.values(counts).reduce((total, n) => total + n, 0);
    model.tokens = { sections: counts, total: sum() };
    ({ sections } = renderPrContext(model, opts.style));
    counts.summary = count(sections.summary);
    model.tokens.total = sum();
    const { output } = renderPrContext(model, opts.style);
    return { output, tokens: count(output) };
  };

  let result = measure();
  if (model.budget && result.tokens > model.budget.limit) {
    const limit = model.budget.limit;
    const steps = buildDropSteps(model, opts.style, dropped, count);
    let estimate = result.tokens;
    let stale = false;
    for (const step of steps) {
      if (stale || step.tokens == null || estimate <= limit) {
        result = measure();
        estimate = result.tokens;
        stale = false;
        if (estimate <= limit) break;
      }
      step.apply();
      if (step.tokens == null) stale = true;
      else estimate -= step.tokens;
    }
    result = measure();
    model.budget.over = result.tokens > limit;
    if (model.budget.over) {
      result = measure();
      warnings.push(
        `The required sections alone take ${result.tokens} tokens, over the ${limit}-token budget`
      );
    }
  }

  return {
    output: result.output,
    tokens: result.tokens,
    style: opts.style,
    mode: model.mode,
    base: model.base,
    head: model.head,
    mergeBase: model.mergeBase,
    scope,
    stats: model.stats,
    sections: model.tokens.sections,
    budget: model.budget,
    commits: model.commits,
    files: model.files,
    methods: { changed: methods, deleted: deletedMethods },
    relatedTests: tests.map(({ path: testPath, reasons, changed, excluded }) => ({
      path: testPath,
      reasons,
      changed,
      excluded,
    })),
    redactions,
    warnings,
  };
}

/**
 * What the budget drops, least important first: full file contents, test contents, related
 * test paths, per-file diffs, method sources, the methods list, commit bodies, the commit
 * log, the file list. Item steps carry the tokens their text takes (largest items go first
 * within a kind); whole-section steps have tokens null, so the caller measures before them.
 */
function buildDropSteps(model, style, dropped, count) {
  const steps = [];
  const bySize = (items) => items.sort((a, b) => b.tokens - a.tokens);

  steps.push(
    ...bySize(
      model.contents
        .filter((item) => typeof item.content === 'string')
        .map((item) => ({
          tokens: count(renderItem('content', item, model, style)),
          apply: () => {
            item.dropped = true;
            dropped.contents.push(item.path);
          },
        }))
    )
  );
  if (model.withTests) {
    steps.push(
      ...bySize(
        model.tests
          .filter((test) => typeof test.content === 'string')
          .map((test) => ({
            tokens: count(renderItem('testContent', test, model, style)),
            apply: () => {
              test.contentDropped = true;
              dropped.testContents.push(test.path);
            },
          }))
      )
    );
  }
  for (const test of [...model.tests].reverse()) {
    steps.push({
      tokens: count(renderItem('testLine', test, model, style)),
      apply: () => {
        test.dropped = true;
        dropped.tests.push(test.path);
      },
    });
  }
  if (model.diffEnabled) {
    steps.push(
      ...bySize(
        model.diffs.map((diff) => ({
          tokens: count(diff.text),
          apply: () => {
            diff.dropped = true;
            dropped.diff.push(diff.path);
          },
        }))
      )
    );
  }
  steps.push(
    ...bySize(
      model.methods.map((method) => ({
        tokens: count(method.source),
        apply: () => {
          method.sourceDropped = true;
          dropped.methodSources.push(`${method.file}:${method.name}`);
        },
      }))
    )
  );
  if (model.methods.length || model.deletedMethods.length) {
    steps.push({
      tokens: null,
      apply: () => {
        model.methodsDropped = true;
        dropped.methods = true;
      },
    });
  }
  if (model.commits.some((commit) => commit.body)) {
    steps.push({
      tokens: null,
      apply: () => {
        model.logBodiesDropped = true;
        dropped.commitBodies = true;
      },
    });
  }
  if (model.commits.length) {
    steps.push({
      tokens: null,
      apply: () => {
        model.logDropped = true;
        dropped.commits = true;
      },
    });
  }
  if (model.files.length) {
    steps.push({
      tokens: null,
      apply: () => {
        model.filesDropped = true;
        dropped.files = true;
      },
    });
  }
  return steps;
}

export default buildPrContext;

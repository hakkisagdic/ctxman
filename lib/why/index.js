/**
 * ctxman why - "why is the code like this?" context from local git history
 *
 * For a file, a symbol (`file:symbol`) or a line range (`file#L10-L40`) this collects the
 * commits that shaped it, the issues / tickets / URLs those commits reference (and
 * optionally their GitHub / GitLab issue, PR & MR discussions when `discussions: true`),
 * blame ownership, files that change together with it, docs / ADRs / changelog entries /
 * code comments that mention it, TODO-style notes inside it and the tests that reference
 * it, and renders all of it as one document for an LLM (or a person). Offline by default.
 */

import fs from 'fs';
import path from 'path';
import { isValidGitRef } from '../integrations/git/GitClient.js';
import { redactSecrets, formatRedactionSummary } from '../utils/secret-redactor.js';
import { resolveWorkspaceRepos } from '../workspace/index.js';
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
import {
  fetchDiscussions,
  DEFAULT_MAX_DISCUSSIONS,
  DEFAULT_MAX_COMMENTS,
  DEFAULT_DISCUSSION_TIMEOUT_MS,
} from './discussions.js';
import { collectOwnership } from './ownership.js';
import { collectCoupling } from './coupling.js';
import { findNotes, searchRelated } from './search.js';
import { STYLES, renderWithinBudget } from './render.js';
import { queryAnalyzerCitations, resolveAnalyzerDbPath } from './analyzer-bridge.js';
import { DEFAULT_SOURCE_TIMEOUT_MS, runSources } from '../evidence/index.js';
import { createGitHubEvidenceSource } from '../evidence/sources/github.js';
import { createGitLabEvidenceSource } from '../evidence/sources/gitlab.js';
import { createChatEvidenceSource } from '../evidence/sources/chat.js';
import { isStrongLink, linkChatToCode } from '../evidence/chat-linker.js';
import { getProjectIndex } from '../search/bm25.js';
import { recordExport } from '../policy/audit.js';

export {
  WhyError,
  queryAnalyzerCitations,
  findRepositoryRoot,
  parseTargetSpec,
  parseRemote,
  mineReferences,
  fetchDiscussions,
};

const DEFAULTS = {
  limit: 20,
  since: null,
  rev: null,
  patches: false,
  discussions: false,
  chats: false,
  chatsWeak: false,
  maxDiscussions: DEFAULT_MAX_DISCUSSIONS,
  maxComments: DEFAULT_MAX_COMMENTS,
  discussionTimeoutMs: DEFAULT_DISCUSSION_TIMEOUT_MS,
  token: null,
  fetch: null,
  env: null,
  couplingWindow: 500,
  couplingTop: 10,
  maxFilesPerCommit: 50,
  maxRelated: 20,
  maxTests: 10,
  style: 'markdown',
  analyzerDb: null,
  analyzer: false,
  budget: null,
  ask: null,
  redact: true,
  cwd: null,
  repos: null,
  evidenceSources: null,
  sourceTimeoutMs: DEFAULT_SOURCE_TIMEOUT_MS,
  githubApiBase: null,
  gitlabApiBase: null,
  provider: null,
  evidenceCachePath: null,
  destination: null,
};

const MAX_NOTES = 50;
const NEVER_COMMITTED = 'the file is staged but has never been committed';
const RELATED_KIND_ORDER = { adr: 0, changelog: 1, doc: 2, comment: 3 };

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
  opts.maxDiscussions = integerOption('maxDiscussions', opts.maxDiscussions, 0, 100);
  opts.maxComments = integerOption('maxComments', opts.maxComments, 0, 50);
  opts.discussionTimeoutMs = integerOption(
    'discussionTimeoutMs',
    opts.discussionTimeoutMs,
    100,
    60000
  );
  opts.sourceTimeoutMs = integerOption('sourceTimeoutMs', opts.sourceTimeoutMs, 10, 60000);
  if (opts.evidenceSources !== null && !Array.isArray(opts.evidenceSources)) {
    throw new WhyError('INVALID_OPTION', 'evidenceSources must be an array of EvidenceSource');
  }
  opts.couplingWindow = integerOption('couplingWindow', opts.couplingWindow, 0, 100000);
  opts.couplingTop = integerOption('couplingTop', opts.couplingTop, 1, 1000);
  opts.maxFilesPerCommit = integerOption('maxFilesPerCommit', opts.maxFilesPerCommit, 1, 100000);
  opts.maxRelated = integerOption('maxRelated', opts.maxRelated, 0, 1000);
  opts.maxTests = integerOption('maxTests', opts.maxTests, 0, 1000);
  if (opts.budget !== null) opts.budget = integerOption('budget', opts.budget, 1, 100000000);

  if (!STYLES.includes(opts.style)) {
    throw new WhyError(
      'INVALID_OPTION',
      `style must be one of ${STYLES.join(', ')}(got ${JSON.stringify(opts.style)})`.replace(
        ')(',
        ') ('
      )
    );
  }
  if (opts.since !== null) {
    const since = String(opts.since).trim();
    if (!since || since.length > 100 || since.startsWith('-') || !/^[\w .:+/\-,]+$/.test(since)) {
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
  if (opts.provider !== null) {
    const provider = String(opts.provider).trim().toLowerCase();
    if (provider !== 'github' && provider !== 'gitlab') {
      throw new WhyError(
        'INVALID_OPTION',
        `provider must be "github" or "gitlab" (got ${JSON.stringify(opts.provider)})`
      );
    }
    opts.provider = provider;
  }
  opts.patches = Boolean(opts.patches);
  opts.discussions = Boolean(opts.discussions);
  opts.chatsWeak = Boolean(opts.chatsWeak);
  opts.chats = Boolean(opts.chats || opts.chatsWeak);
  if (opts.destination === 'mcp' || opts.destination === 'rest') {
    opts.chats = false;
    opts.chatsWeak = false;
  }
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
function openProject(root, opts, { checkRev = true } = {}) {
  if (typeof root !== 'string' || !fs.statSync(root, { throwIfNoEntry: false })?.isDirectory()) {
    throw new WhyError('ROOT_NOT_FOUND', `Project root is not a directory: ${root}`);
  }
  const projectRoot = fs.realpathSync(root);
  const top = findRepositoryRoot(projectRoot);
  if (
    checkRev &&
    opts.rev &&
    !tryGit(top, ['rev-parse', '--verify', '--quiet', `${opts.rev}^{commit}`])
  ) {
    throw new WhyError('UNKNOWN_REF', `Unknown revision: ${opts.rev}`);
  }
  const info = readRepositoryInfo(top);
  const warnings = [];
  if (info.shallow) {
    warnings.push(
      'This is a shallow clone, so history is truncated at the clone depth: the oldest commit shown may not be where the code started (`git fetch --unshallow` fetches the rest).'
    );
  }
  const isExcluded = createPathFilter(projectRoot, { env: opts.env });
  return {
    projectRoot,
    top,
    base: opts.cwd ? path.resolve(projectRoot, opts.cwd) : projectRoot,
    rev: opts.rev,
    info,
    remote: parseRemote(info.remoteUrl),
    isExcluded,
    policy: isExcluded.policy,
    warnings,
  };
}

function isGitWorkTree(dir) {
  try {
    return Boolean(findRepositoryRoot(dir));
  } catch {
    return false;
  }
}

function buildWorkspaceRepoInputs(primaryRoot, extraRepos) {
  const realPrimary = fs.existsSync(primaryRoot)
    ? fs.realpathSync(primaryRoot)
    : path.resolve(primaryRoot);
  const isContainerOfExtra = extraRepos.some((item) => {
    const raw = typeof item === 'string' ? item : item?.path;
    if (typeof raw !== 'string' || !raw.trim()) return false;
    const resolved = path.resolve(raw);
    const real = fs.existsSync(resolved) ? fs.realpathSync(resolved) : resolved;
    return real !== realPrimary && real.startsWith(realPrimary + path.sep);
  });
  if (isContainerOfExtra || !isGitWorkTree(realPrimary)) {
    return [...extraRepos];
  }
  return [primaryRoot, ...extraRepos];
}

function resolveWorkspaceWhyTarget(workspaceRepos, target, opts) {
  const repoByAlias = new Map(workspaceRepos.map((r) => [r.alias, r]));
  const realCwd =
    opts.cwd && fs.existsSync(opts.cwd)
      ? fs.realpathSync(opts.cwd)
      : opts.cwd
        ? path.resolve(opts.cwd)
        : null;
  const cwdRepo = realCwd
    ? workspaceRepos.find(
        (r) => realCwd === r.realRoot || realCwd.startsWith(r.realRoot + path.sep)
      )
    : null;

  // 1. Check explicit `<alias>/<rest>` prefix
  if (typeof target === 'string') {
    const posix = target.replace(/\\/g, '/').replace(/^\/+/, '');
    const slashIdx = posix.indexOf('/');
    if (slashIdx > 0) {
      const alias = posix.slice(0, slashIdx);
      const rest = posix.slice(slashIdx + 1);
      const matched = repoByAlias.get(alias);
      if (matched && rest) {
        matched.project.base = matched.project.projectRoot;
        return { targetRepo: matched, innerTarget: rest };
      }
    }
  } else if (target && typeof target === 'object' && typeof target.file === 'string') {
    const posix = target.file.replace(/\\/g, '/').replace(/^\/+/, '');
    const slashIdx = posix.indexOf('/');
    if (slashIdx > 0) {
      const alias = posix.slice(0, slashIdx);
      const rest = posix.slice(slashIdx + 1);
      const matched = repoByAlias.get(alias);
      if (matched && rest) {
        matched.project.base = matched.project.projectRoot;
        return { targetRepo: matched, innerTarget: { ...target, file: rest } };
      }
    }
  }

  // 2. Unprefixed target: check cwdRepo first (if cwd is inside a workspace repo), then each repo
  const ordered = cwdRepo
    ? [cwdRepo, ...workspaceRepos.filter((r) => r.alias !== cwdRepo.alias)]
    : workspaceRepos;

  const hasCandidateInRepo = (repo, useCwdBase) => {
    const base = useCwdBase ? realCwd : repo.project.projectRoot;
    try {
      const spec =
        typeof target === 'string'
          ? parseTargetSpec(target, (file) =>
              Boolean(fs.statSync(path.resolve(base, file), { throwIfNoEntry: false })?.isFile())
            )
          : objectTarget(target);
      const located = resolveInsideRoot(repo.project.projectRoot, base, spec.file, {
        mustExist: false,
      });
      const gitPath = toGitPath(path.relative(repo.project.top, located.absolute));
      if (opts.rev) {
        return (
          tryGit(repo.project.top, ['cat-file', '-t', `${opts.rev}:${gitPath}`])?.trim() === 'blob'
        );
      }
      if (fs.statSync(located.absolute, { throwIfNoEntry: false })?.isFile()) {
        return true;
      }
      const deleted = tryGit(repo.project.top, [
        'log',
        '-n',
        '1',
        '--format=%h',
        '--',
        literal(gitPath),
      ])?.trim();
      return Boolean(deleted);
    } catch {
      return false;
    }
  };

  for (const repo of ordered) {
    const useCwdBase = Boolean(cwdRepo && repo.alias === cwdRepo.alias);
    if (hasCandidateInRepo(repo, useCwdBase)) {
      repo.project.base = useCwdBase ? realCwd : repo.project.projectRoot;
      return { targetRepo: repo, innerTarget: target };
    }
  }

  const fallback = cwdRepo ?? workspaceRepos[0];
  fallback.project.base =
    cwdRepo && fallback.alias === cwdRepo.alias ? realCwd : fallback.project.projectRoot;
  return { targetRepo: fallback, innerTarget: target };
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
  if (isExcluded.isDenied(relPath)) {
    throw new WhyError('POLICY_DENIED', `${relPath} is denied by the export policy`);
  }

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

function commitWebUrl(remote, sha) {
  if (!remote?.provider || !remote?.webUrl || !sha) return null;
  if (remote.provider === 'github') return `${remote.webUrl}/commit/${sha}`;
  if (remote.provider === 'gitlab') return `${remote.webUrl}/-/commit/${sha}`;
  if (remote.provider === 'bitbucket') return `${remote.webUrl}/commits/${sha}`;
  return null;
}

const commitEvidenceId = (commit) => `commit:${commit.sha}`;
const discussionEvidenceId = (disc) =>
  `discussion:${disc.provider || 'remote'}:${disc.repo || 'repo'}:${disc.id}`;
const discussionCommentEvidenceId = (disc, idx) =>
  `discussion-comment:${disc.provider || 'remote'}:${disc.repo || 'repo'}:${disc.id}:${idx + 1}`;

/**
 * Build EvidenceSource connectors for `ctxman why`:
 * - Default runs are offline (no remote discussions), so `citations[]` is always populated
 *   from local git commit history (`kind: 'commit'`) without network calls.
 * - When `discussions: true`, remote PR/MR/issue discussions and their review comments are
 *   mapped to `pr`, `issue`, and `review-comment` Evidence records.
 */
function buildWhyEvidenceSources(
  history,
  discussions,
  remote,
  extraSources,
  remoteEvidenceSource = null,
  chatEvidenceSource = null
) {
  const commits = history?.commits ?? [];
  const commitDateByShortSha = new Map(commits.map((c) => [c.shortSha, c.date]));

  const commitSource = {
    id: 'git-commits',
    available: () => commits.length > 0,
    search: async () => {
      const total = Math.max(commits.length, 1);
      return commits.map((commit, idx) => ({
        id: commitEvidenceId(commit),
        kind: 'commit',
        source: 'git',
        url: commitWebUrl(remote, commit.sha),
        ref: commit.sha,
        timestamp: commit.date,
        author: commit.author,
        title: commit.subject || undefined,
        excerpt: commit.body || commit.subject || commit.shortSha,
        score: Number((1 - (idx / total) * 0.5).toFixed(4)),
      }));
    },
  };

  const discussionSource = {
    id: 'discussions',
    available: () => Array.isArray(discussions) && discussions.length > 0,
    search: async () => {
      const items = [];
      for (const disc of discussions) {
        const isChangeRequest = disc.kind === 'pr' || disc.kind === 'mr';
        const fallbackDate =
          (Array.isArray(disc.commits) && commitDateByShortSha.get(disc.commits[0])) || null;
        const discTimestamp = disc.createdAt || fallbackDate;

        items.push({
          id: discussionEvidenceId(disc),
          kind: isChangeRequest ? 'pr' : 'issue',
          source: disc.provider || 'discussions',
          url: disc.url || null,
          ref: disc.id,
          timestamp: discTimestamp,
          author: disc.author || undefined,
          title: disc.title || undefined,
          excerpt: disc.body || disc.title || disc.id,
          score: isChangeRequest ? 0.95 : 0.9,
        });

        const comments = Array.isArray(disc.comments) ? disc.comments : [];
        comments.forEach((comment, idx) => {
          items.push({
            id: discussionCommentEvidenceId(disc, idx),
            kind: 'review-comment',
            source: disc.provider || 'discussions',
            url: disc.url || null,
            ref: `${disc.id}#comment-${idx + 1}`,
            timestamp: comment.createdAt || discTimestamp,
            author: comment.author || undefined,
            excerpt: comment.body,
            score: 0.85,
          });
        });
      }
      return items;
    },
  };

  const sources = [commitSource, discussionSource];
  if (remoteEvidenceSource) sources.push(remoteEvidenceSource);
  if (chatEvidenceSource) sources.push(chatEvidenceSource);
  if (Array.isArray(extraSources)) sources.push(...extraSources);
  return sources;
}

/**
 * Explain why code looks the way it does, from the local git history
 *
 * @param {string} root - Project directory inside a git work tree. Target paths must stay
 *   inside it; its .gitignore / .contextignore / .contextinclude apply
 * @param {string|{file: string, symbol?: string, startLine?: number, endLine?: number}} target
 *   `file`, `file:symbol` (function, method, class; `Class.method` too), `file#L10-L40`
 *   or `file:10-40` (or `<alias>/<file>...` when `options.repos` is set)
 * @param {object} [options]
 * @param {number} [options.limit=20] - Commits to include
 * @param {string} [options.since] - Only commits after this date (git date syntax)
 * @param {string} [options.rev] - Explain the code as of this revision instead of the work tree
 * @param {boolean} [options.patches=false] - Include each commit's diff of the target
 * @param {boolean} [options.discussions=false] - Fetch referenced GitHub/GitLab issue/PR/MR discussions
 * @param {boolean} [options.chats=false] - Search local AI-assistant chats via keyflip (requires policy)
 * @param {boolean} [options.chatsWeak=false] - Include time-only chat matches within 24 h (implies chats)
 * @param {number} [options.maxDiscussions=10] - Maximum remote discussions fetched
 * @param {number} [options.maxComments=5] - Maximum comments fetched per discussion
 * @param {number} [options.discussionTimeoutMs=5000] - Per-request timeout (ms)
 * @param {string} [options.token] - Explicit GitHub/GitLab API token override
 * @param {typeof globalThis.fetch} [options.fetch] - Injectable fetch implementation
 * @param {NodeJS.ProcessEnv} [options.env] - Environment override for token lookup
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
 * @param {Array<string|{path: string, alias?: string}>} [options.repos] - Additional workspace repositories
 * @returns {Promise<{text: string, style: string, tokens: number, budget: number|null,
 *   omitted: Record<string, number>, warnings: string[], data: object, repos?: Array<{alias: string, root: string}>}>}
 */
export async function explainHistory(root, target, options = {}) {
  const opts = normalizeOptions(options);
  const isWorkspace = Array.isArray(options.repos) && options.repos.length > 0;

  let project;
  let effectiveTarget = target;
  let workspaceRepos = null;
  let targetRepo = null;

  if (isWorkspace) {
    if (typeof root !== 'string' || !fs.statSync(root, { throwIfNoEntry: false })?.isDirectory()) {
      throw new WhyError('ROOT_NOT_FOUND', `Project root is not a directory: ${root}`);
    }
    let resolvedRepos;
    try {
      resolvedRepos = resolveWorkspaceRepos(
        buildWorkspaceRepoInputs(path.resolve(root), options.repos)
      );
    } catch (error) {
      if (error instanceof WhyError) throw error;
      throw new WhyError('ROOT_NOT_FOUND', error.message);
    }

    if (!opts.redact) {
      const requiringRepo = resolvedRepos.find((r) => r.policy?.requireRedaction);
      if (requiringRepo) {
        throw new WhyError(
          'POLICY_DENIED',
          `Secret redaction is required by export policy in ${requiringRepo.alias} (--no-redact is refused)`
        );
      }
    }

    workspaceRepos = resolvedRepos.map((repo) => ({
      ...repo,
      project: openProject(repo.realRoot, { ...opts, cwd: null }, { checkRev: false }),
    }));

    const resolved = resolveWorkspaceWhyTarget(workspaceRepos, target, opts);
    targetRepo = resolved.targetRepo;
    effectiveTarget = resolved.innerTarget;
    project = targetRepo.project;

    if (
      opts.rev &&
      !tryGit(project.top, ['rev-parse', '--verify', '--quiet', `${opts.rev}^{commit}`])
    ) {
      throw new WhyError('UNKNOWN_REF', `Unknown revision: ${opts.rev}`);
    }
  } else {
    project = openProject(root, opts);
  }

  const file = readTarget(project, effectiveTarget);
  const selection = selectLines(project, file);
  const { wholeFile, range, symbol } = selection;
  const { spec, relPath, lines, totalLines, contentOmitted } = file;
  const displayTargetPath = isWorkspace ? `${targetRepo.alias}/${relPath}` : relPath;

  const env = opts.env ?? process.env;
  const githubApiBase =
    opts.githubApiBase ??
    (env.CTXMAN_GITHUB_API_URL ? String(env.CTXMAN_GITHUB_API_URL).trim() : null);
  const gitlabApiBase =
    opts.gitlabApiBase ??
    (env.CTXMAN_GITLAB_API_URL ? String(env.CTXMAN_GITLAB_API_URL).trim() : null);
  const envProvider = env.CTXMAN_GIT_PROVIDER
    ? String(env.CTXMAN_GIT_PROVIDER).trim().toLowerCase()
    : null;
  if (envProvider && envProvider !== 'github' && envProvider !== 'gitlab') {
    throw new WhyError(
      'INVALID_OPTION',
      `CTXMAN_GIT_PROVIDER must be "github" or "gitlab" (got ${JSON.stringify(env.CTXMAN_GIT_PROVIDER)})`
    );
  }
  const explicitProvider = opts.provider ?? envProvider ?? null;
  const inferredProvider =
    project.remote?.provider ??
    explicitProvider ??
    (gitlabApiBase && !githubApiBase
      ? 'gitlab'
      : githubApiBase && !gitlabApiBase
        ? 'github'
        : null);
  const effectiveRemote = project.remote ? { ...project.remote, provider: inferredProvider } : null;

  const history = historySection(project, file, selection, opts);
  const references = mineReferences(history.commits, effectiveRemote);
  for (const commit of history.commits) commit.refs = referencesOf(references, commit.shortSha);

  let discussions = [];
  if (opts.discussions) {
    const fetched = await fetchDiscussions(references.issues, effectiveRemote, {
      maxDiscussions: opts.maxDiscussions,
      maxComments: opts.maxComments,
      timeoutMs: opts.discussionTimeoutMs,
      apiBase:
        effectiveRemote?.provider === 'gitlab'
          ? (gitlabApiBase ?? undefined)
          : effectiveRemote?.provider === 'github'
            ? (githubApiBase ?? undefined)
            : undefined,
      token: opts.token ?? undefined,
      env: opts.env ?? undefined,
      fetch: opts.fetch ?? undefined,
    });
    discussions = fetched.discussions;
    project.warnings.push(...fetched.warnings);
  }

  let institutionalCitations = [];
  if (opts.analyzerDb || opts.analyzer || resolveAnalyzerDbPath(project.projectRoot) !== null) {
    const dbPath = opts.analyzerDb || project.projectRoot;
    institutionalCitations = queryAnalyzerCitations(dbPath, {
      file: relPath,
      symbol: spec.symbol,
      commits: history.commits.map((c) => c.sha),
      redact: opts.redact,
    });
  }

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

  let coupling = history.reason === NEVER_COMMITTED ? null : couplingSection(project, file, opts);
  if (isWorkspace && coupling) {
    coupling = {
      ...coupling,
      files: coupling.files.map((entry) => ({
        ...entry,
        path: `${targetRepo.alias}/${entry.path}`,
      })),
    };
  }

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

  // Docs, comments and tests that mention the target (work tree across all workspace repos)
  const member = spec.symbol ? spec.symbol.split(/\.|::|#/).pop() : null;
  const terms = searchTerms(relPath, member ? [member] : symbolsInRange.slice(0, 3));

  let relatedList;
  let testList;
  if (isWorkspace) {
    const mergedRelated = [];
    const mergedTests = [];
    for (const repo of workspaceRepos) {
      const isTargetRepo = repo.alias === targetRepo.alias;
      const repoFound = searchRelated(repo.project.projectRoot, {
        ...terms,
        target: isTargetRepo
          ? {
              path: relPath,
              startLine: range ? range.startLine : null,
              endLine: range ? range.endLine : null,
            }
          : { path: '\0__other_repo__', startLine: null, endLine: null },
        isExcluded: repo.project.isExcluded,
        maxRelated: opts.maxRelated,
        maxTests: opts.maxTests,
      });
      for (const item of repoFound.related) {
        mergedRelated.push({ ...item, path: `${repo.alias}/${item.path}` });
      }
      for (const testItem of repoFound.tests) {
        mergedTests.push({ ...testItem, path: `${repo.alias}/${testItem.path}` });
      }
    }
    mergedRelated.sort(
      (a, b) =>
        RELATED_KIND_ORDER[a.kind] - RELATED_KIND_ORDER[b.kind] ||
        (a.mentions === 'symbol' ? 0 : 1) - (b.mentions === 'symbol' ? 0 : 1) ||
        a.path.localeCompare(b.path) ||
        a.line - b.line
    );
    mergedTests.sort(
      (a, b) =>
        (a.references === 'symbol' ? 0 : 1) - (b.references === 'symbol' ? 0 : 1) ||
        b.totalMatches - a.totalMatches ||
        a.path.localeCompare(b.path)
    );
    relatedList = mergedRelated.slice(0, opts.maxRelated);
    testList = mergedTests.slice(0, opts.maxTests);
  } else {
    const found = searchRelated(project.projectRoot, {
      ...terms,
      target: {
        path: relPath,
        startLine: range ? range.startLine : null,
        endLine: range ? range.endLine : null,
      },
      isExcluded: project.isExcluded,
      maxRelated: opts.maxRelated,
      maxTests: opts.maxTests,
    });
    relatedList = found.related;
    testList = found.tests;
  }

  const shown = !contentOmitted && covered;
  const first = range?.startLine ?? 1;
  const last = range?.endLine ?? totalLines;
  const notes = shown ? findNotes(lines, first, last, relPath).slice(0, MAX_NOTES) : [];
  let source = null;
  if (shown) {
    source = wholeFile ? file.content.replace(/\n$/, '') : lines.slice(first - 1, last).join('\n');
  }

  const { info, rev } = project;
  const remote = effectiveRemote;
  const reposMeta = isWorkspace
    ? workspaceRepos.map(({ alias, root: repoRoot }) => ({ alias, root: repoRoot }))
    : undefined;

  const isPathDeniedForEvidence = (candidate) => {
    if (!candidate || typeof candidate !== 'string') return false;
    const posix = candidate.replace(/\\/g, '/').replace(/^\/+/, '');
    if (!posix) return false;
    if (isWorkspace) {
      const slashIdx = posix.indexOf('/');
      if (slashIdx > 0) {
        const alias = posix.slice(0, slashIdx);
        const rest = posix.slice(slashIdx + 1);
        const matched = workspaceRepos.find((r) => r.alias === alias);
        if (matched && rest && matched.project.isExcluded.isDenied(rest)) return true;
      }
      return workspaceRepos.some((r) => r.project.isExcluded.isDenied(posix));
    }
    return project.isExcluded.isDenied(posix);
  };

  const activePolicy = isWorkspace ? targetRepo.policy : project.policy;

  const normalizePosix = (p) =>
    String(p ?? '')
      .replace(/\\/g, '/')
      .replace(/^\.\//, '')
      .replace(/^\/+/, '');

  let chatEvidenceSource = null;
  if (opts.chats) {
    const chatPolicyAllowed = isWorkspace
      ? workspaceRepos.every((r) => Boolean(r.policy?.isSourceEnabled?.('chat')))
      : Boolean(activePolicy?.isSourceEnabled?.('chat'));
    if (!chatPolicyAllowed) {
      project.warnings.push(
        'Chat evidence source is disabled by policy (set "sources": { "chat": { "enabled": true } } in .ctxman/policy.json to enable).'
      );
    } else {
      const linkChatParts = async (parts) => {
        if (!Array.isArray(parts) || parts.length === 0) return parts;

        const projectIndex = getProjectIndex(project.projectRoot);
        const files = [];
        const symbols = [];
        let targetEntry = null;
        const targetRelPosix = normalizePosix(relPath);

        for (const entry of projectIndex.files.values()) {
          const entryPosix = normalizePosix(entry.relativePath);
          if (!entryPosix || isPathDeniedForEvidence(entryPosix)) continue;
          files.push(entryPosix);
          if (entryPosix === targetRelPosix) targetEntry = entry;
          for (const unit of entry.units ?? []) {
            symbols.push({ entry, unit });
          }
        }

        if (
          targetRelPosix &&
          !files.includes(targetRelPosix) &&
          !isPathDeniedForEvidence(targetRelPosix) &&
          fs.existsSync(path.join(project.projectRoot, ...targetRelPosix.split('/')))
        ) {
          files.push(targetRelPosix);
        }

        const linked = await linkChatToCode(parts, {
          repoRoot: project.projectRoot,
          files,
          symbols,
          commits: history.commits,
          env: opts.env ?? undefined,
        });

        const anyLinkApplied = linked.some(
          (item) => Array.isArray(item.links) && item.links.length > 0
        );
        if (!anyLinkApplied) return parts;

        const targetSymbolNames = new Set(
          (terms.symbols ?? []).filter((s) => typeof s === 'string' && s.trim())
        );
        if (spec.symbol) {
          targetSymbolNames.add(spec.symbol);
          const bareSpec = spec.symbol.split(/\.|::|#/).pop();
          if (bareSpec) targetSymbolNames.add(bareSpec);
        } else if (targetEntry?.units) {
          for (const unit of targetEntry.units) {
            const bare = String(unit.name).replace(/^(?:get|set)\s+/, '');
            targetSymbolNames.add(unit.name);
            targetSymbolNames.add(bare);
            if (unit.parent) {
              targetSymbolNames.add(`${unit.parent}.${bare}`);
            }
          }
        }

        const targetCommitShas = history.commits
          .map((commit) => (typeof commit.sha === 'string' ? commit.sha.toLowerCase() : ''))
          .filter(Boolean);

        const matchesTargetStrong = (link) => {
          if (!isStrongLink(link)) return false;
          if (link.type === 'path') {
            return link.value === targetRelPosix;
          }
          if (link.type === 'symbol') {
            if (targetSymbolNames.has(link.value)) return true;
            if (link.value.includes('.')) {
              return targetSymbolNames.has(link.value.split('.').pop());
            }
            return false;
          }
          if (link.type === 'sha') {
            const lower = link.value.toLowerCase();
            return targetCommitShas.some((sha) => sha === lower || sha.startsWith(lower));
          }
          return false;
        };

        return linked.filter(
          (part) =>
            part.links.some(matchesTargetStrong) ||
            (opts.chatsWeak && part.links.some((link) => link.type === 'time'))
        );
      };

      chatEvidenceSource = createChatEvidenceSource({
        root: project.projectRoot,
        timeoutMs: opts.sourceTimeoutMs,
        env: opts.env ?? undefined,
        redactPII: Boolean(activePolicy?.redactPII),
        link: linkChatParts,
      });
    }
  }

  let remoteEvidenceSource = null;
  if (opts.discussions && remote?.repoPath) {
    const sharedSourceOpts = {
      root: project.projectRoot,
      remote,
      commits: history.commits.map((c) => c.sha),
      cachePath: opts.evidenceCachePath ?? undefined,
      token: opts.token ?? undefined,
      env: opts.env ?? undefined,
      fetch: opts.fetch ?? undefined,
      timeoutMs: opts.discussionTimeoutMs,
    };
    if (remote.provider === 'github') {
      remoteEvidenceSource = createGitHubEvidenceSource({
        ...sharedSourceOpts,
        apiBase: githubApiBase ?? undefined,
        ...(options?.maxComments !== undefined && options?.maxComments !== null
          ? { maxComments: opts.maxComments }
          : {}),
      });
    } else if (remote.provider === 'gitlab') {
      remoteEvidenceSource = createGitLabEvidenceSource({
        ...sharedSourceOpts,
        apiBase: gitlabApiBase ?? undefined,
        ...(options?.maxComments !== undefined && options?.maxComments !== null
          ? { maxNotes: opts.maxComments }
          : {}),
      });
    }
  }

  const evidenceResult = await runSources(
    buildWhyEvidenceSources(
      history,
      discussions,
      remote,
      opts.evidenceSources,
      remoteEvidenceSource,
      chatEvidenceSource
    ),
    displayTargetPath,
    {
      paths: [displayTargetPath],
      symbols: terms.symbols,
      since: opts.since,
      timeoutMs: opts.sourceTimeoutMs,
      isDenied: isPathDeniedForEvidence,
      redactPII: Boolean(activePolicy?.redactPII),
    }
  );
  project.warnings.push(...evidenceResult.warnings);

  const citationNumberById = new Map(
    evidenceResult.evidence.map((item, index) => [item.id, index + 1])
  );
  for (const commit of history.commits) {
    const id = commitEvidenceId(commit);
    const num = citationNumberById.get(id);
    if (num !== undefined) {
      commit.citation = num;
      commit.citationId = id;
    }
  }
  for (const disc of discussions) {
    const id = discussionEvidenceId(disc);
    const num = citationNumberById.get(id);
    if (num !== undefined) {
      disc.citation = num;
      disc.citationId = id;
    }
    if (Array.isArray(disc.comments)) {
      disc.comments.forEach((comment, idx) => {
        const commentId = discussionCommentEvidenceId(disc, idx);
        const commentNum = citationNumberById.get(commentId);
        if (commentNum !== undefined) {
          comment.citation = commentNum;
          comment.citationId = commentId;
        }
      });
    }
  }

  let data = {
    ...(reposMeta ? { repos: reposMeta } : {}),
    target: {
      path: displayTargetPath,
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
    discussions,
    institutionalCitations,
    citations: evidenceResult.evidence,
    ownership,
    coupling,
    related: relatedList,
    notes,
    tests: testList,
    warnings: project.warnings,
    question: opts.ask,
  };

  const redactionCounts = {};
  if (opts.redact) {
    data = redactDeep(data, redactionCounts);
    if (Object.keys(redactionCounts).length) {
      data.warnings.push(
        `Secrets masked as [REDACTED:<type>]: ${formatRedactionSummary(redactionCounts)} (use --no-redact to keep them).`
      );
    }
  }

  const rendered = renderWithinBudget(data, { style: opts.style, budget: opts.budget });

  if (isWorkspace) {
    for (const repo of workspaceRepos) {
      if (repo.policy?.maxExportTokens !== null && repo.policy?.maxExportTokens !== undefined) {
        if (rendered.tokens > repo.policy.maxExportTokens) {
          throw new WhyError(
            'POLICY_DENIED',
            `Export of ${rendered.tokens} tokens exceeds maxExportTokens (${repo.policy.maxExportTokens}) in ${repo.alias}`
          );
        }
      }
    }
  }

  if (activePolicy?.audit?.enabled) {
    const repoPrefix = isWorkspace ? `${targetRepo.alias}/` : '';
    const stripAlias = (p) =>
      typeof p === 'string' && repoPrefix && p.startsWith(repoPrefix)
        ? p.slice(repoPrefix.length)
        : null;
    const exportedFiles = isWorkspace
      ? [
          ...new Set([
            relPath,
            ...relatedList.map((r) => stripAlias(r.path)).filter(Boolean),
            ...testList.map((t) => stripAlias(t.path)).filter(Boolean),
          ]),
        ]
      : [...new Set([relPath, ...relatedList.map((r) => r.path), ...testList.map((t) => t.path)])];
    const usedPrivateSources = evidenceResult.evidence.some((item) => item.kind === 'chat')
      ? ['chat']
      : undefined;

    recordExport(
      activePolicy,
      {
        command: 'why',
        root: project.projectRoot,
        format: opts.style,
        destination: opts.destination ?? 'stdout',
        files: exportedFiles,
        tokens: rendered.tokens,
        redactions: redactionCounts,
        ...(usedPrivateSources ? { privateSources: usedPrivateSources } : {}),
        text: rendered.text,
      },
      { warn: (message) => data.warnings.push(message) }
    );
  }

  return {
    ...(reposMeta ? { repos: reposMeta } : {}),
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

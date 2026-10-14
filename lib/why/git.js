/**
 * Git access for `ctxman why`
 *
 * Every command runs through execFileSync with an argument list (no shell). Unlike
 * GitClient.exec() this runner keeps output untrimmed (blame and patches are
 * whitespace-sensitive), allows large outputs, lets callers accept exit codes such as
 * `git grep`'s 1 for "no match", and logs nothing: an expected failure must not print
 * to stdout, which carries the document.
 */

import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { WhyError } from './errors.js';

// Settings that would change the output format (signature blocks, quoted paths, colour)
const BASE_ARGS = [
  '-c',
  'core.quotePath=false',
  '-c',
  'log.showSignature=false',
  '-c',
  'color.ui=false',
];

const MAX_BUFFER = 256 * 1024 * 1024;

/**
 * Run git and return its stdout
 * @param {string} cwd - Working directory
 * @param {string[]} args - Arguments after `git`
 * @param {object} [options]
 * @param {string} [options.input] - Text for stdin
 * @param {number[]} [options.okStatuses] - Exit codes that count as success (default [0])
 * @param {'utf-8'|'buffer'} [options.encoding] - 'buffer' returns the raw bytes
 * @returns {string|Buffer}
 */
export function runGit(cwd, args, { input, okStatuses = [0], encoding = 'utf-8' } = {}) {
  try {
    return execFileSync('git', [...BASE_ARGS, ...args], {
      cwd,
      encoding,
      maxBuffer: MAX_BUFFER,
      input,
      stdio: ['pipe', 'pipe', 'pipe'],
      // Read-only use: never take optional locks, never prompt
      env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' },
    });
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new WhyError('GIT_NOT_FOUND', 'git is not installed or not on PATH');
    }
    if (typeof error.status === 'number' && okStatuses.includes(error.status)) {
      if (encoding === 'buffer') return error.stdout ?? Buffer.alloc(0);
      return error.stdout ? String(error.stdout) : '';
    }
    const stderr = error.stderr ? String(error.stderr).trim() : '';
    const failure = new Error(stderr || error.message);
    failure.status = error.status;
    failure.stderr = stderr;
    throw failure;
  }
}

/**
 * Like runGit, but returns null instead of throwing on a git error. Success can be an
 * empty string (`git cat-file -e`), so test the result against null, not for truthiness
 * @param {string} cwd
 * @param {string[]} args
 * @param {object} [options]
 * @returns {string|Buffer|null}
 */
export function tryGit(cwd, args, options) {
  try {
    return runGit(cwd, args, options);
  } catch (error) {
    if (error instanceof WhyError) throw error;
    return null;
  }
}

/**
 * Top-level directory of the work tree containing `dir`
 * @param {string} dir
 * @returns {string} Real (symlink-resolved) path
 */
export function findRepositoryRoot(dir) {
  if (!dir || !fs.statSync(dir, { throwIfNoEntry: false })?.isDirectory()) {
    throw new WhyError('ROOT_NOT_FOUND', `Not a directory: ${dir}`);
  }
  let top;
  try {
    top = runGit(dir, ['rev-parse', '--show-toplevel']).trim();
  } catch (error) {
    if (error instanceof WhyError) throw error;
    const reason = error.stderr ? ` (${error.stderr.split('\n')[0]})` : '';
    throw new WhyError(
      'NOT_A_GIT_REPO',
      `Not a git repository: ${dir}${reason}. ctxman why reads git history; run it inside a git work tree.`
    );
  }
  if (!top) {
    throw new WhyError('NOT_A_GIT_REPO', `Not a git work tree: ${dir}`);
  }
  return fs.realpathSync(top);
}

/**
 * Commits whose parents a shallow clone did not fetch (the `shallow` file in the git
 * directory). git shows them as root commits, so their diff looks like they added
 * everything
 * @param {string} top - Work tree root
 * @returns {Set<string>} Full hashes
 */
function readShallowBoundary(top) {
  const file = tryGit(top, ['rev-parse', '--git-path', 'shallow'])?.trim();
  if (!file) return new Set();
  try {
    const content = fs.readFileSync(path.resolve(top, file), 'utf-8');
    return new Set(content.split('\n').filter((line) => /^[0-9a-f]{40,64}$/.test(line)));
  } catch (_error) {
    return new Set();
  }
}

/**
 * Facts about the repository that shape the output
 * @param {string} top - Work tree root
 * @returns {{shallow: boolean, boundary: Set<string>, head: string|null,
 *   remoteUrl: string|null}} boundary: see readShallowBoundary (empty unless shallow)
 */
export function readRepositoryInfo(top) {
  const shallow = tryGit(top, ['rev-parse', '--is-shallow-repository'])?.trim() === 'true';
  const boundary = shallow ? readShallowBoundary(top) : new Set();
  const head = tryGit(top, ['rev-parse', '--verify', '--quiet', 'HEAD'])?.trim() || null;
  const remoteUrl = tryGit(top, ['remote', 'get-url', 'origin'])?.trim() || null;
  return { shallow, boundary, head, remoteUrl };
}

/**
 * A pathspec matching exactly this path: no glob characters, no pathspec magic
 * @param {string} gitPath
 * @returns {string}
 */
export function literalPathspec(gitPath) {
  return `:(literal)${gitPath}`;
}

/**
 * Convert an OS path relative to the work tree into git's forward-slash form
 * @param {string} relativePath
 * @returns {string}
 */
export function toGitPath(relativePath) {
  return relativePath.split(path.sep).join('/');
}

/**
 * A git date as ISO 8601 in UTC, to the second (2024-01-02T10:00:00Z). Commit dates
 * (`%aI`, author's offset) and blame times (epoch seconds) end up in one form, so dates
 * compare and print alike across sections
 * @param {string|number} value - ISO 8601 text, or seconds since the epoch
 * @returns {string|null} null for a missing or unparsable date
 */
export function utcDate(value) {
  const time = typeof value === 'number' ? value * 1000 : Date.parse(value);
  if (!value || !Number.isFinite(time)) return null;
  return new Date(time).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

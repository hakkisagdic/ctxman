/**
 * Remote Git Repository Helper (P1-3)
 *
 * Safely resolves GitHub/GitLab/Bitbucket shorthand (`owner/repo`, `github:owner/repo`),
 * HTTPS/SSH URLs, or local `file://` / bare repository paths, performs a shallow
 * `git clone --depth 1` into a temporary directory using `execFileSync` (no shell),
 * and guarantees cleanup after analysis or packing.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { isValidGitRef } from '../integrations/git/GitClient.js';

const UNSAFE_SPEC_CHARS = /[;&|`$<>\\\0\r\n]/;
const SHORTHAND_REPO_REGEX = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const PREFIXED_SHORTHAND_REGEX = /^(github|gitlab|bitbucket):([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)$/i;
const ALLOWED_URL_PROTOCOLS = new Set(['https:', 'http:', 'file:', 'ssh:', 'git:']);

const HOST_BY_PREFIX = {
  github: 'https://github.com',
  gitlab: 'https://gitlab.com',
  bitbucket: 'https://bitbucket.org',
};

/**
 * Resolve and validate a remote repository specification.
 * Supports:
 * - `owner/repo` -> `https://github.com/owner/repo.git`
 * - `github:owner/repo`, `gitlab:owner/repo`, `bitbucket:owner/repo`
 * - `https://github.com/owner/repo(.git)`
 * - `file:///absolute/path/to/repo` or an existing local git directory path
 *
 * @param {string} remoteSpec
 * @returns {string} Resolved Git clone URL or local path
 */
export function resolveRemoteGitUrl(remoteSpec) {
  if (typeof remoteSpec !== 'string' || !remoteSpec.trim()) {
    throw new Error('Invalid remote repository specification: must be a non-empty string');
  }

  const trimmed = remoteSpec.trim();
  if (trimmed.startsWith('-')) {
    throw new Error(`Invalid remote repository specification (cannot start with "-"): ${trimmed}`);
  }
  if (UNSAFE_SPEC_CHARS.test(trimmed)) {
    throw new Error(`Unsafe characters in remote repository specification: ${trimmed}`);
  }

  // 1. Existing local path (used for local bare repos / offline fixtures)
  if (
    (trimmed.startsWith('/') || trimmed.startsWith('./') || trimmed.startsWith('../')) &&
    fs.existsSync(trimmed)
  ) {
    return path.resolve(trimmed);
  }

  // 2. Prefixed shorthand: github:owner/repo, gitlab:owner/repo, bitbucket:owner/repo
  const prefixedMatch = PREFIXED_SHORTHAND_REGEX.exec(trimmed);
  if (prefixedMatch) {
    const host = HOST_BY_PREFIX[prefixedMatch[1].toLowerCase()];
    const slug = prefixedMatch[2].replace(/\.git$/i, '');
    return `${host}/${slug}.git`;
  }

  // 3. Full URL (https://, http://, file://, ssh://, git://)
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)) {
    let parsed;
    try {
      parsed = new URL(trimmed);
    } catch {
      throw new Error(`Malformed remote repository URL: ${trimmed}`);
    }
    if (!ALLOWED_URL_PROTOCOLS.has(parsed.protocol)) {
      throw new Error(`Unsupported remote repository protocol: ${parsed.protocol}`);
    }
    return trimmed;
  }

  // 4. Existing local directory fallback (e.g. relative path)
  if (fs.existsSync(trimmed) && fs.statSync(trimmed).isDirectory()) {
    return path.resolve(trimmed);
  }

  // 5. GitHub shorthand `owner/repo`
  if (SHORTHAND_REPO_REGEX.test(trimmed)) {
    const [owner, repo] = trimmed.split('/');
    if (owner === '.' || owner === '..' || repo === '.' || repo === '..') {
      throw new Error(`Invalid repository shorthand: ${trimmed}`);
    }
    const cleanRepo = repo.replace(/\.git$/i, '');
    return `https://github.com/${owner}/${cleanRepo}.git`;
  }

  throw new Error(`Unrecognized remote repository specification: ${trimmed}`);
}

/**
 * Perform a shallow clone (`--depth 1`) of a remote repository into a temporary directory.
 *
 * @param {string} remoteSpec
 * @param {object} [options]
 * @param {string} [options.branch] - Branch or tag ref to checkout
 * @param {number} [options.depth=1] - Shallow clone depth
 * @param {number} [options.timeoutMs=60000] - Clone timeout in ms
 * @returns {{dir: string, url: string, branch: string|null, cleanup: () => void}}
 */
export function cloneRemoteRepo(remoteSpec, options = {}) {
  const url = resolveRemoteGitUrl(remoteSpec);
  const branch =
    options.branch != null && String(options.branch).trim() !== ''
      ? String(options.branch).trim()
      : null;

  if (branch !== null && !isValidGitRef(branch)) {
    throw new Error(`Invalid git reference for branch: ${JSON.stringify(branch)}`);
  }

  const depth = Number.isInteger(options.depth) && options.depth > 0 ? options.depth : 1;
  const timeoutMs =
    Number.isInteger(options.timeoutMs) && options.timeoutMs > 0 ? options.timeoutMs : 60000;

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-remote-'));
  const targetDir = path.join(tempRoot, 'repo');

  const cloneUrl = url.startsWith('/') && !url.startsWith('file://') ? `file://${url}` : url;

  const args = ['clone', '--depth', String(depth)];
  if (branch) {
    args.push('--branch', branch);
  }
  args.push('--', cloneUrl, targetDir);

  try {
    execFileSync('git', args, {
      stdio: 'pipe',
      timeout: timeoutMs,
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0',
      },
    });
  } catch (error) {
    fs.rmSync(tempRoot, { recursive: true, force: true });
    const stderr = error.stderr ? String(error.stderr).trim() : error.message;
    throw new Error(`Failed to clone remote repository "${remoteSpec}": ${stderr}`);
  }

  const cleanup = () => {
    try {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  };

  return {
    dir: targetDir,
    url,
    branch,
    cleanup,
  };
}

/**
 * Clone a remote repository into a temporary directory, execute `fn(repoDir, meta)`,
 * and guarantee cleanup of the temporary clone afterwards.
 *
 * @param {string} remoteSpec
 * @param {object|Function} optionsOrFn
 * @param {Function} [maybeFn]
 * @returns {Promise<any>}
 */
export async function withRemoteRepo(remoteSpec, optionsOrFn, maybeFn) {
  const options = typeof optionsOrFn === 'function' ? {} : optionsOrFn || {};
  const fn = typeof optionsOrFn === 'function' ? optionsOrFn : maybeFn;
  if (typeof fn !== 'function') {
    throw new Error('withRemoteRepo requires a callback function');
  }

  const cloned = cloneRemoteRepo(remoteSpec, options);
  try {
    return await fn(cloned.dir, {
      remote: remoteSpec,
      url: cloned.url,
      branch: cloned.branch,
      dir: cloned.dir,
    });
  } finally {
    cloned.cleanup();
  }
}

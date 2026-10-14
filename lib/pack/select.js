/**
 * File selection for `pack`: the project scan (with .gitignore, .contextignore and
 * .contextinclude) or an explicit list, narrowed by --include/--exclude globs
 */

import fs from 'fs';
import path from 'path';
import { Scanner } from '../core/Scanner.js';
import GitIgnoreParser from '../parsers/gitignore-parser.js';
import FileUtils from '../utils/file-utils.js';

/** Error with a machine-readable code (PATH_OUTSIDE_ROOT, ROOT_NOT_FOUND, ...) */
export class PackError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PackError';
    this.code = code;
  }
}

const toPosix = (relativePath) => relativePath.split(path.sep).join('/');

/**
 * Path of `target` relative to `root` when it lies strictly below it, else null
 * (`..config` is a file name, `../config` is outside)
 * @param {string} root - Absolute directory
 * @param {string} target - Absolute path
 * @returns {string|null}
 */
function relativeInside(root, target) {
  const relative = path.relative(root, target);
  if (relative === '' || path.isAbsolute(relative)) return null;
  if (relative === '..' || relative.startsWith(`..${path.sep}`)) return null;
  return relative;
}

/**
 * Compile gitignore-style globs with the same rules as .contextinclude/.contextignore
 * @param {string[]} globs
 * @param {boolean} includeMode - true: a `!glob` excludes (as in .contextinclude)
 * @returns {{test: function(string): boolean}|null} null when there are no globs
 */
function globMatcher(globs, includeMode) {
  const patterns = globs.map((glob) => glob.trim()).filter(Boolean);
  if (!patterns.length) return null;
  // Only the pattern helpers are used: missing ignore files load nothing
  const parser = new GitIgnoreParser('', '', '');
  const compiled = patterns.map((pattern) => parser.convertToRegex(pattern));
  return {
    test: (relativePath) =>
      includeMode
        ? parser.testPatternsWithNegation(compiled, relativePath)
        : parser.testPatterns(compiled, relativePath, 'exclude'),
  };
}

/**
 * Pick the files to pack
 * @param {string} root - Project root
 * @param {object} options
 * @param {string[]} [options.files] - Explicit list (replaces the scan); relative entries
 *   are resolved against `options.cwd`. Every entry must stay inside the root, and the
 *   project's ignore files still apply to it.
 * @param {string} [options.cwd] - Base for relative `files` entries (default: root)
 * @param {string[]} [options.include] - Keep only matching files
 * @param {string[]} [options.exclude] - Leave matching files out
 * @param {string[]} [options.excludeFiles] - Absolute paths to leave out (the output file)
 * @param {number} [options.maxFileSize] - Larger files are skipped
 * @returns {{root: string, files: Array<{absolutePath: string, path: string, size: number,
 *   modified: Date}>, skipped: Array<{path: string, reason: string}>}}
 */
export function selectFiles(root, options = {}) {
  const rootPath = path.resolve(root);
  if (!fs.statSync(rootPath, { throwIfNoEntry: false })?.isDirectory()) {
    throw new PackError('ROOT_NOT_FOUND', `Not a directory: ${root}`);
  }
  const skipped = [];
  const candidates = options.files
    ? listedFiles(rootPath, options.files, options.cwd ?? rootPath, skipped)
    : scannedFiles(rootPath);

  const include = globMatcher(options.include ?? [], true);
  const exclude = globMatcher(options.exclude ?? [], false);
  const excluded = new Set((options.excludeFiles ?? []).map((file) => path.resolve(file)));
  const maxFileSize = options.maxFileSize ?? Infinity;

  const files = [];
  for (const file of candidates) {
    if (include && !include.test(file.path)) continue;
    if (exclude?.test(file.path)) continue;
    if (excluded.has(file.absolutePath)) continue;
    if (file.size > maxFileSize) {
      skipped.push({ path: file.path, reason: 'too-large' });
      continue;
    }
    files.push(file);
  }
  return { root: rootPath, files, skipped };
}

/** Files found by the Scanner, in path order */
function scannedFiles(rootPath) {
  return new Scanner(rootPath)
    .scan()
    .map((file) => ({
      absolutePath: file.path,
      path: toPosix(file.relativePath),
      size: file.size,
      modified: file.modified,
    }))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/**
 * Whether the scan would leave a listed file out: a skipped directory (node_modules, .git,
 * ...) on its path, or a .gitignore/.contextignore/.contextinclude rule on the file or one
 * of its directories, checked the way the Scanner walks down to it
 */
function isIgnored(scanner, rootPath, relativePath) {
  const segments = relativePath.split(path.sep);
  for (let depth = 1; depth < segments.length; depth++) {
    const directory = segments.slice(0, depth).join(path.sep);
    if (FileUtils.isSkippedDirectory(segments[depth - 1])) return true;
    if (scanner.shouldIgnore(directory, path.join(rootPath, directory))) return true;
  }
  return scanner.shouldIgnore(relativePath, path.join(rootPath, relativePath));
}

/**
 * An explicit list, in the given order. A path that leaves the root (`..`, an absolute path
 * elsewhere, a symlink pointing out) is an error; files the ignore rules exclude are skipped.
 */
function listedFiles(rootPath, entries, cwd, skipped) {
  const realRoot = fs.realpathSync(rootPath);
  const scanner = new Scanner(rootPath);
  const files = [];
  const seen = new Set();
  for (const entry of entries) {
    if (typeof entry !== 'string' || entry.trim() === '') continue;
    const absolute = path.resolve(cwd, entry);
    // The root as given, or its real path (`find "$(pwd -P)"` under a symlinked root)
    let relative = relativeInside(rootPath, absolute);
    if (relative === null && realRoot !== rootPath) relative = relativeInside(realRoot, absolute);
    if (relative === null) {
      throw new PackError('PATH_OUTSIDE_ROOT', `Path is outside the project root: ${entry}`);
    }
    const absolutePath = path.join(rootPath, relative);
    const relativePath = toPosix(relative);
    if (seen.has(relativePath)) continue;
    seen.add(relativePath);

    let stats;
    try {
      // Symlinks are followed, but must not lead out of the root
      if (relativeInside(realRoot, fs.realpathSync(absolutePath)) === null) {
        throw new PackError('PATH_OUTSIDE_ROOT', `Path is outside the project root: ${entry}`);
      }
      stats = fs.statSync(absolutePath);
    } catch (error) {
      if (error instanceof PackError) throw error;
      skipped.push({ path: relativePath, reason: 'missing' });
      continue;
    }
    if (!stats.isFile()) {
      skipped.push({ path: relativePath, reason: 'not-a-file' });
      continue;
    }
    if (isIgnored(scanner, rootPath, relative)) {
      skipped.push({ path: relativePath, reason: 'ignored' });
      continue;
    }
    files.push({ absolutePath, path: relativePath, size: stats.size, modified: stats.mtime });
  }
  return files;
}

export default { selectFiles, PackError };

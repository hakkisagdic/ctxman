/**
 * Path rules for `ctxman why`: keeping targets inside the project, applying the
 * project's ignore files, and classifying files (tests, docs, ADRs, changelogs)
 */

import fs from 'fs';
import path from 'path';
import { Scanner } from '../core/Scanner.js';
import FileUtils from '../utils/file-utils.js';
import { WhyError } from './errors.js';

/** Extensions searched as prose: every line that mentions a term counts */
export const DOC_EXTENSIONS = new Set([
  '.md',
  '.markdown',
  '.mdx',
  '.adoc',
  '.asciidoc',
  '.asc',
  '.rst',
  '.txt',
]);

/**
 * Resolve `file` (relative to `base`, or absolute) and check that it stays inside `root`,
 * also after following symlinks
 * @param {string} root - Real path of the project root
 * @param {string} base - Directory relative paths start from
 * @param {string} file
 * @param {object} [options]
 * @param {boolean} [options.mustExist=true] - false: a path that only exists in history
 * @param {string} [options.label='the repository'] - What `root` is, for error messages
 * @returns {{absolute: string, relative: string}} relative uses the OS separator
 */
export function resolveInsideRoot(
  root,
  base,
  file,
  { mustExist = true, label = 'the repository' } = {}
) {
  if (typeof file !== 'string' || file.trim() === '' || file.includes('\0')) {
    throw new WhyError('INVALID_TARGET', 'A file path is required');
  }
  const absolute = path.resolve(base, file);
  // The root itself, or a path above it (`..foo` is a valid name inside it)
  const outside = (candidate) => {
    const relative = path.relative(root, candidate);
    return (
      relative === '' ||
      relative === '..' ||
      relative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relative)
    );
  };
  if (outside(absolute)) {
    throw new WhyError('PATH_OUTSIDE_ROOT', `Path is outside ${label}: ${file}`);
  }

  const stat = fs.statSync(absolute, { throwIfNoEntry: false });
  if (!stat && !mustExist) {
    return { absolute, relative: path.relative(root, absolute) };
  }
  if (!stat) {
    throw new WhyError('FILE_NOT_FOUND', `File not found: ${file}`);
  }
  if (!stat.isFile()) {
    throw new WhyError('NOT_A_FILE', `Not a file: ${file}`);
  }
  const real = fs.realpathSync(absolute);
  if (outside(real)) {
    throw new WhyError('PATH_OUTSIDE_ROOT', `Path leads outside ${label}: ${file}`);
  }

  const relative = path.relative(root, real);
  if (relative.split(path.sep)[0] === '.git') {
    throw new WhyError('PATH_OUTSIDE_ROOT', `Path is inside the .git directory: ${file}`);
  }
  return { absolute: real, relative };
}

/**
 * The scanner's rules as a predicate on project-relative paths: .gitignore,
 * .contextignore / .contextinclude and the always-skipped directories, applied to every
 * ancestor directory the way a scan would meet them
 * @param {string} root
 * @returns {(relativePath: string) => boolean} true when the path is excluded
 */
export function createPathFilter(root) {
  const scanner = new Scanner(root);
  const cache = new Map();

  const excludedDirectory = (relativeDir) => {
    if (cache.has(relativeDir)) return cache.get(relativeDir);
    const name = relativeDir.split('/').pop();
    const parent = relativeDir.includes('/')
      ? relativeDir.slice(0, relativeDir.lastIndexOf('/'))
      : '';
    const excluded =
      (parent !== '' && excludedDirectory(parent)) ||
      FileUtils.isSkippedDirectory(name) ||
      scanner.shouldIgnore(
        relativeDir.split('/').join(path.sep),
        path.join(root, ...relativeDir.split('/'))
      );
    cache.set(relativeDir, excluded);
    return excluded;
  };

  return (relativePath) => {
    const posix = relativePath.split(path.sep).join('/');
    const parent = posix.includes('/') ? posix.slice(0, posix.lastIndexOf('/')) : '';
    if (parent !== '' && excludedDirectory(parent)) return true;
    return scanner.shouldIgnore(
      posix.split('/').join(path.sep),
      path.join(root, ...posix.split('/'))
    );
  };
}

/**
 * Whether a file holds binary data (a NUL byte in its first 8000 bytes, git's heuristic)
 * @param {Buffer} buffer
 * @returns {boolean}
 */
export function isBinaryBuffer(buffer) {
  return buffer.subarray(0, 8000).includes(0);
}

/**
 * Whether ctxman may print this file's content: the scanner's text-file rule, which
 * also keeps secret-bearing files such as .env or *.pem out of exports
 * @param {string} relativePath
 * @returns {boolean}
 */
export function isExportableText(relativePath) {
  return FileUtils.isText(relativePath);
}

/**
 * Test files by common conventions (test/ and spec/ folders, *.test.*, *_test.go,
 * test_*.py, FooTest.java, ...)
 * @param {string} relativePath - Forward-slash path
 * @returns {boolean}
 */
export function isTestFile(relativePath) {
  const posix = relativePath.split(path.sep).join('/');
  const base = posix.split('/').pop();
  return (
    /(^|\/)(test|tests|__tests__|spec|specs|testing)\//i.test(posix) ||
    /[._-](test|spec)s?\.[^./]+$/i.test(base) ||
    /^test_.+\.py$/i.test(base) ||
    /(Test|Tests|Spec|IT)\.(java|kt|kts|cs|scala|swift|php|groovy)$/.test(base)
  );
}

/**
 * git pathspecs that select the files isTestFile() accepts (a superset; results are
 * filtered with isTestFile again)
 */
export const TEST_PATHSPECS = [
  ':(glob)**/test/**',
  ':(glob)**/tests/**',
  ':(glob)**/__tests__/**',
  ':(glob)**/spec/**',
  ':(glob)**/specs/**',
  ':(glob)**/testing/**',
  ':(glob)**/*.test.*',
  ':(glob)**/*.spec.*',
  ':(glob)**/*_test.*',
  ':(glob)**/*-test.*',
  ':(glob)**/*.tests.*',
  ':(glob)**/test_*',
  ':(glob)**/*Test.*',
  ':(glob)**/*Tests.*',
  ':(glob)**/*Spec.*',
  ':(glob)**/*IT.*',
];

/**
 * Kind of prose file: 'adr' (architecture decision records), 'changelog', 'doc', or
 * null for anything else
 * @param {string} relativePath
 * @returns {'adr'|'changelog'|'doc'|null}
 */
export function classifyTextFile(relativePath) {
  const posix = relativePath.split(path.sep).join('/');
  const base = posix.split('/').pop();
  const ext = path.extname(base).toLowerCase();
  const prose = DOC_EXTENSIONS.has(ext);

  if (
    /(^|\/)(adr|adrs|decisions|architecture[-_]decisions?)\//i.test(posix) ||
    /(^|[^a-z])adr([^a-z]|$)/i.test(base)
  ) {
    return prose || ext === '' ? 'adr' : null;
  }
  if (/^(changelog|changes|history|news|releases?)(\.|$)/i.test(base)) {
    return 'changelog';
  }
  return prose ? 'doc' : null;
}

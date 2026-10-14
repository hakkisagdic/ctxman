/**
 * Find the test files related to a set of changed files: by file name (foo.js ↔
 * foo.test.js, test_foo.py, foo_test.go, FooTest.java, __tests__/foo.js), by package (Go
 * tests in the same directory), by imports of the changed modules (JavaScript/TypeScript
 * through ImportTracker, Python `import`/`from`), and by references to changed class or
 * method names
 */

import path from 'path';
import { ImportTracker } from '../analyzers/import-tracker.js';
import { supportsMethods } from './method-mapper.js';

const posix = path.posix;

const TEST_DIR = /(^|\/)(__tests__|__test__|tests?|specs?)\//i;
const NON_TEST_DIR = /(^|\/)(__fixtures__|fixtures?|__snapshots__|__mocks__|testdata)\//i;
const GENERIC_STEMS = new Set(['index', '__init__', 'main', 'mod', 'lib', 'init']);
const JS_EXTENSIONS = ['.js', '.ts', '.mjs', '.cjs', '.jsx', '.tsx', '.mts', '.cts'];
const JS_FILE = /\.(m|c)?(j|t)sx?$/i;
const CLASS_LANGUAGES = /\.(java|kt|kts|scala|cs|swift|php|groovy)$/i;

// Names too common to say anything when a test mentions them
const COMMON_NAMES = new Set(
  (
    'constructor init main run get set test setup setUp tearDown toString render handle ' +
    'execute call apply process update create delete remove start stop close open load ' +
    'save read write value index length size name then catch describe expect before ' +
    'after beforeEach afterEach beforeAll afterAll __init__ __str__ __repr__ __eq__ equals ' +
    'hashCode error parse format build reset clear next done send emit async await'
  ).split(' ')
);

const importTracker = new ImportTracker('.');

/**
 * Whether a path looks like a test source file
 * @param {string} filePath - Repository-relative, forward slashes
 * @returns {boolean}
 */
export function isTestFile(filePath) {
  if (!supportsMethods(filePath) || NON_TEST_DIR.test(filePath)) return false;
  const base = posix.basename(filePath);
  return (
    /[._-](test|spec)s?\.[^.]+$/i.test(base) ||
    /^test_.+\.py$/i.test(base) ||
    /[a-z0-9](Tests?|Spec|IT)\.[^.]+$/.test(base) ||
    TEST_DIR.test(filePath)
  );
}

const normalize = (stem) => stem.toLowerCase().replace(/[-_.]/g, '');

/** Directory name to use for generic file names such as index.js or __init__.py */
function parentName(filePath) {
  const parts = posix.dirname(filePath).split('/');
  for (let i = parts.length - 1; i >= 0; i--) {
    if (parts[i] && parts[i] !== '.' && !/^(__tests__|__test__|tests?|specs?)$/i.test(parts[i])) {
      return parts[i];
    }
  }
  return '';
}

/**
 * Name a source file is known by, for matching against test names
 * @param {string} filePath
 */
export function sourceStem(filePath) {
  const stem = posix.basename(filePath).replace(/\.[^.]+$/, '');
  return normalize(GENERIC_STEMS.has(stem.toLowerCase()) ? parentName(filePath) : stem);
}

/**
 * Name of the source file a test is named after (foo.test.js → foo, FooTest.java → foo)
 * @param {string} filePath
 */
export function testStem(filePath) {
  let stem = posix.basename(filePath).replace(/\.[^.]+$/, '');
  stem = stem
    .replace(/[._-](test|spec)s?$/i, '')
    .replace(/^test_/i, '')
    .replace(/([a-z0-9])(Tests?|Spec|IT)$/, '$1');
  if (!stem || GENERIC_STEMS.has(stem.toLowerCase())) stem = parentName(filePath);
  return normalize(stem);
}

/** Repository-relative module paths a JavaScript/TypeScript test imports */
function jsImports(testPath, content) {
  const specifiers = [
    ...importTracker.parseES6Imports(content),
    ...importTracker.parseCommonJSImports(content),
  ].map((imp) => imp.package);
  // Side-effect imports and module mocks, which ImportTracker does not report
  const extra = /(?:\bimport\s+|\b(?:vi|jest)\.(?:mock|doMock)\s*\(\s*)['"]([^'"]+)['"]/g;
  let match;
  while ((match = extra.exec(content)) !== null) specifiers.push(match[1]);

  const dir = posix.dirname(testPath);
  const resolved = new Set();
  for (const specifier of specifiers) {
    if (!specifier.startsWith('.')) continue;
    const base = posix.normalize(posix.join(dir, specifier));
    const stripped = base.replace(JS_FILE, '');
    resolved.add(base);
    for (const ext of JS_EXTENSIONS) {
      resolved.add(base + ext);
      resolved.add(`${base}/index${ext}`);
      resolved.add(stripped + ext);
    }
  }
  return resolved;
}

/** Path suffixes (pkg/mod.py, pkg/mod/__init__.py) of the modules a Python test imports */
function pythonImports(testPath, content) {
  const modules = [];
  const pattern =
    /^[ \t]*(?:from[ \t]+([.\w]+)[ \t]+import[ \t]+\(?([\w*, \t]+)|import[ \t]+([\w., \t]+))/gm;
  let match;
  while ((match = pattern.exec(content)) !== null) {
    if (match[1]) {
      modules.push(match[1]);
      for (const name of match[2].split(',')) {
        const clean = name.trim().split(/\s+/)[0];
        if (clean && clean !== '*')
          modules.push(`${match[1]}${match[1].endsWith('.') ? '' : '.'}${clean}`);
      }
    } else {
      for (const name of match[3].split(',')) modules.push(name.trim().split(/\s+/)[0]);
    }
  }

  const suffixes = [];
  for (const moduleName of modules) {
    if (!moduleName) continue;
    const dots = /^\.*/.exec(moduleName)[0].length;
    const rest = moduleName.slice(dots).split('.').filter(Boolean).join('/');
    if (!rest) continue;
    let base = rest;
    if (dots > 0) {
      let dir = posix.dirname(testPath);
      for (let i = 1; i < dots; i++) dir = posix.dirname(dir);
      base = posix.normalize(posix.join(dir, rest));
      if (base.startsWith('..')) continue;
      suffixes.push(
        { path: `${base}.py`, exact: true },
        { path: `${base}/__init__.py`, exact: true }
      );
    } else {
      suffixes.push(
        { path: `${base}.py`, exact: false },
        { path: `${base}/__init__.py`, exact: false }
      );
    }
  }
  return suffixes;
}

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Names that `content` mentions as whole identifiers (`call` set: only when called, as in
 * `name(`, which keeps out variables and properties that share a method's name)
 */
function referencedNames(content, names, { call = false } = {}) {
  if (names.length === 0) return [];
  const after = call ? '\\s*\\(' : '(?![\\w$])';
  const pattern = new RegExp(`(?<![\\w$])(${names.map(escapeRegex).join('|')})${after}`, 'g');
  const found = new Set();
  let match;
  while ((match = pattern.exec(content)) !== null) found.add(match[1]);
  return [...found];
}

/**
 * @typedef {object} RelatedTest
 * @property {string} path
 * @property {string[]} reasons
 * @property {boolean} changed - The test itself is part of the change
 */

/**
 * Test files related to a change
 * @param {object} params
 * @param {string[]} params.candidates - Every file of the head version (repository-relative)
 * @param {Array<{path: string, oldPath: string|null, status: string}>} params.changedFiles
 * @param {string[]} [params.methodNames] - Names of changed and deleted methods
 * @param {(paths: string[]) => Map<string, string|null>} params.readContents - Head contents
 * @param {number} [params.maxScan=3000] - Read at most this many test files for imports
 *   and references (beyond it only names are compared)
 * @returns {RelatedTest[]} Strongest matches first
 */
export function findRelatedTests({
  candidates,
  changedFiles,
  methodNames = [],
  readContents,
  maxScan = 3000,
}) {
  const tests = candidates.filter(isTestFile);
  const changedTests = new Set(changedFiles.filter((f) => f.status !== 'D').map((f) => f.path));
  const sources = changedFiles.filter((f) => !isTestFile(f.path));
  const sourcePaths = new Set();
  for (const file of sources) {
    sourcePaths.add(file.path);
    if (file.oldPath) sourcePaths.add(file.oldPath);
  }

  const byStem = new Map();
  for (const sourcePath of sourcePaths) {
    const stem = sourceStem(sourcePath);
    if (!stem) continue;
    if (!byStem.has(stem)) byStem.set(stem, []);
    byStem.get(stem).push(sourcePath);
  }
  const goDirs = new Map();
  for (const sourcePath of sourcePaths) {
    if (sourcePath.endsWith('.go')) goDirs.set(posix.dirname(sourcePath), sourcePath);
  }
  const classNames = [...sourcePaths]
    .filter((p) => CLASS_LANGUAGES.test(p))
    .map((p) => posix.basename(p).replace(/\.[^.]+$/, ''))
    .filter((name) => /^[A-Z]\w{3,}$/.test(name));
  const names = [
    ...new Set(
      methodNames
        .map((name) => name.split(/\s+/).pop())
        .filter((name) => name && name.length >= 4 && !COMMON_NAMES.has(name))
    ),
  ];

  const found = new Map();
  const add = (testPath, reason, weight) => {
    if (!found.has(testPath)) found.set(testPath, { path: testPath, reasons: [], score: 0 });
    const entry = found.get(testPath);
    if (!entry.reasons.includes(reason)) {
      entry.reasons.push(reason);
      entry.score += weight;
    }
  };

  for (const testPath of tests) {
    if (changedTests.has(testPath)) add(testPath, 'changed in this diff', 3);
    for (const sourcePath of byStem.get(testStem(testPath)) || []) {
      add(testPath, `named after ${sourcePath}`, 3);
    }
    if (testPath.endsWith('_test.go') && goDirs.has(posix.dirname(testPath))) {
      add(testPath, `same Go package as ${goDirs.get(posix.dirname(testPath))}`, 2);
    }
  }

  if (sourcePaths.size > 0 && tests.length <= maxScan) {
    const contents = readContents(tests);
    const callers = new Map();
    for (const testPath of tests) {
      const content = contents.get(testPath);
      if (!content) continue;
      if (JS_FILE.test(testPath)) {
        const imported = jsImports(testPath, content);
        for (const sourcePath of sourcePaths) {
          if (imported.has(sourcePath)) add(testPath, `imports ${sourcePath}`, 3);
        }
      } else if (testPath.endsWith('.py')) {
        for (const suffix of pythonImports(testPath, content)) {
          for (const sourcePath of sourcePaths) {
            const matches = suffix.exact
              ? sourcePath === suffix.path
              : sourcePath === suffix.path || sourcePath.endsWith(`/${suffix.path}`);
            if (matches) add(testPath, `imports ${sourcePath}`, 3);
          }
        }
      }
      for (const name of referencedNames(content, classNames)) {
        add(testPath, `references ${name}`, 2);
      }
      for (const name of referencedNames(content, names, { call: true })) {
        if (!callers.has(name)) callers.set(name, []);
        callers.get(name).push(testPath);
      }
    }
    // A name that many tests call (a common helper name) says nothing about this change
    const common = Math.max(10, tests.length * 0.1);
    for (const [name, testPaths] of callers) {
      if (testPaths.length > common) continue;
      for (const testPath of testPaths) add(testPath, `calls ${name}()`, 1);
    }
  }

  return [...found.values()]
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
    .map(({ path: testPath, reasons }) => ({
      path: testPath,
      reasons,
      changed: changedTests.has(testPath),
    }));
}

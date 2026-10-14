/**
 * Map diff lines to the methods that contain them, and find methods a change removed,
 * with the existing regex method analyzers (lib/analyzers/method-analyzer.js, which hands
 * Go files to go-method-analyzer.js)
 */

import path from 'path';
import MethodAnalyzer from '../analyzers/method-analyzer.js';
import FileUtils from '../utils/file-utils.js';

// The analyzer treats unknown extensions as JavaScript; these are JavaScript too
const EXTRA_JS_EXTENSIONS = new Set(['.mjs', '.cjs', '.mts', '.cts']);

const analyzer = new MethodAnalyzer();

/**
 * @typedef {object} MethodRange
 * @property {string} name
 * @property {number} start - First line (1-based)
 * @property {number} end - Last line (inclusive)
 * @property {string} source - Lines start..end
 */

/**
 * Whether method extraction knows the file's language
 * @param {string} filePath
 * @returns {boolean}
 */
export function supportsMethods(filePath) {
  return (
    FileUtils.isCode(filePath) || EXTRA_JS_EXTENSIONS.has(path.extname(filePath).toLowerCase())
  );
}

/**
 * Methods of a file with their line ranges, sorted by start line
 * @param {string} content
 * @param {string} filePath - Used to pick the language
 * @returns {MethodRange[]}
 */
export function extractMethodRanges(content, filePath) {
  let methods;
  let sources;
  try {
    methods = analyzer.extractMethods(content, filePath);
    sources = analyzer.extractMethodSources(content, methods, filePath);
  } catch (_error) {
    return [];
  }
  return methods
    .map((method, i) => ({
      name: method.name,
      start: method.line,
      end: method.line + sources[i].split('\n').length - 1,
      source: sources[i],
    }))
    .sort((a, b) => a.start - b.start || b.end - a.end);
}

/** The smallest method that satisfies `contains` */
function innermost(methods, contains) {
  let best = null;
  for (const method of methods) {
    if (contains(method) && (!best || method.end - method.start < best.end - best.start)) {
      best = method;
    }
  }
  return best;
}

/**
 * Methods whose lines a diff touches. Each added line belongs to the innermost method
 * around it; a deletion belongs to a method when it happened after the method's first
 * line and before or at its last. A touched method nested in another touched method is
 * left out, since the outer one's source already contains it.
 * @param {MethodRange[]} methods - Methods of the head version
 * @param {{addedLines: number[], deletionAnchors: number[]}} hunks - From parseHunks()
 * @returns {Array<MethodRange & {changedLines: number}>}
 */
export function findTouchedMethods(methods, { addedLines, deletionAnchors }) {
  if (methods.length === 0) return [];
  const touched = new Map();
  const mark = (method) => method && touched.set(method, (touched.get(method) || 0) + 1);

  for (const line of addedLines) {
    mark(innermost(methods, (m) => m.start <= line && line <= m.end));
  }
  for (const anchor of deletionAnchors) {
    mark(innermost(methods, (m) => m.start < anchor && anchor <= m.end));
  }

  const list = [...touched.keys()];
  const containedIn = (inner) =>
    list.find(
      (outer) =>
        outer !== inner &&
        outer.start <= inner.start &&
        inner.end <= outer.end &&
        outer.end - outer.start > inner.end - inner.start
    );

  const result = new Map();
  for (const method of list) {
    let target = method;
    let outer;
    while ((outer = containedIn(target))) target = outer;
    result.set(target, (result.get(target) || 0) + touched.get(method));
  }

  return [...result.entries()]
    .map(([method, changedLines]) => ({ ...method, changedLines }))
    .sort((a, b) => a.start - b.start);
}

/**
 * Methods of the base version that the head version no longer has. A name that still
 * exists fewer times than before reports the base occurrences whose source no longer
 * appears in the head content.
 * @param {MethodRange[]} baseMethods
 * @param {MethodRange[]} headMethods
 * @param {string} headContent
 * @returns {MethodRange[]}
 */
export function findDeletedMethods(baseMethods, headMethods, headContent = '') {
  const headCount = new Map();
  for (const method of headMethods) {
    headCount.set(method.name, (headCount.get(method.name) || 0) + 1);
  }
  const byName = new Map();
  for (const method of baseMethods) {
    if (!byName.has(method.name)) byName.set(method.name, []);
    byName.get(method.name).push(method);
  }

  const deleted = [];
  for (const [name, occurrences] of byName) {
    const missing = occurrences.length - (headCount.get(name) || 0);
    if (missing <= 0) continue;
    if (missing === occurrences.length) {
      deleted.push(...occurrences);
      continue;
    }
    const gone = occurrences.filter((method) => !headContent.includes(method.source));
    const rest = occurrences.filter((method) => !gone.includes(method));
    deleted.push(...[...gone, ...rest].slice(0, missing));
  }
  return deleted.sort((a, b) => a.start - b.start);
}

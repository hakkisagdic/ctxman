/**
 * Repository graph for `ctxman map`
 *
 * One node per source file the scanner returns (so .gitignore, .contextignore and
 * .contextinclude apply), one edge per resolved import, plus what ranking needs: the
 * functions of each file, how often other files mention them, and how often git
 * changed each file recently.
 */

import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { Scanner } from '../core/Scanner.js';
import MethodAnalyzer from '../analyzers/method-analyzer.js';
import { redactSecrets } from '../utils/secret-redactor.js';
import { languageOf, extractImports, extractDeclarations } from './imports.js';
import { ImportResolver } from './resolver.js';

/** Commits of git history mined by default */
export const DEFAULT_HISTORY = 300;
/** Larger files are left out: they are generated or vendored far more often than written */
export const DEFAULT_MAX_FILE_BYTES = 512 * 1024;
/** Average characters per line above which a file counts as minified */
const MINIFIED_LINE_LENGTH = 300;
/** Longest signature kept on one map line */
const MAX_SIGNATURE_LENGTH = 120;
const IDENTIFIER = /[A-Za-z_$][\w$]*/g;

/**
 * @typedef {Object} MapMethod
 * @property {string} name - Function or method name
 * @property {number} line - 1-based line of the declaration
 * @property {string} signature - Declaration text on one line (secrets redacted)
 */

/**
 * @typedef {Object} MapNode
 * @property {string} path - Project-relative path with forward slashes
 * @property {string} language
 * @property {number} bytes
 * @property {MapMethod[]} methods
 * @property {number} symbolRefs - How much other files mention this file's function names
 * @property {number} unresolvedImports - References that named no file of the project
 */

/**
 * @typedef {Object} RepoGraph
 * @property {string} root - Absolute project root
 * @property {MapNode[]} nodes - Sorted by path
 * @property {Array<{from: string, to: string, weight: number}>} edges - Importer → imported
 * @property {{available: boolean, requested: number, commits: number,
 *   counts: Object<string, number>}} history - Commits touching each file
 * @property {Object} stats
 */

/**
 * Scan a project and build its file dependency graph
 * @param {string} root - Project directory
 * @param {Object} [options]
 * @param {number} [options.history=300] - Commits to mine for change frequency (0 disables)
 * @param {boolean} [options.redact=true] - Mask secrets in signatures
 * @param {number} [options.maxFileBytes=524288] - Skip larger files
 * @returns {RepoGraph}
 */
export function buildRepoGraph(root, options = {}) {
  const history = options.history ?? DEFAULT_HISTORY;
  const maxFileBytes = options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
  const redact = options.redact !== false;
  if (!Number.isInteger(history) || history < 0) {
    throw new Error(`history must be a non-negative integer, got ${JSON.stringify(history)}`);
  }

  const absoluteRoot = path.resolve(root);
  if (!fs.statSync(absoluteRoot, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error(`Not a directory: ${root}`);
  }

  const timings = {};
  let started = performance.now();
  const scanned = new Scanner(absoluteRoot).scan();
  timings.scan = performance.now() - started;

  started = performance.now();
  const analyzer = new MethodAnalyzer();
  const redactions = {};
  const skipped = [];
  const nodes = [];
  const identifiers = [];
  const candidates = scanned
    .map((file) => ({ file, relative: file.relativePath.split(path.sep).join('/') }))
    .filter(({ relative }) => languageOf(relative))
    .sort((a, b) => compare(a.relative, b.relative));

  for (const { file, relative } of candidates) {
    if (file.size > maxFileBytes) {
      skipped.push({ path: relative, reason: 'too large' });
      continue;
    }
    let content;
    try {
      content = fs.readFileSync(file.path, 'utf-8');
    } catch (_error) {
      skipped.push({ path: relative, reason: 'unreadable' });
      continue;
    }
    const lines = content.split('\n');
    if (content.length > 4096 && content.length / lines.length > MINIFIED_LINE_LENGTH) {
      skipped.push({ path: relative, reason: 'minified' });
      continue;
    }

    const language = languageOf(relative);
    nodes.push({
      path: relative,
      language,
      bytes: file.size,
      methods: extractMethods(analyzer, content, lines, file.path, redact ? redactions : null),
      symbolRefs: 0,
      unresolvedImports: 0,
      imports: extractImports(language, content),
      declarations: extractDeclarations(language, content),
    });
    identifiers.push(new Set(content.match(IDENTIFIER)));
  }
  timings.parse = performance.now() - started;

  started = performance.now();
  const resolver = new ImportResolver(absoluteRoot, nodes);
  const edges = [];
  for (const node of nodes) {
    const { edges: targets, unresolved } = resolver.resolve(node);
    node.unresolvedImports = unresolved;
    for (const { to, weight } of targets) edges.push({ from: node.path, to, weight });
  }
  edges.sort((a, b) => compare(a.from, b.from) || compare(a.to, b.to));
  for (const node of nodes) {
    delete node.imports;
    delete node.declarations;
  }
  countSymbolReferences(nodes, identifiers);
  timings.resolve = performance.now() - started;

  started = performance.now();
  const mined = mineHistory(absoluteRoot, history);
  const known = new Set(nodes.map((node) => node.path));
  mined.counts = Object.fromEntries(
    Object.entries(mined.counts).filter(([file]) => known.has(file))
  );
  timings.history = performance.now() - started;

  return {
    root: absoluteRoot,
    nodes,
    edges,
    history: mined,
    stats: {
      scannedFiles: scanned.length,
      files: nodes.length,
      edges: edges.length,
      unresolvedImports: nodes.reduce((sum, node) => sum + node.unresolvedImports, 0),
      skipped,
      redactions,
      timings,
    },
  };
}

/** Byte-order comparison, the same on every platform and locale */
function compare(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Functions of a file with a one-line signature each
 * @returns {MapMethod[]}
 */
function extractMethods(analyzer, content, lines, filePath, redactions) {
  const found = analyzer
    .extractMethods(content, filePath)
    .sort((a, b) => a.line - b.line || compare(a.name, b.name));
  return found.map((method) => {
    let signature = signatureAt(lines, method.line);
    if (redactions) {
      const result = redactSecrets(signature);
      signature = result.text;
      for (const type of result.findings) redactions[type] = (redactions[type] || 0) + 1;
    }
    return { name: method.name, line: method.line, signature };
  });
}

/**
 * Declaration starting at a line, joined onto one line until its parameter list closes,
 * without the body
 * @param {string[]} lines
 * @param {number} lineNumber - 1-based
 * @returns {string}
 */
export function signatureAt(lines, lineNumber) {
  let text = (lines[lineNumber - 1] || '').trim();
  const depth = (value) => (value.match(/\(/g) || []).length - (value.match(/\)/g) || []).length;
  for (let i = lineNumber; depth(text) > 0 && i < lineNumber + 6 && i < lines.length; i++) {
    const next = lines[i].trim();
    text += text.endsWith('(') || next.startsWith(')') ? next : ` ${next}`;
  }
  text = text.replace(/\s+/g, ' ');
  // A one-line body (`f() { return 1; }`) is cut after the parameter list
  const body = text.search(/\)\s*\{/);
  if (body !== -1) text = text.slice(0, body + 1);
  text = text.replace(/\s*\{\s*\}?\s*$/, '').trim();
  if (text.length > MAX_SIGNATURE_LENGTH) text = `${text.slice(0, MAX_SIGNATURE_LENGTH - 1)}…`;
  return text;
}

/**
 * symbolRefs of each node: for each function name it defines, the number of other files
 * that mention the name, shared between the files that define the same name (so a
 * `constructor` or `render` defined everywhere earns little)
 */
function countSymbolReferences(nodes, identifiers) {
  const definedNames = nodes.map(
    (node) =>
      new Set(
        node.methods.map((method) => method.name.split(' ').pop()).filter((name) => name.length > 2)
      )
  );
  const definers = new Map();
  for (const names of definedNames) {
    for (const name of names) definers.set(name, (definers.get(name) || 0) + 1);
  }
  const mentions = new Map();
  for (const ids of identifiers) {
    for (const id of ids) {
      if (definers.has(id)) mentions.set(id, (mentions.get(id) || 0) + 1);
    }
  }
  nodes.forEach((node, i) => {
    let score = 0;
    for (const name of definedNames[i]) {
      const defining = definers.get(name);
      score += Math.max(0, (mentions.get(name) || 0) - defining) / defining;
    }
    node.symbolRefs = score;
  });
}

/**
 * How many of the last `commits` commits (merges excluded) touched each file
 * @param {string} root - Absolute project root; paths come back relative to it
 * @param {number} commits - 0 disables
 * @returns {{available: boolean, requested: number, commits: number,
 *   counts: Object<string, number>, reason?: string}}
 */
export function mineHistory(root, commits) {
  const result = { available: false, requested: commits, commits: 0, counts: {} };
  if (!commits) {
    result.reason = 'disabled';
    return result;
  }
  let output;
  try {
    output = execFileSync(
      'git',
      [
        '-c',
        'core.quotePath=false',
        'log',
        `--max-count=${commits}`,
        '--no-merges',
        '--name-only',
        '--relative',
        '--format=%x00',
      ],
      {
        cwd: root,
        encoding: 'utf-8',
        maxBuffer: 256 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'ignore'],
      }
    );
  } catch (_error) {
    result.reason = 'not a git repository';
    return result;
  }

  const chunks = output.split('\0').slice(1);
  for (const chunk of chunks) {
    const files = new Set(
      chunk
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
    );
    for (const file of files) result.counts[file] = (result.counts[file] || 0) + 1;
  }
  result.available = true;
  result.commits = chunks.length;
  return result;
}

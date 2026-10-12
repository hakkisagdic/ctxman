/**
 * Ranked code search: BM25 over code chunks.
 *
 * A chunk is a method/function found by the method analyzers or, for code outside them and
 * for files without methods, a window of up to 40 lines. Identifiers are split into their
 * words (camelCase, snake_case, kebab-case) and lowercased, so `getUserName`, `get_user_name`
 * and "user name" find each other. Pure JavaScript, no dependencies.
 *
 * The per-project index lives in memory and is rebuilt only for files whose modification
 * time or size changed since the last search.
 */

import fs from 'fs';
import path from 'path';
import { Scanner } from '../core/Scanner.js';
import TokenUtils from '../utils/token-utils.js';
import { redactSecrets } from '../utils/secret-redactor.js';
import { readFileChecked } from '../utils/safe-read.js';
import { extractCodeUnits } from './code-units.js';

export const DEFAULT_LIMIT = 10;
export const DEFAULT_MAX_TOKENS = 4000;
export const WINDOW_LINES = 40;
/** Files above this size (minified bundles, generated data) are not indexed */
export const MAX_FILE_BYTES = 1024 * 1024;
const MAX_CACHED_PROJECTS = 8;

// A word: letters, digits, `_` and `$`, optionally joined by `-` (kebab-case)
const WORD = /[\p{L}\p{N}_$]+(?:-[\p{L}\p{N}_$]+)*/gu;
// Parts of a camelCase word: `HTTPServer2Go` -> HTTP, Server, 2, Go
const PART = /\p{Lu}+(?!\p{Ll})|\p{Lu}?[\p{Ll}\p{Lo}\p{Lm}]+|\p{N}+/gu;

/**
 * Fold an English plural to its singular, conservatively: `users` -> `user`,
 * `classes` -> `class`; `status`, `class` and `analysis` stay as they are
 * @param {string} term - Lower-case term
 * @returns {string}
 */
export function normalizeTerm(term) {
  if (term.length <= 3 || !term.endsWith('s')) return term;
  if (/(?:ss|us|is)$/.test(term)) return term;
  if (/(?:sses|shes|ches|xes|zes)$/.test(term)) return term.slice(0, -2);
  if (term.endsWith('ies') && term.length > 4) return `${term.slice(0, -3)}y`;
  return term.slice(0, -1);
}

/**
 * Split text into search terms.
 *
 * Each identifier yields its lower-cased parts (`parseHTTPResponse` -> parse, http,
 * response) plus, when it has several parts, the joined form (`parsehttpresponse`), so an
 * exact identifier query ranks the identifier above code that merely uses the same words.
 * Single characters are dropped.
 *
 * @param {string} text
 * @returns {string[]}
 */
export function tokenize(text) {
  const terms = [];
  for (const [word] of String(text).matchAll(WORD)) {
    const parts = [];
    for (const piece of word.split(/[-_$]+/)) {
      for (const [part] of piece.matchAll(PART)) parts.push(part.toLowerCase());
    }
    for (const part of parts) {
      if (part.length > 1) terms.push(normalizeTerm(part));
    }
    if (parts.length > 1) {
      terms.push(normalizeTerm(parts.join('')));
    }
  }
  return terms;
}

/**
 * Okapi BM25 index over documents given as term lists.
 *
 * IDF is the non-negative variant ln(1 + (N - n + 0.5) / (n + 0.5)). Results with equal
 * scores keep the order in which their documents were added.
 */
export class BM25Index {
  /**
   * @param {Object} [options]
   * @param {number} [options.k1=1.2] - Term frequency saturation
   * @param {number} [options.b=0.75] - Length normalisation
   */
  constructor({ k1 = 1.2, b = 0.75 } = {}) {
    this.k1 = k1;
    this.b = b;
    this.docs = [];
    this.lengths = [];
    this.postings = new Map();
    this.totalLength = 0;
  }

  /** Number of documents */
  get size() {
    return this.docs.length;
  }

  /**
   * Add a document
   * @param {*} doc - Returned with the search results
   * @param {string[]} terms - Terms of the document (see tokenize())
   * @returns {number} Document id
   */
  add(doc, terms) {
    const id = this.docs.length;
    const frequencies = new Map();
    for (const term of terms) frequencies.set(term, (frequencies.get(term) || 0) + 1);
    for (const [term, tf] of frequencies) {
      let list = this.postings.get(term);
      if (!list) {
        list = [];
        this.postings.set(term, list);
      }
      list.push(id, tf);
    }
    this.docs.push(doc);
    this.lengths.push(terms.length);
    this.totalLength += terms.length;
    return id;
  }

  /**
   * Inverse document frequency of a term
   * @param {string} term
   * @returns {number}
   */
  idf(term) {
    const n = (this.postings.get(term)?.length ?? 0) / 2;
    return Math.log(1 + (this.docs.length - n + 0.5) / (n + 0.5));
  }

  /**
   * Rank documents for a query
   * @param {string|string[]} query - Query text, or terms
   * @param {Object} [options]
   * @param {number} [options.limit=10] - Maximum number of results
   * @returns {Array<{doc: *, id: number, score: number}>} Best first
   */
  search(query, { limit = DEFAULT_LIMIT } = {}) {
    const terms = [...new Set(Array.isArray(query) ? query : tokenize(query))];
    if (this.docs.length === 0 || terms.length === 0) return [];

    const avgLength = this.totalLength / this.docs.length || 1;
    const scores = new Map();
    for (const term of terms) {
      const list = this.postings.get(term);
      if (!list) continue;
      const idf = this.idf(term);
      for (let i = 0; i < list.length; i += 2) {
        const id = list[i];
        const tf = list[i + 1];
        const norm = this.k1 * (1 - this.b + (this.b * this.lengths[id]) / avgLength);
        scores.set(id, (scores.get(id) || 0) + (idf * tf * (this.k1 + 1)) / (tf + norm));
      }
    }

    return [...scores]
      .sort((a, b) => b[1] - a[1] || a[0] - b[0])
      .slice(0, Math.max(0, limit))
      .map(([id, score]) => ({ doc: this.docs[id], id, score }));
  }
}

/**
 * Split a file into search chunks: its methods/functions, plus windows of at most
 * `windowLines` lines over the code outside them (the whole file when it has none).
 * Windows without a single term are dropped.
 *
 * @param {string} content - File content
 * @param {string} filePath - Path used for the language (extension)
 * @param {Object} [options]
 * @param {number} [options.windowLines=40]
 * @param {Array} [options.units] - Code units, when already extracted
 * @returns {Array<{name: string|null, kind: string, parent?: string, startLine: number,
 *   endLine: number}>} Sorted by start line
 */
export function chunkFile(content, filePath, { windowLines = WINDOW_LINES, units } = {}) {
  const lines = content.split('\n');
  // A trailing newline does not start another line
  const lineCount = lines.length > 1 && lines.at(-1) === '' ? lines.length - 1 : lines.length;
  const methods = (units ?? extractCodeUnits(content, filePath)).filter((u) => !u.container);

  const chunks = methods.map((unit) => ({
    name: unit.name,
    kind: unit.kind,
    ...(unit.parent ? { parent: unit.parent } : {}),
    startLine: unit.startLine,
    endLine: Math.min(unit.endLine, lineCount),
  }));

  const covered = new Uint8Array(lineCount + 2);
  for (const chunk of chunks) covered.fill(1, chunk.startLine, chunk.endLine + 1);

  let line = 1;
  while (line <= lineCount) {
    // Windows start and end on a non-blank line
    if (covered[line] || !lines[line - 1].trim()) {
      line++;
      continue;
    }
    const start = line;
    while (line <= lineCount && !covered[line] && line - start < windowLines) line++;
    let end = line - 1;
    while (end > start && !lines[end - 1].trim()) end--;
    // Same test as tokenize() yielding a term: a word of two or more characters
    if (/[\p{L}\p{N}]{2}/u.test(lines.slice(start - 1, end).join('\n'))) {
      chunks.push({ name: null, kind: 'window', startLine: start, endLine: end });
    }
  }

  return chunks.sort((a, b) => a.startLine - b.startLine || a.endLine - b.endLine);
}

/**
 * Source text of a line range (1-based, inclusive)
 * @param {string} content
 * @param {number} startLine
 * @param {number} endLine
 * @returns {string}
 */
export function sliceLines(content, startLine, endLine) {
  return content
    .split('\n')
    .slice(startLine - 1, endLine)
    .join('\n');
}

/**
 * Code-point order, independent of the locale
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function compareStrings(a, b) {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

// root + options -> { signature, files: Map<relativePath, entry>, index }
const projectCache = new Map();

/** Forget every cached project index (tests, long-running servers after big changes) */
export function clearSearchCache() {
  projectCache.clear();
}

/**
 * Load a file entry: content, code units and chunks, reused while mtime and size match
 * @private
 */
function loadFile(file, previous, windowLines) {
  let stat;
  try {
    stat = fs.statSync(file.path);
  } catch (_error) {
    return null;
  }
  const signature = `${stat.mtimeMs}:${stat.size}`;
  if (previous && previous.signature === signature) return previous;

  const entry = {
    path: file.path,
    relativePath: file.relativePath,
    signature,
    content: '',
    units: [],
    chunks: [],
  };
  const read = readFileChecked(file.path, { maxBytes: MAX_FILE_BYTES });
  if (read.status === 'too-large') return { ...entry, skipped: 'too large' };
  if (read.status !== 'ok') return null;
  entry.content = read.buffer.toString('utf-8');
  entry.units = extractCodeUnits(entry.content, file.path);
  entry.chunks = chunkFile(entry.content, file.path, { windowLines, units: entry.units });
  return entry;
}

/**
 * The in-memory index of a project, built on first use and refreshed when files are added,
 * removed or changed (by modification time and size). Files are found with the Scanner, so
 * .gitignore, .contextignore and .contextinclude apply.
 *
 * @param {string} root - Project directory
 * @param {Object} [options]
 * @param {number} [options.windowLines=40]
 * @returns {{root: string, files: Map<string, Object>, index: BM25Index, signature: string,
 *   reused: boolean}}
 * @throws {Error} When root is not a directory
 */
export function getProjectIndex(root, { windowLines = WINDOW_LINES } = {}) {
  const resolvedRoot = path.resolve(root);
  if (!fs.statSync(resolvedRoot, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error(`Not a directory: ${root}`);
  }
  const key = `${resolvedRoot}\0${windowLines}`;
  const cached = projectCache.get(key);

  const scanned = new Scanner(resolvedRoot)
    .scan()
    .sort((a, b) => compareStrings(a.relativePath, b.relativePath));

  const files = new Map();
  const signatureParts = [];
  for (const file of scanned) {
    const entry = loadFile(file, cached?.files.get(file.relativePath), windowLines);
    if (!entry) continue;
    files.set(file.relativePath, entry);
    signatureParts.push(`${file.relativePath}\0${entry.signature}`);
  }
  const signature = signatureParts.join('\n');

  // Most recently used last, so the first key is the one to evict
  projectCache.delete(key);
  if (cached && cached.signature === signature) {
    projectCache.set(key, cached);
    return { ...cached, reused: true };
  }

  const index = new BM25Index();
  for (const entry of files.values()) {
    const pathTerms = tokenize(entry.relativePath);
    const lines = entry.content.split('\n');
    for (const chunk of entry.chunks) {
      // Index the redacted text, so the ranking cannot be used to probe secret values
      const text = redactSecrets(lines.slice(chunk.startLine - 1, chunk.endLine).join('\n')).text;
      const nameTerms = chunk.name ? tokenize(chunk.name) : [];
      // The name counts three times and the file path once on top of the text
      index.add({ entry, chunk }, [
        ...tokenize(text),
        ...nameTerms,
        ...nameTerms,
        ...nameTerms,
        ...pathTerms,
      ]);
    }
  }

  const project = { root: resolvedRoot, files, index, signature };
  projectCache.set(key, project);
  while (projectCache.size > MAX_CACHED_PROJECTS) {
    projectCache.delete(projectCache.keys().next().value);
  }
  return { ...project, reused: false };
}

/**
 * Cut text to its first lines that fit in a token budget
 * @param {string} text
 * @param {number} budget - Tokens
 * @param {string} filePath - For the token estimate when tiktoken is missing
 * @returns {string} The fitting prefix ('' when not even one line fits)
 */
export function fitToTokenBudget(text, budget, filePath) {
  const lines = text.split('\n');
  let low = 0;
  let high = lines.length;
  // Largest line count whose text fits
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (TokenUtils.calculate(lines.slice(0, mid).join('\n'), filePath) <= budget) low = mid;
    else high = mid - 1;
  }
  return lines.slice(0, low).join('\n');
}

/**
 * Ranked search over a project.
 *
 * @param {string} root - Project directory
 * @param {string} query - Words or identifiers to look for
 * @param {Object} [options]
 * @param {number} [options.limit=10] - Maximum number of chunks
 * @param {number} [options.maxTokens=4000] - Token budget for the chunk texts; chunks past
 *   it are cut (`truncated: true`) or listed without text
 * @param {boolean} [options.redact=true] - Redact secrets in the returned text
 * @param {number} [options.windowLines=40] - Window size for code outside methods
 * @returns {{query: string, root: string, files: number, chunks: number, tokens: number,
 *   results: Array<{file: string, name: string|null, kind: string, parent?: string,
 *   startLine: number, endLine: number, score: number, tokens: number, text: string|null,
 *   truncated?: boolean}>}}
 */
export function searchProject(
  root,
  query,
  {
    limit = DEFAULT_LIMIT,
    maxTokens = DEFAULT_MAX_TOKENS,
    redact = true,
    windowLines = WINDOW_LINES,
  } = {}
) {
  if (typeof query !== 'string' || !query.trim()) {
    throw new Error('The search query is empty');
  }
  const project = getProjectIndex(root, { windowLines });
  const hits = project.index.search(query, { limit });

  let used = 0;
  const results = hits.map(({ doc: { entry, chunk }, score }) => {
    const raw = sliceLines(entry.content, chunk.startLine, chunk.endLine);
    let text = redact ? redactSecrets(raw).text : raw;
    let tokens = TokenUtils.calculate(text, entry.path);
    const result = {
      file: entry.relativePath,
      name: chunk.name,
      kind: chunk.kind,
      ...(chunk.parent ? { parent: chunk.parent } : {}),
      startLine: chunk.startLine,
      endLine: chunk.endLine,
      score: Math.round(score * 10000) / 10000,
    };

    if (used + tokens > maxTokens) {
      text = fitToTokenBudget(text, maxTokens - used, entry.path);
      tokens = text ? TokenUtils.calculate(text, entry.path) : 0;
      result.truncated = true;
    }
    used += tokens;
    return { ...result, tokens, text: text || null };
  });

  return {
    query,
    root: project.root,
    files: project.files.size,
    chunks: project.index.size,
    tokens: used,
    results,
  };
}

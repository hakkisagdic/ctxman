/**
 * Text around a target: docs, ADRs, changelog entries and code comments that mention
 * it, tests that reference it, and TODO/FIXME-style notes inside it. Searching uses
 * `git grep` (tracked files only, binary files skipped)
 */

import fs from 'fs';
import path from 'path';
import { tryGit } from './git.js';
import {
  DOC_EXTENSIONS,
  TEST_PATHSPECS,
  classifyTextFile,
  isExportableText,
  isTestFile,
} from './paths.js';

const GREP_CONFIG = ['-c', 'grep.fullName=false', '-c', 'grep.column=false'];
const MAX_GREP_HITS = 20000;
const KIND_ORDER = { adr: 0, changelog: 1, doc: 2, comment: 3 };
// TODO: text, FIXME(alice): text, HACK - text
const NOTE_TAGS = /\b(TODO|FIXME|HACK|XXX|NOTE)\b(?:\(([^)]*)\))?[\s:-]*(.*)$/;

const SLASH_COMMENTS = new Set([
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.mjs',
  '.cjs',
  '.java',
  '.c',
  '.cc',
  '.cpp',
  '.h',
  '.hpp',
  '.cs',
  '.go',
  '.rs',
  '.swift',
  '.kt',
  '.kts',
  '.scala',
  '.php',
  '.dart',
  '.groovy',
  '.gradle',
  '.proto',
  '.scss',
  '.less',
  '.sol',
  '.zig',
  '.vue',
  '.svelte',
]);
const HASH_COMMENTS = new Set([
  '.py',
  '.rb',
  '.sh',
  '.bash',
  '.zsh',
  '.yml',
  '.yaml',
  '.toml',
  '.ini',
  '.conf',
  '.cfg',
  '.properties',
  '.tf',
  '.nix',
  '.ex',
  '.exs',
  '.r',
  '.pl',
  '.ps1',
  '.cmake',
  '.coffee',
  '.jl',
  '.php',
]);
const DASH_COMMENTS = new Set(['.sql', '.lua', '.hs', '.elm', '.ada']);
const MARKUP_COMMENTS = new Set(['.html', '.htm', '.xml', '.svg', '.vue', '.svelte']);
const BLOCK_ONLY_COMMENTS = new Set(['.css']);

/**
 * Position where a comment starts on `line`, or -1. Quoted strings are skipped so `//`
 * in a string literal does not count; prose files are all "comment"
 * @param {string} line
 * @param {string} filePath
 * @returns {number}
 */
export function commentStart(line, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const base = path.basename(filePath).toLowerCase();
  if (DOC_EXTENSIONS.has(ext)) return 0;

  const slash = SLASH_COMMENTS.has(ext);
  const hash = HASH_COMMENTS.has(ext) || ['makefile', 'dockerfile', 'gemfile'].includes(base);
  const dash = DASH_COMMENTS.has(ext);
  const markup = MARKUP_COMMENTS.has(ext);
  const block = slash || BLOCK_ONLY_COMMENTS.has(ext);

  const trimmed = line.trimStart();
  const indent = line.length - trimmed.length;
  // Continuation line of a /* ... */ block
  if (block && /^\*(\s|\/|$)/.test(trimmed)) return indent;

  let quote = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') quote = ch;
    else if (slash && ch === '/' && line[i + 1] === '/') return i;
    else if (block && ch === '/' && line[i + 1] === '*') return i;
    else if (hash && ch === '#') return i;
    else if (dash && ch === '-' && line[i + 1] === '-') return i;
    else if (markup && line.startsWith('<!--', i)) return i;
  }
  return -1;
}

/**
 * TODO / FIXME / HACK / XXX / NOTE comments inside lines startLine..endLine
 * @param {string[]} lines - File lines
 * @param {number} startLine
 * @param {number} endLine
 * @param {string} filePath
 * @returns {Array<{line: number, tag: string, text: string}>}
 */
export function findNotes(lines, startLine, endLine, filePath) {
  const notes = [];
  for (let n = startLine; n <= endLine && n <= lines.length; n++) {
    const line = lines[n - 1];
    const start = commentStart(line, filePath);
    if (start === -1) continue;
    const match = line.slice(start).match(NOTE_TAGS);
    if (!match) continue;
    const text = match[3].replace(/\s*(\*\/|-->)\s*$/, '').trim();
    const note = { line: n, tag: match[1], text: shorten(text, 0, 200) };
    if (match[2]) note.author = match[2].trim();
    notes.push(note);
  }
  return notes;
}

/**
 * Word-boundary matcher for a term (identifiers and file names)
 * @param {string} term
 * @returns {RegExp}
 */
function termPattern(term) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![\\w$])${escaped}(?![\\w$])`);
}

/**
 * Shorten a line to `max` characters around position `at`
 */
function shorten(text, at, max) {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const offset = Math.max(0, text.length - text.trimStart().length);
  const center = Math.max(0, at - offset);
  const start = Math.max(0, Math.min(center - Math.floor(max / 3), clean.length - max));
  const slice = clean.slice(start, start + max).trim();
  return `${start > 0 ? '…' : ''}${slice}${start + max < clean.length ? '…' : ''}`;
}

/**
 * Run git grep for fixed-string, whole-word terms and parse `path\0line\0text`
 */
function grep(root, terms, pathspecs = []) {
  const args = [...GREP_CONFIG, 'grep', '-n', '-z', '-I', '--no-color', '-F', '-w'];
  for (const term of terms) args.push('-e', term);
  if (pathspecs.length) args.push('--', ...pathspecs);
  const output = tryGit(root, args, { okStatuses: [0, 1] }) ?? '';

  const hits = [];
  for (const record of output.split('\n')) {
    if (hits.length >= MAX_GREP_HITS) break;
    const first = record.indexOf('\0');
    const second = record.indexOf('\0', first + 1);
    if (first === -1 || second === -1) continue;
    hits.push({
      path: record.slice(0, first),
      line: Number(record.slice(first + 1, second)),
      text: record.slice(second + 1).replace(/\r$/, ''),
    });
  }
  return hits;
}

/**
 * Nearest heading above a line of a Markdown / AsciiDoc / reStructuredText file
 */
function headingFinder(root) {
  const cache = new Map();
  return (relativePath, lineNumber) => {
    if (!cache.has(relativePath)) {
      let lines = [];
      try {
        // lstat: a tracked symlink may point outside the project
        const file = path.join(root, ...relativePath.split('/'));
        const stat = fs.lstatSync(file);
        if (stat.isFile() && stat.size <= 2 * 1024 * 1024) {
          lines = fs.readFileSync(file, 'utf-8').split('\n');
        }
      } catch (_error) {
        // Unreadable: no heading
      }
      cache.set(relativePath, lines);
    }
    const lines = cache.get(relativePath);
    const text = (i) => lines[i].replace(/\r$/, '');
    for (let i = Math.min(lineNumber, lines.length) - 1; i >= 0; i--) {
      // "# Title" (Markdown) or "== Title" (AsciiDoc)
      const atx = text(i).match(/^(#{1,6}|={1,6})\s+(.+?)\s*#*\s*$/);
      if (atx) return atx[2];
      // A line underlined with ===, ---, ~~~ (Markdown setext, reStructuredText)
      if (i > 0 && /^([=\-~^"'`#*+])\1{2,}\s*$/.test(text(i)) && text(i - 1).trim()) {
        return text(i - 1).trim();
      }
    }
    return null;
  };
}

/**
 * Related text and tests for a target
 * @param {string} root - Project root (git grep runs here; paths are relative to it)
 * @param {object} options
 * @param {string[]} options.symbols - Symbol names to look for
 * @param {string|null} options.fileTerm - File name (or short path) to look for
 * @param {string|null} options.stem - Module name for import lines in tests
 * @param {{path: string, startLine: number|null, endLine: number|null}} options.target
 * @param {(relativePath: string) => boolean} options.isExcluded
 * @param {number} [options.maxRelated]
 * @param {number} [options.maxTests]
 * @returns {{related: object[], tests: object[], truncated: {related: number, tests: number}}}
 */
export function searchRelated(root, options) {
  const { symbols, fileTerm, stem, target, isExcluded } = options;
  const maxRelated = options.maxRelated ?? 20;
  const maxTests = options.maxTests ?? 10;
  const terms = [...new Set([...symbols, fileTerm].filter((term) => term && term.length >= 3))];
  const symbolPatterns = symbols.filter((s) => s && s.length >= 3).map(termPattern);
  const filePattern = fileTerm ? termPattern(fileTerm) : null;

  const excludedCache = new Map();
  const allowed = (relativePath) => {
    if (!excludedCache.has(relativePath)) {
      const ext = path.extname(relativePath).toLowerCase();
      excludedCache.set(
        relativePath,
        !isExcluded(relativePath) && (isExportableText(relativePath) || DOC_EXTENSIONS.has(ext))
      );
    }
    return excludedCache.get(relativePath);
  };
  const inTarget = (hit) =>
    hit.path === target.path &&
    (target.startLine === null || (hit.line >= target.startLine && hit.line <= target.endLine));

  const related = [];
  const testHits = new Map();
  const addTestHit = (hit, symbolHit) => {
    const entry = testHits.get(hit.path) ?? { path: hit.path, matches: [], symbolHits: 0 };
    if (entry.matches.some((match) => match.line === hit.line)) return;
    entry.matches.push({ line: hit.line, text: shorten(hit.text, 0, 200) });
    if (symbolHit) entry.symbolHits++;
    testHits.set(hit.path, entry);
  };

  const heading = headingFinder(root);
  for (const hit of terms.length ? grep(root, terms) : []) {
    if (inTarget(hit) || !allowed(hit.path)) continue;
    const symbolIndex = firstIndex(hit.text, symbolPatterns);
    const fileIndex = filePattern ? firstIndex(hit.text, [filePattern]) : -1;
    if (symbolIndex === -1 && fileIndex === -1) continue;

    if (isTestFile(hit.path)) {
      addTestHit(hit, symbolIndex !== -1);
      continue;
    }

    const at = symbolIndex !== -1 ? symbolIndex : fileIndex;
    let kind = classifyTextFile(hit.path);
    if (!kind) {
      const start = commentStart(hit.text, hit.path);
      if (start === -1 || at < start) continue;
      kind = 'comment';
    }
    related.push({
      path: hit.path,
      line: hit.line,
      kind,
      mentions: symbolIndex !== -1 ? 'symbol' : 'file',
      heading: kind === 'comment' ? null : heading(hit.path, hit.line),
      snippet: shorten(hit.text, at, 200),
    });
  }

  // Test files that import the module by name (`require('../cart')`, `from shop.cart import`)
  if (stem && stem.length >= 3) {
    const importLine = /\b(import|require|from|include|use|using|load|source|mod)\b|['"`]/;
    const stemPattern = termPattern(stem);
    for (const hit of grep(root, [stem], TEST_PATHSPECS)) {
      if (inTarget(hit) || !isTestFile(hit.path) || !allowed(hit.path)) continue;
      if (importLine.test(hit.text) && stemPattern.test(hit.text)) addTestHit(hit, false);
    }
  }

  related.sort(
    (a, b) =>
      KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
      (a.mentions === 'symbol' ? 0 : 1) - (b.mentions === 'symbol' ? 0 : 1) ||
      a.path.localeCompare(b.path) ||
      a.line - b.line
  );
  const perFile = new Map();
  const keptRelated = related.filter((entry) => {
    const count = perFile.get(entry.path) ?? 0;
    perFile.set(entry.path, count + 1);
    return count < 3;
  });

  const tests = [...testHits.values()]
    .map((entry) => ({ ...entry, matches: entry.matches.sort((a, b) => a.line - b.line) }))
    .sort(
      (a, b) =>
        b.symbolHits - a.symbolHits ||
        b.matches.length - a.matches.length ||
        a.path.localeCompare(b.path)
    )
    .map((entry) => ({
      path: entry.path,
      references: entry.symbolHits > 0 ? 'symbol' : 'file',
      matches: entry.matches.slice(0, 5),
      totalMatches: entry.matches.length,
    }));

  return {
    related: keptRelated.slice(0, maxRelated),
    tests: tests.slice(0, maxTests),
    truncated: {
      related: Math.max(0, keptRelated.length - maxRelated),
      tests: Math.max(0, tests.length - maxTests),
    },
  };
}

function firstIndex(text, patterns) {
  let best = -1;
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match && (best === -1 || match.index < best)) best = match.index;
  }
  return best;
}

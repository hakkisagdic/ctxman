/**
 * Targets of `ctxman why`: `file`, `file:symbol`, `file#L10-L40` (or `file:10-40`),
 * symbol resolution to a line range with the method analyzers, and mapping a
 * working-tree range onto HEAD through the diff hunks between them
 */

import path from 'path';
import MethodAnalyzer from '../analyzers/method-analyzer.js';
import { WhyError } from './errors.js';

const RANGE_SUFFIX = /^(.*?)#L(\d+)(?:-L?(\d+))?$/i;
const LINE_SUFFIX = /^(\d+)(?:-(\d+))?$/;
const SYMBOL_PATTERN = /^~?[A-Za-z_$][\w$]*(?:(?:\.|::|#)~?[A-Za-z_$][\w$]*)*[?!]?$/;
const MEMBER_SEPARATOR = /\.|::|#/;

// class Foo, interface Foo, struct Foo, impl<T> Trait for Foo, type Foo struct, module Foo, ...
const CONTAINER_LINE =
  /^\s*(?:template\s*<[^>]*>\s*)?(?:(?:export|default|public|private|protected|internal|abstract|final|sealed|open|data|static|partial|declare|unsafe|case|inline|value|annotation|pub(?:\([^)]*\))?|enum(?=\s+class))\s+)*(class|interface|enum|struct|record|trait|object|protocol|extension|module|namespace|impl|union|type)(?:\s*<[^>]*>)?\s+(?:[\w$:<>,\s]+?\s+for\s+)?([A-Za-z_$][\w$]*)/;
const NOT_A_NAME = new Set(['extends', 'implements', 'for', 'where', 'of', 'is']);

// Comment-only lines, for the doc comments and decorators kept with a definition
const HASH_COMMENT_EXTENSIONS = new Set(['.py', '.rb', '.sh', '.bash', '.zsh', '.pl', '.r']);

let sharedAnalyzer = null;
const analyzer = () => (sharedAnalyzer ??= new MethodAnalyzer());

/**
 * Split a target string into file and symbol or line range. `exists` decides between
 * readings when a path itself contains ':'
 * @param {string} spec
 * @param {(file: string) => boolean} exists
 * @returns {{file: string, symbol?: string, startLine?: number, endLine?: number}}
 */
export function parseTargetSpec(spec, exists = () => false) {
  if (typeof spec !== 'string' || spec.trim() === '') {
    throw new WhyError(
      'INVALID_TARGET',
      'A target is required: <file>, <file>:<symbol> or <file>#L10-L40'
    );
  }
  const target = spec.trim();

  const range = target.match(RANGE_SUFFIX);
  if (range && range[1]) {
    return lineTarget(range[1], range[2], range[3] ?? range[2]);
  }
  if (exists(target)) return { file: target };

  const readings = [];
  for (let i = target.indexOf(':'); i !== -1; i = target.indexOf(':', i + 1)) {
    // C:\path on Windows: a drive letter, not a separator
    if (i === 1 && /^[A-Za-z]$/.test(target[0])) continue;
    const file = target.slice(0, i);
    const rest = target.slice(i + 1);
    const lines = rest.match(LINE_SUFFIX);
    if (lines) readings.push(lineTarget(file, lines[1], lines[2] ?? lines[1]));
    else if (SYMBOL_PATTERN.test(rest)) readings.push({ file, symbol: rest });
  }
  return readings.find((reading) => exists(reading.file)) ?? readings[0] ?? { file: target };
}

function lineTarget(file, start, end) {
  return { file, startLine: Number.parseInt(start, 10), endLine: Number.parseInt(end, 10) };
}

/**
 * Check a symbol name before it reaches a regular expression or git
 * @param {string} symbol
 * @returns {boolean}
 */
export function isValidSymbol(symbol) {
  return typeof symbol === 'string' && symbol.length <= 200 && SYMBOL_PATTERN.test(symbol);
}

/**
 * Functions, methods and type-like containers (class, struct, impl, ...) in a file, with
 * their line ranges (1-based, inclusive). A range starts at the decorators and doc
 * comment directly above the declaration
 * @param {string} content
 * @param {string} filePath - Picks the language rules
 * @returns {Array<{name: string, kind: string, line: number, startLine: number, endLine: number, container: boolean}>}
 */
export function listDefinitions(content, filePath) {
  const methodAnalyzer = analyzer();
  const lines = content.split('\n');
  const ext = path.extname(filePath).toLowerCase();

  const methods = methodAnalyzer
    .extractMethods(content, filePath)
    .filter((method) => method.line >= 1 && method.line <= lines.length);
  const sources = methodAnalyzer.extractMethodSources(content, methods, filePath);

  const containers = [];
  lines.forEach((line, index) => {
    const match = line.match(CONTAINER_LINE);
    if (match && !NOT_A_NAME.has(match[2])) {
      containers.push({ name: match[2], kind: match[1], line: index + 1 });
    }
  });

  const declarationLines = [...new Set([...methods, ...containers].map((d) => d.line))].sort(
    (a, b) => a - b
  );

  const definitions = methods.map((method, index) => ({
    name: method.name.replace(/^(get|set) /, ''),
    kind:
      method.name.startsWith('get ') || method.name.startsWith('set ') ? 'accessor' : 'function',
    line: method.line,
    endLine: method.line + sources[index].split('\n').length - 1,
    container: false,
  }));

  for (const container of containers) {
    const next = declarationLines.find((line) => line > container.line);
    const end = blockEnd(lines, container.line - 1, ext, next ? next - 1 : lines.length);
    definitions.push({ ...container, endLine: end + 1, container: true });
  }

  return definitions
    .map((definition) => ({
      ...definition,
      startLine: leadingStart(lines, definition.line - 1, ext) + 1,
    }))
    .sort((a, b) => a.line - b.line || a.name.localeCompare(b.name));
}

/**
 * Last line index (0-based) of the block opened at `start`
 */
function blockEnd(lines, start, ext, limit) {
  const methodAnalyzer = analyzer();
  if (ext === '.py') return methodAnalyzer.findIndentedBlockEnd(lines, start);
  if (ext === '.rb') return methodAnalyzer.findRubyBlockEnd(lines, start);
  return methodAnalyzer.findBraceBlockEnd(lines, start, limit);
}

/**
 * Index of the first line of the decorators / attributes / doc comment directly above
 * line `index` (no blank line in between)
 */
function leadingStart(lines, index, ext) {
  const hashComments = HASH_COMMENT_EXTENSIONS.has(ext);
  let first = index;
  for (let i = index - 1; i >= 0 && index - i <= 40; i--) {
    const text = lines[i].trim();
    const isLeading =
      text.startsWith('@') ||
      text.startsWith('#[') ||
      /^\[[A-Z][\w.]*(\(.*\))?\]$/.test(text) ||
      /^(\/\/|\/\*|\*)/.test(text) ||
      (hashComments && text.startsWith('#') && !text.startsWith('#!'));
    if (!text || !isLeading) break;
    first = i;
  }
  return first;
}

/**
 * Resolve a symbol (`name`, `Class.method`, `Type::method`, `Class#method`) to a line range
 * @param {string} content
 * @param {string} filePath
 * @param {string} symbol
 * @returns {{name: string, kind: string, line: number, startLine: number, endLine: number,
 *   resolvedBy: string, matches: number}|null} null when nothing matches
 */
export function resolveSymbol(content, filePath, symbol) {
  const definitions = listDefinitions(content, filePath);
  const lines = content.split('\n');
  const ext = path.extname(filePath).toLowerCase();
  const parts = symbol.split(MEMBER_SEPARATOR);
  const member = parts[parts.length - 1];

  let matches;
  if (parts.length === 1) {
    matches = definitions.filter((definition) => definition.name === member);
  } else {
    const containerName = parts[parts.length - 2];
    const scopes = definitions.filter((d) => d.name === containerName && d.container);
    const fallbackScope = scopes.length ? null : fallbackDefinition(lines, containerName, ext);
    if (fallbackScope) scopes.push(fallbackScope);
    matches = definitions.filter(
      (d) =>
        d.name === member && scopes.some((scope) => d.line > scope.line && d.line <= scope.endLine)
    );
    if (!matches.length) {
      const qualified = qualifiedDefinition(lines, containerName, member, ext);
      if (qualified) matches = [qualified];
    }
  }

  if (!matches.length && parts.length === 1) {
    const fallback = fallbackDefinition(lines, member, ext);
    if (fallback) matches = [fallback];
  }
  if (!matches.length) return null;

  const [best] = matches;
  return {
    name: symbol,
    kind: best.kind,
    line: best.line,
    startLine: best.startLine,
    endLine: Math.max(best.endLine, best.line),
    resolvedBy: best.resolvedBy ?? 'analyzer',
    matches: matches.length,
  };
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * A definition the analyzers do not report: `func name`, `const name =`, `name: ...`,
 * lowercase Go functions, Lua/Elixir/shell functions and so on
 */
function fallbackDefinition(lines, name, ext) {
  const n = escapeRegExp(name);
  const patterns = [
    new RegExp(
      `\\b(?:def|defp|defn|defmacro|function|func|fn|fun|sub|proc|class|struct|interface|enum|trait|type|const|let|var|val|macro|module|object|alias)\\s+\\*?\\s*${n}(?![\\w$])`
    ),
    new RegExp(`\\bfunc\\s*\\([^)]*\\)\\s*${n}\\s*[(<\\[]`),
    new RegExp(
      `^\\s*(?:(?:export|static|public|private|protected|readonly)\\s+)*(?:[\\w$]+\\.)*${n}\\s*(?::[^=\\n]*)?=(?![=>])`
    ),
    new RegExp(`^\\s*['"]?${n}['"]?\\s*:(?!:)`),
  ];
  return findDefinitionLine(lines, ext, patterns, 'definition');
}

/**
 * A member defined outside its container's block: Go receivers, C++ `Type::method`,
 * JavaScript `Type.prototype.method =` and `Type.method =`
 */
function qualifiedDefinition(lines, container, member, ext) {
  const c = escapeRegExp(container);
  const m = escapeRegExp(member);
  const patterns = [
    new RegExp(`\\bfunc\\s*\\([^)]*\\b${c}\\s*\\)\\s*${m}\\s*[(<\\[]`),
    new RegExp(`\\b${c}::${m}\\s*\\(`),
    new RegExp(`\\b${c}\\.(?:prototype\\.)?${m}\\s*=(?!=)`),
  ];
  return findDefinitionLine(lines, ext, patterns, 'qualified');
}

function findDefinitionLine(lines, ext, patterns, resolvedBy) {
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i].trim();
    if (/^(\/\/|\/\*|\*|#|--)/.test(text) && !/^#\[/.test(text)) continue;
    if (patterns.some((pattern) => pattern.test(lines[i]))) {
      const end = blockEnd(lines, i, ext, lines.length);
      return {
        kind: 'definition',
        line: i + 1,
        startLine: leadingStart(lines, i, ext) + 1,
        endLine: end + 1,
        resolvedBy,
      };
    }
  }
  return null;
}

/**
 * Names in the file closest to a symbol that was not found
 * @param {string} content
 * @param {string} filePath
 * @param {string} symbol
 * @param {number} [limit]
 * @returns {string[]}
 */
export function closeMatches(content, filePath, symbol, limit = 5) {
  const definitions = listDefinitions(content, filePath);
  const names = new Set(definitions.map((d) => d.name));
  for (const d of definitions.filter((definition) => !definition.container)) {
    const scope = definitions.find((c) => c.container && d.line > c.line && d.line <= c.endLine);
    if (scope) names.add(`${scope.name}.${d.name}`);
  }

  const wanted = symbol.toLowerCase();
  const wantedMember = wanted.split(MEMBER_SEPARATOR).pop();
  const scored = [];
  for (const name of names) {
    const lower = name.toLowerCase();
    const member = lower.split('.').pop();
    let score;
    if (lower === wanted || member === wantedMember) score = 0;
    else if (lower.includes(wantedMember) || wantedMember.includes(member)) score = 1;
    else {
      const distance = levenshtein(wantedMember, member);
      if (distance <= Math.max(2, Math.floor(wantedMember.length / 3))) score = 1 + distance;
    }
    if (score !== undefined) scored.push({ name, score });
  }
  return scored
    .sort((a, b) => a.score - b.score || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map((entry) => entry.name);
}

function levenshtein(a, b) {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    previous = current;
  }
  return previous[b.length];
}

/**
 * Hunks of a `git diff -U0` (old = HEAD, new = working tree)
 * @param {string} diff
 * @returns {Array<{oldStart: number, oldCount: number, newStart: number, newCount: number}>}
 */
export function parseHunks(diff) {
  const hunks = [];
  for (const match of diff.matchAll(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/gm)) {
    hunks.push({
      oldStart: Number(match[1]),
      oldCount: match[2] === undefined ? 1 : Number(match[2]),
      newStart: Number(match[3]),
      newCount: match[4] === undefined ? 1 : Number(match[4]),
    });
  }
  return hunks;
}

/**
 * Map a working-tree line range onto the old (HEAD) side of the diff. Lines inside a
 * changed block widen to the whole old block; a range made only of added lines has no
 * old counterpart
 * @param {ReturnType<typeof parseHunks>} hunks
 * @param {number} start
 * @param {number} end
 * @returns {{startLine: number, endLine: number}|null}
 */
export function mapRangeToOld(hunks, start, end) {
  const mapLine = (line, edge) => {
    let offset = 0;
    for (const hunk of hunks) {
      const newEnd = hunk.newStart + hunk.newCount - 1;
      if (hunk.newCount > 0 && line >= hunk.newStart && line <= newEnd) {
        if (hunk.oldCount === 0) return edge === 'start' ? hunk.oldStart + 1 : hunk.oldStart;
        return edge === 'start' ? hunk.oldStart : hunk.oldStart + hunk.oldCount - 1;
      }
      const before = hunk.newCount > 0 ? newEnd < line : hunk.newStart < line;
      if (!before) break;
      offset += hunk.newCount - hunk.oldCount;
    }
    return line - offset;
  };
  const startLine = mapLine(start, 'start');
  const endLine = mapLine(end, 'end');
  return startLine <= endLine ? { startLine, endLine } : null;
}

/**
 * The range git's default funcname rule gives a name: from the first line that starts
 * with a letter, `_` or `$` and contains the name, up to the next such line (trailing
 * blank lines dropped). Used to show the source when only `git log -L :name:file` found
 * the symbol
 * @param {string[]} lines
 * @param {string} name
 * @returns {{startLine: number, endLine: number}|null}
 */
export function funcnameRange(lines, name) {
  const word = new RegExp(`(?<![\\w$])${escapeRegExp(name)}(?![\\w$])`);
  const isFuncname = (line) => /^[A-Za-z_$]/.test(line);
  const start = lines.findIndex((line) => isFuncname(line) && word.test(line));
  if (start === -1) return null;
  let end = lines.length - 1;
  for (let i = start + 1; i < lines.length; i++) {
    if (isFuncname(lines[i])) {
      end = i - 1;
      break;
    }
  }
  while (end > start && lines[end].trim() === '') end--;
  return { startLine: start + 1, endLine: end + 1 };
}

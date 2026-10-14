/**
 * Signature-only compression for `pack --compress`
 *
 * Keeps everything outside function bodies (imports, class headers, top-level code,
 * signatures) and replaces each body with a one-line placeholder in the language's comment
 * syntax: `{ /* … 42 lines *\/ }` for brace languages, `...  # 42 lines` for Python and
 * `# … 42 lines` for Ruby.
 *
 * Which functions exist comes from the existing method analyzers (names and declaration
 * lines). Their `extractMethodSources()` only returns text slices from the declaration line
 * and scans braces from there without knowing whether that line starts inside a string, so
 * body ranges are located here with a string/comment-aware lexer instead. The rules are
 * conservative: a body is elided only when its braces are unambiguous, and a file whose
 * brackets do not balance under the lexer is left whole.
 */

import MethodAnalyzer from '../analyzers/method-analyzer.js';
import { lexCode, familyOf, lineAt, CODE, COMMENT, STRING } from './code-lexer.js';

const analyzer = new MethodAnalyzer();

// Lines between `)` and a body's `{` (multi-line `where`/`throws` clauses, init lists)
const MAX_SIGNATURE_LINES = 6;
// How a signature line may continue on the next line before the body's `{`
const CONTINUATION = /^(?:where\b|throws\b|->|:|const\b|noexcept\b|override\b|final\b|requires\b)/;
// The `where` keyword, checked from the character before it
const WHERE = /^[^\w$]where\b/;

// What may follow a declared name up to the `(` of its parameter list
const GENERIC_TAIL = /[ \t]*(?:<[^<>()\n]*(?:<[^<>()\n]*>[^<>()\n]*)*>)?[ \t]*\(/y;
const SWIFT_TAIL = /[?!]?[ \t]*(?:<[^<>()\n]*(?:<[^<>()\n]*>[^<>()\n]*)*>)?[ \t]*\(/y;
const JS_TAILS = [
  GENERIC_TAIL,
  /[ \t]*:[ \t]*(?:async[ \t]+)?function[ \t]*\*?[ \t]*\(/y, // name: function (
  /[ \t]*(?::[^=;()\n]+)?=[ \t]*(?:async[ \t]*)?\(/y, // const name = (...) =>
];

const plural = (count) => `${count} ${count === 1 ? 'line' : 'lines'}`;
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Compress one file
 * @param {string} content - File content
 * @param {string} filePath - Path (its extension picks the language)
 * @returns {{text: string, lineMap: number[]|null, elided: number, supported: boolean}}
 *   text: compressed content; lineMap: original 1-based line number of every output line
 *   (null when nothing changed); elided: number of bodies replaced; supported: whether the
 *   language has a method analyzer
 */
export function compressCode(content, filePath) {
  const family = familyOf(filePath);
  const unchanged = { text: content, lineMap: null, elided: 0, supported: family !== null };
  if (!family) return unchanged;

  let methods;
  try {
    methods = analyzer.extractMethods(content, filePath);
  } catch (_error) {
    return unchanged;
  }
  if (!methods.length) return unchanged;

  let replacements;
  if (family === 'ruby') {
    replacements = rubyReplacements(content, methods);
  } else {
    const lexed = lexCode(content, family);
    if (!lexed.balanced) return unchanged;
    replacements = bodyReplacements(content, lexed, methods, family);
  }
  if (!replacements.length) return unchanged;

  const compressed = applyReplacements(content, replacements);
  // Last line of defence: brackets that no longer balance mean a range was wrong
  if (family !== 'ruby' && !lexCode(compressed.text, family).balanced) return unchanged;
  return { ...compressed, elided: replacements.length, supported: true };
}

/**
 * Placeholders for brace and Python bodies, outermost first; bodies nested in an elided
 * body are left to it
 */
function bodyReplacements(src, lexed, methods, family) {
  const declarations = [];
  const seen = new Set();
  for (const method of methods) {
    const name = method.name.split(/\s+/).pop(); // "get value" -> "value"
    const declaration = locateDeclaration(src, lexed, method.line, name, family);
    if (declaration && !seen.has(declaration.parenIdx)) {
      seen.add(declaration.parenIdx);
      declarations.push(declaration);
    }
  }
  declarations.sort((a, b) => a.nameIdx - b.nameIdx);

  const replacements = [];
  let coveredUntil = -1;
  for (const declaration of declarations) {
    if (declaration.nameIdx < coveredUntil) continue; // nested in an elided body
    const replacement =
      family === 'python'
        ? pythonBody(src, lexed, declaration)
        : braceBody(src, lexed, declaration, family);
    if (!replacement) continue;
    // Only when it is shorter: a one-line body is cheaper than its placeholder
    if (replacement.end - replacement.start <= replacement.text.length) continue;
    replacements.push(replacement);
    coveredUntil = replacement.end;
  }
  return replacements;
}

/**
 * Position of a declared name on its line and of the `(` that opens its parameters
 * @returns {{nameIdx: number, parenIdx: number}|null}
 */
function locateDeclaration(src, lexed, line, name, family) {
  const { kinds, lineStarts } = lexed;
  if (!name || line < 1 || line > lineStarts.length) return null;
  const start = lineStarts[line - 1];
  const stop = line < lineStarts.length ? lineStarts[line] - 1 : src.length;
  const lineText = src.slice(start, stop);
  const tails = family === 'js' ? JS_TAILS : [family === 'swift' ? SWIFT_TAIL : GENERIC_TAIL];
  const pattern = new RegExp(`(?<![\\w$])${escapeRegex(name)}(?![\\w$])`, 'g');

  for (const found of lineText.matchAll(pattern)) {
    const nameIdx = start + found.index;
    if (kinds[nameIdx] !== CODE) continue;
    const before = lineText.slice(0, found.index);
    if (family === 'python' && !/(?:^|[^\w])def\s+$/.test(before)) continue;
    // A call, not a declaration: `new Foo(...) {`, `obj.run(...)`, `$this->run(...)`.
    // Kotlin extension functions (`fun String.trimAll(`) are declared with a dot.
    if (/\bnew\s+$/.test(before) || /->\s*$/.test(before)) continue;
    if (family !== 'kotlin' && /\.\s*$/.test(before)) continue;
    for (const tail of tails) {
      tail.lastIndex = nameIdx + name.length;
      if (!tail.test(src)) continue;
      const parenIdx = tail.lastIndex - 1;
      if (kinds[parenIdx] === CODE && lexed.match[parenIdx] > parenIdx) {
        return { nameIdx, parenIdx };
      }
    }
  }
  return null;
}

/** Index of the next code character that is not whitespace, or -1 */
function nextCode(src, kinds, from) {
  for (let i = from; i < src.length; i++) {
    if (kinds[i] === CODE && !/\s/.test(src[i])) return i;
  }
  return -1;
}

/** Whether only whitespace and comments follow `from` on its line */
function restOfLineIsTrivia(src, kinds, from) {
  for (let i = from; i < src.length && src[i] !== '\n'; i++) {
    if (kinds[i] === STRING) return false;
    if (kinds[i] === CODE && !/\s/.test(src[i])) return false;
  }
  return true;
}

/** Whether `index` is the first non-whitespace character of its line */
function startsLine(src, index) {
  for (let i = index - 1; i >= 0 && src[i] !== '\n'; i--) {
    if (!/\s/.test(src[i])) return false;
  }
  return true;
}

/**
 * The body braces after a parameter list, or null when they are not certain. The `{` must
 * end its line and follow the `)` on the same line, alone on the next line (Allman style),
 * or after continuation lines (`where`, `throws`, `:` init lists). Inline brace groups such
 * as TypeScript object types or C++ `x_{x}` initializers are skipped; `;`, `=` (except
 * `=> {` and Scala's `= {`) or a closing bracket mean there is no body.
 */
function findBodyBraces(src, lexed, closeParen, family) {
  const { kinds, match, lineStarts } = lexed;
  let lineBreaks = 0;
  let atLineStart = false;
  // After `where`, every line up to the body is a bound (`T: Clone,`)
  let inWhereClause = false;

  for (let i = closeParen + 1; i < src.length; i++) {
    if (kinds[i] !== CODE) continue;
    const ch = src[i];
    if (ch === '\n') {
      if (++lineBreaks > MAX_SIGNATURE_LINES) return null;
      atLineStart = true;
      continue;
    }
    if (/\s/.test(ch)) continue;
    if (atLineStart) {
      atLineStart = false;
      if (ch !== '{' && !inWhereClause && !CONTINUATION.test(src.slice(i, i + 9))) return null;
    }
    if (ch === 'w' && WHERE.test(src.slice(i - 1, i + 6))) inWhereClause = true;

    if (ch === '{') {
      const close = match[i];
      if (close < 0) return null;
      if (lineAt(lineStarts, close) === lineAt(lineStarts, i)) {
        i = close; // inline group: a type literal or an initializer
        continue;
      }
      if (!restOfLineIsTrivia(src, kinds, i + 1)) return null;
      // `{ ... } {`: the group was a multi-line return type, not the body
      const after = nextCode(src, kinds, close + 1);
      if (
        after !== -1 &&
        src[after] === '{' &&
        lineAt(lineStarts, after) === lineAt(lineStarts, close)
      ) {
        return null;
      }
      return { open: i, close };
    }
    if (ch === '(' || ch === '[') {
      if (match[i] < 0) return null;
      i = match[i];
      continue;
    }
    if (ch === ';' || ch === '}' || ch === ')' || ch === ']') return null;
    if (ch === '=') {
      const next = src[i + 1];
      const arrow = next === '>';
      if (!arrow && !(family === 'scala' && next !== '=')) return null;
      const target = nextCode(src, kinds, i + (arrow ? 2 : 1));
      if (target === -1 || src[target] !== '{') return null;
      i = target - 1;
    }
  }
  return null;
}

/** Placeholder for a brace body: `{ /* … N lines *\/ }` */
function braceBody(src, lexed, declaration, family) {
  const closeParen = lexed.match[declaration.parenIdx];
  const braces = findBodyBraces(src, lexed, closeParen, family);
  if (!braces) return null;

  const { lineStarts } = lexed;
  const openLine = lineAt(lineStarts, braces.open);
  const closeLine = lineAt(lineStarts, braces.close);
  const count = closeLine - openLine - 1 + (startsLine(src, braces.close) ? 0 : 1);
  if (count < 1) return null;

  return { start: braces.open + 1, end: braces.close, text: ` /* … ${plural(count)} */ ` };
}

/** Indentation width and kind of the first non-blank character of a line */
function describeLine(src, lexed, line) {
  const { kinds, lineStarts } = lexed;
  const start = lineStarts[line];
  const stop = line + 1 < lineStarts.length ? lineStarts[line + 1] - 1 : src.length;
  // Inside a string or comment that began on an earlier line
  const continued = start > 0 && kinds[start - 1] !== CODE;
  let i = start;
  while (i < stop && (src[i] === ' ' || src[i] === '\t' || src[i] === '\r')) i++;
  return {
    continued,
    blank: i >= stop,
    indent: i - start,
    kind: kinds[i],
    stop: src[stop - 1] === '\r' ? stop - 1 : stop,
  };
}

/** Placeholder for a Python body: an indented `...  # N lines` line */
function pythonBody(src, lexed, declaration) {
  const { kinds, match, lineStarts } = lexed;
  const closeParen = match[declaration.parenIdx];

  // The `:` that ends the signature (after an optional `-> type`) must end its line
  let colon = -1;
  for (let i = closeParen + 1; i < src.length; i++) {
    if (kinds[i] !== CODE) continue;
    const ch = src[i];
    if (ch === '(' || ch === '[' || ch === '{') {
      if (match[i] < 0) return null;
      i = match[i];
    } else if (ch === ':') {
      colon = i;
      break;
    } else if (ch === '\n' || ch === ';' || ch === ')' || ch === ']' || ch === '}') {
      return null;
    }
  }
  if (colon === -1 || !restOfLineIsTrivia(src, kinds, colon + 1)) return null;

  const colonLine = lineAt(lineStarts, colon);
  const base = describeLine(src, lexed, lineAt(lineStarts, declaration.nameIdx)).indent;
  let first = -1;
  let last = -1;
  for (let line = colonLine + 1; line < lineStarts.length; line++) {
    const info = describeLine(src, lexed, line);
    if (info.continued) {
      if (first !== -1) last = line; // rest of a multi-line string in the body
      continue;
    }
    if (info.blank) continue;
    if (info.kind === COMMENT) {
      if (first !== -1 && info.indent > base) last = line;
      continue;
    }
    if (info.indent <= base) break;
    if (first === -1) first = line;
    last = line;
  }
  if (first === -1) return null;

  const firstInfo = describeLine(src, lexed, first);
  const firstStart = lineStarts[first];
  const indent = src.slice(firstStart, firstStart + firstInfo.indent);
  // A docstring is documentation, like the comment above a function elsewhere: keep it
  let keptUntil = colonLine;
  if (firstInfo.kind === STRING) {
    let end = firstStart + firstInfo.indent;
    while (end < src.length && kinds[end] === STRING) end++;
    keptUntil = lineAt(lineStarts, end - 1);
    if (!restOfLineIsTrivia(src, kinds, end) || keptUntil >= last) return null;
  }
  return {
    start: lineStarts[keptUntil + 1],
    end: describeLine(src, lexed, last).stop,
    text: `${indent}...  # ${plural(last - keptUntil)}`,
  };
}

/** Placeholders for Ruby bodies (`def` ... `end`), found by indentation like the analyzer */
function rubyReplacements(src, methods) {
  const lines = src.split('\n');
  const starts = [];
  for (let i = 0, offset = 0; i < lines.length; offset += lines[i].length + 1, i++) {
    starts.push(offset);
  }
  const lineStop = (line) => {
    const stop = starts[line] + lines[line].length;
    return src[stop - 1] === '\r' ? stop - 1 : stop;
  };

  const replacements = [];
  let coveredUntil = -1;
  const ordered = [...new Set(methods.map((method) => method.line - 1))].sort((a, b) => a - b);
  for (const start of ordered) {
    if (start <= coveredUntil) continue; // nested in an elided body
    const declaration = lines[start] ?? '';
    if (!/^\s*def\s/.test(declaration)) continue;
    if (/\bdef\s+[\w.]+[?!]?\s*(?:\([^)]*\))?\s*=/.test(declaration)) continue; // endless method
    const opened = (declaration.match(/\(/g) || []).length;
    if (opened !== (declaration.match(/\)/g) || []).length) continue; // multi-line parameters

    if (/\bend\b/.test(declaration.replace(/#.*$/, ''))) continue; // one-line `def x() y end`

    const end = analyzer.findRubyBlockEnd(lines, start);
    if (end <= start + 1) continue;
    // Every body line must be indented deeper than `def` (`rescue`/`ensure`/`else` aside),
    // otherwise the `end` found may close something else
    const base = declaration.length - declaration.trimStart().length;
    const body = lines.slice(start + 1, end);
    const misplaced = body.some((line) => {
      const text = line.trim();
      if (text === '') return false;
      return line.length - line.trimStart().length <= base && !/^(rescue|ensure|else)\b/.test(text);
    });
    if (misplaced) continue;
    const first = body.findIndex((line) => line.trim() !== '');
    if (first === -1) continue;
    const indent = lines[start + 1 + first].match(/^[ \t]*/)[0];
    const replacement = {
      start: starts[start + 1],
      end: lineStop(end - 1),
      text: `${indent}# … ${plural(end - start - 1)}`,
    };
    if (replacement.end - replacement.start <= replacement.text.length) continue;
    replacements.push(replacement);
    coveredUntil = end;
  }
  return replacements;
}

/**
 * Apply non-overlapping replacements (sorted by start) and map every output line to the
 * original line it starts on
 * @returns {{text: string, lineMap: number[]}}
 */
function applyReplacements(src, replacements) {
  let text = '';
  const lineMap = [1];
  let line = 1;
  let cursor = 0;

  const keep = (from, to) => {
    const segment = src.slice(from, to);
    for (let i = segment.indexOf('\n'); i !== -1; i = segment.indexOf('\n', i + 1)) {
      lineMap.push(++line);
    }
    text += segment;
  };

  for (const { start, end, text: placeholder } of replacements) {
    keep(cursor, start);
    text += placeholder;
    const removed = src.slice(start, end);
    for (let i = removed.indexOf('\n'); i !== -1; i = removed.indexOf('\n', i + 1)) line++;
    cursor = end;
  }
  keep(cursor, src.length);
  return { text, lineMap };
}

export default { compressCode };

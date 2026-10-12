/**
 * Code Lexer for `pack --compress`
 *
 * Marks every character of a source file as code, comment or string and pairs up the
 * brackets that are code, so the compressor can find a function body's braces without being
 * fooled by braces inside strings, comments, regular expressions or template text. It knows
 * each language's comment and string syntax only; it is not a parser.
 */

import path from 'path';

/** Character kinds stored in `kinds` */
export const CODE = 0;
export const COMMENT = 1;
export const STRING = 2;

const C_LIKE = { lineComments: ['//'], blockComments: true };

/**
 * Comment and string syntax per language family. Options:
 * quotes: single-line string delimiters, multilineQuotes: those strings may span lines,
 * triple: multi-line delimiters ("""), charLiterals: `'x'` is a character literal and any
 * other `'` is code (Rust lifetimes, Scala symbols), template: JavaScript template literals,
 * regex: JavaScript regular expression literals.
 */
const SYNTAX = {
  js: { ...C_LIKE, quotes: '"\'', template: true, regex: true },
  java: { ...C_LIKE, quotes: '"', triple: ['"""'], charLiterals: true },
  csharp: { ...C_LIKE, quotes: '"', triple: ['"""'], verbatim: true, charLiterals: true },
  go: { ...C_LIKE, quotes: '"', rawBacktick: true, charLiterals: true },
  rust: {
    ...C_LIKE,
    nestedComments: true,
    quotes: '"',
    multilineQuotes: true,
    charLiterals: true,
    rustRaw: true,
  },
  php: {
    lineComments: ['//', '#'],
    blockComments: true,
    quotes: '"\'',
    multilineQuotes: true,
    heredoc: true,
  },
  kotlin: { ...C_LIKE, nestedComments: true, quotes: '"', triple: ['"""'], charLiterals: true },
  swift: { ...C_LIKE, nestedComments: true, quotes: '"', triple: ['"""'] },
  c: { ...C_LIKE, quotes: '"', charLiterals: true },
  scala: { ...C_LIKE, nestedComments: true, quotes: '"', triple: ['"""'], charLiterals: true },
  python: { lineComments: ['#'], quotes: '"\'', triple: ['"""', "'''"] },
};

/** Extensions whose method analyzer the compressor can use, by language family */
const FAMILY_BY_EXTENSION = {
  '.js': 'js',
  '.jsx': 'js',
  '.mjs': 'js',
  '.cjs': 'js',
  '.ts': 'js',
  '.tsx': 'js',
  '.mts': 'js',
  '.cts': 'js',
  '.java': 'java',
  '.cs': 'csharp',
  '.go': 'go',
  '.rs': 'rust',
  '.php': 'php',
  '.kt': 'kotlin',
  '.kts': 'kotlin',
  '.swift': 'swift',
  '.c': 'c',
  '.cc': 'c',
  '.cpp': 'c',
  '.h': 'c',
  '.hpp': 'c',
  '.scala': 'scala',
  '.py': 'python',
  '.rb': 'ruby',
};

const OPENERS = { '(': ')', '[': ']', '{': '}' };
const CLOSERS = new Set([')', ']', '}']);

// After one of these, a `/` starts a regular expression rather than a division
const REGEX_PRECEDERS = new Set('(,=:[!&|?{};+-*%<>~^}'.split(''));
const REGEX_KEYWORDS = new Set([
  'return',
  'typeof',
  'instanceof',
  'case',
  'do',
  'else',
  'in',
  'of',
  'new',
  'delete',
  'void',
  'throw',
  'yield',
  'await',
]);

const CHAR_LITERAL = /'(?:\\.[^'\n]{0,9}|[^'\\\n])'/y;
const RUST_RAW_STRING = /b?r(#*)"/y;
const PHP_HEREDOC = /<<<[ \t]*(['"]?)([A-Za-z_]\w*)\1\r?\n/y;
const WORD_CHAR = /[\w$]/;

/**
 * Language family of a file for the compressor, or null when it has no method analyzer
 * @param {string} filePath
 * @returns {string|null} 'js', 'python', 'ruby', ...
 */
export function familyOf(filePath) {
  return FAMILY_BY_EXTENSION[path.extname(filePath).toLowerCase()] ?? null;
}

/**
 * Index of the first character of every line
 * @param {string} src
 * @returns {number[]}
 */
export function lineStartsOf(src) {
  const starts = [0];
  for (let i = src.indexOf('\n'); i !== -1; i = src.indexOf('\n', i + 1)) starts.push(i + 1);
  return starts;
}

/**
 * Zero-based line of a character index
 * @param {number[]} lineStarts - From lineStartsOf()
 * @param {number} index
 * @returns {number}
 */
export function lineAt(lineStarts, index) {
  let lo = 0;
  let hi = lineStarts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (lineStarts[mid] <= index) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * Lex a source file
 * @param {string} src - File content
 * @param {string} family - From familyOf() (not 'ruby')
 * @returns {{kinds: Uint8Array, match: Int32Array, balanced: boolean, lineStarts: number[]}}
 *   kinds: CODE/COMMENT/STRING per character; match: index of the partner of each code
 *   bracket (-1 elsewhere); balanced: false when a bracket has no partner, in which case
 *   the pairs cannot be trusted
 */
export function lexCode(src, family) {
  const syntax = SYNTAX[family];
  if (!syntax) throw new Error(`No lexer for ${family}`);

  const n = src.length;
  const kinds = new Uint8Array(n);
  const match = new Int32Array(n).fill(-1);
  const stack = [];
  const templateDepths = []; // JS: brace depth inside each open `${ ... }`
  let balanced = true;
  let prev = -1; // last significant code character, for regex detection

  const mark = (from, to, kind) => kinds.fill(kind, from, Math.min(to, n));

  /** End of a quoted string starting at `start` (the opening delimiter) */
  const quotedEnd = (start, quote, multiline) => {
    for (let j = start + 1; j < n; j++) {
      const c = src[j];
      if (c === '\\') j++;
      else if (c === quote) return j + 1;
      else if (c === '\n' && !multiline) return j; // unterminated: stop at the line end
    }
    return n;
  };

  /** End of template text starting at `start`, and whether it stopped at a `${` */
  const templateEnd = (start) => {
    for (let j = start; j < n; j++) {
      const c = src[j];
      if (c === '\\') j++;
      else if (c === '`') return { end: j + 1, expression: false };
      else if (c === '$' && src[j + 1] === '{') return { end: j + 1, expression: true };
    }
    return { end: n, expression: false };
  };

  const regexAllowed = () => {
    if (prev < 0) return true;
    const p = src[prev];
    if (REGEX_PRECEDERS.has(p)) return true;
    if (!WORD_CHAR.test(p)) return false;
    let s = prev;
    while (s > 0 && WORD_CHAR.test(src[s - 1])) s--;
    return REGEX_KEYWORDS.has(src.slice(s, prev + 1));
  };

  /** End of a regex literal starting at `start`, or -1 when it does not close on its line */
  const regexEnd = (start) => {
    let inClass = false;
    for (let j = start + 1; j < n; j++) {
      const c = src[j];
      if (c === '\n') return -1;
      if (c === '\\') j++;
      else if (c === '[') inClass = true;
      else if (c === ']') inClass = false;
      else if (c === '/' && !inClass) {
        let end = j + 1;
        while (end < n && /[a-z]/i.test(src[end])) end++;
        return end;
      }
    }
    return -1;
  };

  const openBracket = (i) => stack.push(i);
  const closeBracket = (i) => {
    const open = stack.pop();
    if (open === undefined || OPENERS[src[open]] !== src[i]) {
      balanced = false;
      if (open !== undefined) stack.push(open);
      return;
    }
    match[open] = i;
    match[i] = open;
  };

  /** Mark template text from `start` and resume code after it (or inside its `${`) */
  const continueTemplate = (start) => {
    const { end, expression } = templateEnd(start);
    mark(start, end, STRING);
    if (!expression) {
      prev = end - 1;
      return end;
    }
    // `end` is the `{` of `${`: a code bracket closed by the `}` that ends the expression
    openBracket(end);
    templateDepths.push(0);
    prev = end;
    return end + 1;
  };

  let i = 0;
  while (i < n) {
    const ch = src[i];
    const next = src[i + 1];

    // Comments
    const lineComment = syntax.lineComments.find((token) => src.startsWith(token, i));
    if (lineComment && !(family === 'php' && ch === '#' && next === '[')) {
      const end = src.indexOf('\n', i);
      const stop = end === -1 ? n : end;
      mark(i, stop, COMMENT);
      i = stop;
      continue;
    }
    if (syntax.blockComments && ch === '/' && next === '*') {
      let depth = 1;
      let j = i + 2;
      while (j < n && depth > 0) {
        if (src[j] === '*' && src[j + 1] === '/') {
          depth--;
          j += 2;
        } else if (syntax.nestedComments && src[j] === '/' && src[j + 1] === '*') {
          depth++;
          j += 2;
        } else {
          j++;
        }
      }
      mark(i, j, COMMENT);
      i = j;
      continue;
    }

    // Strings
    let end = -1;
    const triple = syntax.triple?.find((token) => src.startsWith(token, i));
    if (triple) {
      const close = src.indexOf(triple, i + 3);
      end = close === -1 ? n : close + 3;
    } else if (
      syntax.verbatim &&
      ch === '"' &&
      (src[i - 1] === '@' || (src[i - 1] === '$' && src[i - 2] === '@'))
    ) {
      // C# verbatim string: spans lines, `""` is an escaped quote
      end = n;
      for (let j = i + 1; j < n; j++) {
        if (src[j] !== '"') continue;
        if (src[j + 1] === '"') j++;
        else {
          end = j + 1;
          break;
        }
      }
    } else if (syntax.quotes.includes(ch)) {
      end = quotedEnd(i, ch, syntax.multilineQuotes);
    } else if (syntax.charLiterals && ch === "'") {
      CHAR_LITERAL.lastIndex = i;
      if (CHAR_LITERAL.test(src)) end = CHAR_LITERAL.lastIndex;
    } else if (syntax.rawBacktick && ch === '`') {
      const close = src.indexOf('`', i + 1);
      end = close === -1 ? n : close + 1;
    } else if (syntax.rustRaw && (ch === 'r' || ch === 'b') && !WORD_CHAR.test(src[i - 1] ?? ' ')) {
      RUST_RAW_STRING.lastIndex = i;
      const raw = RUST_RAW_STRING.exec(src);
      if (raw) {
        const close = src.indexOf(`"${raw[1]}`, RUST_RAW_STRING.lastIndex);
        end = close === -1 ? n : close + 1 + raw[1].length;
      }
    } else if (syntax.heredoc && ch === '<' && src.startsWith('<<<', i)) {
      PHP_HEREDOC.lastIndex = i;
      const heredoc = PHP_HEREDOC.exec(src);
      if (heredoc) {
        const closing = new RegExp(`^[ \\t]*${heredoc[2]}\\b`, 'm');
        const rest = src.slice(PHP_HEREDOC.lastIndex);
        const found = closing.exec(rest);
        end = found ? PHP_HEREDOC.lastIndex + found.index + found[0].length : n;
      }
    } else if (syntax.template && ch === '`') {
      mark(i, i + 1, STRING);
      i = continueTemplate(i + 1);
      continue;
    } else if (syntax.regex && ch === '/' && regexAllowed()) {
      end = regexEnd(i);
    }
    if (end > i) {
      mark(i, end, STRING);
      prev = end - 1;
      i = end;
      continue;
    }

    // Code
    if (ch in OPENERS) {
      openBracket(i);
      if (ch === '{' && templateDepths.length) templateDepths[templateDepths.length - 1]++;
    } else if (CLOSERS.has(ch)) {
      if (ch === '}' && templateDepths.length && templateDepths[templateDepths.length - 1] === 0) {
        // End of a `${ ... }` expression: back into the template text
        templateDepths.pop();
        closeBracket(i);
        i = continueTemplate(i + 1);
        continue;
      }
      if (ch === '}' && templateDepths.length) templateDepths[templateDepths.length - 1]--;
      closeBracket(i);
    }
    if (ch !== ' ' && ch !== '\t' && ch !== '\n' && ch !== '\r') prev = i;
    i++;
  }

  if (stack.length || templateDepths.length) balanced = false;
  return { kinds, match, balanced, lineStarts: lineStartsOf(src) };
}

export default { lexCode, familyOf, lineStartsOf, lineAt, CODE, COMMENT, STRING };

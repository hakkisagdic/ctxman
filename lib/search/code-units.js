/**
 * Code units of a source file: methods/functions (from the existing method analyzers) and
 * class-like declarations, each with the line range of its source.
 *
 * Shared by the ranked search (lib/search/bm25.js) and symbol lookup (lib/search/symbols.js).
 */

import path from 'path';
import MethodAnalyzer from '../analyzers/method-analyzer.js';

/** Extensions the method analyzers understand; other files have no code units */
export const CODE_EXTENSIONS = new Set([
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.rs',
  '.go',
  '.java',
  '.cs',
  '.py',
  '.php',
  '.rb',
  '.kt',
  '.kts',
  '.swift',
  '.c',
  '.cpp',
  '.cc',
  '.h',
  '.hpp',
  '.scala',
]);

const MAX_AVERAGE_LINE_LENGTH = 250;

// Modifiers that may precede a class-like keyword in the brace languages
const MODIFIERS =
  '(?:(?:export|default|declare|public|private|protected|internal|static|abstract|final|sealed|' +
  'partial|open|data|inner|value|annotation|readonly|override|case|implicit|lazy|unsafe|' +
  'pub(?:\\([^)]*\\))?|fileprivate)\\s+)*';

const CLASS_PATTERNS = {
  brace: new RegExp(
    `^[ \\t]*${MODIFIERS}(class|interface|enum(?:\\s+(?:class|struct))?|struct|record|trait|object|protocol|extension|union)\\s+([A-Za-z_$][\\w$]*)`,
    'gm'
  ),
  rustImpl:
    /^[ \t]*(?:unsafe\s+)?impl(?:\s*<[^>]*>)?\s+(?:[\w:]+(?:<[^>]*>)?\s+for\s+)?([A-Za-z_]\w*)/gm,
  goType: /^type\s+([A-Za-z_]\w*)\s+(struct|interface)\b/gm,
  python: /^[ \t]*class\s+([A-Za-z_]\w*)/gm,
  ruby: /^[ \t]*(class|module)\s+([A-Z]\w*(?:::\w+)*)/gm,
};

const analyzer = new MethodAnalyzer();

/**
 * Function mapping a string index to its 1-based line number
 * @param {string} content
 * @returns {(index: number) => number}
 */
function lineLocator(content) {
  const breaks = [];
  for (let i = content.indexOf('\n'); i !== -1; i = content.indexOf('\n', i + 1)) breaks.push(i);
  return (index) => {
    // Number of line breaks before `index`
    let low = 0;
    let high = breaks.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (breaks[mid] < index) low = mid + 1;
      else high = mid;
    }
    return low + 1;
  };
}

/**
 * Class-like declarations (classes, interfaces, structs, enums, traits, modules, impl blocks)
 * @param {string} content
 * @param {string} ext - Lower-case file extension
 * @returns {Array<{name: string, kind: string, line: number}>}
 */
function findClassDeclarations(content, ext) {
  const found = [];
  const lineAt = lineLocator(content);
  const collect = (regex, pick) => {
    for (const match of content.matchAll(regex)) {
      const { name, kind } = pick(match);
      found.push({ name, kind, line: lineAt(match.index + match[0].lastIndexOf(name)) });
    }
  };

  if (ext === '.py') {
    collect(CLASS_PATTERNS.python, (m) => ({ name: m[1], kind: 'class' }));
  } else if (ext === '.rb') {
    collect(CLASS_PATTERNS.ruby, (m) => ({ name: m[2], kind: m[1] }));
  } else if (ext === '.go') {
    collect(CLASS_PATTERNS.goType, (m) => ({ name: m[1], kind: m[2] }));
  } else {
    collect(CLASS_PATTERNS.brace, (m) => ({ name: m[2], kind: m[1].replace(/\s+/g, ' ') }));
    if (ext === '.rs') {
      collect(CLASS_PATTERNS.rustImpl, (m) => ({ name: m[1], kind: 'impl' }));
    }
  }
  return found;
}

/**
 * Methods, functions and class-like declarations of a file with their line ranges.
 *
 * Method ranges come from MethodAnalyzer.extractMethodSources(); class ranges use the same
 * block rules (braces, Python indentation, Ruby `end`). Units are sorted by start line.
 *
 * @param {string} content - File content
 * @param {string} filePath - Used for the language (extension)
 * @returns {Array<{name: string, kind: string, startLine: number, endLine: number,
 *   container?: boolean, parent?: string}>} `container` marks class-like declarations;
 *   `parent` names the class-like declaration a method lies in
 */
export function extractCodeUnits(content, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (!CODE_EXTENSIONS.has(ext)) return [];

  const lines = content.split('\n');
  // Minified or generated code: the regex analyzers crawl over very long lines and find
  // nothing useful, so such files are searched by line windows only
  if (content.length / lines.length > MAX_AVERAGE_LINE_LENGTH) return [];
  let methods = [];
  try {
    methods = analyzer.extractMethods(content, filePath);
  } catch (_error) {
    // A regex analyzer failing on odd input leaves the file to the line windows
  }
  const methodSources = analyzer.extractMethodSources(content, methods, filePath);
  const units = methods.map((method, i) => ({
    name: method.name,
    kind: method.type || 'function',
    startLine: method.line,
    endLine: method.line + methodSources[i].split('\n').length - 1,
  }));

  const classes = findClassDeclarations(content, ext);
  const starts = [...new Set([...units, ...classes].map((u) => u.startLine ?? u.line))].sort(
    (a, b) => a - b
  );
  for (const decl of classes) {
    const start = decl.line - 1;
    let end;
    if (ext === '.py') {
      end = analyzer.findIndentedBlockEnd(lines, start);
    } else if (ext === '.rb') {
      end = analyzer.findRubyBlockEnd(lines, start);
    } else if (ext === '.go') {
      end = analyzer.findBraceBlockEnd(lines, start, lines.length);
    } else {
      // A declaration without a body (`class Foo;`, `case class Foo(x: Int)`) must not run
      // into the body of the next unit
      const next = starts.find((line) => line > decl.line);
      end = analyzer.findBraceBlockEnd(lines, start, next ? next - 1 : lines.length);
    }
    units.push({
      name: decl.name,
      kind: decl.kind,
      startLine: decl.line,
      endLine: end + 1,
      container: true,
    });
  }

  units.sort((a, b) => a.startLine - b.startLine || b.endLine - a.endLine);

  // Go methods belong to their receiver type: `func (s *Server) Start()`
  if (ext === '.go') {
    for (const unit of units) {
      const receiver = /^\s*func\s*\(\s*(?:\w+\s+)?\*?\s*([A-Za-z_]\w*)/.exec(
        lines[unit.startLine - 1] ?? ''
      );
      if (receiver && !unit.container) unit.parent = receiver[1];
    }
  }

  // Functions inside a class-like block are its methods
  const containers = units.filter((unit) => unit.container);
  for (const unit of units) {
    if (unit.container) continue;
    const parent = containers
      .filter((c) => c.startLine < unit.startLine && c.endLine >= unit.endLine)
      .at(-1);
    if (parent) {
      unit.parent = parent.name;
      if (unit.kind === 'function') unit.kind = 'method';
    }
  }

  return units;
}

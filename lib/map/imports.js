/**
 * Import extraction for the repository map
 *
 * Regex based, one pass per file: the module references a source file makes (imports,
 * requires, includes, `mod` declarations) and the package or namespace it declares.
 * Resolving the references to files of the repository is the job of resolver.js.
 */

import path from 'path';
import { ImportTracker } from '../analyzers/import-tracker.js';

/** Language of each source extension the map covers */
export const LANGUAGE_BY_EXTENSION = {
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.mts': 'typescript',
  '.cts': 'typescript',
  '.py': 'python',
  '.go': 'go',
  '.java': 'java',
  '.kt': 'kotlin',
  '.kts': 'kotlin',
  '.scala': 'scala',
  '.rb': 'ruby',
  '.php': 'php',
  '.c': 'c',
  '.h': 'c',
  '.cc': 'cpp',
  '.cpp': 'cpp',
  '.hpp': 'cpp',
  '.rs': 'rust',
  '.cs': 'csharp',
  '.swift': 'swift',
};

/**
 * Language of a file, or null when the map does not cover it
 * @param {string} filePath
 * @returns {string|null}
 */
export function languageOf(filePath) {
  return LANGUAGE_BY_EXTENSION[path.extname(filePath).toLowerCase()] || null;
}

// Specifier parsing for JavaScript/TypeScript lives in the import tracker
const jsTracker = new ImportTracker('.');

/** @param {RegExp} pattern @param {string} content @returns {RegExpExecArray[]} */
function allMatches(pattern, content) {
  const matches = [];
  pattern.lastIndex = 0;
  let match;
  while ((match = pattern.exec(content)) !== null) {
    matches.push(match);
    if (match[0] === '') pattern.lastIndex++;
  }
  return matches;
}

/** Split `a, b as c, d` (or `(a, b)`) into names, dropping aliases */
function splitNames(list) {
  return list
    .replace(/[()\\]/g, ' ')
    .replace(/#.*$/gm, '')
    .split(',')
    .map((name) => name.trim().split(/\s+/)[0])
    .filter((name) => /^[\w.*]+$/.test(name));
}

const PY_IMPORT =
  /^[ \t]*import[ \t]+([\w.]+(?:[ \t]+as[ \t]+\w+)?(?:[ \t]*,[ \t]*[\w.]+(?:[ \t]+as[ \t]+\w+)?)*)/gm;
const PY_FROM = /^[ \t]*from[ \t]+(\.+[\w.]*|[\w.]+)[ \t]+import[ \t]+(\([^)]*\)|[^\n#;]+)/gm;
const GO_IMPORT_LINE = /^[ \t]*import[ \t]+(?:[\w.]+[ \t]+)?"([^"\n]+)"/gm;
const GO_IMPORT_BLOCK = /^[ \t]*import[ \t]*\(([\s\S]*?)\)/gm;
const GO_BLOCK_ENTRY = /"([^"\n]+)"/g;
const JVM_PACKAGE = /^[ \t]*package[ \t]+([\w.]+)/m;
const JVM_IMPORT =
  /^[ \t]*import[ \t]+(?:static[ \t]+)?([\w.]+?)(?:\.(\*|_|\{[^}\n]*\}))?(?=[ \t]*(?:;|\/[/*]|as\b|$))/gm;
const RUBY_REQUIRE = /^[ \t]*(require_relative|require)[ \t(]+['"]([^'"\n]+)['"]/gm;
const PHP_NAMESPACE = /^[ \t]*namespace[ \t]+([\w\\]+)[ \t]*[;{]/m;
const PHP_USE = /^[ \t]*use[ \t]+(?!\()([^;{]+(?:\{[^}]*\})?)[ \t]*;/gm;
const PHP_INCLUDE =
  /\b(?:require|include)(?:_once)?[ \t]*\(?[ \t]*((?:__DIR__|dirname[ \t]*\([ \t]*__FILE__[ \t]*\))[ \t]*\.[ \t]*)?['"]([^'"\n]+)['"]/g;
const C_INCLUDE = /^[ \t]*#[ \t]*include[ \t]*"([^"\n]+)"/gm;
const RUST_MOD = /^[ \t]*(?:pub(?:\([^)\n]*\))?[ \t]+)?mod[ \t]+(\w+)[ \t]*;/gm;
const RUST_PATH = /\b(crate|super|self)((?:::\w+)*)(?:::\{([^{}]*)\})?/g;
const RUST_USE_EXTERNAL = /^[ \t]*(?:pub(?:\([^)\n]*\))?[ \t]+)?use[ \t]+(\w+)((?:::\w+)*)/gm;
const CS_NAMESPACE = /^[ \t]*namespace[ \t]+([\w.]+)/gm;
const CS_USING =
  /^[ \t]*(?:global[ \t]+)?using[ \t]+(static[ \t]+)?(?:\w+[ \t]*=[ \t]*)?([\w.]+)[ \t]*;/gm;

/**
 * Module references of one file
 * @param {string} language - From languageOf()
 * @param {string} content - Source text
 * @returns {Array<Object>} Raw references; their shape depends on the language
 */
export function extractImports(language, content) {
  switch (language) {
    case 'javascript':
    case 'typescript':
      return jsTracker.parseModuleSpecifiers(content).map((spec) => ({ spec }));
    case 'python': {
      const refs = [];
      for (const match of allMatches(PY_IMPORT, content)) {
        for (const name of splitNames(match[1])) refs.push({ module: name, names: [] });
      }
      for (const match of allMatches(PY_FROM, content)) {
        refs.push({ module: match[1], names: splitNames(match[2]) });
      }
      return refs;
    }
    case 'go': {
      const specs = allMatches(GO_IMPORT_LINE, content).map((match) => match[1]);
      for (const block of allMatches(GO_IMPORT_BLOCK, content)) {
        specs.push(...allMatches(GO_BLOCK_ENTRY, block[1]).map((match) => match[1]));
      }
      return [...new Set(specs)].map((spec) => ({ spec }));
    }
    case 'java':
    case 'kotlin':
    case 'scala':
      return allMatches(JVM_IMPORT, content).map((match) => ({
        name: match[1],
        wildcard: match[2] === '*' || match[2] === '_',
        members: match[2]?.startsWith('{')
          ? match[2]
              .slice(1, -1)
              .split(',')
              .map((member) => member.split(/=>|\bas\b/)[0].trim())
              .filter((member) => /^\w+$/.test(member))
          : [],
      }));
    case 'ruby':
      return allMatches(RUBY_REQUIRE, content).map((match) => ({
        spec: match[2],
        relative: match[1] === 'require_relative',
      }));
    case 'php': {
      const refs = [];
      for (const match of allMatches(PHP_USE, content)) {
        for (const name of expandPhpUse(match[1])) refs.push({ name });
      }
      for (const match of allMatches(PHP_INCLUDE, content)) {
        refs.push({ include: match[2], fromDir: Boolean(match[1]) });
      }
      return refs;
    }
    case 'c':
    case 'cpp':
      return allMatches(C_INCLUDE, content).map((match) => ({ include: match[1] }));
    case 'rust': {
      const refs = allMatches(RUST_MOD, content).map((match) => ({ mod: match[1] }));
      for (const match of allMatches(RUST_PATH, content)) {
        const segments = match[2].split('::').filter(Boolean);
        if (match[3] === undefined) {
          if (segments.length === 0) continue;
          refs.push({ anchor: match[1], segments });
          continue;
        }
        for (const member of match[3].split(',')) {
          const tail = member.trim().split(/\s+as\s+/)[0];
          const extra = /^\w+(?:::\w+)*$/.test(tail) && tail !== 'self' ? tail.split('::') : [];
          refs.push({ anchor: match[1], segments: [...segments, ...extra] });
        }
      }
      for (const match of allMatches(RUST_USE_EXTERNAL, content)) {
        if (['crate', 'super', 'self', 'std', 'core', 'alloc'].includes(match[1])) continue;
        refs.push({ crate: match[1], segments: match[2].split('::').filter(Boolean) });
      }
      return refs;
    }
    case 'csharp':
      return allMatches(CS_USING, content).map((match) => ({
        name: match[2],
        isStatic: Boolean(match[1]),
      }));
    default:
      return [];
  }
}

/** `A\B\{C, D as E}` → ['A\B\C', 'A\B\D']; `function A\f` → ['A\f'] */
function expandPhpUse(clause) {
  const names = [];
  const body = clause.replace(/^\s*(?:function|const)\s+/, '');
  const group = body.match(/^\s*\\?([\w\\]*?)\\?\s*\{([^}]*)\}/);
  if (group) {
    for (const member of group[2].split(',')) {
      const name = member.trim().split(/\s+as\s+/)[0];
      if (/^[\w\\]+$/.test(name)) names.push(`${group[1]}\\${name}`);
    }
    return names;
  }
  for (const part of body.split(',')) {
    const name = part
      .trim()
      .split(/\s+as\s+/)[0]
      .replace(/^\\/, '');
    if (/^[\w\\]+$/.test(name)) names.push(name);
  }
  return names;
}

/**
 * Packages or namespaces a file declares (Java/Kotlin/Scala `package`, PHP and C#
 * `namespace`), used to resolve imports by fully qualified name
 * @param {string} language
 * @param {string} content
 * @returns {string[]}
 */
export function extractDeclarations(language, content) {
  switch (language) {
    case 'java':
    case 'kotlin':
    case 'scala': {
      const match = content.match(JVM_PACKAGE);
      return match ? [match[1]] : [];
    }
    case 'php': {
      const match = content.match(PHP_NAMESPACE);
      return match ? [match[1].replace(/^\\/, '')] : [];
    }
    case 'csharp':
      return [...new Set(allMatches(CS_NAMESPACE, content).map((match) => match[1]))];
    default:
      return [];
  }
}

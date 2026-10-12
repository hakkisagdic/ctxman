/**
 * AI-tool ignore files
 *
 * Other coding assistants keep their own ignore file next to .gitignore. A team that already
 * lists its sensitive paths there can have ctxman honour the same lists instead of copying
 * them into .contextignore. All of them use .gitignore syntax, so the existing parser reads
 * them; only the files in the project root are read.
 */

import fs from 'fs';
import path from 'path';
import GitIgnoreParser from '../parsers/gitignore-parser.js';

/**
 * Known ignore files, with the tool that reads each one
 * @type {ReadonlyArray<{file: string, tool: string, emptyMeansAll?: boolean}>}
 */
export const KNOWN_IGNORE_FILES = Object.freeze([
  { file: '.cursorignore', tool: 'Cursor' },
  { file: '.cursorindexingignore', tool: 'Cursor (indexing only)' },
  // Gemini Code Assist / Android Studio: an empty .aiexclude blocks its whole directory
  { file: '.aiexclude', tool: 'Gemini Code Assist', emptyMeansAll: true },
  { file: '.geminiignore', tool: 'Gemini CLI' },
  { file: '.augmentignore', tool: 'Augment Code' },
  { file: '.tabnineignore', tool: 'Tabnine' },
  { file: '.devinignore', tool: 'Devin' },
  { file: '.codeiumignore', tool: 'Windsurf (Codeium)' },
  { file: '.aiderignore', tool: 'Aider' },
  { file: '.clineignore', tool: 'Cline' },
  { file: '.rooignore', tool: 'Roo Code' },
  { file: '.continueignore', tool: 'Continue' },
  { file: '.repomixignore', tool: 'Repomix' },
  { file: '.gitingestignore', tool: 'Gitingest' },
]);

const KNOWN_BY_NAME = new Map(KNOWN_IGNORE_FILES.map((entry) => [entry.file, entry]));

/**
 * Whether a name can be used as an ignore file: a bare file name in the project root
 * @param {string} name
 * @returns {boolean}
 */
export function isValidIgnoreFileName(name) {
  return (
    typeof name === 'string' &&
    name.length > 0 &&
    name !== '.' &&
    name !== '..' &&
    !/[/\\\0]/.test(name)
  );
}

/**
 * Turn a --respect-ignore-files value or a policy `ignoreFiles` list into file names.
 * "all" stands for every known file; names are deduplicated and keep their order.
 * @param {string|string[]|null|undefined} spec - "all", "a,b" or ["a", "b"]
 * @returns {string[]}
 * @throws {Error} For a name with a path separator or `..`
 */
export function resolveIgnoreFileNames(spec) {
  if (spec === null || spec === undefined || spec === false) return [];

  const items = (Array.isArray(spec) ? spec : String(spec).split(','))
    .map((item) => String(item).trim())
    .filter(Boolean);

  const names = [];
  for (const item of items) {
    const expanded = item === 'all' ? KNOWN_IGNORE_FILES.map((entry) => entry.file) : [item];
    for (const name of expanded) {
      if (!isValidIgnoreFileName(name)) {
        throw new Error(
          `Invalid ignore file name ${JSON.stringify(name)}: expected a file name in the project root, such as .cursorignore, or "all"`
        );
      }
      if (!names.includes(name)) names.push(name);
    }
  }
  return names;
}

/**
 * Patterns of the given ignore files in `root`. Each file is applied on its own: a path is
 * ignored when any of the files ignores it, and a `!` line only re-includes paths matched
 * earlier in the same file.
 * @param {string} root - Project root
 * @param {string[]} names - File names from resolveIgnoreFileNames()
 * @returns {IgnoreFileRules}
 */
export function loadIgnoreFileRules(root, names) {
  const parser = new GitIgnoreParser(null, null, null);
  const files = names.map((name) => {
    const filePath = path.join(root, name);
    const known = KNOWN_BY_NAME.get(name);
    const exists = isFile(filePath);
    let patterns = exists ? parser.parsePatternFile(filePath) : [];
    if (exists && patterns.length === 0 && known?.emptyMeansAll) {
      patterns = [parser.convertToRegex('**')];
    }
    return { name, path: filePath, tool: known?.tool ?? null, exists, patterns };
  });

  return new IgnoreFileRules(parser, files);
}

function isFile(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch (_error) {
    return false;
  }
}

/**
 * Loaded ignore files and the matcher over them
 */
export class IgnoreFileRules {
  /**
   * @param {GitIgnoreParser} parser - Supplies the pattern matching
   * @param {Array<{name: string, path: string, tool: string|null, exists: boolean, patterns: object[]}>} files
   */
  constructor(parser, files) {
    this.parser = parser;
    this.files = files;
  }

  /** @returns {boolean} True when at least one of the files exists */
  get active() {
    return this.files.some((file) => file.exists);
  }

  /**
   * @param {string} relativePath - Path relative to the project root (file or directory)
   * @returns {string|null} Name of the first ignore file that ignores the path, or null
   */
  match(relativePath) {
    const rel = relativePath.split(path.sep).join('/');
    for (const file of this.files) {
      if (file.patterns.length > 0 && this.parser.testPatterns(file.patterns, rel, file.name)) {
        return file.name;
      }
    }
    return null;
  }

  /**
   * @param {string} relativePath
   * @returns {boolean}
   */
  isIgnored(relativePath) {
    return this.match(relativePath) !== null;
  }

  /**
   * One line per file for console output, e.g. ".cursorignore (3 patterns)"
   * @returns {string}
   */
  describe() {
    return this.files
      .map((file) =>
        file.exists
          ? `${file.name} (${file.patterns.length} pattern${file.patterns.length === 1 ? '' : 's'})`
          : `${file.name} (not found)`
      )
      .join(', ');
  }
}

export default { KNOWN_IGNORE_FILES, resolveIgnoreFileNames, loadIgnoreFileRules };

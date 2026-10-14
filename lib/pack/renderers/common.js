/**
 * Helpers shared by the pack renderers
 *
 * A renderer turns a document model into text:
 *   header        text for the top, or null
 *   partLabel     "Part 2 of 3" when the output is split, or null
 *   part          {index, count} when the output is split, or null
 *   tree          directory tree text, or null
 *   files         [{path, content, tokens, lines?: [first, last], totalLines?}]
 *   firstIndex    index of the first file (documents are numbered across parts)
 *   omitted       {files: [{path, tokens}], count, tokens, more, moreTokens}, or null
 *   instructions  text for the end, or null
 */

/** @param {number} value */
export const formatNumber = (value) => value.toLocaleString('en-US');

/**
 * Display name of a packed file; a piece of a file split by lines says which lines
 * @param {{path: string, lines?: number[], totalLines?: number}} file
 * @returns {string}
 */
export function sourceLabel(file) {
  if (!file.lines) return file.path;
  return `${file.path} (lines ${file.lines[0]}-${file.lines[1]} of ${file.totalLines})`;
}

/**
 * Content without its final line break (the wrapper adds one)
 * @param {string} content
 * @returns {string}
 */
export function withoutFinalNewline(content) {
  return content.endsWith('\n') ? content.slice(0, -1) : content;
}

/**
 * Lines of the omitted-files section: the listed files, then a count of the rest
 * @param {object} omitted - Document model `omitted`
 * @param {string} bullet - Prefix of each line
 * @returns {string[]}
 */
export function omittedLines(omitted, bullet = '') {
  const lines = omitted.files.map(
    (file) => `${bullet}${file.path} (${formatNumber(file.tokens)} tokens)`
  );
  if (omitted.more > 0) {
    lines.push(
      `${bullet}… and ${formatNumber(omitted.more)} more files (${formatNumber(omitted.moreTokens)} tokens)`
    );
  }
  return lines;
}

/**
 * One-line description of the omitted files
 * @param {object} omitted - Document model `omitted`
 * @returns {string}
 */
export function omittedSummary(omitted) {
  const files = omitted.count === 1 ? '1 file' : `${formatNumber(omitted.count)} files`;
  return `${files} (${formatNumber(omitted.tokens)} tokens) did not fit in the token budget`;
}

/**
 * Join the non-empty sections of a document with blank lines
 * @param {Array<string|null|false>} sections
 * @returns {string}
 */
export function joinSections(sections) {
  return `${sections.filter((section) => section).join('\n\n')}\n`;
}

// Fenced-code language per extension (Markdown style)
const LANGUAGES = {
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'jsx',
  ts: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  tsx: 'tsx',
  py: 'python',
  rb: 'ruby',
  go: 'go',
  rs: 'rust',
  java: 'java',
  kt: 'kotlin',
  kts: 'kotlin',
  swift: 'swift',
  cs: 'csharp',
  c: 'c',
  h: 'c',
  cc: 'cpp',
  cpp: 'cpp',
  cxx: 'cpp',
  hpp: 'cpp',
  scala: 'scala',
  php: 'php',
  json: 'json',
  md: 'markdown',
  yml: 'yaml',
  yaml: 'yaml',
  html: 'html',
  vue: 'vue',
  css: 'css',
  scss: 'scss',
  sass: 'sass',
  less: 'less',
  xml: 'xml',
  svg: 'xml',
  sh: 'bash',
  bash: 'bash',
  zsh: 'zsh',
  sql: 'sql',
  toml: 'toml',
  ini: 'ini',
  conf: 'ini',
  txt: 'text',
};

/**
 * Fenced-code language of a file, from its extension ('' when unknown)
 * @param {string} filePath
 * @returns {string}
 */
export function languageOf(filePath) {
  const name = filePath.split('/').pop().toLowerCase();
  if (name === 'dockerfile') return 'dockerfile';
  if (name === 'makefile') return 'makefile';
  const dot = name.lastIndexOf('.');
  return dot > 0 ? (LANGUAGES[name.slice(dot + 1)] ?? '') : '';
}

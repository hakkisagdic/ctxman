/**
 * Markdown style: a heading per file and a fenced code block whose fence is longer than any
 * backtick run in the file, so the content cannot close it
 */

import {
  joinSections,
  languageOf,
  omittedLines,
  omittedSummary,
  sourceLabel,
  withoutFinalNewline,
} from './common.js';

/**
 * Backtick fence for a block of text: at least three, one more than its longest run
 * @param {string} text
 * @returns {string}
 */
export function fenceFor(text) {
  let longest = 0;
  for (const run of text.match(/`+/g) || []) longest = Math.max(longest, run.length);
  return '`'.repeat(Math.max(3, longest + 1));
}

/**
 * One file: heading and fenced content
 * @param {object} file - Document model file
 * @returns {string}
 */
export function renderFile(file) {
  const content = withoutFinalNewline(file.content);
  const fence = fenceFor(content);
  return `### ${sourceLabel(file)}\n\n${fence}${languageOf(file.path)}\n${content}\n${fence}`;
}

/**
 * @param {object} doc - Document model (see renderers/common.js)
 * @returns {string}
 */
export function render(doc) {
  const treeFence = doc.tree !== null && fenceFor(doc.tree);
  return joinSections([
    doc.header,
    doc.partLabel,
    doc.tree !== null && `## Directory structure\n\n${treeFence}\n${doc.tree}\n${treeFence}`,
    doc.files.length > 0 && `## Files\n\n${doc.files.map((file) => renderFile(file)).join('\n\n')}`,
    doc.omitted &&
      `## Omitted files\n\n${omittedSummary(doc.omitted)}:\n\n${omittedLines(doc.omitted, '- ').join('\n')}`,
    doc.instructions && `## Instructions\n\n${doc.instructions}`,
  ]);
}

export default { name: 'markdown', extension: '.md', render, renderFile };

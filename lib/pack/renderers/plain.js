/**
 * Plain style: `=== path ===` separators and raw content
 */

import {
  joinSections,
  omittedLines,
  omittedSummary,
  sourceLabel,
  withoutFinalNewline,
} from './common.js';

/**
 * One file: separator line and content
 * @param {object} file - Document model file
 * @returns {string}
 */
export function renderFile(file) {
  return `=== ${sourceLabel(file)} ===\n${withoutFinalNewline(file.content)}`;
}

/**
 * @param {object} doc - Document model (see renderers/common.js)
 * @returns {string}
 */
export function render(doc) {
  return joinSections([
    doc.header,
    doc.partLabel,
    doc.tree !== null && `Directory structure:\n${doc.tree}`,
    doc.files.length > 0 && doc.files.map((file) => renderFile(file)).join('\n\n'),
    doc.omitted &&
      `Omitted files: ${omittedSummary(doc.omitted)}.\n${omittedLines(doc.omitted, '  ').join('\n')}`,
    doc.instructions && `Instructions:\n${doc.instructions}`,
  ]);
}

export default { name: 'plain', extension: '.txt', render, renderFile };

/**
 * XML style: Anthropic's long-context document format
 *
 *   <documents>
 *   <document index="1">
 *   <source>path</source>
 *   <document_content>
 *   ...raw file content...
 *   </document_content>
 *   </document>
 *   </documents>
 *
 * File content is not XML-escaped (Claude reads raw code, and escaping every `<` and `&`
 * costs tokens). Only a closing tag of the wrapper itself (`</document_content>`,
 * `</document>`, `</documents>`) inside a file is neutralised by writing its `<` as `&lt;`,
 * so a file cannot end its own document early. Paths and the tree are escaped.
 */

import {
  joinSections,
  omittedLines,
  omittedSummary,
  sourceLabel,
  withoutFinalNewline,
} from './common.js';

const escapeXml = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// `</document_content>`, `</document>` and `</documents>`, in any case, spaces before `>`
const WRAPPER_CLOSING_TAG = /<(?=\/(?:document_content|documents?)\s*>)/gi;

/**
 * Neutralise wrapper closing tags inside file content
 * @param {string} content
 * @returns {string}
 */
export function protectContent(content) {
  return content.replace(WRAPPER_CLOSING_TAG, '&lt;');
}

/**
 * One `<document>` element
 * @param {object} file - Document model file
 * @param {number} index - Document number
 * @returns {string}
 */
export function renderFile(file, index) {
  return [
    `<document index="${index}">`,
    `<source>${escapeXml(sourceLabel(file))}</source>`,
    '<document_content>',
    protectContent(withoutFinalNewline(file.content)),
    '</document_content>',
    '</document>',
  ].join('\n');
}

/**
 * @param {object} doc - Document model (see common.js)
 * @returns {string}
 */
export function render(doc) {
  const documents = [
    '<documents>',
    ...doc.files.map((file, i) => renderFile(file, doc.firstIndex + i)),
    '</documents>',
  ].join('\n');

  return joinSections([
    doc.header,
    doc.partLabel,
    doc.tree !== null && `<directory_structure>\n${escapeXml(doc.tree)}\n</directory_structure>`,
    documents,
    doc.omitted &&
      [
        `<omitted_files count="${doc.omitted.count}" tokens="${doc.omitted.tokens}">`,
        `${omittedSummary(doc.omitted)}:`,
        ...omittedLines(doc.omitted).map(escapeXml),
        '</omitted_files>',
      ].join('\n'),
    doc.instructions && `<instructions>\n${doc.instructions}\n</instructions>`,
  ]);
}

export default { name: 'xml', extension: '.xml', render, renderFile };

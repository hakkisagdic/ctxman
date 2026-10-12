/**
 * JSON style: {header?, part?, parts?, tree?, files: [{path, tokens, content}], omitted?,
 * instructions?} with the instructions last
 */

const fileEntry = (file) => ({
  path: file.path,
  ...(file.lines && { lines: file.lines, totalLines: file.totalLines }),
  tokens: file.tokens,
  content: file.content,
});

/**
 * One file entry as it appears in the `files` array (for size estimates)
 * @param {object} file - Document model file
 * @returns {string}
 */
export function renderFile(file) {
  return JSON.stringify(fileEntry(file), null, 2).replace(/\n/g, '\n    ');
}

/**
 * @param {object} doc - Document model (see renderers/common.js)
 * @returns {string}
 */
export function render(doc) {
  const output = {};
  if (doc.header) output.header = doc.header;
  if (doc.part) {
    output.part = doc.part.index;
    output.parts = doc.part.count;
  }
  if (doc.tree !== null) output.tree = doc.tree;
  output.files = doc.files.map(fileEntry);
  if (doc.omitted) {
    output.omitted = {
      count: doc.omitted.count,
      tokens: doc.omitted.tokens,
      files: doc.omitted.files.map(({ path, tokens }) => ({ path, tokens })),
      ...(doc.omitted.more > 0 && { more: doc.omitted.more, moreTokens: doc.omitted.moreTokens }),
    };
  }
  if (doc.instructions) output.instructions = doc.instructions;
  return `${JSON.stringify(output, null, 2)}\n`;
}

export default { name: 'json', extension: '.json', render, renderFile };

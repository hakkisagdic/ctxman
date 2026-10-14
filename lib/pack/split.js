/**
 * `pack --split`: cut the packed files into numbered parts of at most `limit` tokens
 *
 * Every part is a complete document in the chosen style. Part 1 carries the header and the
 * directory tree, the last part the omitted-files list and the instructions, and document
 * numbers continue across parts. Files are never cut, except a file that does not fit in a
 * part on its own: it is split by lines into pieces labelled "(lines a-b of n)".
 */

import { PackError } from './select.js';

// Label of a middle part when estimating: as long as any real label can be
const PLACEHOLDER_PART = { index: 9999, count: 9999 };

/**
 * @param {Array} entries - Packed entries in output order
 * @param {number} limit - Token limit per part
 * @param {object} context
 * @param {object} context.renderer - Style renderer
 * @param {function(string): number} context.count - Token counter
 * @param {object} context.doc - Whole-document fields: header, tree, omitted, instructions
 * @returns {{parts: Array<{index: number, text: string, tokens: number, files: string[]}>,
 *   splitFiles: Array<{path: string, pieces: number}>}}
 */
export function splitIntoParts(entries, limit, { renderer, count, doc }) {
  const hasFirstExtras = Boolean(doc.header) || doc.tree !== null;
  const hasLastExtras = Boolean(doc.omitted) || Boolean(doc.instructions);

  const partDoc = (units, index, total, firstIndex) => ({
    header: index === 0 ? doc.header : null,
    partLabel: `Part ${index + 1} of ${total}`,
    part: { index: index + 1, count: total },
    tree: index === 0 ? doc.tree : null,
    files: units,
    firstIndex,
    omitted: index === total - 1 ? doc.omitted : null,
    instructions: index === total - 1 ? doc.instructions : null,
  });
  const middleDoc = (units) => ({
    ...partDoc(units, 1, 3, 99999),
    part: PLACEHOLDER_PART,
    partLabel: 'Part 9999 of 9999',
  });
  const middleBase = count(renderer.render(middleDoc([])));
  const unitCost = (unit) => count(renderer.renderFile(unit, 1)) + 1;

  // Files too large for a part of their own are cut into pieces by lines
  const units = [];
  const splitFiles = [];
  for (const entry of entries) {
    // Estimates near the limit are checked exactly
    const estimate = middleBase + unitCost(entry);
    if (estimate <= limit * 0.9 || count(renderer.render(middleDoc([entry]))) <= limit) {
      units.push(entry);
      continue;
    }
    const pieces = splitByLines(entry, limit, { renderer, count, middleDoc });
    splitFiles.push({ path: entry.path, pieces: pieces.length });
    units.push(...pieces);
  }

  // Fill parts greedily with the estimates
  let parts = [[]];
  let used = count(renderer.render({ ...middleDoc([]), header: doc.header, tree: doc.tree }));
  for (const unit of units) {
    const cost = unitCost(unit);
    if (parts[parts.length - 1].length && used + cost > limit) {
      parts.push([]);
      used = middleBase;
    }
    parts[parts.length - 1].push(unit);
    used += cost;
  }

  // Then count each part exactly and move files forward until every part fits. A move
  // changes two parts (all of them when the number of parts changes): the others are
  // counted once
  const counted = new Map();
  const countOnce = (text) => {
    if (!counted.has(text)) counted.set(text, count(text));
    return counted.get(text);
  };
  const maxIterations = (units.length + 5) * 4;
  for (let iteration = 0; ; iteration++) {
    if (iteration > maxIterations) {
      throw new PackError('SPLIT_TOO_SMALL', `Could not split into parts of ${limit} tokens`);
    }
    const rendered = renderParts(parts, partDoc, renderer, countOnce);
    const over = rendered.findIndex((part) => part.tokens > limit);
    if (over === -1) {
      return {
        parts: rendered.map((part, i) => ({ ...part, files: parts[i].map(labelOf) })),
        splitFiles,
      };
    }

    const isLast = over === parts.length - 1;
    if (isLast && hasLastExtras && parts[over].length) {
      parts.push([]); // the omitted list and instructions get a part of their own
    } else if (parts[over].length > 1 || (over === 0 && hasFirstExtras && parts[over].length)) {
      if (isLast) parts.push([]);
      parts[over + 1].unshift(parts[over].pop());
    } else {
      throw new PackError(
        'SPLIT_TOO_SMALL',
        `Part ${over + 1} needs ${rendered[over].tokens} tokens; raise --split` +
          (over === 0 && doc.tree !== null ? ' or use --no-tree' : '')
      );
    }
    parts = parts.filter(
      (units, i) =>
        units.length ||
        (i === 0 && hasFirstExtras) ||
        (i === parts.length - 1 && hasLastExtras && parts.length > 1)
    );
    if (!parts.length) parts = [[]];
  }
}

function renderParts(parts, partDoc, renderer, count) {
  let firstIndex = 1;
  return parts.map((units, i) => {
    const text = renderer.render(partDoc(units, i, parts.length, firstIndex));
    firstIndex += units.length;
    return { index: i + 1, text, tokens: count(text) };
  });
}

const labelOf = (unit) =>
  unit.lines ? `${unit.path} (lines ${unit.lines[0]}-${unit.lines[1]})` : unit.path;

/**
 * Cut one entry into pieces of whole lines, each fitting in a part on its own
 * @returns {Array} Entries with `lines: [first, last]` and `totalLines`
 */
function splitByLines(entry, limit, { renderer, count, middleDoc }) {
  const endsWithNewline = entry.content.endsWith('\n');
  const lines = (endsWithNewline ? entry.content.slice(0, -1) : entry.content).split('\n');
  const numberOf = (i) => (entry.lineNumbers ? entry.lineNumbers[i] : i + 1);
  const lineTokens = lines.map((line) => count(`${line}\n`));
  const fits = (piece) => count(renderer.render(middleDoc([piece]))) <= limit;

  const piece = (from, to) => {
    const content = lines.slice(from, to).join('\n') + (endsWithNewline ? '\n' : '');
    return {
      ...entry,
      content,
      tokens: count(content),
      lines: [numberOf(from), numberOf(to - 1)],
      totalLines: entry.totalLines,
    };
  };

  const empty = count(renderer.render(middleDoc([piece(0, 1)]))) - lineTokens[0];
  let margin = Math.max(16, Math.ceil(limit * 0.02));
  for (let attempt = 0; attempt < 6; attempt++, margin *= 2) {
    const room = limit - empty - margin;
    const pieces = [];
    let start = 0;
    let used = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lineTokens[i] > room) {
        throw new PackError(
          'SPLIT_TOO_SMALL',
          `${entry.path}: line ${numberOf(i)} alone has ${lineTokens[i]} tokens, more than ` +
            `a ${limit}-token part can hold`
        );
      }
      if (used + lineTokens[i] > room && i > start) {
        pieces.push(piece(start, i));
        start = i;
        used = 0;
      }
      used += lineTokens[i];
    }
    pieces.push(piece(start, lines.length));
    if (pieces.every(fits)) return pieces;
  }
  throw new PackError('SPLIT_TOO_SMALL', `Could not split ${entry.path} into ${limit}-token parts`);
}

export default { splitIntoParts };

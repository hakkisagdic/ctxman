/**
 * Token budget for `pack --budget`
 *
 * Files are ranked with the repository-map ranking of `ctxman map` (lib/map): PageRank over
 * the import graph blended with git change frequency and symbol references, so the files
 * the rest of the code depends on come first. Files the graph does not cover (documentation,
 * configuration, data, languages without import parsing, files the map skips as minified)
 * follow in path order. They are packed greedily: a file that does not fit is skipped and
 * smaller, lower-ranked files can still use the room. The per-file costs are estimates, so
 * the rendered document is then counted exactly and files are dropped (lowest rank first)
 * until it fits: the result never exceeds the budget.
 */

import { buildRepoGraph, rankFiles } from '../map/index.js';
import { PackError } from './select.js';

// Exact re-renders spent trying to use the room left after the estimate-based pass
const MAX_TOP_UP_ATTEMPTS = 8;

/**
 * Rank entries most important first
 * @param {string} root - Project root (the import graph and git history are read from it)
 * @param {Array<{path: string}>} entries - Project-relative paths with `/` separators
 * @param {object} [options]
 * @param {number} [options.history] - Commits of git history to mine (map default: 300)
 * @returns {{ranked: Array, scores: Map<string, number>}} The same entry objects, reordered,
 *   and the map score (0..1) of each ranked path
 */
export function rankEntries(root, entries, options = {}) {
  const graph = buildRepoGraph(root, { history: options.history, redact: false });
  const rows = rankFiles(graph);
  const position = new Map(rows.map((row, i) => [row.path, i]));
  const scores = new Map(rows.map((row) => [row.path, row.score]));

  const inGraph = entries.filter((entry) => position.has(entry.path));
  const rest = entries.filter((entry) => !position.has(entry.path));
  inGraph.sort((a, b) => position.get(a.path) - position.get(b.path));
  rest.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { ranked: [...inGraph, ...rest], scores };
}

/**
 * Choose the entries that fit in the budget
 * @param {Array} entries - Candidates in output order
 * @param {Array} ranked - The same entries, most important first
 * @param {number} budget - Token limit for the whole rendered document
 * @param {object} helpers
 * @param {function(Array, Array): {text: string, tokens: number}} helpers.measure - Render
 *   and count a document with these packed entries (output order) and omitted entries (rank
 *   order)
 * @param {function(object): number} helpers.cost - Estimated tokens an entry adds
 * @returns {{packed: Array, omitted: Array, text: string, tokens: number}}
 */
export function fitToBudget(entries, ranked, budget, { measure, cost }) {
  const selected = new Set();
  const evaluate = () =>
    measure(
      entries.filter((entry) => selected.has(entry)),
      ranked.filter((entry) => !selected.has(entry))
    );

  let current = evaluate();
  if (current.tokens > budget) {
    throw new PackError(
      'BUDGET_TOO_SMALL',
      `The document needs ${current.tokens} tokens without any file (header, tree, omitted ` +
        `list, instructions); the budget is ${budget}`
    );
  }

  let used = current.tokens;
  for (const entry of ranked) {
    const entryCost = cost(entry);
    if (used + entryCost <= budget) {
      selected.add(entry);
      used += entryCost;
    }
  }
  current = evaluate();

  // Estimates can be a little low: drop the lowest-ranked files until the exact count fits
  while (current.tokens > budget) {
    // Without files the document was measured to fit, so this cannot loop forever
    if (!selected.size) throw new PackError('BUDGET_TOO_SMALL', `Cannot fit in ${budget} tokens`);
    let excess = current.tokens - budget;
    for (let i = ranked.length - 1; i >= 0 && excess > 0; i--) {
      if (selected.delete(ranked[i])) excess -= cost(ranked[i]);
    }
    current = evaluate();
  }

  // ... or a little high: try the best-ranked files left out while there may be room
  let attempts = 0;
  for (const entry of ranked) {
    if (attempts >= MAX_TOP_UP_ATTEMPTS) break;
    if (selected.has(entry) || current.tokens + entry.tokens > budget) continue;
    attempts++;
    selected.add(entry);
    const next = evaluate();
    if (next.tokens <= budget) current = next;
    else selected.delete(entry);
  }

  return {
    packed: entries.filter((entry) => selected.has(entry)),
    omitted: ranked.filter((entry) => !selected.has(entry)),
    ...current,
  };
}

export default { rankEntries, fitToBudget };

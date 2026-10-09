/**
 * File ranking for `ctxman map`
 *
 *   score(f) = (wP·P(f) + wH·H(f) + wS·S(f)) / (wP + wH + wS)
 *
 *   P(f) = PR(f) / max PR      PageRank over the import graph (importer → imported,
 *                              damping 0.85), optionally personalised toward focus files
 *   H(f) = ln(1 + c(f)) / ln(1 + max c)
 *                              c = commits among the last N (merges excluded) touching f
 *   S(f) = ln(1 + s(f)) / ln(1 + max s)
 *                              s = mentions of f's function names in other files
 *
 * Default weights wP = 0.70, wH = 0.25, wS = 0.05. A component that is 0 for every file
 * (no git history, no symbol references) drops out of the sum and of the divisor, so the
 * others are renormalised. Equal scores are ordered by path.
 */

import path from 'path';

/** Default blend of the three components */
export const DEFAULT_WEIGHTS = Object.freeze({ pagerank: 0.7, history: 0.25, symbols: 0.05 });
export const DEFAULT_DAMPING = 0.85;
/** Share of the random jump that goes to focus files and their neighbours */
export const FOCUS_SHARE = 0.9;
/** Relative jump weight of a focus file and of a file one import away from one */
export const FOCUS_WEIGHT = 1;
export const NEIGHBOUR_WEIGHT = 0.5;

/**
 * Weighted PageRank by power iteration. The rank of nodes without outgoing edges
 * (dangling nodes) is spread like the random jump, so the scores always sum to 1.
 * @param {string[]} ids - Node ids; the order is the iteration order
 * @param {Array<{from: string, to: string, weight?: number}>} edges
 * @param {Object} [options]
 * @param {number} [options.damping=0.85]
 * @param {Map<string, number>|Object<string, number>} [options.personalization] - Random
 *   jump weights (normalised here); uniform when missing or all zero
 * @param {number} [options.maxIterations=200]
 * @param {number} [options.tolerance=1e-10] - Stop when the L1 change is below n × tolerance
 * @returns {{scores: Map<string, number>, iterations: number, converged: boolean}}
 */
export function pageRank(ids, edges, options = {}) {
  const damping = options.damping ?? DEFAULT_DAMPING;
  const maxIterations = options.maxIterations ?? 200;
  const tolerance = options.tolerance ?? 1e-10;
  if (!(damping >= 0 && damping < 1)) throw new Error('damping must be in [0, 1)');

  const n = ids.length;
  const scores = new Map();
  if (n === 0) return { scores, iterations: 0, converged: true };

  const index = new Map(ids.map((id, i) => [id, i]));
  const merged = new Map();
  for (const edge of edges) {
    const from = index.get(edge.from);
    const to = index.get(edge.to);
    const weight = edge.weight ?? 1;
    if (from === undefined || to === undefined || from === to || !(weight > 0)) continue;
    const key = from * n + to;
    merged.set(key, (merged.get(key) || 0) + weight);
  }
  const sources = new Int32Array(merged.size);
  const targets = new Int32Array(merged.size);
  const weights = new Float64Array(merged.size);
  const outWeight = new Float64Array(n);
  [...merged.keys()]
    .sort((a, b) => a - b)
    .forEach((key, i) => {
      sources[i] = Math.floor(key / n);
      targets[i] = key % n;
      weights[i] = merged.get(key);
      outWeight[sources[i]] += weights[i];
    });

  const jump = new Float64Array(n);
  const custom = options.personalization;
  let total = 0;
  if (custom) {
    const entries = custom instanceof Map ? custom : new Map(Object.entries(custom));
    for (const [id, weight] of entries) {
      const i = index.get(id);
      if (i !== undefined && weight > 0) {
        jump[i] += weight;
        total += weight;
      }
    }
  }
  if (total > 0) for (let i = 0; i < n; i++) jump[i] /= total;
  else jump.fill(1 / n);

  let rank = new Float64Array(n).fill(1 / n);
  let iterations = 0;
  let converged = false;
  while (iterations < maxIterations) {
    iterations++;
    const next = new Float64Array(n);
    let dangling = 0;
    for (let i = 0; i < n; i++) if (outWeight[i] === 0) dangling += rank[i];
    for (let e = 0; e < sources.length; e++) {
      next[targets[e]] += (damping * rank[sources[e]] * weights[e]) / outWeight[sources[e]];
    }
    const teleport = 1 - damping + damping * dangling;
    let change = 0;
    for (let i = 0; i < n; i++) {
      next[i] += teleport * jump[i];
      change += Math.abs(next[i] - rank[i]);
    }
    rank = next;
    if (change < n * tolerance) {
      converged = true;
      break;
    }
  }

  ids.forEach((id, i) => scores.set(id, rank[i]));
  return { scores, iterations, converged };
}

/**
 * Files of the graph matched by focus paths (a file, or a folder for every file in it)
 * @param {import('./graph.js').RepoGraph} graph
 * @param {string[]} focus - Absolute or project-relative paths
 * @returns {{files: string[], unmatched: string[]}}
 * @throws {Error} When a path lies outside the project
 */
export function resolveFocus(graph, focus = []) {
  const files = new Set();
  const unmatched = [];
  const nodePaths = graph.nodes.map((node) => node.path);
  for (const entry of focus) {
    const relative = toProjectPath(graph.root, entry);
    const matches = nodePaths.filter(
      (file) => relative === '' || file === relative || file.startsWith(`${relative}/`)
    );
    if (matches.length === 0) unmatched.push(entry);
    for (const file of matches) files.add(file);
  }
  return { files: [...files].sort(), unmatched };
}

/**
 * Project-relative form of a path (forward slashes); throws when it escapes the project
 * @param {string} root - Absolute project root
 * @param {string} entry
 * @returns {string}
 */
export function toProjectPath(root, entry) {
  if (typeof entry !== 'string' || entry.trim() === '') {
    throw new Error(`Invalid focus path: ${JSON.stringify(entry)}`);
  }
  const absolute = path.resolve(root, entry);
  const relative = path.relative(root, absolute);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Focus path is outside the project: ${entry}`);
  }
  return relative.split(path.sep).join('/');
}

/**
 * Rank the files of a graph, best first
 * @param {import('./graph.js').RepoGraph} graph
 * @param {Object} [options]
 * @param {string[]} [options.focus] - Files or folders to personalise PageRank toward
 * @param {{pagerank?: number, history?: number, symbols?: number}} [options.weights]
 * @param {number} [options.damping=0.85]
 * @returns {Array<{path: string, rank: number, score: number, pagerank: number,
 *   changes: number, symbolRefs: number, focus: boolean,
 *   components: {pagerank: number, history: number, symbols: number}}>}
 */
export function rankFiles(graph, options = {}) {
  const weights = { ...DEFAULT_WEIGHTS, ...options.weights };
  const ids = graph.nodes.map((node) => node.path);
  const focus = new Set(resolveFocus(graph, options.focus || []).files);

  let personalization = null;
  if (focus.size > 0) {
    const preference = new Map();
    for (const file of focus) preference.set(file, FOCUS_WEIGHT);
    for (const { from, to } of graph.edges) {
      for (const [a, b] of [
        [from, to],
        [to, from],
      ]) {
        if (focus.has(a) && !focus.has(b)) {
          preference.set(b, Math.max(preference.get(b) || 0, NEIGHBOUR_WEIGHT));
        }
      }
    }
    const preferenceTotal = [...preference.values()].reduce((sum, value) => sum + value, 0);
    personalization = new Map(
      ids.map((id) => [
        id,
        (1 - FOCUS_SHARE) / ids.length +
          (FOCUS_SHARE * (preference.get(id) || 0)) / preferenceTotal,
      ])
    );
  }

  const { scores } = pageRank(ids, graph.edges, {
    damping: options.damping ?? DEFAULT_DAMPING,
    personalization,
  });

  const history = graph.history?.available ? graph.history.counts : null;
  const maxRank = maxOf(scores.values());
  const maxChanges = history ? maxOf(ids.map((id) => history[id] || 0)) : 0;
  const maxSymbols = maxOf(graph.nodes.map((node) => node.symbolRefs || 0));
  // Components without any signal drop out instead of capping every score below 1
  const active = {
    pagerank: weights.pagerank,
    history: maxChanges > 0 ? weights.history : 0,
    symbols: maxSymbols > 0 ? weights.symbols : 0,
  };
  const totalWeight = active.pagerank + active.history + active.symbols;

  const rows = graph.nodes.map((node) => {
    const pagerank = scores.get(node.path);
    const changes = history ? history[node.path] || 0 : 0;
    const symbolRefs = node.symbolRefs || 0;
    const components = {
      pagerank: maxRank > 0 ? pagerank / maxRank : 0,
      history: maxChanges > 0 ? Math.log1p(changes) / Math.log1p(maxChanges) : 0,
      symbols: maxSymbols > 0 ? Math.log1p(symbolRefs) / Math.log1p(maxSymbols) : 0,
    };
    const weighted =
      active.pagerank * components.pagerank +
      active.history * components.history +
      active.symbols * components.symbols;
    return {
      path: node.path,
      rank: 0,
      score: totalWeight > 0 ? weighted / totalWeight : 0,
      pagerank,
      changes,
      symbolRefs,
      focus: focus.has(node.path),
      components,
    };
  });

  rows.sort((a, b) => b.score - a.score || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  rows.forEach((row, i) => {
    row.rank = i + 1;
  });
  return rows;
}

/** Largest value, 0 for none (no argument spreading, so any size works) */
function maxOf(values) {
  let max = 0;
  for (const value of values) if (value > max) max = value;
  return max;
}

/**
 * Repository map (`ctxman map`)
 *
 * A ranked overview of a codebase for an LLM, after Aider's repo map: a file dependency
 * graph built from imports and cross-file AST symbol call edges, PageRank over it blended
 * with git change frequency and symbol references, and the function signatures of the best
 * files trimmed to a token budget.
 *
 *   buildRepoGraph(root, opts)  scan + parse + resolve imports & call graph (+ git history)
 *   rankFiles(graph, opts)      scores, best first
 *   renderRepoMap(root, opts)   all of the above, rendered within the budget
 */

export { buildRepoGraph, mineHistory, signatureAt, DEFAULT_HISTORY } from './graph.js';
export {
  rankFiles,
  pageRank,
  resolveFocus,
  splitTargetSymbol,
  toProjectPath,
  DEFAULT_WEIGHTS,
  DEFAULT_DAMPING,
} from './rank.js';
export {
  renderRepoMap,
  renderGraph,
  renderBlock,
  normalizeMapOptions,
  DEFAULT_TOKENS,
  STYLES,
  ORDERS,
} from './render.js';
export { extractImports, languageOf, LANGUAGE_BY_EXTENSION } from './imports.js';
export { ImportResolver } from './resolver.js';
export {
  stripCommentsAndStrings,
  normalizeSymbolName,
  extractCallsFromSource,
  extractFileCallSites,
  buildCallGraph,
} from './call-graph.js';

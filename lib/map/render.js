/**
 * Rendering for `ctxman map`: the ranked files with their function signatures, trimmed
 * to a token budget, or the dependency graph itself
 */

import fs from 'fs';
import path from 'path';
import MethodAnalyzer from '../analyzers/method-analyzer.js';
import TokenUtils from '../utils/token-utils.js';
import { buildRepoGraph, DEFAULT_HISTORY } from './graph.js';
import { rankFiles, resolveFocus, DEFAULT_WEIGHTS, DEFAULT_DAMPING } from './rank.js';

export const DEFAULT_TOKENS = 2048;
export const STYLES = ['text', 'markdown', 'json', 'dot'];
export const ORDERS = ['rank', 'path'];
const MARKDOWN_TITLE = '# Repository map';
// No file block is smaller than this, so a smaller remainder ends the selection
const MIN_BLOCK_TOKENS = 4;
// Fewer than one token per this many characters never happens in practice: a block
// whose characters / 10 exceed the remaining budget is skipped without counting it
const CHARS_PER_TOKEN_CEILING = 10;

const countTokens = (text) => (text ? TokenUtils.calculate(text, 'map.txt') : 0);
const round = (value, digits) => Number(value.toFixed(digits));

/**
 * Check and complete the options of renderRepoMap()
 * @param {Object} options
 * @returns {Object}
 */
export function normalizeMapOptions(options = {}) {
  const normalized = {
    tokens: options.tokens ?? DEFAULT_TOKENS,
    focus: options.focus ?? [],
    history: options.history ?? DEFAULT_HISTORY,
    order: options.order ?? 'rank',
    importantLast: Boolean(options.importantLast),
    style: options.style ?? 'text',
    graph: Boolean(options.graph),
    redact: options.redact !== false,
    weights: { ...DEFAULT_WEIGHTS, ...options.weights },
    damping: options.damping ?? DEFAULT_DAMPING,
    maxFileBytes: options.maxFileBytes,
  };
  if (!Number.isInteger(normalized.tokens) || normalized.tokens < 1) {
    throw new Error(`tokens must be a positive integer, got ${JSON.stringify(options.tokens)}`);
  }
  if (!Number.isInteger(normalized.history) || normalized.history < 0) {
    throw new Error(
      `history must be a non-negative integer, got ${JSON.stringify(options.history)}`
    );
  }
  if (!Array.isArray(normalized.focus)) normalized.focus = [normalized.focus];
  if (!STYLES.includes(normalized.style)) {
    throw new Error(`style must be one of ${STYLES.join(', ')}, got ${normalized.style}`);
  }
  if (!ORDERS.includes(normalized.order)) {
    throw new Error(`order must be one of ${ORDERS.join(', ')}, got ${normalized.order}`);
  }
  if (normalized.importantLast && normalized.order !== 'rank') {
    throw new Error('importantLast applies to rank order only');
  }
  for (const [name, weight] of Object.entries(normalized.weights)) {
    if (!(weight >= 0)) throw new Error(`weight ${name} must be a non-negative number`);
  }
  return normalized;
}

/**
 * Build, rank and render the repository map of a project
 * @param {string} root - Project directory
 * @param {Object} [options]
 * @param {number} [options.tokens=2048] - Budget for the rendered map (TokenUtils count)
 * @param {string[]} [options.focus] - Files or folders to bias the ranking toward
 * @param {number} [options.history=300] - Commits of git history to mine (0 disables)
 * @param {'rank'|'path'} [options.order='rank'] - Order of the files in the output
 * @param {boolean} [options.importantLast=false] - Highest-ranked file at the end
 * @param {'text'|'markdown'|'json'|'dot'} [options.style='text']
 * @param {boolean} [options.graph=false] - Render the dependency edges instead of the map
 * @param {boolean} [options.redact=true] - Mask secrets in signatures
 * @param {{pagerank?: number, history?: number, symbols?: number}} [options.weights]
 * @returns {{output: string, style: string, budget: number, tokens: number,
 *   files: Array<Object>, ranked: Array<Object>, graph: import('./graph.js').RepoGraph,
 *   skipped: number, warnings: string[], stats: Object}}
 */
export function renderRepoMap(root, options = {}) {
  const opts = normalizeMapOptions(options);
  const started = performance.now();
  const graph = buildRepoGraph(root, {
    history: opts.history,
    redact: opts.redact,
    maxFileBytes: opts.maxFileBytes,
  });

  const warnings = [];
  const focus = resolveFocus(graph, opts.focus);
  for (const entry of focus.unmatched) warnings.push(`focus path matches no mapped file: ${entry}`);
  if (opts.history > 0 && !graph.history.available) {
    warnings.push(`git history unavailable (${graph.history.reason}); ranking without it`);
  }

  let timer = performance.now();
  const ranked = rankFiles(graph, {
    focus: focus.files,
    weights: opts.weights,
    damping: opts.damping,
  });
  graph.stats.timings.rank = performance.now() - timer;

  timer = performance.now();
  const result = {
    style: opts.style,
    budget: opts.tokens,
    graph,
    ranked,
    warnings,
  };
  if (opts.graph || opts.style === 'dot') {
    result.output = renderGraph(graph, ranked, opts.style);
    result.tokens = countTokens(result.output);
    result.files = [];
    result.skipped = 0;
  } else {
    const selection = selectFiles(graph, ranked, opts);
    result.files = selection.files;
    result.skipped = selection.skipped;
    result.tokens = selection.tokens;
    result.output =
      opts.style === 'json' ? renderJson(graph, ranked, selection, opts) : selection.output;
    if (selection.files.length === 0 && ranked.length > 0) {
      warnings.push(`no file fits in ${opts.tokens} tokens`);
    }
  }
  graph.stats.timings.render = performance.now() - timer;
  graph.stats.timings.total = performance.now() - started;
  result.stats = graph.stats;
  return result;
}

/**
 * Greedy selection, best rank first: every whole file block that still fits the budget.
 * The sum of block counts can differ from the count of the joined text by a token here
 * and there, so the joined text is counted again and the lowest-ranked files are dropped
 * until it fits.
 */
function selectFiles(graph, ranked, opts) {
  const style = opts.style === 'markdown' ? 'markdown' : 'text';
  const nodes = new Map(graph.nodes.map((node) => [node.path, node]));
  const analyzer = new MethodAnalyzer();
  const separator = style === 'markdown' ? '\n\n' : '\n';
  const chosen = [];
  let used = style === 'markdown' ? countTokens(`${MARKDOWN_TITLE}${separator}`) : 0;
  let skipped = 0;

  for (const row of ranked) {
    const remaining = opts.tokens - used;
    if (remaining < MIN_BLOCK_TOKENS) {
      skipped += ranked.length - row.rank + 1;
      break;
    }
    const node = nodes.get(row.path);
    const characters = node.methods.reduce(
      (sum, method) => sum + method.signature.length,
      row.path.length
    );
    if (characters / CHARS_PER_TOKEN_CEILING > remaining) {
      skipped++;
      continue;
    }
    // Token counts need the whole file and every method body counted; the block with
    // zeros in their place costs about as much and is cheap to count, so files that
    // cannot fit are skipped before that work
    const skeleton = renderBlock(style, {
      path: row.path,
      score: row.score,
      tokens: 0,
      methods: node.methods.map((method) => ({ ...method, tokens: 0 })),
    });
    if (countTokens(skeleton + separator) > remaining) {
      skipped++;
      continue;
    }
    const entry = describeFile(graph, node, row, analyzer);
    const block = renderBlock(style, entry);
    const cost = countTokens(block + separator);
    if (cost > remaining) {
      skipped++;
      continue;
    }
    chosen.push({ entry, block });
    used += cost;
  }

  for (;;) {
    const ordered = displayOrder(chosen, opts);
    const blocks = ordered.map((item) => item.block);
    if (style === 'markdown' && blocks.length > 0) blocks.unshift(MARKDOWN_TITLE);
    const output = blocks.length > 0 ? `${blocks.join(separator)}\n` : '';
    const tokens = countTokens(output);
    if (tokens <= opts.tokens || chosen.length === 0) {
      return { files: ordered.map((item) => item.entry), output, tokens, skipped };
    }
    chosen.pop();
    skipped++;
  }
}

/** rank (best first), path, or rank with the best last */
function displayOrder(chosen, opts) {
  if (opts.order === 'path') {
    return [...chosen].sort((a, b) =>
      a.entry.path < b.entry.path ? -1 : a.entry.path > b.entry.path ? 1 : 0
    );
  }
  return opts.importantLast ? [...chosen].reverse() : [...chosen];
}

/** Map entry of a file: its tokens and the tokens of each of its methods */
function describeFile(graph, node, row, analyzer) {
  const absolute = path.join(graph.root, node.path);
  let content = '';
  try {
    content = fs.readFileSync(absolute, 'utf-8');
  } catch (_error) {
    // Deleted since the scan: keep the signatures, count nothing
  }
  const sources = content ? analyzer.extractMethodSources(content, node.methods, absolute) : [];
  return {
    path: node.path,
    rank: row.rank,
    score: row.score,
    tokens: content ? TokenUtils.calculate(content, absolute) : 0,
    methods: node.methods.map((method, i) => ({
      line: method.line,
      name: method.name,
      signature: method.signature,
      tokens: sources[i] ? TokenUtils.calculate(sources[i], absolute) : 0,
    })),
  };
}

/** One file of the map */
export function renderBlock(style, entry) {
  const score = entry.score.toFixed(3);
  if (style === 'markdown') {
    const lines = [`## ${entry.path}`, `score ${score} · ${entry.tokens} tokens`];
    if (entry.methods.length > 0) lines.push('');
    for (const method of entry.methods) {
      lines.push(`- L${method.line} ${inlineCode(method.signature)} (${method.tokens} tokens)`);
    }
    return lines.join('\n');
  }
  const lines = [`${entry.path} (score ${score}, ${entry.tokens} tokens)`];
  for (const method of entry.methods) {
    lines.push(`  ${method.line}: ${method.signature} [${method.tokens} tok]`);
  }
  return lines.join('\n');
}

/** Markdown inline code that survives backticks in the text */
function inlineCode(text) {
  if (!text.includes('`')) return `\`${text}\``;
  return `\`\` ${text} \`\``;
}

function renderJson(graph, ranked, selection, opts) {
  const included = new Set(selection.files.map((file) => file.path));
  const document = {
    root: graph.root,
    budget: opts.tokens,
    tokens: selection.tokens,
    order: opts.order,
    importantLast: opts.importantLast,
    weights: opts.weights,
    damping: opts.damping,
    history: {
      requested: graph.history.requested,
      commits: graph.history.commits,
      available: graph.history.available,
    },
    files: selection.files.map((file) => ({ ...file, score: round(file.score, 6) })),
    nodes: ranked.map((row) => ({
      path: row.path,
      rank: row.rank,
      score: round(row.score, 6),
      pagerank: round(row.pagerank, 8),
      changes: row.changes,
      symbolRefs: round(row.symbolRefs, 4),
      focus: row.focus,
      included: included.has(row.path),
    })),
    edges: graph.edges.map((edge) => ({ ...edge, weight: round(edge.weight, 6) })),
    stats: {
      files: graph.stats.files,
      edges: graph.stats.edges,
      unresolvedImports: graph.stats.unresolvedImports,
      skippedFiles: graph.stats.skipped,
    },
  };
  return `${JSON.stringify(document, null, 2)}\n`;
}

/**
 * The dependency edges: `a -> b` lines (text), a fenced block (markdown), nodes and edges
 * (json) or a Graphviz digraph (dot)
 */
export function renderGraph(graph, ranked, style) {
  const weightNote = (edge) => (edge.weight === 1 ? '' : ` (${round(edge.weight, 3)})`);
  if (style === 'json') {
    return `${JSON.stringify(
      {
        root: graph.root,
        nodes: ranked.map((row) => ({
          path: row.path,
          rank: row.rank,
          score: round(row.score, 6),
        })),
        edges: graph.edges.map((edge) => ({ ...edge, weight: round(edge.weight, 6) })),
      },
      null,
      2
    )}\n`;
  }
  if (style === 'dot') {
    const escape = (value) => value.replace(/["\\]/g, '\\$&');
    const quote = (value) => `"${escape(value)}"`;
    const lines = ['digraph repo {', '  rankdir=LR;', '  node [shape=box, fontsize=10];'];
    const byPath = [...ranked].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    for (const row of byPath) {
      // \n in a DOT string is a line break in the label
      const label = `"${escape(row.path)}\\n${row.score.toFixed(3)}"`;
      lines.push(`  ${quote(row.path)} [label=${label}];`);
    }
    for (const edge of graph.edges) {
      const attributes = edge.weight === 1 ? '' : ` [weight=${round(edge.weight, 3)}]`;
      lines.push(`  ${quote(edge.from)} -> ${quote(edge.to)}${attributes};`);
    }
    lines.push('}');
    return `${lines.join('\n')}\n`;
  }
  const lines = graph.edges.map((edge) => `${edge.from} -> ${edge.to}${weightNote(edge)}`);
  if (style === 'markdown') {
    return `# Dependency graph\n\n\`\`\`text\n${lines.join('\n')}${lines.length ? '\n' : ''}\`\`\`\n`;
  }
  return lines.length > 0 ? `${lines.join('\n')}\n` : '';
}

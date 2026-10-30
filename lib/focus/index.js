/**
 * Focus Context (`ctxman focus <file> --depth N`)
 *
 * Packs a target file together with its neighborhood in the repository import graph:
 *   - outgoing imports (`target -> dep -> transitive dep`) up to `depth` hops
 *   - incoming importers (`caller -> transitive caller -> target`) up to `depth` hops
 *
 * Directional traversal prevents shared utility hubs (such as `logger.js`) from pulling in
 * unrelated sibling consumers at depth >= 2. Files are ordered and prioritized for token
 * budgets with the target file first, then direct neighbors (distance 1), then deeper hops,
 * breaking ties by personalised PageRank centered on the target file.
 */

import fs from 'fs';
import path from 'path';
import { Scanner } from '../core/Scanner.js';
import { buildRepoGraph, rankFiles } from '../map/index.js';
import { packContext, PackError, TOOL_DEFAULT_BUDGET } from '../pack/index.js';
import { enforceExport } from '../policy/enforce.js';

export const DEFAULT_FOCUS_DEPTH = 1;
export const DIRECTIONS = ['both', 'imports', 'importers'];

export class FocusError extends PackError {
  constructor(code, message) {
    super(code, message);
    this.name = 'FocusError';
  }
}

const toPosix = (relativePath) => relativePath.split(path.sep).join('/');

function relativeInside(root, target) {
  const relative = path.relative(root, target);
  if (relative === '' || path.isAbsolute(relative)) return null;
  if (relative === '..' || relative.startsWith(`..${path.sep}`)) return null;
  return relative;
}

const TEST_PATH_RE =
  /(?:^|\/)(?:test|tests|__tests__|spec|specs)(?:\/|$)|\.(?:test|spec)\.[a-z0-9]+$/i;

function isTestPath(posixPath) {
  return TEST_PATH_RE.test(posixPath);
}

/**
 * Breadth-first traversal along a directed adjacency list (`Map<string, Set<string>>`).
 * @param {string} start - Starting node path
 * @param {Map<string, Set<string>>} adjacency
 * @param {number} maxDepth
 * @returns {Map<string, number>} Neighbor path -> shortest hop distance (1..maxDepth)
 */
function bfsDirected(start, adjacency, maxDepth) {
  const distances = new Map();
  if (maxDepth <= 0) return distances;

  const queue = [[start, 0]];
  const visited = new Set([start]);

  while (queue.length > 0) {
    const [current, dist] = queue.shift();
    if (dist >= maxDepth) continue;
    const nextNodes = adjacency.get(current);
    if (!nextNodes) continue;
    for (const next of nextNodes) {
      if (visited.has(next)) continue;
      visited.add(next);
      distances.set(next, dist + 1);
      queue.push([next, dist + 1]);
    }
  }

  return distances;
}

function resolveDirection(options) {
  if (options.direction !== undefined) {
    if (!DIRECTIONS.includes(options.direction)) {
      throw new FocusError(
        'INVALID_OPTION',
        `Unknown direction "${options.direction}" (use ${DIRECTIONS.join(', ')})`
      );
    }
    return options.direction;
  }
  const wantImports = options.imports !== false;
  const wantImporters = options.importers !== false;
  if (wantImports && wantImporters) return 'both';
  if (wantImports) return 'imports';
  if (wantImporters) return 'importers';
  throw new FocusError(
    'INVALID_OPTION',
    'At least one of imports or importers must be enabled (use depth: 0 for target only)'
  );
}

/**
 * Resolve and validate target file inside project root
 */
function resolveTargetFile(root, target, cwd) {
  const rootPath = path.resolve(root);
  if (!fs.statSync(rootPath, { throwIfNoEntry: false })?.isDirectory()) {
    throw new FocusError('ROOT_NOT_FOUND', `Not a directory: ${root}`);
  }
  if (typeof target !== 'string' || target.trim() === '') {
    throw new FocusError('INVALID_OPTION', 'Target file is required');
  }

  const realRoot = fs.realpathSync(rootPath);
  const baseDir = cwd ? path.resolve(cwd) : rootPath;
  const candidate = path.resolve(baseDir, target);

  let relative = relativeInside(rootPath, candidate);
  if (relative === null && realRoot !== rootPath) {
    relative = relativeInside(realRoot, candidate);
  }
  if (relative === null) {
    throw new FocusError('PATH_OUTSIDE_ROOT', `Target file is outside the project root: ${target}`);
  }

  const absolutePath = path.join(rootPath, relative);
  const posixPath = toPosix(relative);

  const scanner = new Scanner(rootPath);
  const policy = scanner.getPolicy();

  // Check policy denial before touching or revealing file existence details
  if (policy?.active && (policy.isAuditLog(relative) || scanner.isDenied(relative))) {
    enforceExport(policy, {
      files: [posixPath],
      tokens: 0,
      redact: true,
    });
  }

  let stat;
  try {
    stat = fs.statSync(absolutePath, { throwIfNoEntry: false });
    if (stat) {
      const realTarget = fs.realpathSync(absolutePath);
      if (relativeInside(realRoot, realTarget) === null) {
        throw new FocusError(
          'PATH_OUTSIDE_ROOT',
          `Target file resolves outside the project root: ${target}`
        );
      }
    }
  } catch (error) {
    if (error instanceof FocusError) throw error;
    stat = null;
  }

  if (!stat || !stat.isFile()) {
    throw new FocusError('FILE_NOT_FOUND', `Target file not found: ${posixPath}`);
  }

  return { rootPath, targetRel: posixPath, targetOSRel: relative, scanner, policy };
}

/**
 * Pack a target file and its import/importer neighborhood into a single LLM-ready document.
 *
 * @param {string} root - Project root directory
 * @param {string} target - Project-relative (or absolute inside root) target file
 * @param {object} [options]
 * @param {number} [options.depth=1] - Graph traversal hops (0 = target file only)
 * @param {'both'|'imports'|'importers'} [options.direction='both']
 * @param {boolean} [options.imports=true] - Include outgoing imports
 * @param {boolean} [options.importers=true] - Include incoming importers
 * @param {boolean} [options.includeTests=true] - Include test files in neighborhood
 * @param {number} [options.history=0] - Git commits mined for tie-breaking PageRank
 * @param {string} [options.cwd] - Base directory for resolving relative `target`
 * @param {'xml'|'markdown'|'plain'|'json'} [options.style='xml']
 * @param {number} [options.budget] - Token limit; target first, then closest neighbors
 * @param {boolean} [options.compress=false] - Elide function bodies
 * @param {boolean} [options.lineNumbers=false] - Prefix lines with original line numbers
 * @param {boolean} [options.tree=true] - Include directory tree at top
 * @param {string} [options.header] - Header text at top
 * @param {string} [options.instructions] - Instructions appended at end
 * @param {boolean} [options.redact=true] - Redact secrets
 * @param {string} [options.targetModel] - Tokenizer / context-fit model id
 * @param {string[]} [options.excludeFiles] - Absolute file paths to omit (e.g. output file)
 * @returns {Promise<object>} PackResult augmented with `focus` metadata
 */
export async function focusContext(root, target, options = {}) {
  const depth = options.depth ?? DEFAULT_FOCUS_DEPTH;
  if (!Number.isInteger(depth) || depth < 0) {
    throw new FocusError('INVALID_OPTION', `depth must be a non-negative integer, got ${depth}`);
  }
  const direction = depth === 0 ? 'both' : resolveDirection(options);
  const includeTests = options.includeTests !== false;

  const { rootPath, targetRel, policy } = resolveTargetFile(root, target, options.cwd);

  // Build import graph and personalized PageRank around target
  const graph = buildRepoGraph(rootPath, {
    history: options.history ?? 0,
    redact: options.redact !== false,
  });
  const nodeSet = new Set(graph.nodes.map((node) => node.path));
  const inGraph = nodeSet.has(targetRel);

  const outgoing = new Map();
  const incoming = new Map();
  for (const edge of graph.edges) {
    if (!outgoing.has(edge.from)) outgoing.set(edge.from, new Set());
    outgoing.get(edge.from).add(edge.to);
    if (!incoming.has(edge.to)) incoming.set(edge.to, new Set());
    incoming.get(edge.to).add(edge.from);
  }

  const outDistances =
    direction === 'both' || direction === 'imports'
      ? bfsDirected(targetRel, outgoing, depth)
      : new Map();
  const inDistances =
    direction === 'both' || direction === 'importers'
      ? bfsDirected(targetRel, incoming, depth)
      : new Map();

  const ranked = rankFiles(graph, { focus: [targetRel] });
  const scoreMap = new Map(ranked.map((row) => [row.path, row.score]));

  const allNeighborPaths = new Set([...outDistances.keys(), ...inDistances.keys()]);
  const neighbors = [];
  for (const neighborPath of allNeighborPaths) {
    if (neighborPath === targetRel) continue;
    if (!includeTests && isTestPath(neighborPath)) continue;

    const dOut = outDistances.get(neighborPath);
    const dIn = inDistances.get(neighborPath);
    const distance = dOut !== undefined && dIn !== undefined ? Math.min(dOut, dIn) : (dOut ?? dIn);
    const relation =
      dOut !== undefined && dIn !== undefined ? 'both' : dOut !== undefined ? 'import' : 'importer';

    neighbors.push({
      path: neighborPath,
      distance,
      relation,
      score: Math.round((scoreMap.get(neighborPath) ?? 0) * 10000) / 10000,
    });
  }

  // Order neighbors: closest hop first, highest personalized PageRank second, lexical path third
  neighbors.sort(
    (a, b) =>
      a.distance - b.distance ||
      b.score - a.score ||
      (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
  );

  const orderedFiles = [targetRel, ...neighbors.map((n) => n.path)];

  const packResult = await packContext(rootPath, {
    style: options.style,
    include: options.include,
    exclude: options.exclude,
    files: orderedFiles,
    rankOrder: orderedFiles,
    cwd: rootPath,
    excludeFiles: options.excludeFiles,
    maxFileSize: options.maxFileSize,
    tree: options.tree,
    header: options.header,
    instructions: options.instructions,
    lineNumbers: options.lineNumbers,
    compress: options.compress,
    redact: options.redact,
    budget: options.budget,
    split: options.split,
    targetModel: options.targetModel,
  });

  if (policy?.active) {
    enforceExport(policy, {
      files: packResult.files,
      tokens: packResult.totalTokens,
      redact: options.redact !== false,
      targetModel: options.targetModel ?? null,
    });
  }

  return {
    ...packResult,
    focus: {
      target: targetRel,
      depth,
      direction,
      inGraph,
      neighbors,
    },
  };
}

/**
 * One-line summary of a focusContext() result
 * @param {object} result
 * @returns {string}
 */
export function describeFocus(result) {
  const { focus } = result;
  const packedNeighbors = Math.max(0, result.files.length - 1);
  const parts = [
    `target ${focus.target} + ${packedNeighbors}/${focus.neighbors.length} neighbor(s) (depth ${focus.depth}, ${focus.direction})`,
    `${result.totalTokens} tokens (${result.style})`,
  ];
  if (result.omitted.length) parts.push(`${result.omitted.length} file(s) left out by the budget`);
  if (result.compression)
    parts.push(`${result.compression.savedTokens} tokens saved by compression`);
  if (result.redactions.total) parts.push(`${result.redactions.total} secret(s) redacted`);
  return `Focused ${parts.join('; ')}.`;
}

export { TOOL_DEFAULT_BUDGET };
export default focusContext;

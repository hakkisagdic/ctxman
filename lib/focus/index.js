/**
 * Focus Context (`ctxman focus <file>[:symbol] --depth N`)
 *
 * Packs a target file (or `file:symbol`) together with its neighborhood in the repository
 * import graph and cross-file AST symbol call graph:
 *   - outgoing imports & symbol calls (`target -> dep -> transitive dep`) up to `depth` hops
 *   - incoming importers & symbol callers (`caller -> transitive caller -> target`) up to `depth` hops
 *
 * Supports both single-repository mode and multi-repository workspace mode (`options.repos` / `--repo <dir>`),
 * traversing cross-repository import and symbol call edges under `<repoAlias>/<path>` namespaces.
 */

import fs from 'fs';
import path from 'path';
import { Scanner } from '../core/Scanner.js';
import { buildRepoGraph, rankFiles, splitTargetSymbol, normalizeSymbolName } from '../map/index.js';
import { packContext, PackError, TOOL_DEFAULT_BUDGET } from '../pack/index.js';
import { enforceExport } from '../policy/enforce.js';
import {
  resolveWorkspaceRepos,
  enforceWorkspacePolicies,
  buildWorkspaceGraph,
  packWorkspace,
} from '../workspace/index.js';

export const DEFAULT_FOCUS_DEPTH = 1;
export const DIRECTIONS = ['both', 'imports', 'importers', 'calls', 'callers'];

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

/**
 * Compute intra-file method call closure so symbol-level focus follows helper functions
 * within the same file before/after crossing file boundaries.
 *
 * @param {import('../map/graph.js').MapNode | undefined} node
 * @param {string} symbol
 * @param {'outgoing'|'incoming'} dir
 * @returns {Set<string>} Set of method names in `node` reachable from/to `symbol`
 */
function intraFileSymbolClosure(node, symbol, dir) {
  const reached = new Set([symbol, normalizeSymbolName(symbol)].filter(Boolean));
  if (!node || !Array.isArray(node.methods) || node.methods.length === 0) return reached;

  const methods = node.methods;
  let changed = true;
  while (changed) {
    changed = false;
    for (const method of methods) {
      const mName = method.name;
      const mNorm = normalizeSymbolName(mName);
      const calls = method.calls || [];
      if (dir === 'outgoing') {
        if (reached.has(mName) || reached.has(mNorm)) {
          for (const callee of calls) {
            if (
              methods.some(
                (other) => other.name === callee || normalizeSymbolName(other.name) === callee
              ) &&
              !reached.has(callee)
            ) {
              reached.add(callee);
              changed = true;
            }
          }
        }
      } else {
        // incoming: if `method` calls any symbol in `reached`, then `method` is an intra-file caller
        if (!reached.has(mName) && calls.some((c) => reached.has(c))) {
          reached.add(mName);
          if (mNorm) reached.add(mNorm);
          changed = true;
        }
      }
    }
  }
  return reached;
}

/**
 * Symbol-level directional BFS across `graph.callEdges`.
 *
 * @param {import('../map/graph.js').RepoGraph} graph
 * @param {string} startFile
 * @param {string} startSymbol
 * @param {'outgoing'|'incoming'} dir
 * @param {number} maxDepth
 * @returns {{ distances: Map<string, number>, traversedEdges: Array<object> }}
 */
function bfsSymbolCallGraph(graph, startFile, startSymbol, dir, maxDepth) {
  const distances = new Map();
  const traversedEdges = [];
  if (maxDepth <= 0) return { distances, traversedEdges };

  const nodeMap = new Map(graph.nodes.map((n) => [n.path, n]));
  const callEdges = graph.callEdges || [];
  const queue = [{ file: startFile, symbol: startSymbol, dist: 0 }];
  const visitedStates = new Set([`${startFile}:${startSymbol}`]);

  while (queue.length > 0) {
    const { file, symbol, dist } = queue.shift();
    if (dist >= maxDepth) continue;

    const activeSymbols = intraFileSymbolClosure(nodeMap.get(file), symbol, dir);

    for (const edge of callEdges) {
      if (dir === 'outgoing') {
        if (
          edge.from === file &&
          (activeSymbols.has(edge.caller) || activeSymbols.has(normalizeSymbolName(edge.caller)))
        ) {
          traversedEdges.push(edge);
          const nextDistance = dist + 1;
          if (edge.to !== startFile) {
            const prev = distances.get(edge.to);
            if (prev === undefined || nextDistance < prev) {
              distances.set(edge.to, nextDistance);
            }
          }
          const stateKey = `${edge.to}:${edge.callee}`;
          if (!visitedStates.has(stateKey)) {
            visitedStates.add(stateKey);
            queue.push({ file: edge.to, symbol: edge.callee, dist: nextDistance });
          }
        }
      } else {
        if (
          edge.to === file &&
          (activeSymbols.has(edge.callee) || activeSymbols.has(normalizeSymbolName(edge.callee)))
        ) {
          traversedEdges.push(edge);
          const nextDistance = dist + 1;
          if (edge.from !== startFile) {
            const prev = distances.get(edge.from);
            if (prev === undefined || nextDistance < prev) {
              distances.set(edge.from, nextDistance);
            }
          }
          const stateKey = `${edge.from}:${edge.caller}`;
          if (!visitedStates.has(stateKey)) {
            visitedStates.add(stateKey);
            queue.push({ file: edge.from, symbol: edge.caller, dist: nextDistance });
          }
        }
      }
    }
  }

  return { distances, traversedEdges };
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
  if (options.callsOnly) return 'calls';
  if (options.callersOnly) return 'callers';
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
 * Resolve and validate target file (and optional `:symbol`) inside project root
 */
function resolveTargetFile(root, target, cwd, explicitSymbol) {
  const rootPath = path.resolve(root);
  if (!fs.statSync(rootPath, { throwIfNoEntry: false })?.isDirectory()) {
    throw new FocusError('ROOT_NOT_FOUND', `Not a directory: ${root}`);
  }
  if (typeof target !== 'string' || target.trim() === '') {
    throw new FocusError('INVALID_OPTION', 'Target file is required');
  }

  const realRoot = fs.realpathSync(rootPath);
  const baseDir = cwd ? path.resolve(cwd) : rootPath;

  let rawTarget = target;
  let parsedSymbol = explicitSymbol ? String(explicitSymbol).trim() : null;

  const literalCandidate = path.resolve(baseDir, rawTarget);
  if (!fs.existsSync(literalCandidate)) {
    const split = splitTargetSymbol(rawTarget);
    if (split.symbol) {
      rawTarget = split.pathPart;
      if (!parsedSymbol) parsedSymbol = split.symbol;
    }
  }

  const candidate = path.resolve(baseDir, rawTarget);

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

  return {
    rootPath,
    targetRel: posixPath,
    targetOSRel: relative,
    symbol: parsedSymbol || null,
    scanner,
    policy,
  };
}

/**
 * Resolve and validate target file (and optional `:symbol`) across multiple workspace repositories.
 * Supports `<alias>/<path>[:symbol]`, absolute paths inside any workspace repo, or relative paths.
 */
function resolveWorkspaceTargetFile(resolvedRepos, primaryRoot, target, cwd, explicitSymbol) {
  if (typeof target !== 'string' || target.trim() === '') {
    throw new FocusError('INVALID_OPTION', 'Target file is required');
  }

  const baseDir = cwd ? path.resolve(cwd) : resolvedRepos[0].root;
  let rawTarget = target.trim();
  let parsedSymbol = explicitSymbol ? String(explicitSymbol).trim() : null;

  const existsLiterally = (candidateStr) => {
    if (fs.existsSync(path.resolve(baseDir, candidateStr))) return true;
    const posix = toPosix(candidateStr).replace(/^\/+/, '');
    for (const repo of resolvedRepos) {
      if (posix.startsWith(`${repo.alias}/`)) {
        if (fs.existsSync(path.join(repo.root, posix.slice(repo.alias.length + 1)))) return true;
      }
      if (fs.existsSync(path.resolve(repo.root, candidateStr))) return true;
    }
    return false;
  };

  if (!existsLiterally(rawTarget)) {
    const split = splitTargetSymbol(rawTarget);
    if (split.symbol) {
      rawTarget = split.pathPart;
      if (!parsedSymbol) parsedSymbol = split.symbol;
    }
  }

  const findContainingRepo = (absCandidate) => {
    let best = null;
    for (const repo of resolvedRepos) {
      let rel = relativeInside(repo.root, absCandidate);
      if (rel === null && repo.realRoot !== repo.root) {
        rel = relativeInside(repo.realRoot, absCandidate);
      }
      if (rel !== null) {
        if (!best || repo.root.length > best.repo.root.length) {
          best = { repo, relative: rel };
        }
      }
    }
    return best;
  };

  let matchedRepo = null;
  let relative = null;

  const cleanPosix = toPosix(rawTarget).replace(/^\.\//, '');

  // 1. Check `<alias>/<path>` prefix
  for (const repo of resolvedRepos) {
    if (cleanPosix.startsWith(`${repo.alias}/`)) {
      const sub = cleanPosix.slice(repo.alias.length + 1);
      const absCandidate = path.resolve(repo.root, sub);
      let rel = relativeInside(repo.root, absCandidate);
      if (rel === null && repo.realRoot !== repo.root) {
        rel = relativeInside(repo.realRoot, absCandidate);
      }
      if (rel === null) {
        throw new FocusError(
          'PATH_OUTSIDE_ROOT',
          `Target file is outside repository ${repo.alias}: ${target}`
        );
      }
      matchedRepo = repo;
      relative = rel;
      break;
    }
  }

  // 2. Check absolute path or `..` traversal relative to baseDir
  if (!matchedRepo && (path.isAbsolute(rawTarget) || cleanPosix.startsWith('..'))) {
    const absCandidate = path.resolve(baseDir, rawTarget);
    const found = findContainingRepo(absCandidate);
    if (!found) {
      throw new FocusError(
        'PATH_OUTSIDE_ROOT',
        `Target file is outside the workspace roots: ${target}`
      );
    }
    matchedRepo = found.repo;
    relative = found.relative;
  }

  // 3. Check relative path across workspace repos (existing or policy-denied file first)
  if (!matchedRepo) {
    for (const repo of resolvedRepos) {
      const absCandidate = path.resolve(repo.root, rawTarget);
      const rel = relativeInside(repo.root, absCandidate);
      if (rel === null) continue;
      const scanner = new Scanner(repo.root);
      const policy = scanner.getPolicy();
      const isDenied = policy?.active && (policy.isAuditLog(rel) || scanner.isDenied(rel));
      if (isDenied || fs.existsSync(path.join(repo.root, rel))) {
        matchedRepo = repo;
        relative = rel;
        break;
      }
    }
  }

  // 4. Fallback to primary repository so standard missing/outside checks apply
  if (!matchedRepo) {
    const primary = resolvedRepos[0];
    const absCandidate = path.resolve(primary.root, rawTarget);
    const rel = relativeInside(primary.root, absCandidate);
    if (rel === null) {
      throw new FocusError(
        'PATH_OUTSIDE_ROOT',
        `Target file is outside the workspace roots: ${target}`
      );
    }
    matchedRepo = primary;
    relative = rel;
  }

  const absolutePath = path.join(matchedRepo.root, relative);
  const posixRel = toPosix(relative);
  const workspacePath = `${matchedRepo.alias}/${posixRel}`;

  const scanner = new Scanner(matchedRepo.root);
  const policy = scanner.getPolicy();

  if (policy?.active && (policy.isAuditLog(relative) || scanner.isDenied(relative))) {
    enforceExport(policy, {
      files: [posixRel],
      tokens: 0,
      redact: true,
    });
  }

  let stat;
  try {
    stat = fs.statSync(absolutePath, { throwIfNoEntry: false });
    if (stat) {
      const realTarget = fs.realpathSync(absolutePath);
      if (relativeInside(matchedRepo.realRoot, realTarget) === null) {
        throw new FocusError(
          'PATH_OUTSIDE_ROOT',
          `Target file resolves outside repository ${matchedRepo.alias}: ${target}`
        );
      }
    }
  } catch (error) {
    if (error instanceof FocusError) throw error;
    stat = null;
  }

  if (!stat || !stat.isFile()) {
    throw new FocusError('FILE_NOT_FOUND', `Target file not found: ${workspacePath}`);
  }

  return {
    targetRepo: matchedRepo,
    targetRel: workspacePath,
    repoRelPath: posixRel,
    symbol: parsedSymbol || null,
  };
}

/**
 * Pack a target file (or `file:symbol`) and its import/importer and cross-file symbol call
 * neighborhood into a single LLM-ready document.
 *
 * @param {string} root - Project root directory
 * @param {string} target - Project-relative (or `<alias>/<path>` in multi-repo mode) target file or `file:symbol`
 * @param {object} [options]
 * @param {Array<string|{path: string, alias?: string}>} [options.repos] - Additional repository roots for multi-repo workspace focus
 * @param {string} [options.symbol] - Optional function/method symbol in `target` to focus call graph on
 * @param {number} [options.depth=1] - Graph traversal hops (0 = target file only)
 * @param {'both'|'imports'|'importers'|'calls'|'callers'} [options.direction='both']
 * @param {boolean} [options.imports=true] - Include outgoing imports
 * @param {boolean} [options.importers=true] - Include incoming importers
 * @param {boolean} [options.callGraph=true] - Include cross-file AST symbol call graph edges
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
  const useCallGraph = options.callGraph !== false;

  const extraRepos = Array.isArray(options.repos) ? options.repos.filter(Boolean) : [];
  const isMultiRepo = extraRepos.length > 0;

  let resolvedRepos = null;
  let rootPath = null;
  let targetRel = null;
  let symbol = null;
  let policy = null;
  let graph = null;

  if (isMultiRepo) {
    resolvedRepos = resolveWorkspaceRepos([root, ...extraRepos]);
    enforceWorkspacePolicies(resolvedRepos, {
      filesByRepo: new Map(),
      tokens: 0,
      redact: options.redact !== false,
      targetModel: options.targetModel ?? null,
    });
    const resolvedTarget = resolveWorkspaceTargetFile(
      resolvedRepos,
      root,
      target,
      options.cwd,
      options.symbol
    );
    targetRel = resolvedTarget.targetRel;
    symbol = resolvedTarget.symbol;
    graph = buildWorkspaceGraph(resolvedRepos, {
      history: options.history ?? 0,
      redact: options.redact !== false,
    });
  } else {
    const resolvedTarget = resolveTargetFile(root, target, options.cwd, options.symbol);
    rootPath = resolvedTarget.rootPath;
    targetRel = resolvedTarget.targetRel;
    symbol = resolvedTarget.symbol;
    policy = resolvedTarget.policy;
    graph = buildRepoGraph(rootPath, {
      history: options.history ?? 0,
      redact: options.redact !== false,
    });
  }

  const nodeMap = new Map(graph.nodes.map((node) => [node.path, node]));
  const inGraph = nodeMap.has(targetRel);

  if (symbol) {
    const targetNode = nodeMap.get(targetRel);
    const hasSymbol = targetNode?.methods?.some(
      (m) => m.name === symbol || normalizeSymbolName(m.name) === symbol
    );
    if (!hasSymbol) {
      throw new FocusError('SYMBOL_NOT_FOUND', `Symbol "${symbol}" not found in ${targetRel}`);
    }
  }

  const outgoing = new Map();
  const incoming = new Map();
  for (const edge of graph.edges) {
    if (!outgoing.has(edge.from)) outgoing.set(edge.from, new Set());
    outgoing.get(edge.from).add(edge.to);
    if (!incoming.has(edge.to)) incoming.set(edge.to, new Set());
    incoming.get(edge.to).add(edge.from);
  }

  const callOutgoing = new Map();
  const callIncoming = new Map();
  for (const edge of graph.callEdges || []) {
    if (!callOutgoing.has(edge.from)) callOutgoing.set(edge.from, new Set());
    callOutgoing.get(edge.from).add(edge.to);
    if (!callIncoming.has(edge.to)) callIncoming.set(edge.to, new Set());
    callIncoming.get(edge.to).add(edge.from);
  }

  let importOutDistances = new Map();
  let importInDistances = new Map();
  let callOutDistances = new Map();
  let callInDistances = new Map();
  let symbolTraversedEdges = null;

  if (symbol) {
    // Symbol-level focus traverses the cross-file AST symbol call graph from `targetRel:symbol`
    const wantOut = direction === 'both' || direction === 'imports' || direction === 'calls';
    const wantIn = direction === 'both' || direction === 'importers' || direction === 'callers';
    const outRes = wantOut
      ? bfsSymbolCallGraph(graph, targetRel, symbol, 'outgoing', depth)
      : { distances: new Map(), traversedEdges: [] };
    const inRes = wantIn
      ? bfsSymbolCallGraph(graph, targetRel, symbol, 'incoming', depth)
      : { distances: new Map(), traversedEdges: [] };
    callOutDistances = outRes.distances;
    callInDistances = inRes.distances;
    symbolTraversedEdges = [...outRes.traversedEdges, ...inRes.traversedEdges];
  } else if (direction === 'calls') {
    callOutDistances = bfsDirected(targetRel, callOutgoing, depth);
  } else if (direction === 'callers') {
    callInDistances = bfsDirected(targetRel, callIncoming, depth);
  } else {
    if (direction === 'both' || direction === 'imports') {
      importOutDistances = bfsDirected(targetRel, outgoing, depth);
      if (useCallGraph) {
        callOutDistances = bfsDirected(targetRel, callOutgoing, depth);
      }
    }
    if (direction === 'both' || direction === 'importers') {
      importInDistances = bfsDirected(targetRel, incoming, depth);
      if (useCallGraph) {
        callInDistances = bfsDirected(targetRel, callIncoming, depth);
      }
    }
  }

  const rankGraph = isMultiRepo ? { ...graph, root: resolvedRepos[0].root } : graph;
  const ranked = rankFiles(rankGraph, {
    focus: [targetRel],
    callGraph: useCallGraph || Boolean(symbol),
  });
  const scoreMap = new Map(ranked.map((row) => [row.path, row.score]));

  const allNeighborPaths = new Set([
    ...importOutDistances.keys(),
    ...importInDistances.keys(),
    ...callOutDistances.keys(),
    ...callInDistances.keys(),
  ]);

  const minDefined = (a, b) => (a !== undefined && b !== undefined ? Math.min(a, b) : (a ?? b));

  const neighbors = [];
  for (const neighborPath of allNeighborPaths) {
    if (neighborPath === targetRel) continue;
    if (!includeTests && isTestPath(neighborPath)) continue;

    const dImpOut = importOutDistances.get(neighborPath);
    const dImpIn = importInDistances.get(neighborPath);
    const dCallOut = callOutDistances.get(neighborPath);
    const dCallIn = callInDistances.get(neighborPath);

    const dOut = minDefined(dImpOut, dCallOut);
    const dIn = minDefined(dImpIn, dCallIn);
    const distance = minDefined(dOut, dIn);

    let relation;
    if (
      symbol ||
      direction === 'calls' ||
      direction === 'callers' ||
      (dImpOut === undefined && dImpIn === undefined)
    ) {
      relation =
        dOut !== undefined && dIn !== undefined ? 'both' : dOut !== undefined ? 'call' : 'caller';
    } else {
      relation =
        dImpOut !== undefined && dImpIn !== undefined
          ? 'both'
          : dImpOut !== undefined
            ? 'import'
            : 'importer';
    }

    const neighborNode = nodeMap.get(neighborPath);
    neighbors.push({
      path: neighborPath,
      ...(isMultiRepo && neighborNode?.repo ? { repo: neighborNode.repo } : {}),
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

  let packResult;
  if (isMultiRepo) {
    packResult = await packWorkspace(resolvedRepos, {
      style: options.style,
      include: options.include,
      exclude: options.exclude,
      files: orderedFiles,
      rankOrder: orderedFiles,
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
  } else {
    packResult = await packContext(rootPath, {
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
  }

  const packedFileSet = new Set(packResult.files.map((f) => f.path));
  const candidateCallEdges = symbolTraversedEdges ?? (graph.callEdges || []);
  const relevantCallEdges = [];
  const seenCallEdgeKeys = new Set();
  for (const edge of candidateCallEdges) {
    if (!packedFileSet.has(edge.from) || !packedFileSet.has(edge.to)) continue;
    const key = `${edge.from}:${edge.caller}:${edge.callerLine}->${edge.to}:${edge.callee}:${edge.calleeLine}`;
    if (seenCallEdgeKeys.has(key)) continue;
    seenCallEdgeKeys.add(key);
    relevantCallEdges.push(edge);
  }

  return {
    ...packResult,
    focus: {
      target: targetRel,
      symbol: symbol || null,
      depth,
      direction,
      inGraph,
      ...(isMultiRepo ? { repos: packResult.repos } : {}),
      neighbors,
      callEdges: relevantCallEdges,
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
  const targetLabel = focus.symbol ? `${focus.target}:${focus.symbol}` : focus.target;
  const parts = [
    `target ${targetLabel} + ${packedNeighbors}/${focus.neighbors.length} neighbor(s) (depth ${focus.depth}, ${focus.direction})`,
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

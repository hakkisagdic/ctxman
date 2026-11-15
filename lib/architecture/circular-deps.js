import path from 'node:path';
import { buildRepoGraph } from '../map/index.js';

/**
 * Find all Strongly Connected Components (SCCs) using Tarjan's algorithm.
 *
 * @param {string[]} vertices
 * @param {Map<string, Set<string>>} adjacency
 * @returns {string[][]}
 */
function findTarjanSCCs(vertices, adjacency) {
  let index = 0;
  const indices = new Map();
  const lowlink = new Map();
  const onStack = new Set();
  const stack = [];
  const sccs = [];

  function strongconnect(v) {
    indices.set(v, index);
    lowlink.set(v, index);
    index += 1;
    stack.push(v);
    onStack.add(v);

    const neighbors = adjacency.get(v) || new Set();
    for (const w of neighbors) {
      if (!indices.has(w)) {
        strongconnect(w);
        lowlink.set(v, Math.min(lowlink.get(v), lowlink.get(w)));
      } else if (onStack.has(w)) {
        lowlink.set(v, Math.min(lowlink.get(v), indices.get(w)));
      }
    }

    if (lowlink.get(v) === indices.get(v)) {
      const scc = [];
      while (stack.length > 0) {
        const w = stack.pop();
        onStack.delete(w);
        scc.push(w);
        if (w === v) break;
      }
      sccs.push(scc);
    }
  }

  for (const v of vertices) {
    if (!indices.has(v)) {
      strongconnect(v);
    }
  }

  return sccs;
}

/**
 * Reconstruct a representative cycle path within an SCC.
 *
 * @param {string[]} scc
 * @param {Map<string, Set<string>>} adjacency
 * @returns {string[]}
 */
function reconstructCyclePath(scc, adjacency) {
  const sccSet = new Set(scc);
  const sorted = [...scc].sort();
  const start = sorted[0];
  const visited = new Set();
  const parent = new Map();

  // BFS from start to find shortest path back to start within sccSet
  const queue = [start];
  visited.add(start);

  while (queue.length > 0) {
    const u = queue.shift();
    const neighbors = [...(adjacency.get(u) || [])].filter((n) => sccSet.has(n)).sort();
    for (const v of neighbors) {
      if (v === start) {
        const pathNodes = [u];
        let cur = u;
        while (parent.has(cur)) {
          cur = parent.get(cur);
          pathNodes.push(cur);
        }
        pathNodes.reverse();
        pathNodes.push(start);
        return pathNodes;
      }
      if (!visited.has(v)) {
        visited.add(v);
        parent.set(v, u);
        queue.push(v);
      }
    }
  }

  return [...sorted, sorted[0]];
}

/**
 * Detect circular import dependencies in a repository using Tarjan's Strongly
 * Connected Components (SCC) algorithm and recommend the minimum-weight edge to
 * break each cycle (`F4-2`: Circular Dependency Unwinder).
 *
 * @param {string} root - Repository root directory
 * @param {object} [options]
 * @param {object} [options.graph] - Prebuilt `buildRepoGraph` result
 * @returns {object}
 */
export function findCircularDependencies(root, options = {}) {
  const absRoot = path.resolve(root || process.cwd());
  const graph = options.graph || buildRepoGraph(absRoot, { history: 0, redact: true });

  const nodePaths = Array.isArray(graph.nodes)
    ? graph.nodes.map((n) => n.path).filter(Boolean)
    : graph.nodes instanceof Map
      ? [...graph.nodes.keys()]
      : [];

  const vertices = [...new Set(nodePaths)].sort();
  const adjacency = new Map();
  const inDegree = new Map();

  for (const v of vertices) {
    adjacency.set(v, new Set());
    inDegree.set(v, 0);
  }

  if (Array.isArray(graph.edges)) {
    for (const edge of graph.edges) {
      if (!edge || !edge.from || !edge.to || edge.from === edge.to) continue;
      if (!adjacency.has(edge.from)) adjacency.set(edge.from, new Set());
      if (!vertices.includes(edge.from)) vertices.push(edge.from);
      if (!vertices.includes(edge.to)) vertices.push(edge.to);
      adjacency.get(edge.from).add(edge.to);
      inDegree.set(edge.to, (inDegree.get(edge.to) || 0) + 1);
    }
  } else if (graph.edges instanceof Map) {
    for (const [from, targets] of graph.edges.entries()) {
      if (!adjacency.has(from)) adjacency.set(from, new Set());
      for (const to of targets) {
        if (from === to) continue;
        adjacency.get(from).add(to);
        inDegree.set(to, (inDegree.get(to) || 0) + 1);
      }
    }
  }

  // Count cross-file symbol calls per edge (from -> to)
  const callEdgeWeights = new Map();
  const callSymbols = new Map();
  for (const ce of graph.callEdges || []) {
    const fromFile = ce.from || ce.fromFile;
    const toFile = ce.to || ce.toFile;
    const callee = ce.callee || ce.calleeSymbol;
    if (!fromFile || !toFile || fromFile === toFile) continue;
    const key = `${fromFile}->${toFile}`;
    callEdgeWeights.set(key, (callEdgeWeights.get(key) || 0) + (ce.weight || 1));
    if (!callSymbols.has(key)) callSymbols.set(key, new Set());
    if (callee) callSymbols.get(key).add(callee);
  }

  const sccs = findTarjanSCCs(vertices, adjacency);
  const cycles = [];

  for (const scc of sccs) {
    if (scc.length < 2) continue;

    const sccSorted = [...scc].sort();
    const cyclePath = reconstructCyclePath(sccSorted, adjacency);
    const sccSet = new Set(sccSorted);

    // Collect all internal edges within this SCC and score coupling cost
    const internalEdges = [];
    for (const u of sccSorted) {
      for (const v of adjacency.get(u) || []) {
        if (!sccSet.has(v)) continue;
        const key = `${u}->${v}`;
        const callCount = callEdgeWeights.get(key) || 0;
        const symbols = [...(callSymbols.get(key) || [])];
        internalEdges.push({
          from: u,
          to: v,
          callCount,
          symbols,
          couplingScore: callCount * 10 + (inDegree.get(v) || 1),
        });
      }
    }

    internalEdges.sort((a, b) => a.couplingScore - b.couplingScore || a.from.localeCompare(b.from));
    const bestBreak = internalEdges[0] || {
      from: sccSorted[0],
      to: sccSorted[1],
      callCount: 0,
      symbols: [],
    };

    const id = `CYCLE-${String(cycles.length + 1).padStart(2, '0')}`;
    cycles.push({
      id,
      files: sccSorted,
      cyclePath,
      length: sccSorted.length,
      recommendedBreakEdge: {
        from: bestBreak.from,
        to: bestBreak.to,
        callCount: bestBreak.callCount,
        symbols: bestBreak.symbols,
        suggestion:
          bestBreak.symbols.length > 0
            ? `Extract shared symbol(s) (${bestBreak.symbols.join(', ')}) from '${bestBreak.to}' into a dedicated shared module or pass via dependency injection to remove import '${bestBreak.from} -> ${bestBreak.to}'.`
            : `Remove or invert the low-coupling import '${bestBreak.from} -> ${bestBreak.to}' (0 direct AST symbol calls) by extracting shared constants/types.`,
      },
    });
  }

  cycles.sort((a, b) => b.length - a.length || a.files[0].localeCompare(b.files[0]));

  const mermaidLines = ['flowchart LR'];
  let nodeIdx = 0;
  const nodeIds = new Map();
  const getId = (f) => {
    if (!nodeIds.has(f)) {
      nodeIdx += 1;
      nodeIds.set(f, `N${nodeIdx}`);
    }
    return nodeIds.get(f);
  };

  for (const cycle of cycles) {
    for (let i = 0; i < cycle.cyclePath.length - 1; i++) {
      const u = cycle.cyclePath[i];
      const v = cycle.cyclePath[i + 1];
      const uId = getId(u);
      const vId = getId(v);
      const isBreak = cycle.recommendedBreakEdge.from === u && cycle.recommendedBreakEdge.to === v;
      const edgeArrow = isBreak ? '-. "break here" .->' : '-->';
      mermaidLines.push(`  ${uId}["${u}"] ${edgeArrow} ${vId}["${v}"]`);
    }
  }

  return {
    root: absRoot,
    totalFiles: vertices.length,
    cycleCount: cycles.length,
    cycles,
    mermaidDiagram: cycles.length > 0 ? mermaidLines.join('\n') : null,
  };
}

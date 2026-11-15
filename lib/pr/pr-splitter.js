import path from 'node:path';
import { buildRepoGraph } from '../map/index.js';

const TEST_FILE_RE =
  /(?:^|\/)(?:test|tests|__tests__|spec|specs)(?:\/|$)|\.(?:test|spec)\.[a-z0-9]+$/i;

function normalizeRel(filePath) {
  return String(filePath || '')
    .replace(/\\/g, '/')
    .replace(/^\.?\//, '');
}

/**
 * Atomic PR Splitter (`F3-3`).
 *
 * Partitions a set of changed files into independent, reviewable sub-PR groups
 * using connected components over the repository import & AST call graph, and orders
 * groups from foundation/leaf dependencies to higher-level consumers.
 *
 * @param {string} root - Repository root directory
 * @param {string[]} changedFiles - List of project-relative changed file paths
 * @param {object} [options={}]
 * @param {object} [options.graph] - Optional precomputed `buildRepoGraph` result
 */
export function splitPrIntoAtomicGroups(root, changedFiles = [], options = {}) {
  const absRoot = path.resolve(root || process.cwd());
  const normalizedChanged = [...new Set((changedFiles || []).map(normalizeRel).filter(Boolean))];
  if (normalizedChanged.length === 0) {
    return {
      totalFiles: 0,
      groupCount: 0,
      groups: [],
    };
  }

  const graph = options.graph || buildRepoGraph(absRoot, { history: 0, redact: true });
  const changedSet = new Set(normalizedChanged);

  // Build undirected adjacency among changed files + directed dependency tracking
  const undirected = new Map();
  const directedDeps = new Map();
  for (const f of normalizedChanged) {
    undirected.set(f, new Set());
    directedDeps.set(f, new Set());
  }

  const addLink = (from, to) => {
    if (!changedSet.has(from) || !changedSet.has(to) || from === to) return;
    undirected.get(from).add(to);
    undirected.get(to).add(from);
    directedDeps.get(from).add(to);
  };

  for (const edge of graph.edges || []) {
    addLink(normalizeRel(edge.from), normalizeRel(edge.to));
  }
  for (const ce of graph.callEdges || []) {
    addLink(normalizeRel(ce.from), normalizeRel(ce.to));
  }

  // Also link test files to changed files sharing the same stem
  for (const testFile of normalizedChanged.filter((f) => TEST_FILE_RE.test(f))) {
    const stem = path
      .basename(testFile)
      .replace(/\.(?:test|spec)\.[a-z0-9]+$/i, '')
      .toLowerCase();
    for (const prodFile of normalizedChanged.filter((f) => !TEST_FILE_RE.test(f))) {
      const prodStem = path.basename(prodFile, path.extname(prodFile)).toLowerCase();
      if (stem === prodStem || prodFile.toLowerCase().includes(stem)) {
        addLink(testFile, prodFile);
      }
    }
  }

  // Connected components via BFS
  const visited = new Set();
  const rawComponents = [];

  for (const file of normalizedChanged) {
    if (visited.has(file)) continue;
    const comp = [];
    const queue = [file];
    visited.add(file);

    while (queue.length > 0) {
      const curr = queue.shift();
      comp.push(curr);
      for (const neighbor of undirected.get(curr) || []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
    rawComponents.push(comp.sort());
  }

  const groups = rawComponents.map((files, idx) => {
    const productionFiles = files.filter((f) => !TEST_FILE_RE.test(f));
    const testFiles = files.filter((f) => TEST_FILE_RE.test(f));
    const primaryDir =
      productionFiles.length > 0
        ? path.posix.dirname(productionFiles[0])
        : path.posix.dirname(files[0]);

    let internalEdges = 0;
    for (const f of files) {
      for (const dep of directedDeps.get(f) || []) {
        if (files.includes(dep)) internalEdges += 1;
      }
    }

    return {
      id: `PR-PART-${idx + 1}`,
      scope: primaryDir === '.' ? 'root' : primaryDir,
      files,
      productionFiles,
      testFiles,
      internalEdges,
      suggestedTitle: `feat(${primaryDir === '.' ? 'core' : path.posix.basename(primaryDir)}): update ${productionFiles.length || files.length} module(s)`,
    };
  });

  return {
    totalFiles: normalizedChanged.length,
    groupCount: groups.length,
    groups,
  };
}

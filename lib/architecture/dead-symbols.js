import path from 'node:path';
import { buildRepoGraph, normalizeSymbolName } from '../map/index.js';

const ENTRYPOINT_FILE_RE =
  /(?:^|\/)(?:index|cli|main|server|app)\.[a-z0-9]+$|^bin\/|(?:^|\/)(?:test|tests|__tests__|spec|specs)\/|\.(?:test|spec)\.[a-z0-9]+$/i;

const LIFECYCLE_METHOD_NAMES = new Set([
  'constructor',
  'init',
  'start',
  'stop',
  'run',
  'close',
  'reset',
  'toJSON',
  'toString',
  'render',
]);

/**
 * Semantic Dead-Symbol & Orphan Export Hunter (`F3-1`).
 *
 * Uses the repository import graph, AST method declarations, and cross-file symbol
 * call graph (`buildRepoGraph`) to identify:
 *  - `orphanModules`: non-entrypoint source files with zero incoming imports and zero incoming calls
 *  - `deadSymbols`: functions/methods in non-entrypoint modules that have zero incoming cross-file
 *    calls and zero intra-file calls from other methods in the same file
 *
 * @param {string} root - Repository root directory
 * @param {object} [options={}]
 * @param {object} [options.graph] - Optional prebuilt `buildRepoGraph` result
 * @param {string[]} [options.ignoreFiles] - Optional glob/prefix list to ignore
 */
export function findDeadSymbols(root, options = {}) {
  const absRoot = path.resolve(root || process.cwd());
  const graph = options.graph || buildRepoGraph(absRoot, { history: 0, redact: true });

  const incomingImports = new Map();
  for (const edge of graph.edges || []) {
    if (!edge || !edge.to || edge.from === edge.to) continue;
    incomingImports.set(edge.to, (incomingImports.get(edge.to) || 0) + 1);
  }

  const incomingCallsByFile = new Map();
  const incomingCallsBySymbol = new Map();
  for (const ce of graph.callEdges || []) {
    if (!ce || !ce.to) continue;
    incomingCallsByFile.set(ce.to, (incomingCallsByFile.get(ce.to) || 0) + 1);
    const symKey = `${ce.to}:${normalizeSymbolName(ce.callee || '')}`;
    incomingCallsBySymbol.set(symKey, (incomingCallsBySymbol.get(symKey) || 0) + 1);
  }

  const orphanModules = [];
  const deadSymbols = [];
  let totalSymbols = 0;

  for (const node of graph.nodes || []) {
    if (!node || !node.path) continue;
    const filePath = node.path;
    const isEntrypointOrTest = ENTRYPOINT_FILE_RE.test(filePath);
    const methods = Array.isArray(node.methods) ? node.methods : [];
    totalSymbols += methods.length;

    const impCount = incomingImports.get(filePath) || 0;
    const callCount = incomingCallsByFile.get(filePath) || 0;

    if (!isEntrypointOrTest && impCount === 0 && callCount === 0 && (node.symbolRefs || 0) === 0) {
      orphanModules.push({
        file: filePath,
        language: node.language || 'unknown',
        bytes: node.bytes || 0,
        methodCount: methods.length,
      });
    }

    if (isEntrypointOrTest) continue;

    // Collect intra-file called identifiers across all methods in this file
    const intraFileCalled = new Set();
    for (const m of methods) {
      for (const c of m.calls || []) {
        intraFileCalled.add(normalizeSymbolName(c));
      }
    }

    for (const m of methods) {
      if (!m || !m.name) continue;
      const normName = normalizeSymbolName(m.name);
      if (!normName || LIFECYCLE_METHOD_NAMES.has(m.name) || LIFECYCLE_METHOD_NAMES.has(normName)) {
        continue;
      }
      const symKey = `${filePath}:${normName}`;
      const crossFileCalls = incomingCallsBySymbol.get(symKey) || 0;
      const calledInternally = intraFileCalled.has(normName);

      if (crossFileCalls === 0 && !calledInternally && (node.symbolRefs || 0) === 0) {
        deadSymbols.push({
          file: filePath,
          name: m.name,
          line: m.line || 1,
          signature: m.signature || m.name,
          reason: impCount === 0 ? 'orphan_module_symbol' : 'unreferenced_symbol',
        });
      }
    }
  }

  return {
    scannedFiles: (graph.nodes || []).length,
    totalSymbols,
    orphanModules,
    deadSymbols,
    summary: {
      orphanModuleCount: orphanModules.length,
      deadSymbolCount: deadSymbols.length,
    },
  };
}

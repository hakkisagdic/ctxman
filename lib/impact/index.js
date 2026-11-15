/**
 * Blast Radius & Symbol Contract Simulator (`C-2`)
 *
 * Pre-change "What-If" impact simulator (`analyzeBlastRadius(root, target, options)`):
 *   - Resolves a target file or `file:symbol`
 *   - Computes 1-hop direct importers and 2-hop transitive dependents
 *   - Traces AST cross-file symbol callers (`caller -> callee` with line numbers)
 *   - Identifies the minimal affected test suite (`affectedTests` + runnable command)
 *   - Recommends code owners / reviewers via git history (`findExperts`)
 *   - Calculates a deterministic `blastScore` (0-100), `severity` (`low`|`medium`|`high`|`critical`),
 *     and a Mermaid (`flowchart LR`) blast radius diagram.
 */

import fs from 'fs';
import path from 'path';
import { buildRepoGraph, rankFiles, splitTargetSymbol, normalizeSymbolName } from '../map/index.js';
import { PackError } from '../pack/select.js';
import { findExperts } from '../who/index.js';

export class ImpactError extends PackError {
  constructor(code, message) {
    super(code, message);
    this.name = 'ImpactError';
  }
}

const TEST_PATH_RE =
  /(?:^|\/)(?:test|tests|__tests__|spec|specs)(?:\/|$)|\.(?:test|spec)\.[a-z0-9]+$/i;

const CRITICAL_PATH_RE =
  /(?:^|\/)(?:auth|security|policy|billing|payment|crypto|core|index\.[a-z0-9]+)(?:\/|$)/i;

function isTestFile(posixPath) {
  return TEST_PATH_RE.test(posixPath);
}

const toPosix = (p) => p.split(path.sep).join('/');

function resolveTarget(root, target, explicitSymbol = null) {
  const rootPath = path.resolve(root);
  if (!fs.statSync(rootPath, { throwIfNoEntry: false })?.isDirectory()) {
    throw new ImpactError('ROOT_NOT_FOUND', `Not a directory: ${root}`);
  }
  if (!target || typeof target !== 'string' || !target.trim()) {
    throw new ImpactError('INVALID_OPTION', 'Target file or file:symbol is required');
  }

  let rawPath = target.trim();
  let symbol = explicitSymbol ? String(explicitSymbol).trim() : null;

  const literalCandidate = path.resolve(rootPath, rawPath);
  if (!fs.existsSync(literalCandidate)) {
    const split = splitTargetSymbol(rawPath);
    if (split.symbol) {
      rawPath = split.pathPart;
      if (!symbol) symbol = split.symbol;
    }
  }

  const resolvedFile = path.resolve(rootPath, rawPath);
  const rel = path.relative(rootPath, resolvedFile);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new ImpactError('PATH_OUTSIDE_ROOT', `Target file is outside root: ${target}`);
  }

  if (!fs.statSync(resolvedFile, { throwIfNoEntry: false })?.isFile()) {
    throw new ImpactError('FILE_NOT_FOUND', `Target file not found: ${toPosix(rel)}`);
  }

  return {
    rootPath,
    targetRel: toPosix(rel),
    symbol: symbol || null,
  };
}

function sanitizeMermaidId(str, idx) {
  return `n${idx}_${String(str).replace(/[^a-zA-Z0-9_]/g, '_')}`;
}

/**
 * Build a Mermaid `flowchart LR` diagram showing incoming callers/importers and affected tests.
 */
export function buildBlastMermaidDiagram({
  targetRel,
  symbol,
  directImporters = [],
  transitiveImporters = [],
  directCallers = [],
  affectedTests = [],
}) {
  const lines = ['flowchart LR'];
  const targetLabel = symbol ? `${targetRel}:${symbol}` : targetRel;
  lines.push(`  target["🎯 ${targetLabel}"]`);

  const shownImporters = directImporters.filter((p) => !isTestFile(p)).slice(0, 6);
  shownImporters.forEach((imp, idx) => {
    const id = sanitizeMermaidId(imp, idx);
    lines.push(`  ${id}["📦 ${imp}"] -->|imports| target`);
  });

  const shownCallers = directCallers.slice(0, 6);
  shownCallers.forEach((call, idx) => {
    const id = sanitizeMermaidId(`${call.from}_${call.caller}`, idx + 20);
    lines.push(`  ${id}["⚡ ${call.from}:${call.caller}()"] -.->|calls ${call.callee}| target`);
  });

  const shownTransitive = transitiveImporters.filter((p) => !isTestFile(p)).slice(0, 4);
  shownTransitive.forEach((tr, idx) => {
    const id = sanitizeMermaidId(tr, idx + 40);
    lines.push(`  ${id}["🔗 ${tr} (2-hop)"] -.->|transitive| target`);
  });

  const shownTests = affectedTests.slice(0, 6);
  shownTests.forEach((testFile, idx) => {
    const id = sanitizeMermaidId(testFile, idx + 60);
    lines.push(`  target -->|verify| ${id}["🧪 ${testFile}"]`);
  });

  return lines.join('\n');
}

/**
 * Format Blast Radius result as a clean Markdown report.
 */
export function formatBlastRadiusReport(result) {
  const targetTitle = result.target.symbol
    ? `${result.target.file}:${result.target.symbol}`
    : result.target.file;

  const lines = [
    `# Blast Radius Analysis: \`${targetTitle}\``,
    '',
    `- **Blast Score:** **${result.blastScore}/100** (\`${result.severity.toUpperCase()}\`)`,
    `- **Direct Production Importers (1-hop):** ${result.directImporters.length}`,
    `- **Transitive Dependents (2-hop+):** ${result.transitiveImporters.length}`,
    `- **Direct Symbol Call Sites:** ${result.directCallers.length}`,
    `- **Affected Test Files:** ${result.affectedTests.length}`,
  ];

  if (result.recommendedTestCommand) {
    lines.push(`- **Recommended Test Command:** \`${result.recommendedTestCommand}\``);
  }

  if (result.factors.length > 0) {
    lines.push('', '## Risk Factors');
    for (const f of result.factors) {
      lines.push(`- **${f.factor}** (+${f.points}): ${f.detail}`);
    }
  }

  if (result.directCallers.length > 0) {
    lines.push('', '## Direct Symbol Call Sites');
    for (const c of result.directCallers.slice(0, 15)) {
      lines.push(
        `- \`${c.from}:${c.callerLine}\` (\`${c.caller}\` calls \`${c.callee}\` at line ${c.calleeLine})`
      );
    }
  }

  if (result.affectedTests.length > 0) {
    lines.push('', '## Affected Test Suite');
    for (const t of result.affectedTests) {
      lines.push(`- \`${t}\``);
    }
  }

  if (result.reviewers.length > 0) {
    lines.push('', '## Recommended Reviewers');
    for (const r of result.reviewers) {
      lines.push(`- **${r.name}** <${r.email}> (score: ${r.score}, commits: ${r.commits})`);
    }
  }

  lines.push('', '## Blast Radius Diagram', '```mermaid', result.mermaidDiagram, '```');
  return lines.join('\n');
}

/**
 * Analyze the blast radius of modifying a file or symbol (`file:symbol`).
 *
 * @param {string} root - Project root directory
 * @param {string} target - Relative file path or `file:symbol`
 * @param {object} [options]
 * @param {string} [options.symbol] - Optional explicit symbol name
 * @param {number} [options.depth=2] - Max dependency hop depth (default: 2)
 * @param {boolean} [options.includeReviewers=true] - Query git history for recommended reviewers
 * @returns {object}
 */
export function analyzeBlastRadius(root, target, options = {}) {
  const maxDepth = Number.isInteger(options.depth) && options.depth >= 1 ? options.depth : 2;
  const { rootPath, targetRel, symbol } = resolveTarget(root, target, options.symbol);

  const graph = buildRepoGraph(rootPath, { history: 0, redact: true });
  const nodeMap = new Map(graph.nodes.map((n) => [n.path, n]));
  const targetNode = nodeMap.get(targetRel);

  const methods = (targetNode?.methods || []).map((m) => ({
    name: m.name,
    line: m.line,
    endLine: m.endLine,
    signature: m.signature || m.name,
  }));

  if (symbol) {
    const normSym = normalizeSymbolName(symbol);
    const exists = methods.some(
      (m) => m.name === symbol || normalizeSymbolName(m.name) === normSym
    );
    if (!exists) {
      throw new ImpactError('SYMBOL_NOT_FOUND', `Symbol "${symbol}" not found in ${targetRel}`);
    }
  }

  // Build reverse import adjacency: `imported -> Set<importer>`
  const reverseImports = new Map();
  for (const edge of graph.edges || []) {
    if (!reverseImports.has(edge.to)) reverseImports.set(edge.to, new Set());
    reverseImports.get(edge.to).add(edge.from);
  }

  // BFS up to maxDepth hops along reverseImports
  const hopDistances = new Map();
  const queue = [[targetRel, 0]];
  const visited = new Set([targetRel]);

  while (queue.length > 0) {
    const [current, dist] = queue.shift();
    if (dist >= maxDepth) continue;
    for (const importer of reverseImports.get(current) || []) {
      if (visited.has(importer)) continue;
      visited.add(importer);
      hopDistances.set(importer, dist + 1);
      queue.push([importer, dist + 1]);
    }
  }

  const allDirectImporters = [];
  const allTransitiveImporters = [];
  for (const [filePath, dist] of hopDistances.entries()) {
    if (dist === 1) allDirectImporters.push(filePath);
    else allTransitiveImporters.push(filePath);
  }

  // Filter symbol call edges targeting `targetRel` (and `symbol` when given)
  const normTargetSymbol = symbol ? normalizeSymbolName(symbol) : null;
  const directCallers = [];
  const callerFiles = new Set();

  for (const edge of graph.callEdges || []) {
    if (edge.to !== targetRel) continue;
    if (
      normTargetSymbol &&
      edge.callee !== symbol &&
      normalizeSymbolName(edge.callee) !== normTargetSymbol
    ) {
      continue;
    }
    directCallers.push({
      from: edge.from,
      caller: edge.caller,
      callerLine: edge.callerLine,
      callee: edge.callee,
      calleeLine: edge.calleeLine,
    });
    callerFiles.add(edge.from);
  }

  // Also check 2-hop callers (callers of files/functions in directCallers)
  const directCallerKeys = new Set(
    directCallers.map((c) => `${c.from}:${normalizeSymbolName(c.caller)}`)
  );
  const transitiveCallers = [];
  for (const edge of graph.callEdges || []) {
    if (edge.to === targetRel) continue;
    const calleeKey = `${edge.to}:${normalizeSymbolName(edge.callee)}`;
    if (directCallerKeys.has(calleeKey)) {
      transitiveCallers.push({
        from: edge.from,
        caller: edge.caller,
        callerLine: edge.callerLine,
        viaFile: edge.to,
        callee: edge.callee,
      });
    }
  }

  // Separate production dependents vs affected test files
  const affectedTestSet = new Set();
  for (const p of [...allDirectImporters, ...allTransitiveImporters, ...callerFiles]) {
    if (isTestFile(p)) affectedTestSet.add(p);
  }
  for (const tc of transitiveCallers) {
    if (isTestFile(tc.from)) affectedTestSet.add(tc.from);
  }

  // Also match conventional test file by stem if present in graph
  const baseStem = path.basename(targetRel, path.extname(targetRel)).toLowerCase();
  for (const node of graph.nodes) {
    if (isTestFile(node.path) && node.path.toLowerCase().includes(baseStem)) {
      affectedTestSet.add(node.path);
    }
  }

  const affectedTests = [...affectedTestSet].sort();
  const directProductionImporters = allDirectImporters.filter((p) => !isTestFile(p)).sort();
  const transitiveProductionImporters = allTransitiveImporters.filter((p) => !isTestFile(p)).sort();

  // Rank centrality score
  const ranked = rankFiles(graph, { focus: [targetRel], callGraph: true });
  const targetRankScore = ranked.find((r) => r.path === targetRel)?.score ?? 0;

  // Compute deterministic blastScore (0-100)
  const factors = [];
  let rawScore = 0;

  if (directProductionImporters.length > 0) {
    const pts = Math.min(35, directProductionImporters.length * 8);
    rawScore += pts;
    factors.push({
      factor: 'direct_importers',
      points: pts,
      detail: `${directProductionImporters.length} production module(s) directly import this target`,
    });
  }

  if (transitiveProductionImporters.length > 0) {
    const pts = Math.min(20, transitiveProductionImporters.length * 4);
    rawScore += pts;
    factors.push({
      factor: 'transitive_dependents',
      points: pts,
      detail: `${transitiveProductionImporters.length} module(s) transitively depend on this target`,
    });
  }

  if (directCallers.length > 0) {
    const pts = Math.min(25, directCallers.length * 5);
    rawScore += pts;
    factors.push({
      factor: 'symbol_call_sites',
      points: pts,
      detail: `${directCallers.length} cross-file AST call site(s) invoke symbol(s) in this target`,
    });
  }

  if (CRITICAL_PATH_RE.test(targetRel)) {
    const pts = 15;
    rawScore += pts;
    factors.push({
      factor: 'critical_surface',
      points: pts,
      detail: `Target is on a critical architecture/security/public entry path (${targetRel})`,
    });
  }

  if (affectedTests.length === 0 && directProductionImporters.length > 0) {
    const pts = 15;
    rawScore += pts;
    factors.push({
      factor: 'untested_dependents',
      points: pts,
      detail: 'No affected test files discovered for a module with production dependents',
    });
  }

  const blastScore = Math.min(100, Math.max(0, rawScore));
  const severity =
    blastScore >= 75 ? 'critical' : blastScore >= 50 ? 'high' : blastScore >= 25 ? 'medium' : 'low';

  let reviewers = [];
  if (options.includeReviewers !== false) {
    try {
      const who = findExperts(rootPath, targetRel, { limit: 3 });
      reviewers = (who?.experts || []).map((e) => ({
        name: e.name,
        email: e.email,
        commits: e.commits,
        score: e.score,
      }));
    } catch (_err) {
      reviewers = [];
    }
  }

  const recommendedTestCommand =
    affectedTests.length > 0 ? `npx vitest run ${affectedTests.slice(0, 10).join(' ')}` : null;

  const mermaidDiagram = buildBlastMermaidDiagram({
    targetRel,
    symbol,
    directImporters: directProductionImporters,
    transitiveImporters: transitiveProductionImporters,
    directCallers,
    affectedTests,
  });

  const result = {
    target: {
      file: targetRel,
      symbol,
      methods,
      centralityScore: Number(targetRankScore.toFixed(4)),
    },
    blastScore,
    severity,
    factors,
    directImporters: directProductionImporters,
    transitiveImporters: transitiveProductionImporters,
    directCallers,
    transitiveCallers,
    affectedTests,
    recommendedTestCommand,
    reviewers,
    mermaidDiagram,
  };

  return {
    ...result,
    markdown: formatBlastRadiusReport(result),
  };
}

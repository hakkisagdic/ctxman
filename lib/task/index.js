import fs from 'fs';
import path from 'path';
import { Scanner } from '../core/Scanner.js';
import { hybridSearch } from '../search/hybrid.js';
import { buildRepoGraph } from '../map/graph.js';
import { renderRepoMap } from '../map/render.js';
import { normalizeSymbolName } from '../map/call-graph.js';
import { compressCode } from '../pack/compress.js';
import { fitToTokenBudget } from '../search/bm25.js';
import { redactSecrets } from '../utils/secret-redactor.js';
import TokenUtils from '../utils/token-utils.js';
import {
  resolveWorkspaceRepos,
  enforceWorkspacePolicies,
  buildWorkspaceGraph,
  mapWorkspace,
  searchWorkspace,
} from '../workspace/index.js';

export const DEFAULT_TASK_BUDGET = 32000;
export const SUPPORTED_TASK_FORMATS = ['markdown', 'json', 'xml'];
const MAX_RENDERED_OMITTED = 12;

/**
 * Parse budget expression (e.g. 32000, "32k", "40k", "1m").
 * @param {number|string} budget
 * @param {number} defaultBudget
 * @returns {number}
 */
export function parseBudget(budget, defaultBudget = DEFAULT_TASK_BUDGET) {
  if (budget === undefined || budget === null || budget === '') return defaultBudget;
  if (typeof budget === 'number') {
    if (!Number.isInteger(budget) || budget <= 0) {
      throw new Error(`budget must be a positive integer, got ${budget}`);
    }
    return budget;
  }
  const match = /^(\d+(?:\.\d+)?)([km])?$/i.exec(String(budget).trim());
  const scale = { k: 1e3, m: 1e6 }[match?.[2]?.toLowerCase()] ?? 1;
  const value = match ? Math.round(Number(match[1]) * scale) : NaN;
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`budget must be a positive integer, got ${JSON.stringify(budget)}`);
  }
  return value;
}

const toPosix = (p) => p.split(path.sep).join('/');

/**
 * Computes intra-file helper closure starting from `symbolName` inside `node`.
 */
function intraFileClosure(node, symbolName) {
  const short = normalizeSymbolName(symbolName);
  const closure = new Set([symbolName, short].filter(Boolean));
  if (!node || !Array.isArray(node.methods)) return closure;

  const byName = new Map();
  for (const m of node.methods) {
    const mShort = normalizeSymbolName(m.name);
    if (!byName.has(mShort)) byName.set(mShort, []);
    byName.get(mShort).push(m);
  }

  const queue = [short];
  while (queue.length > 0) {
    const current = queue.shift();
    for (const m of byName.get(current) || []) {
      for (const called of m.calls || []) {
        const cShort = normalizeSymbolName(called);
        if (byName.has(cShort) && !closure.has(cShort)) {
          closure.add(cShort);
          queue.push(cShort);
        }
      }
    }
  }
  return closure;
}

export async function buildTaskContext(root, taskQuery, options = {}) {
  const query = typeof taskQuery === 'string' ? taskQuery.trim() : '';
  if (!query) {
    throw new Error('A task query is required');
  }

  const projectRoot = path.resolve(root);
  const budget = parseBudget(options.budget, DEFAULT_TASK_BUDGET);
  const format = options.format ? String(options.format).toLowerCase() : 'markdown';
  if (!SUPPORTED_TASK_FORMATS.includes(format)) {
    throw new Error(
      `Invalid format "${format}". Supported formats: ${SUPPORTED_TASK_FORMATS.join(', ')}`
    );
  }
  const redact = options.redact !== false;
  const useCallGraph = options.callGraph !== false;
  const searchMode = options.searchMode ?? 'hybrid';
  const seedLimit = Number.isInteger(options.limit) && options.limit > 0 ? options.limit : 5;

  const extraRepos = Array.isArray(options.repos) ? options.repos.filter(Boolean) : [];
  const isMultiRepo = extraRepos.length > 0;

  let resolvedRepos = null;
  let repoByAlias = null;
  let scannersByAlias = null;
  let scanner = null;

  if (isMultiRepo) {
    resolvedRepos = resolveWorkspaceRepos([projectRoot, ...extraRepos]);
    enforceWorkspacePolicies(resolvedRepos, {
      filesByRepo: new Map(),
      tokens: 0,
      redact,
      targetModel: options.model ?? null,
    });
    repoByAlias = new Map(resolvedRepos.map((r) => [r.alias, r]));
    scannersByAlias = new Map(
      resolvedRepos.map((r) => {
        const s = new Scanner(r.root);
        s.getPolicy();
        return [r.alias, s];
      })
    );
  } else {
    scanner = new Scanner(projectRoot);
    scanner.getPolicy();
  }

  const isPathDenied = (graphPath) => {
    const posix = toPosix(graphPath);
    if (!isMultiRepo) return scanner.isDenied(posix);
    const slashIdx = posix.indexOf('/');
    const alias = slashIdx > 0 ? posix.slice(0, slashIdx) : null;
    const repoScanner = alias ? scannersByAlias.get(alias) : null;
    if (!repoScanner) return false;
    return repoScanner.isDenied(posix.slice(alias.length + 1));
  };

  const resolveDiskPath = (graphPath) => {
    const posix = toPosix(graphPath);
    if (!isMultiRepo)
      return { fullPath: path.join(projectRoot, posix), repo: null, relativePath: posix };
    const slashIdx = posix.indexOf('/');
    const alias = slashIdx > 0 ? posix.slice(0, slashIdx) : null;
    const repo = alias ? repoByAlias.get(alias) : null;
    if (!repo) return { fullPath: null, repo: null, relativePath: posix };
    const relativePath = posix.slice(alias.length + 1);
    return { fullPath: path.join(repo.root, relativePath), repo: alias, relativePath };
  };

  let totalRedactions = 0;

  // 1. Search to find seed files and symbols
  let searchResult;
  try {
    if (isMultiRepo) {
      searchResult = searchWorkspace(resolvedRepos, query, {
        limit: seedLimit * 2,
        redact,
      });
    } else {
      searchResult = await hybridSearch(projectRoot, query, {
        limit: seedLimit * 2,
        mode: searchMode,
        redact,
      });
    }
  } catch (_error) {
    searchResult = { results: [] };
  }

  const seeds = [];
  const seedFileSet = new Set();
  const seedSymbolsByFile = new Map();
  for (const hit of searchResult.results || []) {
    const rel = toPosix(hit.file);
    if (isPathDenied(rel)) continue;
    if (hit.name) {
      if (!seedSymbolsByFile.has(rel)) seedSymbolsByFile.set(rel, new Set());
      seedSymbolsByFile.get(rel).add(hit.name);
      seedSymbolsByFile.get(rel).add(normalizeSymbolName(hit.name));
    }
    if (!seedFileSet.has(rel)) {
      seedFileSet.add(rel);
      seeds.push({
        file: rel,
        ...(hit.repo ? { repo: hit.repo } : {}),
        score: hit.score,
        kind: hit.kind,
        name: hit.name,
      });
      if (seeds.length >= seedLimit) break;
    }
  }

  // 2. Build repository or workspace graph (import edges + AST symbol call edges) for neighborhood traversal
  const graph = isMultiRepo
    ? buildWorkspaceGraph(resolvedRepos, { redact })
    : buildRepoGraph(projectRoot, { redact });
  const nodeByPath = new Map(graph.nodes.map((n) => [n.path, n]));

  const importOutgoing = new Map();
  const importIncoming = new Map();
  for (const edge of graph.edges) {
    if (!importOutgoing.has(edge.from)) importOutgoing.set(edge.from, new Set());
    importOutgoing.get(edge.from).add(edge.to);
    if (!importIncoming.has(edge.to)) importIncoming.set(edge.to, new Set());
    importIncoming.get(edge.to).add(edge.from);
  }

  const callOutgoing = new Map();
  const callIncoming = new Map();
  const callEdges = useCallGraph && Array.isArray(graph.callEdges) ? graph.callEdges : [];
  for (const ce of callEdges) {
    if (!callOutgoing.has(ce.from)) callOutgoing.set(ce.from, new Set());
    callOutgoing.get(ce.from).add(ce.to);
    if (!callIncoming.has(ce.to)) callIncoming.set(ce.to, new Set());
    callIncoming.get(ce.to).add(ce.from);
  }

  const hop0 = new Set(seeds.map((s) => s.file));
  if (hop0.size === 0 && graph.nodes.length > 0) {
    const topNode = graph.nodes[0].path;
    if (!isPathDenied(topNode)) {
      hop0.add(topNode);
      seeds.push({
        file: topNode,
        ...(graph.nodes[0].repo ? { repo: graph.nodes[0].repo } : {}),
        score: 1.0,
      });
    }
  }

  const hop1 = new Set();
  if (useCallGraph && callEdges.length > 0) {
    // 2a. Prioritize cross-file call edges directly originating from or targeting seed symbols
    const expandedSeedSymbols = new Map();
    for (const [file, symSet] of seedSymbolsByFile.entries()) {
      const node = nodeByPath.get(file);
      const fullClosure = new Set();
      for (const sym of symSet) {
        for (const c of intraFileClosure(node, sym)) fullClosure.add(c);
      }
      expandedSeedSymbols.set(file, fullClosure);
    }

    for (const ce of callEdges) {
      const callerSyms = expandedSeedSymbols.get(ce.from);
      if (
        callerSyms &&
        (callerSyms.has(ce.caller) || callerSyms.has(normalizeSymbolName(ce.caller))) &&
        !hop0.has(ce.to) &&
        !isPathDenied(ce.to)
      ) {
        hop1.add(ce.to);
      }
      const calleeSyms = expandedSeedSymbols.get(ce.to);
      if (
        calleeSyms &&
        (calleeSyms.has(ce.callee) || calleeSyms.has(normalizeSymbolName(ce.callee))) &&
        !hop0.has(ce.from) &&
        !isPathDenied(ce.from)
      ) {
        hop1.add(ce.from);
      }
    }

    // 2b. All 1-hop cross-file symbol call neighbors of seed files (including barrel-resolved calls)
    for (const node of hop0) {
      for (const out of callOutgoing.get(node) || []) {
        if (!hop0.has(out) && !isPathDenied(out)) hop1.add(out);
      }
      for (const inc of callIncoming.get(node) || []) {
        if (!hop0.has(inc) && !isPathDenied(inc)) hop1.add(inc);
      }
    }
  }

  // 2c. 1-hop module import neighbors of seed files
  for (const node of hop0) {
    for (const out of importOutgoing.get(node) || []) {
      if (!hop0.has(out) && !isPathDenied(out)) hop1.add(out);
    }
    for (const inc of importIncoming.get(node) || []) {
      if (!hop0.has(inc) && !isPathDenied(inc)) hop1.add(inc);
    }
  }

  const hop2 = new Set();
  if (useCallGraph && callEdges.length > 0) {
    // 2d. Prioritize 2-hop cross-file symbol call neighbors
    for (const node of hop1) {
      for (const out of callOutgoing.get(node) || []) {
        if (!hop0.has(out) && !hop1.has(out) && !isPathDenied(out)) hop2.add(out);
      }
      for (const inc of callIncoming.get(node) || []) {
        if (!hop0.has(inc) && !hop1.has(inc) && !isPathDenied(inc)) hop2.add(inc);
      }
    }
  }

  // 2e. 2-hop module import neighbors
  for (const node of hop1) {
    for (const out of importOutgoing.get(node) || []) {
      if (!hop0.has(out) && !hop1.has(out) && !isPathDenied(out)) hop2.add(out);
    }
    for (const inc of importIncoming.get(node) || []) {
      if (!hop0.has(inc) && !hop1.has(inc) && !isPathDenied(inc)) hop2.add(inc);
    }
  }

  // 3. Architectural Overview (token-bounded markdown summary)
  const mapBudget = Math.max(100, Math.min(Math.floor(budget * 0.15), 2500));
  const repoMapResult = isMultiRepo
    ? mapWorkspace(resolvedRepos, {
        tokens: mapBudget,
        focus: Array.from(hop0),
        callGraph: useCallGraph,
        redact,
        style: 'markdown',
      })
    : renderRepoMap(projectRoot, {
        tokens: mapBudget,
        focus: Array.from(hop0),
        callGraph: useCallGraph,
        redact,
        style: 'markdown',
      });
  const repoMapOutput = repoMapResult.output;
  const repoMapTokens = TokenUtils.calculate(repoMapOutput, 'repomap.md');

  // 4. Read & process files: Hop 0 and 1 full code, Hop 2 compressed signatures
  const fileCandidates = [];
  const addCandidate = (relPath, hop) => {
    const { fullPath, repo, relativePath } = resolveDiskPath(relPath);
    if (!fullPath || !fs.existsSync(fullPath)) return;
    try {
      let rawContent = fs.readFileSync(fullPath, 'utf-8');
      if (redact) {
        const red = redactSecrets(rawContent);
        rawContent = red.text;
        totalRedactions += red.findings.length;
      }

      let finalContent = rawContent;
      let compressed = false;

      if (hop === 2) {
        const comp = compressCode(rawContent, relPath);
        finalContent = comp.text;
        compressed = true;
      }

      const tokens = TokenUtils.calculate(finalContent, relPath);
      const lines = finalContent.split('\n').length;
      fileCandidates.push({
        path: relPath,
        ...(repo ? { repo, relativePath } : {}),
        hop,
        compressed,
        tokens,
        lines,
        content: finalContent,
        rawContent,
      });
    } catch {
      // Skip unreadable files
    }
  };

  for (const file of hop0) addCandidate(file, 0);
  for (const file of hop1) addCandidate(file, 1);
  for (const file of hop2) addCandidate(file, 2);

  // 5. Fit files within budget
  const envelopeReserve = format === 'json' ? Math.min(600, Math.floor(budget * 0.25)) : 240;
  let availableTokens = Math.max(0, budget - repoMapTokens - envelopeReserve);
  const perFileOverhead = format === 'json' ? 60 : 30;
  const packedFiles = [];
  const omitted = [];

  for (const candidate of fileCandidates) {
    const cost = candidate.tokens + perFileOverhead;
    if (availableTokens >= cost) {
      packedFiles.push(candidate);
      availableTokens -= cost;
      continue;
    }

    if (!candidate.compressed && availableTokens > perFileOverhead + 60) {
      const compText = compressCode(candidate.rawContent, candidate.path).text;
      const compTokens = TokenUtils.calculate(compText, candidate.path);
      if (availableTokens >= compTokens + perFileOverhead) {
        packedFiles.push({
          ...candidate,
          compressed: true,
          tokens: compTokens,
          lines: compText.split('\n').length,
          content: compText,
        });
        availableTokens -= compTokens + perFileOverhead;
        continue;
      }

      if (candidate.hop === 0 && packedFiles.length === 0) {
        const fitted = fitToTokenBudget(
          compTokens < candidate.tokens ? compText : candidate.content,
          availableTokens - perFileOverhead,
          candidate.path
        );
        if (fitted) {
          const fittedTokens = TokenUtils.calculate(fitted, candidate.path);
          packedFiles.push({
            ...candidate,
            compressed: true,
            tokens: fittedTokens,
            lines: fitted.split('\n').length,
            content: fitted,
          });
          availableTokens = Math.max(0, availableTokens - fittedTokens - perFileOverhead);
          continue;
        }
      }
    }

    omitted.push({ path: candidate.path, reason: 'exceeded budget' });
  }

  const filterRelevantCallEdges = (filesList) => {
    if (!useCallGraph || callEdges.length === 0) return [];
    const includedSet = new Set(filesList.map((f) => f.path));
    return callEdges.filter((ce) => includedSet.has(ce.from) && includedSet.has(ce.to));
  };

  // 6. Format document output (cap serialized omitted list so large graphs don't bloat JSON/XML)
  const targetExt = format === 'json' ? 'json' : format === 'xml' ? 'xml' : 'md';
  const summarizeOmitted = (omittedList) =>
    omittedList.length <= MAX_RENDERED_OMITTED
      ? omittedList
      : [
          ...omittedList.slice(0, MAX_RENDERED_OMITTED),
          {
            path: `... (+${omittedList.length - MAX_RENDERED_OMITTED} more files)`,
            reason: 'exceeded budget',
          },
        ];

  const workspaceReposMeta = isMultiRepo
    ? resolvedRepos.map(({ alias, root: rRoot }) => ({ alias, root: rRoot }))
    : null;

  const renderOutput = (filesList, omittedList) => {
    const activeCallEdges = filterRelevantCallEdges(filesList);

    if (format === 'markdown') {
      const sections = [];
      sections.push(`# Task Context: ${query}`);
      sections.push(`\n## Architectural Overview\n\n${repoMapOutput.trim()}`);

      if (seeds.length > 0) {
        sections.push('\n## Seed Discoveries');
        for (const s of seeds) {
          const details = [
            `score: ${s.score}`,
            s.kind ? `kind: ${s.kind}` : null,
            s.name ? `symbol: ${s.name}` : null,
          ]
            .filter(Boolean)
            .join(', ');
          sections.push(`- \`${s.file}\` (${details})`);
        }
      }

      sections.push('\n## Relevant Code Context');
      for (const f of filesList) {
        const hopLabel =
          f.hop === 0
            ? f.compressed
              ? 'seed · compressed'
              : 'seed · full code'
            : f.hop === 1
              ? f.compressed
                ? '1-hop neighbor · compressed'
                : '1-hop neighbor · full code'
              : '2-hop neighbor · signatures';
        sections.push(`\n### \`${f.path}\` (${hopLabel}, ${f.tokens} tokens)`);
        const ext = path.extname(f.path).slice(1) || '';
        sections.push(`\`\`\`${ext}\n${f.content.trimEnd()}\n\`\`\``);
      }

      if (omittedList.length > 0) {
        sections.push(`\n*${omittedList.length} file(s) omitted to fit token budget (${budget}).*`);
      }

      return sections.join('\n');
    }

    const displayedOmitted = summarizeOmitted(omittedList);
    if (format === 'json') {
      const doc = {
        query,
        budget,
        ...(workspaceReposMeta ? { repos: workspaceReposMeta } : {}),
        architecturalOverview: repoMapOutput.trim(),
        seeds,
        files: filesList.map((f) => ({
          path: f.path,
          ...(f.repo ? { repo: f.repo } : {}),
          hop: f.hop,
          compressed: f.compressed,
          tokens: f.tokens,
          lines: f.lines,
          content: f.content,
        })),
        callEdges: activeCallEdges,
        omittedCount: omittedList.length,
        omitted: displayedOmitted,
        redactions: { total: totalRedactions },
      };
      return JSON.stringify(doc, null, 2);
    }

    const out = [];
    out.push(`<task_context query="${escapeXml(query)}" budget="${budget}">`);
    out.push('  <overview>');
    out.push(`<![CDATA[\n${repoMapOutput}\n]]>`);
    out.push('  </overview>');
    out.push('  <seeds>');
    for (const s of seeds) {
      out.push(
        `    <seed file="${escapeXml(s.file)}" score="${s.score}"${s.name ? ` symbol="${escapeXml(s.name)}"` : ''} />`
      );
    }
    out.push('  </seeds>');
    out.push('  <files>');
    for (const f of filesList) {
      out.push(
        `    <file path="${escapeXml(f.path)}" hop="${f.hop}" compressed="${f.compressed}" tokens="${f.tokens}">`
      );
      out.push(`<![CDATA[\n${f.content}\n]]>`);
      out.push('    </file>');
    }
    out.push('  </files>');
    if (displayedOmitted.length > 0) {
      out.push(`  <omitted total="${omittedList.length}">`);
      for (const o of displayedOmitted) {
        out.push(`    <file path="${escapeXml(o.path)}" reason="${escapeXml(o.reason)}" />`);
      }
      out.push('  </omitted>');
    }
    out.push('</task_context>');
    return out.join('\n');
  };

  let renderedText = renderOutput(packedFiles, omitted);
  let finalTokens = TokenUtils.calculate(renderedText, `task.${targetExt}`);
  while (finalTokens > budget && packedFiles.length > 1) {
    const dropped = packedFiles.pop();
    omitted.push({ path: dropped.path, reason: 'exceeded budget' });
    renderedText = renderOutput(packedFiles, omitted);
    finalTokens = TokenUtils.calculate(renderedText, `task.${targetExt}`);
  }
  if (finalTokens > budget && packedFiles.length === 1) {
    const sole = packedFiles[0];
    const targetFileTokens = Math.max(40, sole.tokens - (finalTokens - budget) - 40);
    const trimmed = fitToTokenBudget(sole.content, targetFileTokens, sole.path);
    if (trimmed) {
      sole.content = trimmed;
      sole.compressed = true;
      sole.tokens = TokenUtils.calculate(trimmed, sole.path);
      sole.lines = trimmed.split('\n').length;
      renderedText = renderOutput(packedFiles, omitted);
      finalTokens = TokenUtils.calculate(renderedText, `task.${targetExt}`);
    }
  }

  if (isMultiRepo) {
    const filesByRepo = new Map(resolvedRepos.map((r) => [r.alias, []]));
    for (const f of packedFiles) {
      if (f.repo && filesByRepo.has(f.repo)) {
        filesByRepo.get(f.repo).push({ path: f.relativePath, tokens: f.tokens });
      }
    }
    enforceWorkspacePolicies(resolvedRepos, {
      filesByRepo,
      tokens: finalTokens,
      redact,
      targetModel: options.model ?? null,
    });
  }

  if (options.output) {
    const outPath = path.resolve(options.output);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, renderedText, 'utf-8');
  }

  const finalCallEdges = filterRelevantCallEdges(packedFiles);

  return {
    query,
    format,
    budget,
    totalTokens: finalTokens,
    text: renderedText,
    ...(workspaceReposMeta ? { repos: workspaceReposMeta } : {}),
    seeds,
    files: packedFiles.map((f) => ({
      path: f.path,
      ...(f.repo ? { repo: f.repo } : {}),
      hop: f.hop,
      compressed: f.compressed,
      tokens: f.tokens,
      lines: f.lines,
    })),
    callEdges: finalCallEdges,
    omitted,
    redactions: { total: totalRedactions },
  };
}

function escapeXml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export default buildTaskContext;

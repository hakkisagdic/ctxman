import fs from 'fs';
import path from 'path';
import { Scanner } from '../core/Scanner.js';
import { hybridSearch } from '../search/hybrid.js';
import { buildRepoGraph } from '../map/graph.js';
import { renderRepoMap } from '../map/render.js';
import { compressCode } from '../pack/compress.js';
import { fitToTokenBudget } from '../search/bm25.js';
import { redactSecrets } from '../utils/secret-redactor.js';
import TokenUtils from '../utils/token-utils.js';

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
  const searchMode = options.searchMode ?? 'hybrid';
  const seedLimit = Number.isInteger(options.limit) && options.limit > 0 ? options.limit : 5;

  const scanner = new Scanner(projectRoot);
  scanner.getPolicy();
  let totalRedactions = 0;

  // 1. Hybrid search to find seed files and symbols
  let searchResult;
  try {
    searchResult = await hybridSearch(projectRoot, query, {
      limit: seedLimit * 2,
      mode: searchMode,
      redact,
    });
  } catch (_error) {
    searchResult = { results: [] };
  }

  const seeds = [];
  const seedFileSet = new Set();
  for (const hit of searchResult.results || []) {
    const rel = toPosix(hit.file);
    if (scanner.isDenied(rel)) continue;
    if (!seedFileSet.has(rel)) {
      seedFileSet.add(rel);
      seeds.push({
        file: rel,
        score: hit.score,
        kind: hit.kind,
        name: hit.name,
      });
      if (seeds.length >= seedLimit) break;
    }
  }

  // 2. Build repository graph for neighborhood traversal
  const graph = buildRepoGraph(projectRoot, { redact });
  const outgoing = new Map();
  const incoming = new Map();
  for (const edge of graph.edges) {
    if (!outgoing.has(edge.from)) outgoing.set(edge.from, new Set());
    outgoing.get(edge.from).add(edge.to);
    if (!incoming.has(edge.to)) incoming.set(edge.to, new Set());
    incoming.get(edge.to).add(edge.from);
  }

  const hop0 = new Set(seeds.map((s) => s.file));
  if (hop0.size === 0 && graph.nodes.length > 0) {
    const topNode = graph.nodes[0].path;
    if (!scanner.isDenied(topNode)) {
      hop0.add(topNode);
      seeds.push({ file: topNode, score: 1.0 });
    }
  }

  const hop1 = new Set();
  for (const node of hop0) {
    for (const out of outgoing.get(node) || []) {
      if (!hop0.has(out) && !scanner.isDenied(out)) hop1.add(out);
    }
    for (const inc of incoming.get(node) || []) {
      if (!hop0.has(inc) && !scanner.isDenied(inc)) hop1.add(inc);
    }
  }

  const hop2 = new Set();
  for (const node of hop1) {
    for (const out of outgoing.get(node) || []) {
      if (!hop0.has(out) && !hop1.has(out) && !scanner.isDenied(out)) hop2.add(out);
    }
    for (const inc of incoming.get(node) || []) {
      if (!hop0.has(inc) && !hop1.has(inc) && !scanner.isDenied(inc)) hop2.add(inc);
    }
  }

  // 3. Architectural Overview (token-bounded markdown summary)
  const mapBudget = Math.max(100, Math.min(Math.floor(budget * 0.15), 2500));
  const repoMapResult = renderRepoMap(projectRoot, {
    tokens: mapBudget,
    focus: Array.from(hop0),
    redact,
    style: 'markdown',
  });
  const repoMapOutput = repoMapResult.output;
  const repoMapTokens = TokenUtils.calculate(repoMapOutput, 'repomap.md');

  // 4. Read & process files: Hop 0 and 1 full code, Hop 2 compressed signatures
  const fileCandidates = [];
  const addCandidate = (relPath, hop) => {
    const fullPath = path.join(projectRoot, relPath);
    if (!fs.existsSync(fullPath)) return;
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

  const renderOutput = (filesList, omittedList) => {
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
        architecturalOverview: repoMapOutput.trim(),
        seeds,
        files: filesList.map((f) => ({
          path: f.path,
          hop: f.hop,
          compressed: f.compressed,
          tokens: f.tokens,
          lines: f.lines,
          content: f.content,
        })),
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

  if (options.output) {
    const outPath = path.resolve(options.output);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, renderedText, 'utf-8');
  }

  return {
    query,
    format,
    budget,
    totalTokens: finalTokens,
    text: renderedText,
    seeds,
    files: packedFiles.map((f) => ({
      path: f.path,
      hop: f.hop,
      compressed: f.compressed,
      tokens: f.tokens,
      lines: f.lines,
    })),
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

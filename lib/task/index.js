import fs from 'fs';
import path from 'path';
import { Scanner } from '../core/Scanner.js';
import { hybridSearch } from '../search/hybrid.js';
import { buildRepoGraph } from '../map/graph.js';
import { renderRepoMap } from '../map/render.js';
import { compressCode } from '../pack/compress.js';
import { redactSecrets } from '../utils/secret-redactor.js';
import TokenUtils from '../utils/token-utils.js';

export const DEFAULT_TASK_BUDGET = 32000;
export const SUPPORTED_TASK_FORMATS = ['markdown', 'json', 'xml'];

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
 * Discovers seed files and builds task-driven context:
 * - Hybrid search to discover seed files & symbols
 * - 1-hop full code + 2-hop compressed signatures
 * - Architectural repo map overview header
 * - Strictly bounded within token budget
 * - Enforces Scanner policy rules and secret redaction
 *
 * @param {string} root - Project root directory
 * @param {string} taskQuery - Goal or task description
 * @param {Object} [options]
 * @param {number|string} [options.budget=32000] - Token budget
 * @param {'markdown'|'json'|'xml'} [options.format='markdown'] - Output format
 * @param {string} [options.searchMode='hybrid'] - Search mode ('hybrid'|'bm25'|'semantic')
 * @param {boolean} [options.redact=true] - Redact secrets
 * @param {string} [options.output] - Output file path
 * @param {string} [options.model] - Target model identifier
 * @param {number} [options.limit=5] - Number of seed files
 * @returns {Promise<{
 *   query: string,
 *   format: string,
 *   budget: number,
 *   totalTokens: number,
 *   text: string,
 *   seeds: Array<{file: string, score: number, kind?: string, name?: string}>,
 *   files: Array<{path: string, hop: number, compressed: boolean, tokens: number, lines: number}>,
 *   omitted: Array<{path: string, reason: string}>,
 *   redactions: {total: number}
 * }>}
 */
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
    // If hybrid search fails, degrade gracefully
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

  // BFS hop collection
  // Hop 0: seed files
  // Hop 1: direct imports & importers
  // Hop 2: 2-hop neighbors
  const hop0 = new Set(seeds.map((s) => s.file));
  // If no seeds from search, pick top ranked file from graph
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

  // 3. Architectural Overview: renderRepoMap
  const mapBudget = Math.min(Math.floor(budget * 0.15), 3000);
  const repoMapResult = renderRepoMap(projectRoot, {
    tokens: mapBudget,
    focus: Array.from(hop0),
    redact,
    style: format === 'json' ? 'json' : 'markdown',
  });
  const repoMapOutput = repoMapResult.output;
  const repoMapTokens = TokenUtils.calculate(repoMapOutput, 'repomap.txt');

  // 4. Read & process files: Hop 0 and 1 full code, Hop 2 compressed signatures
  const fileCandidates = [];
  const addCandidate = (relPath, hop) => {
    const fullPath = path.join(projectRoot, relPath);
    if (!fs.existsSync(fullPath)) return;
    try {
      const content = fs.readFileSync(fullPath, 'utf-8');
      let finalContent = content;
      let compressed = false;

      if (hop === 2) {
        // Compress function bodies to signatures
        const comp = compressCode(content, relPath);
        finalContent = comp.text;
        compressed = true;
      }

      if (redact) {
        const red = redactSecrets(finalContent);
        finalContent = red.text;
        totalRedactions += red.findings.length;
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
      });
    } catch {
      // Skip unreadable files
    }
  };

  for (const file of hop0) addCandidate(file, 0);
  for (const file of hop1) addCandidate(file, 1);
  for (const file of hop2) addCandidate(file, 2);

  // 5. Fit files within budget
  const packedFiles = [];
  const omitted = [];
  let availableTokens = budget - repoMapTokens - 200; // 200 tokens buffer for headers & seeds

  for (const candidate of fileCandidates) {
    const cost = candidate.tokens + 30;
    if (availableTokens >= cost) {
      packedFiles.push(candidate);
      availableTokens -= cost;
    } else {
      omitted.push({ path: candidate.path, reason: 'exceeded budget' });
    }
  }

  // 6. Format document output
  let renderedText = '';
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
    for (const f of packedFiles) {
      const hopLabel =
        f.hop === 0
          ? 'seed · full code'
          : f.hop === 1
            ? '1-hop neighbor · full code'
            : '2-hop neighbor · signatures';
      sections.push(`\n### \`${f.path}\` (${hopLabel}, ${f.tokens} tokens)`);
      const ext = path.extname(f.path).slice(1) || '';
      sections.push(`\`\`\`${ext}\n${f.content.trimEnd()}\n\`\`\``);
    }

    if (omitted.length > 0) {
      sections.push(`\n*${omitted.length} file(s) omitted to fit token budget (${budget}).*`);
    }

    renderedText = sections.join('\n');
  } else if (format === 'json') {
    const doc = {
      query,
      budget,
      architecturalOverview:
        repoMapResult.style === 'json' ? JSON.parse(repoMapOutput) : repoMapOutput,
      seeds,
      files: packedFiles.map((f) => ({
        path: f.path,
        hop: f.hop,
        compressed: f.compressed,
        tokens: f.tokens,
        lines: f.lines,
        content: f.content,
      })),
      omitted,
      redactions: { total: totalRedactions },
    };
    renderedText = JSON.stringify(doc, null, 2);
  } else if (format === 'xml') {
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
    for (const f of packedFiles) {
      out.push(
        `    <file path="${escapeXml(f.path)}" hop="${f.hop}" compressed="${f.compressed}" tokens="${f.tokens}">`
      );
      out.push(`<![CDATA[\n${f.content}\n]]>`);
      out.push('    </file>');
    }
    out.push('  </files>');
    if (omitted.length > 0) {
      out.push('  <omitted>');
      for (const o of omitted) {
        out.push(`    <file path="${escapeXml(o.path)}" reason="${escapeXml(o.reason)}" />`);
      }
      out.push('  </omitted>');
    }
    out.push('</task_context>');
    renderedText = out.join('\n');
  }

  const finalTokens = TokenUtils.calculate(
    renderedText,
    `task.${format === 'json' ? 'json' : format === 'xml' ? 'xml' : 'md'}`
  );

  // Write to output file if requested
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

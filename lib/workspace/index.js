/**
 * Multi-Repository Workspace Context (`--repo <dir>`)
 *
 * Aggregates multiple repositories under `<repoAlias>/<relativePath>` namespaces while
 * sharing a single global token budget across:
 *   - `mapWorkspace(repos, options)`    -> unified ranked repository map
 *   - `searchWorkspace(repos, query, options)` -> unified BM25 chunk search
 *   - `packWorkspace(repos, options)`   -> unified packed LLM document (xml/markdown/plain/json)
 *
 * Every repository's own `.gitignore`, `.contextignore`, `.contextinclude`, and
 * `.ctxman/policy.json` rules are enforced independently before merging.
 */

import fs from 'fs';
import path from 'path';
import MethodAnalyzer from '../analyzers/method-analyzer.js';
import TokenUtils from '../utils/token-utils.js';
import { LLMDetector } from '../utils/llm-detector.js';
import { redactSecrets } from '../utils/secret-redactor.js';
import { loadPolicy } from '../policy/index.js';
import { enforceExport } from '../policy/enforce.js';
import {
  buildRepoGraph,
  rankFiles,
  resolveFocus,
  renderBlock,
  renderGraph,
  normalizeMapOptions,
} from '../map/index.js';
import {
  BM25Index,
  tokenize,
  getProjectIndex,
  sliceLines,
  fitToTokenBudget,
  compareStrings,
  DEFAULT_LIMIT,
  DEFAULT_MAX_TOKENS,
  WINDOW_LINES,
} from '../search/bm25.js';
import { selectFiles, PackError } from '../pack/select.js';
import { compressCode } from '../pack/compress.js';
import { buildTree } from '../pack/tree.js';
import { rankEntries, fitToBudget } from '../pack/budget.js';
import { splitIntoParts } from '../pack/split.js';
import { getRenderer, STYLES as PACK_STYLES } from '../pack/renderers/index.js';
import { addLineNumbers, DEFAULT_MAX_FILE_SIZE } from '../pack/index.js';

const toPosix = (p) => String(p).split(path.sep).join('/');
const countMapTokens = (text) => (text ? TokenUtils.calculate(text, 'map.txt') : 0);
const round = (value, digits) => Number(value.toFixed(digits));

const MARKDOWN_MAP_TITLE = '# Workspace repository map';
const MIN_BLOCK_TOKENS = 4;
const CHARS_PER_TOKEN_CEILING = 10;
const OMITTED_LISTED = 20;
const BINARY_SNIFF_BYTES = 8000;

function sanitizeAlias(raw) {
  const cleaned = String(raw || 'repo')
    .trim()
    .replace(/[\\/]+/g, '-')
    .replace(/^\.+/, '');
  return cleaned || 'repo';
}

/**
 * Resolve, validate, deduplicate, and assign unique aliases to workspace repositories.
 * Loads each repository's export policy immediately so invalid policy configs fail fast.
 *
 * @param {Array<string|{path: string, alias?: string}>} repos
 * @returns {Array<{alias: string, root: string, realRoot: string, policy: import('../policy/policy.js').Policy}>}
 */
export function resolveWorkspaceRepos(repos) {
  if (!Array.isArray(repos) || repos.length === 0) {
    throw new Error('At least one repository path is required');
  }

  const rawEntries = [];
  const seenRealRoots = new Set();

  for (const item of repos) {
    const rawPath = typeof item === 'string' ? item : item?.path;
    const explicitAlias = typeof item === 'object' && item !== null ? item.alias : undefined;
    if (typeof rawPath !== 'string' || !rawPath.trim()) {
      throw new Error('Repository path must be a non-empty string');
    }
    const resolved = path.resolve(rawPath);
    if (!fs.statSync(resolved, { throwIfNoEntry: false })?.isDirectory()) {
      throw new Error(`Not a directory: ${rawPath}`);
    }
    const realRoot = fs.realpathSync(resolved);
    if (seenRealRoots.has(realRoot)) continue;
    seenRealRoots.add(realRoot);

    const policy = loadPolicy(resolved);
    rawEntries.push({
      root: resolved,
      realRoot,
      explicitAlias: explicitAlias ? sanitizeAlias(explicitAlias) : null,
      baseName: sanitizeAlias(path.basename(resolved) || path.basename(realRoot) || 'repo'),
      parentName: sanitizeAlias(path.basename(path.dirname(resolved))),
      policy,
    });
  }

  // Count basename collisions among entries without explicit aliases
  const baseCounts = new Map();
  for (const entry of rawEntries) {
    const candidate = entry.explicitAlias ?? entry.baseName;
    baseCounts.set(candidate, (baseCounts.get(candidate) ?? 0) + 1);
  }

  const usedAliases = new Set();
  return rawEntries.map((entry) => {
    let candidate = entry.explicitAlias ?? entry.baseName;
    if (!entry.explicitAlias && (baseCounts.get(candidate) ?? 0) > 1 && entry.parentName) {
      candidate = `${entry.parentName}-${entry.baseName}`;
    }
    let unique = candidate;
    let suffix = 2;
    while (usedAliases.has(unique)) {
      unique = `${candidate}-${suffix++}`;
    }
    usedAliases.add(unique);
    return {
      alias: unique,
      root: entry.root,
      realRoot: entry.realRoot,
      policy: entry.policy,
    };
  });
}

function enforceWorkspacePolicies(resolvedRepos, { filesByRepo, tokens, redact, targetModel }) {
  for (const repo of resolvedRepos) {
    if (!repo.policy?.active) continue;
    enforceExport(repo.policy, {
      files: filesByRepo?.get(repo.alias) ?? [],
      tokens,
      redact,
      targetModel: targetModel ?? null,
    });
  }
}

// ============================================================================
// 1. Multi-Repo Map (`mapWorkspace`)
// ============================================================================

function splitRepoFocus(resolvedRepos, focusList) {
  const perRepo = new Map(resolvedRepos.map((r) => [r.alias, []]));
  const unmatched = [];

  for (const raw of focusList ?? []) {
    const posix = toPosix(raw).replace(/^\/+/, '');
    let matchedAny = false;

    for (const repo of resolvedRepos) {
      if (posix === repo.alias) {
        // Focusing an entire repo alias boosts all top-level entries in that repo
        perRepo.get(repo.alias).push('.');
        matchedAny = true;
      } else if (posix.startsWith(`${repo.alias}/`)) {
        const sub = posix.slice(repo.alias.length + 1);
        if (sub) {
          perRepo.get(repo.alias).push(sub);
          matchedAny = true;
        }
      } else if (fs.existsSync(path.resolve(repo.root, raw))) {
        perRepo.get(repo.alias).push(raw);
        matchedAny = true;
      }
    }

    if (!matchedAny) unmatched.push(raw);
  }

  return { perRepo, unmatched };
}

function describeWorkspaceFile(node, row, analyzer) {
  let content = '';
  try {
    content = fs.readFileSync(node.absolutePath, 'utf-8');
  } catch (_error) {
    // File removed after scan
  }
  const sources = content
    ? analyzer.extractMethodSources(content, node.methods, node.absolutePath)
    : [];
  return {
    path: node.path,
    repo: node.repo,
    rank: row.rank,
    score: row.score,
    tokens: content ? TokenUtils.calculate(content, node.absolutePath) : 0,
    methods: node.methods.map((method, i) => ({
      line: method.line,
      name: method.name,
      signature: method.signature,
      tokens: sources[i] ? TokenUtils.calculate(sources[i], node.absolutePath) : 0,
    })),
  };
}

function displayMapOrder(chosen, opts) {
  if (opts.order === 'path') {
    return [...chosen].sort((a, b) => compareStrings(a.entry.path, b.entry.path));
  }
  return opts.importantLast ? [...chosen].reverse() : [...chosen];
}

function selectWorkspaceMapFiles(nodesByPath, ranked, opts) {
  const style = opts.style === 'markdown' ? 'markdown' : 'text';
  const analyzer = new MethodAnalyzer();
  const separator = style === 'markdown' ? '\n\n' : '\n';
  const chosen = [];
  let used = style === 'markdown' ? countMapTokens(`${MARKDOWN_MAP_TITLE}${separator}`) : 0;
  let skipped = 0;

  for (const row of ranked) {
    const remaining = opts.tokens - used;
    if (remaining < MIN_BLOCK_TOKENS) {
      skipped += ranked.length - row.rank + 1;
      break;
    }
    const node = nodesByPath.get(row.path);
    const characters = node.methods.reduce(
      (sum, method) => sum + method.signature.length,
      row.path.length
    );
    if (characters / CHARS_PER_TOKEN_CEILING > remaining) {
      skipped++;
      continue;
    }
    const skeleton = renderBlock(style, {
      path: row.path,
      score: row.score,
      tokens: 0,
      methods: node.methods.map((method) => ({
        line: method.line,
        name: method.name,
        signature: method.signature,
        tokens: 0,
      })),
    });
    if (countMapTokens(skeleton + separator) > remaining) {
      skipped++;
      continue;
    }
    const entry = describeWorkspaceFile(node, row, analyzer);
    const block = renderBlock(style, entry);
    const cost = countMapTokens(block + separator);
    if (cost > remaining) {
      skipped++;
      continue;
    }
    chosen.push({ entry, block });
    used += cost;
  }

  for (;;) {
    const ordered = displayMapOrder(chosen, opts);
    const blocks = ordered.map((item) => item.block);
    if (style === 'markdown' && blocks.length > 0) blocks.unshift(MARKDOWN_MAP_TITLE);
    const output = blocks.length > 0 ? `${blocks.join(separator)}\n` : '';
    const tokens = countMapTokens(output);
    if (tokens <= opts.tokens || chosen.length === 0) {
      return { files: ordered.map((item) => item.entry), output, tokens, skipped };
    }
    chosen.pop();
    skipped++;
  }
}

/**
 * Build, rank, and render a unified repository map across multiple repositories under a
 * single shared token budget.
 *
 * @param {Array<string|{path: string, alias?: string}>} repos
 * @param {object} [options] - Same options as `renderRepoMap`
 * @returns {object}
 */
export function mapWorkspace(repos, options = {}) {
  const started = performance.now();
  const resolvedRepos = resolveWorkspaceRepos(repos);
  const opts = normalizeMapOptions(options);

  // Enforce redaction policy upfront if --no-redact was requested
  enforceWorkspacePolicies(resolvedRepos, {
    filesByRepo: new Map(),
    tokens: 0,
    redact: opts.redact,
  });

  const warnings = [];
  const { perRepo: focusPerRepo, unmatched } = splitRepoFocus(resolvedRepos, opts.focus);
  for (const entry of unmatched) {
    warnings.push(`focus path matches no mapped file: ${entry}`);
  }

  const allNodes = [];
  const allEdges = [];
  const allCallEdges = [];
  const mergedRanked = [];
  const redactions = {};
  const skippedFiles = [];
  let totalCommits = 0;
  let anyHistoryAvailable = false;
  let unresolvedImports = 0;

  for (const repo of resolvedRepos) {
    const graph = buildRepoGraph(repo.root, {
      history: opts.history,
      redact: opts.redact,
      maxFileBytes: opts.maxFileBytes,
    });

    const repoFocusInputs = focusPerRepo.get(repo.alias) ?? [];
    const focus = repoFocusInputs.includes('.')
      ? { files: graph.nodes.map((n) => n.path), unmatched: [] }
      : resolveFocus(graph, repoFocusInputs);
    for (const u of focus.unmatched) {
      warnings.push(`focus path matches no mapped file in ${repo.alias}: ${u}`);
    }

    if (graph.history.available) {
      anyHistoryAvailable = true;
      totalCommits += graph.history.commits;
    }

    const ranked = rankFiles(graph, {
      focus: focus.files,
      callGraph: opts.callGraph,
      weights: opts.weights,
      damping: opts.damping,
    });

    for (const node of graph.nodes) {
      allNodes.push({
        ...node,
        repo: repo.alias,
        relativePath: node.path,
        path: `${repo.alias}/${node.path}`,
        absolutePath: path.join(repo.root, node.path),
      });
    }
    for (const edge of graph.edges) {
      allEdges.push({
        ...edge,
        repo: repo.alias,
        from: `${repo.alias}/${edge.from}`,
        to: `${repo.alias}/${edge.to}`,
      });
    }
    for (const edge of graph.callEdges || []) {
      allCallEdges.push({
        ...edge,
        repo: repo.alias,
        from: `${repo.alias}/${edge.from}`,
        to: `${repo.alias}/${edge.to}`,
      });
    }
    for (const row of ranked) {
      mergedRanked.push({
        ...row,
        repo: repo.alias,
        relativePath: row.path,
        path: `${repo.alias}/${row.path}`,
      });
    }

    unresolvedImports += graph.stats.unresolvedImports;
    for (const s of graph.stats.skipped) {
      skippedFiles.push({ ...s, path: `${repo.alias}/${s.path}` });
    }
    for (const [k, v] of Object.entries(graph.stats.redactions)) {
      redactions[k] = (redactions[k] ?? 0) + v;
    }
  }

  mergedRanked.sort((a, b) => b.score - a.score || compareStrings(a.path, b.path));
  mergedRanked.forEach((row, index) => {
    row.rank = index + 1;
  });

  const workspaceGraph = {
    root: resolvedRepos.map((r) => r.root).join(path.delimiter),
    repos: resolvedRepos.map(({ alias, root }) => ({ alias, root })),
    nodes: allNodes,
    edges: allEdges,
    callEdges: allCallEdges,
    history: {
      requested: opts.history,
      commits: totalCommits,
      available: anyHistoryAvailable,
    },
    stats: {
      files: allNodes.length,
      edges: allEdges.length,
      callEdges: allCallEdges.length,
      unresolvedImports,
      skipped: skippedFiles,
      redactions,
      timings: { total: 0 },
    },
  };

  const nodesByPath = new Map(allNodes.map((n) => [n.path, n]));
  let output;
  let tokens;
  let files = [];
  let skipped = 0;

  if (opts.graph || opts.style === 'dot') {
    output = renderGraph(workspaceGraph, mergedRanked, opts.style, {
      callGraph: opts.callGraph,
    });
    tokens = countMapTokens(output);
  } else {
    const selection = selectWorkspaceMapFiles(nodesByPath, mergedRanked, opts);
    files = selection.files;
    skipped = selection.skipped;
    tokens = selection.tokens;
    if (opts.style === 'json') {
      const included = new Set(files.map((f) => f.path));
      output = `${JSON.stringify(
        {
          repos: workspaceGraph.repos,
          budget: opts.tokens,
          tokens,
          order: opts.order,
          importantLast: opts.importantLast,
          files: files.map((f) => ({ ...f, score: round(f.score, 6) })),
          nodes: mergedRanked.map((row) => ({
            path: row.path,
            repo: row.repo,
            rank: row.rank,
            score: round(row.score, 6),
            included: included.has(row.path),
          })),
          edges: allEdges.map((e) => ({ ...e, weight: round(e.weight, 6) })),
          callEdges: allCallEdges.map((e) => ({ ...e, weight: round(e.weight, 6) })),
          stats: {
            files: workspaceGraph.stats.files,
            edges: workspaceGraph.stats.edges,
            callEdges: workspaceGraph.stats.callEdges,
            unresolvedImports,
            skippedFiles,
          },
        },
        null,
        2
      )}\n`;
    } else {
      output = selection.output;
    }
    if (files.length === 0 && mergedRanked.length > 0) {
      warnings.push(`no file fits in ${opts.tokens} tokens`);
    }
  }

  workspaceGraph.stats.timings.total = performance.now() - started;

  return {
    output,
    style: opts.style,
    budget: opts.tokens,
    tokens,
    repos: workspaceGraph.repos,
    files,
    ranked: mergedRanked,
    graph: workspaceGraph,
    skipped,
    warnings,
    stats: workspaceGraph.stats,
  };
}

// ============================================================================
// 2. Multi-Repo Search (`searchWorkspace`)
// ============================================================================

/**
 * Ranked BM25 search across multiple repositories under a shared token budget.
 *
 * @param {Array<string|{path: string, alias?: string}>} repos
 * @param {string} query
 * @param {object} [options]
 * @param {number} [options.limit=10]
 * @param {number} [options.maxTokens=4000]
 * @param {boolean} [options.redact=true]
 * @param {number} [options.windowLines=40]
 * @returns {object}
 */
export function searchWorkspace(
  repos,
  query,
  {
    limit = DEFAULT_LIMIT,
    maxTokens = DEFAULT_MAX_TOKENS,
    redact = true,
    windowLines = WINDOW_LINES,
  } = {}
) {
  if (typeof query !== 'string' || !query.trim()) {
    throw new Error('The search query is empty');
  }
  const resolvedRepos = resolveWorkspaceRepos(repos);
  enforceWorkspacePolicies(resolvedRepos, {
    filesByRepo: new Map(),
    tokens: 0,
    redact,
  });

  const unifiedIndex = new BM25Index();
  let totalFiles = 0;

  for (const repo of resolvedRepos) {
    const project = getProjectIndex(repo.root, { windowLines });
    totalFiles += project.files.size;

    for (const entry of project.files.values()) {
      const prefixedPath = `${repo.alias}/${toPosix(entry.relativePath)}`;
      const pathTerms = tokenize(prefixedPath);
      const lines = entry.content.split('\n');
      for (const chunk of entry.chunks) {
        const text = redactSecrets(lines.slice(chunk.startLine - 1, chunk.endLine).join('\n')).text;
        const nameTerms = chunk.name ? tokenize(chunk.name) : [];
        unifiedIndex.add({ repo: repo.alias, prefixedPath, entry, chunk }, [
          ...tokenize(text),
          ...nameTerms,
          ...nameTerms,
          ...nameTerms,
          ...pathTerms,
        ]);
      }
    }
  }

  const hits = unifiedIndex.search(query, { limit });
  let used = 0;
  const results = hits.map(({ doc: { repo, prefixedPath, entry, chunk }, score }) => {
    const raw = sliceLines(entry.content, chunk.startLine, chunk.endLine);
    let text = redact ? redactSecrets(raw).text : raw;
    let tokens = TokenUtils.calculate(text, entry.path);

    const item = {
      repo,
      file: prefixedPath,
      name: chunk.name,
      kind: chunk.kind,
      ...(chunk.parent ? { parent: chunk.parent } : {}),
      startLine: chunk.startLine,
      endLine: chunk.endLine,
      score: Math.round(score * 10000) / 10000,
    };

    if (used + tokens > maxTokens) {
      text = fitToTokenBudget(text, maxTokens - used, entry.path);
      tokens = text ? TokenUtils.calculate(text, entry.path) : 0;
      item.truncated = true;
    }
    used += tokens;
    return { ...item, tokens, text: text || null };
  });

  return {
    query,
    root: resolvedRepos.map((r) => `${r.alias}=${r.root}`).join(', '),
    repos: resolvedRepos.map(({ alias, root }) => ({ alias, root })),
    files: totalFiles,
    chunks: unifiedIndex.size,
    tokens: used,
    results,
  };
}

// ============================================================================
// 3. Multi-Repo Pack (`packWorkspace`)
// ============================================================================

function positiveInteger(value, name) {
  if (value === undefined || value === null) return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new PackError('INVALID_OPTION', `${name} must be a positive integer, got ${value}`);
  }
  return number;
}

function stringList(value, name) {
  if (value === undefined || value === null) return [];
  const list = Array.isArray(value) ? value : [value];
  if (!list.every((item) => typeof item === 'string')) {
    throw new PackError('INVALID_OPTION', `${name} must be a list of strings`);
  }
  return list;
}

function resolveTargetProfile(model) {
  if (model === undefined || model === null || model === '') return null;
  const id = LLMDetector.resolveModelId(String(model));
  if (!id) {
    throw new PackError(
      'UNKNOWN_MODEL',
      `Unknown model "${model}" (ctxman --list-llms lists the known ids)`
    );
  }
  return LLMDetector.getProfile(id);
}

function prepareWorkspaceFile(file, repoAlias, opts) {
  let buffer;
  try {
    buffer = fs.readFileSync(file.absolutePath);
  } catch (_error) {
    return { skipped: 'unreadable' };
  }
  if (buffer.subarray(0, BINARY_SNIFF_BYTES).includes(0)) return { skipped: 'binary' };

  let content = buffer.toString('utf8');
  if (content.charCodeAt(0) === 0xfeff) content = content.slice(1);
  const totalLines = content.split('\n').length - (content.endsWith('\n') ? 1 : 0);
  const count = (text) => TokenUtils.calculate(text, file.path, opts.encoding);

  let lineNumbers = null;
  let compression = null;
  if (opts.compress) {
    const result = compressCode(content, file.path);
    if (result.elided > 0) {
      compression = {
        bodies: result.elided,
        originalTokens: count(content),
        compressedTokens: count(result.text),
      };
      content = result.text;
      lineNumbers = result.lineMap;
    }
  }

  if (opts.lineNumbers) content = addLineNumbers(content, lineNumbers);

  let findings = [];
  if (opts.redact) {
    const redacted = redactSecrets(content);
    if (redacted.findings.length) {
      if (redacted.text.split('\n').length !== content.split('\n').length) lineNumbers = null;
      content = redacted.text;
      findings = redacted.findings;
    }
  }

  return {
    repo: repoAlias,
    relativePath: file.path,
    path: `${repoAlias}/${file.path}`,
    absolutePath: file.absolutePath,
    modified: file.modified,
    content,
    tokens: count(content),
    totalLines,
    lineNumbers,
    compression,
    findings,
  };
}

function omittedSection(omitted) {
  if (!omitted.length) return null;
  const rest = omitted.slice(OMITTED_LISTED);
  const sum = (entries) => entries.reduce((total, entry) => total + entry.tokens, 0);
  return {
    files: omitted.slice(0, OMITTED_LISTED).map(({ path: p, tokens }) => ({ path: p, tokens })),
    count: omitted.length,
    tokens: sum(omitted),
    more: rest.length,
    moreTokens: sum(rest),
  };
}

function modelFit(profile, tokens, encoding) {
  if (!profile) return null;
  return {
    id: profile.id,
    name: profile.name,
    vendor: profile.vendor,
    encoding: TokenUtils.isExact() ? encoding : 'estimate',
    exact: TokenUtils.isExact() && profile.tokenizer?.exact === true,
    contextWindow: profile.contextWindow,
    maxRecommendedInput: profile.maxRecommendedInput ?? null,
    fits: tokens <= profile.contextWindow,
    percentOfWindow: (tokens / profile.contextWindow) * 100,
  };
}

/**
 * Pack files from multiple repositories into a single LLM-ready document under one shared
 * token budget, with `<repoAlias>/<path>` prefixes and per-repo policy enforcement.
 *
 * @param {Array<string|{path: string, alias?: string}>} repos
 * @param {object} [options] - Same options as `packContext`
 * @returns {Promise<object>}
 */
export async function packWorkspace(repos, options = {}) {
  const resolvedRepos = resolveWorkspaceRepos(repos);
  const style = options.style ?? 'xml';
  if (!PACK_STYLES.includes(style)) {
    throw new PackError(
      'INVALID_OPTION',
      `Unknown style "${style}" (use ${PACK_STYLES.join(', ')})`
    );
  }
  const profile = resolveTargetProfile(options.targetModel);
  const opts = {
    style,
    include: stringList(options.include, 'include'),
    exclude: stringList(options.exclude, 'exclude'),
    excludeFiles: stringList(options.excludeFiles, 'excludeFiles'),
    maxFileSize: positiveInteger(options.maxFileSize, 'maxFileSize') ?? DEFAULT_MAX_FILE_SIZE,
    tree: options.tree !== false,
    header: options.header ? String(options.header).trimEnd() : null,
    instructions: options.instructions ? String(options.instructions).trimEnd() : null,
    lineNumbers: Boolean(options.lineNumbers),
    compress: Boolean(options.compress),
    redact: options.redact !== false,
    budget: positiveInteger(options.budget, 'budget'),
    split: positiveInteger(options.split, 'split'),
    profile,
    encoding: TokenUtils.encodingFor(profile?.id),
  };

  const renderer = getRenderer(opts.style);
  const count = (text) => TokenUtils.calculate(text, `pack${renderer.extension}`, opts.encoding);

  const entries = [];
  const skipped = [];
  const globalScores = new Map();

  for (const repo of resolvedRepos) {
    const selection = selectFiles(repo.root, {
      include: opts.include,
      exclude: opts.exclude,
      excludeFiles: opts.excludeFiles,
      maxFileSize: opts.maxFileSize,
    });
    for (const s of selection.skipped) {
      skipped.push({ path: `${repo.alias}/${s.path}`, reason: s.reason });
    }

    const repoEntries = [];
    for (const file of selection.files) {
      const prepared = prepareWorkspaceFile(file, repo.alias, opts);
      if (prepared.skipped) {
        skipped.push({ path: `${repo.alias}/${file.path}`, reason: prepared.skipped });
      } else {
        repoEntries.push(prepared);
        entries.push(prepared);
      }
    }

    if (opts.budget && repoEntries.length > 0) {
      // Rank inside each repo using relativePath, then lift scores to `<alias>/<path>`
      const localProxies = repoEntries.map((entry) => ({ path: entry.relativePath, entry }));
      const { ranked, scores } = rankEntries(repo.root, localProxies);
      ranked.forEach((proxy, idx) => {
        const mapScore = scores.get(proxy.path);
        // Non-graph files (docs/configs) get a small positive tail score preserving rank order
        const effectiveScore = mapScore !== undefined ? mapScore + 0.0001 : 0.00005 / (idx + 1);
        globalScores.set(proxy.entry.path, effectiveScore);
      });
    }
  }

  const textFindings = [];
  const redactText = (text) => {
    if (!text || !opts.redact) return text;
    const redacted = redactSecrets(text);
    textFindings.push(...redacted.findings);
    return redacted.text;
  };
  const header = redactText(opts.header);
  const instructions = redactText(opts.instructions);

  const docFor = (packed, omitted) => ({
    header,
    partLabel: null,
    part: null,
    tree: opts.tree ? buildTree(packed.map((entry) => entry.path)) : null,
    files: packed,
    firstIndex: 1,
    omitted: omittedSection(omitted),
    instructions,
  });
  const measure = (packed, omitted) => {
    const text = renderer.render(docFor(packed, omitted));
    return { text, tokens: count(text) };
  };

  let packed = entries;
  let omitted = [];
  let rendered;
  if (opts.budget) {
    const ranked = [...entries].sort(
      (a, b) =>
        (globalScores.get(b.path) ?? 0) - (globalScores.get(a.path) ?? 0) ||
        compareStrings(a.path, b.path)
    );
    const separator = count('\n\n');
    const wrapperCost = (entry) =>
      opts.style === 'json'
        ? count(renderer.renderFile(entry, entries.length))
        : entry.tokens + count(renderer.renderFile({ ...entry, content: '' }, entries.length));
    const cost = (entry) =>
      (entry.cost ??= wrapperCost(entry) + separator + (opts.tree ? count(entry.path) + 1 : 0));
    ({ packed, omitted, ...rendered } = fitToBudget(entries, ranked, opts.budget, {
      measure,
      cost,
    }));
  } else {
    rendered = measure(entries, []);
  }

  // Enforce every repository's export policy against the final packed output
  const filesByRepo = new Map(resolvedRepos.map((r) => [r.alias, []]));
  for (const entry of packed) {
    filesByRepo.get(entry.repo)?.push({
      path: entry.relativePath,
      tokens: entry.tokens,
    });
  }
  enforceWorkspacePolicies(resolvedRepos, {
    filesByRepo,
    tokens: rendered.tokens,
    redact: opts.redact,
    targetModel: options.targetModel ?? null,
  });

  let parts = null;
  let splitFiles = [];
  if (opts.split) {
    const doc = docFor(packed, omitted);
    ({ parts, splitFiles } = splitIntoParts(packed, opts.split, { renderer, count, doc }));
  }

  const redactionCounts = {};
  const findings = [...textFindings, ...packed.flatMap((entry) => entry.findings)];
  for (const type of findings) redactionCounts[type] = (redactionCounts[type] ?? 0) + 1;

  const compressed = packed.filter((entry) => entry.compression);
  const sum = (key) => compressed.reduce((total, entry) => total + entry.compression[key], 0);
  const compression = opts.compress
    ? {
        files: compressed.length,
        bodies: sum('bodies'),
        originalTokens: sum('originalTokens'),
        compressedTokens: sum('compressedTokens'),
        savedTokens: sum('originalTokens') - sum('compressedTokens'),
      }
    : null;

  return {
    text: rendered.text,
    style: opts.style,
    encoding: TokenUtils.isExact() ? opts.encoding : 'estimate',
    totalTokens: rendered.tokens,
    repos: resolvedRepos.map(({ alias, root }) => ({ alias, root })),
    files: packed.map((entry) => ({
      repo: entry.repo,
      path: entry.path,
      tokens: entry.tokens,
      lines: entry.totalLines,
      compressed: Boolean(entry.compression),
    })),
    omitted: omitted.map(({ path: p, tokens }) => ({ path: p, tokens })),
    skipped,
    redactions: { total: findings.length, byType: redactionCounts },
    compression,
    budget: opts.budget ? { limit: opts.budget, used: rendered.tokens } : null,
    model: modelFit(opts.profile, rendered.tokens, opts.encoding),
    parts,
    splitFiles,
  };
}

export default {
  resolveWorkspaceRepos,
  mapWorkspace,
  searchWorkspace,
  packWorkspace,
};

/**
 * Hybrid Code Search: Reciprocal Rank Fusion (RRF) over BM25 lexical chunks and
 * local vector embeddings (`askCodebase`).
 *
 * Combines exact identifier/keyword recall (`BM25Index` over methods and 40-line windows)
 * with conceptual semantic similarity (`askCodebase` file embeddings):
 *
 *   score_RRF(chunk) = w_bm25 / (k + rank_bm25) + w_semantic / (k + rank_semantic)
 *
 * Graceful degradation:
 *   - `mode: 'bm25'`     -> pure lexical BM25 (instant, zero external packages)
 *   - `mode: 'hybrid'`   -> RRF fusion of BM25 + semantic; if optional RAG dependencies
 *                           (`@xenova/transformers` / `@lancedb/lancedb`) are unavailable,
 *                           falls back to BM25 with `semanticAvailable: false` and a warning
 *   - `mode: 'semantic'` -> pure vector search projected onto code chunks (falls back to BM25
 *                           only when `fallbackToBm25: true`, otherwise throws)
 */

import path from 'path';
import {
  getProjectIndex,
  sliceLines,
  fitToTokenBudget,
  DEFAULT_LIMIT,
  DEFAULT_MAX_TOKENS,
  WINDOW_LINES,
} from './bm25.js';
import { askCodebase } from '../rag/ask.js';
import { PolicyConfigError } from '../policy/index.js';
import TokenUtils from '../utils/token-utils.js';
import { redactSecrets } from '../utils/secret-redactor.js';

export const SEARCH_MODES = ['bm25', 'semantic', 'hybrid'];
export const DEFAULT_RRF_K = 60;

const toPosix = (p) => String(p).split(path.sep).join('/');

function chunkKey(posixFile, startLine, endLine) {
  return `${posixFile}:${startLine}-${endLine}`;
}

/**
 * Pick the best representative chunk from a project file entry when a semantic match had
 * zero lexical overlap in BM25: prefers the first named function/method chunk, else window 0.
 */
function representativeChunk(entry, fallbackText) {
  if (entry && Array.isArray(entry.chunks) && entry.chunks.length > 0) {
    const named = entry.chunks.find((chunk) => Boolean(chunk.name));
    return named ?? entry.chunks[0];
  }
  const lineCount = Math.max(1, String(fallbackText || '').split('\n').length);
  return {
    name: null,
    kind: 'window',
    startLine: 1,
    endLine: Math.min(WINDOW_LINES, lineCount),
  };
}

/**
 * Run BM25, semantic, or Reciprocal Rank Fusion (RRF) hybrid search over a project.
 *
 * @param {string} root - Project root directory
 * @param {string} query - Natural-language or identifier query
 * @param {object} [options]
 * @param {'hybrid'|'bm25'|'semantic'} [options.mode='hybrid']
 * @param {number} [options.limit=10] - Maximum chunks returned
 * @param {number} [options.maxTokens=4000] - Token budget across returned chunk texts
 * @param {boolean} [options.redact=true] - Redact secrets in returned code
 * @param {number} [options.windowLines=40] - Fallback window size for code outside methods
 * @param {number} [options.rrfK=60] - RRF smoothing constant k
 * @param {number} [options.bm25Weight=1] - Weight applied to BM25 RRF component
 * @param {number} [options.semanticWeight=1] - Weight applied to semantic RRF component
 * @param {boolean} [options.fallbackToBm25=false] - Fall back to BM25 even in `'semantic'` mode
 * @param {(event: 'indexing'|'indexed') => void} [options.onProgress]
 * @param {(storePath: string) => object} [options.createStore] - Injectable vector store factory
 * @returns {Promise<{
 *   query: string,
 *   mode: 'bm25'|'semantic'|'hybrid',
 *   effectiveMode: 'bm25'|'semantic'|'hybrid',
 *   semanticAvailable: boolean,
 *   indexed: boolean,
 *   root: string,
 *   files: number,
 *   chunks: number,
 *   tokens: number,
 *   warnings: string[],
 *   results: Array<{
 *     file: string,
 *     name: string|null,
 *     kind: string,
 *     parent?: string,
 *     startLine: number,
 *     endLine: number,
 *     score: number,
 *     bm25Rank: number|null,
 *     semanticRank: number|null,
 *     bm25Score: number|null,
 *     semanticScore: number|null,
 *     tokens: number,
 *     text: string|null,
 *     truncated?: boolean
 *   }>
 * }>}
 */
export async function hybridSearch(root, query, options = {}) {
  if (typeof query !== 'string' || !query.trim()) {
    throw new Error('The search query is empty');
  }
  const mode = options.mode ?? 'hybrid';
  if (!SEARCH_MODES.includes(mode)) {
    throw new Error(`Invalid search mode "${mode}" (expected one of: ${SEARCH_MODES.join(', ')})`);
  }

  const limit =
    Number.isInteger(options.limit) && options.limit > 0 ? options.limit : DEFAULT_LIMIT;
  const maxTokens =
    Number.isInteger(options.maxTokens) && options.maxTokens > 0
      ? options.maxTokens
      : DEFAULT_MAX_TOKENS;
  const redact = options.redact !== false;
  const windowLines = options.windowLines ?? WINDOW_LINES;
  const rrfK = Number.isFinite(options.rrfK) && options.rrfK > 0 ? options.rrfK : DEFAULT_RRF_K;
  const bm25Weight =
    Number.isFinite(options.bm25Weight) && options.bm25Weight >= 0 ? options.bm25Weight : 1;
  const semanticWeight =
    Number.isFinite(options.semanticWeight) && options.semanticWeight >= 0
      ? options.semanticWeight
      : 1;

  const project = getProjectIndex(root, { windowLines });
  const filesByPosix = new Map();
  for (const entry of project.files.values()) {
    filesByPosix.set(toPosix(entry.relativePath), entry);
  }

  const candidatePoolSize = Math.max(limit * 3, 20);
  const warnings = [];

  // 1. Collect BM25 candidates when mode includes lexical ranking (or as fallback pool)
  const bm25Hits =
    mode === 'bm25' || mode === 'hybrid'
      ? project.index.search(query, { limit: candidatePoolSize })
      : [];

  // 2. Collect semantic candidates when mode is 'hybrid' or 'semantic'
  let semanticResult = null;
  let semanticAvailable = false;
  if (mode === 'hybrid' || mode === 'semantic') {
    try {
      semanticResult = await askCodebase(project.root, query, {
        limit: candidatePoolSize,
        redact,
        onProgress: options.onProgress,
        createStore: options.createStore,
      });
      semanticAvailable = true;
    } catch (error) {
      if (error instanceof PolicyConfigError) throw error;
      if (mode === 'semantic' && !options.fallbackToBm25) {
        throw error;
      }
      warnings.push(
        `Semantic search unavailable (${error.message}); fell back to BM25 lexical ranking.`
      );
    }
  }

  const effectiveMode = mode === 'bm25' ? 'bm25' : semanticAvailable ? mode : 'bm25';

  // If semantic failed and we fell back from 'semantic' -> 'bm25', compute BM25 hits now
  const activeBm25Hits =
    effectiveMode === 'bm25' && bm25Hits.length === 0
      ? project.index.search(query, { limit: candidatePoolSize })
      : bm25Hits;

  // 3. Fuse candidates in a unified map keyed by `posixFile:startLine-endLine`
  const candidates = new Map();
  const bestBm25KeyPerFile = new Map();

  activeBm25Hits.forEach(({ doc: { entry, chunk }, score }, idx) => {
    const posixFile = toPosix(entry.relativePath);
    const key = chunkKey(posixFile, chunk.startLine, chunk.endLine);
    const rank = idx + 1;
    if (!bestBm25KeyPerFile.has(posixFile)) {
      bestBm25KeyPerFile.set(posixFile, key);
    }
    candidates.set(key, {
      file: entry.relativePath,
      posixFile,
      entry,
      chunk,
      fallbackText: null,
      bm25Rank: rank,
      bm25Score: score,
      semanticRank: null,
      semanticScore: null,
    });
  });

  if (semanticAvailable && semanticResult) {
    semanticResult.results.forEach((semHit, idx) => {
      const posixFile = toPosix(semHit.file);
      const rank = idx + 1;
      const existingKey = bestBm25KeyPerFile.get(posixFile);

      if (existingKey && candidates.has(existingKey)) {
        const item = candidates.get(existingKey);
        if (item.semanticRank === null) {
          item.semanticRank = rank;
          item.semanticScore = semHit.score;
        }
        return;
      }

      const entry = filesByPosix.get(posixFile) ?? null;
      const chunk = representativeChunk(entry, semHit.text);
      const key = chunkKey(posixFile, chunk.startLine, chunk.endLine);
      if (candidates.has(key)) {
        const item = candidates.get(key);
        if (item.semanticRank === null) {
          item.semanticRank = rank;
          item.semanticScore = semHit.score;
        }
        return;
      }

      candidates.set(key, {
        file: entry ? entry.relativePath : semHit.file,
        posixFile,
        entry,
        chunk,
        fallbackText: semHit.text,
        bm25Rank: null,
        bm25Score: null,
        semanticRank: rank,
        semanticScore: semHit.score,
      });
    });
  }

  // 4. Score and sort candidates
  const scored = [];
  for (const item of candidates.values()) {
    let finalScore;
    if (effectiveMode === 'bm25') {
      finalScore = item.bm25Score ?? 0;
    } else if (effectiveMode === 'semantic') {
      finalScore =
        item.semanticScore !== null && item.semanticScore !== undefined
          ? Number(item.semanticScore)
          : 1 / (rrfK + (item.semanticRank ?? candidatePoolSize));
    } else {
      const bm25Rrf = item.bm25Rank !== null ? bm25Weight / (rrfK + item.bm25Rank) : 0;
      const semRrf = item.semanticRank !== null ? semanticWeight / (rrfK + item.semanticRank) : 0;
      finalScore = bm25Rrf + semRrf;
    }
    scored.push({ ...item, finalScore });
  }

  scored.sort((a, b) => {
    if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
    // Tie-break: matched in both signals first, then better BM25 rank, then lexical path
    const aBoth = a.bm25Rank !== null && a.semanticRank !== null ? 1 : 0;
    const bBoth = b.bm25Rank !== null && b.semanticRank !== null ? 1 : 0;
    if (bBoth !== aBoth) return bBoth - aBoth;
    if ((a.bm25Rank ?? Infinity) !== (b.bm25Rank ?? Infinity)) {
      return (a.bm25Rank ?? Infinity) - (b.bm25Rank ?? Infinity);
    }
    return a.posixFile < b.posixFile ? -1 : a.posixFile > b.posixFile ? 1 : 0;
  });

  // 5. Materialize source snippets within maxTokens budget
  let used = 0;
  const results = scored.slice(0, limit).map((item) => {
    const filePathForTokens = item.entry ? item.entry.path : path.join(project.root, item.file);
    const raw = item.entry
      ? sliceLines(item.entry.content, item.chunk.startLine, item.chunk.endLine)
      : sliceLines(item.fallbackText ?? '', item.chunk.startLine, item.chunk.endLine);
    let text = redact ? redactSecrets(raw).text : raw;
    let tokens = TokenUtils.calculate(text, filePathForTokens);

    const out = {
      file: item.file,
      name: item.chunk.name,
      kind: item.chunk.kind,
      ...(item.chunk.parent ? { parent: item.chunk.parent } : {}),
      startLine: item.chunk.startLine,
      endLine: item.chunk.endLine,
      score: Math.round(item.finalScore * 10000) / 10000,
      bm25Rank: item.bm25Rank,
      semanticRank: item.semanticRank,
      bm25Score: item.bm25Score !== null ? Math.round(item.bm25Score * 10000) / 10000 : null,
      semanticScore:
        item.semanticScore !== null && item.semanticScore !== undefined
          ? Math.round(Number(item.semanticScore) * 10000) / 10000
          : null,
    };

    if (used + tokens > maxTokens) {
      text = fitToTokenBudget(text, maxTokens - used, filePathForTokens);
      tokens = text ? TokenUtils.calculate(text, filePathForTokens) : 0;
      out.truncated = true;
    }
    used += tokens;
    return { ...out, tokens, text: text || null };
  });

  return {
    query,
    mode,
    effectiveMode,
    semanticAvailable,
    indexed: Boolean(semanticResult?.indexed),
    root: project.root,
    files: project.files.size,
    chunks: project.index.size,
    tokens: used,
    warnings,
    results,
  };
}

export default hybridSearch;

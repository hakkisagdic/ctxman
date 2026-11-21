/**
 * Evidence source runner (`lib/evidence/source.js`)
 *
 * Orchestrates `EvidenceSource` connectors (`id`, `available()`, `search(query, opts)`)
 * with a per-source timeout (default 5 s), error isolation into `warnings[]`, injected
 * `isDenied(pathOrRef)` policy filtering, and deterministic sorting.
 */

import { normalizeEvidence } from './contract.js';

export const DEFAULT_SOURCE_TIMEOUT_MS = 5000;

function parseTimestampMs(timestamp) {
  if (!timestamp || typeof timestamp !== 'string') return Number.NEGATIVE_INFINITY;
  const ms = Date.parse(timestamp);
  return Number.isFinite(ms) ? ms : Number.NEGATIVE_INFINITY;
}

function compareStrings(a, b) {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * Deterministic comparator: score DESC, timestamp DESC, id ASC (with source/locator tie-breakers)
 */
export function compareEvidence(a, b) {
  if (b.score !== a.score) return b.score - a.score;
  const timeDiff = parseTimestampMs(b.timestamp) - parseTimestampMs(a.timestamp);
  if (timeDiff !== 0) return timeDiff;
  const idCmp = compareStrings(a.id, b.id);
  if (idCmp !== 0) return idCmp;
  const srcCmp = compareStrings(a.source, b.source);
  if (srcCmp !== 0) return srcCmp;
  return compareStrings(a.ref ?? a.url ?? '', b.ref ?? b.url ?? '');
}

/**
 * Check whether any path-like locator on a raw or normalized evidence record is denied
 * by the caller's export policy predicate.
 *
 * @param {object|null} raw
 * @param {object|null} normalized
 * @param {((pathOrRef: string) => boolean)|null|undefined} isDenied
 * @returns {boolean}
 */
export function isEvidenceDenied(raw, normalized, isDenied) {
  if (typeof isDenied !== 'function') return false;

  const candidates = [raw?.path, raw?.source, raw?.ref, normalized?.source, normalized?.ref].filter(
    (v) => typeof v === 'string' && v.trim() !== ''
  );

  for (const candidate of candidates) {
    const trimmed = candidate.trim();
    if (isDenied(trimmed)) return true;

    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) continue;

    const posix = trimmed.replace(/\\/g, '/').replace(/^\.\//, '');
    if (posix && isDenied(posix)) return true;

    const beforeHash = posix.split('#')[0];
    if (beforeHash && beforeHash !== posix && isDenied(beforeHash)) return true;

    const beforeAt = beforeHash.split('@')[0];
    if (beforeAt && beforeAt !== beforeHash && isDenied(beforeAt)) return true;

    const beforeColon = beforeAt.split(':')[0];
    if (beforeColon && beforeColon !== beforeAt && isDenied(beforeColon)) return true;
  }

  return false;
}

async function runWithTimeout(taskFn, timeoutMs, sourceId) {
  const controller = new AbortController();
  let timer = null;

  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      const err = new Error(`Evidence source "${sourceId}" timed out after ${timeoutMs}ms.`);
      err.code = 'SOURCE_TIMEOUT';
      reject(err);
    }, timeoutMs);
  });

  const workPromise = Promise.resolve().then(() => taskFn(controller.signal));
  // Prevent unhandled rejection if the source rejects after the timeout has already settled
  workPromise.catch(() => {});

  try {
    return await Promise.race([workPromise, timeoutPromise]);
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
}

/**
 * Execute `EvidenceSource` connectors safely and collect normalized, sorted `Evidence[]`.
 *
 * @param {Array<{id: string, available?: (opts?: {signal?: AbortSignal}) => boolean|Promise<boolean>, search: (query: string, opts: object) => Array<object>|Promise<Array<object>>}>} sources
 * @param {string} query
 * @param {object} [opts]
 * @param {string[]} [opts.paths]
 * @param {string[]} [opts.symbols]
 * @param {string|null} [opts.since]
 * @param {number} [opts.limit]
 * @param {number} [opts.timeoutMs=5000]
 * @param {(pathOrRef: string) => boolean} [opts.isDenied]
 * @param {boolean} [opts.redactPII=false]
 * @returns {Promise<{evidence: Array<object>, warnings: string[]}>}
 */
export async function runSources(sources, query, opts = {}) {
  const warnings = [];
  if (!Array.isArray(sources) || sources.length === 0) {
    return { evidence: [], warnings };
  }

  const timeoutMs =
    typeof opts.timeoutMs === 'number' && Number.isFinite(opts.timeoutMs) && opts.timeoutMs > 0
      ? opts.timeoutMs
      : DEFAULT_SOURCE_TIMEOUT_MS;

  const searchQuery = query == null ? '' : String(query);
  const searchBaseOpts = {
    paths: Array.isArray(opts.paths) ? opts.paths : [],
    symbols: Array.isArray(opts.symbols) ? opts.symbols : [],
    since: opts.since ?? null,
    limit: opts.limit,
  };

  const collected = [];

  for (const source of sources) {
    const sourceId =
      source && typeof source.id === 'string' && source.id.trim() ? source.id.trim() : 'unknown';

    if (!source || typeof source !== 'object' || typeof source.search !== 'function') {
      warnings.push(`Evidence source "${sourceId}" is invalid: missing search() function.`);
      continue;
    }

    let rawItems;
    try {
      rawItems = await runWithTimeout(
        async (signal) => {
          if (typeof source.available === 'function') {
            const isAvailable = await source.available({ signal });
            if (!isAvailable) return null;
          }
          return await source.search(searchQuery, { ...searchBaseOpts, signal });
        },
        timeoutMs,
        sourceId
      );
    } catch (error) {
      if (error?.code === 'SOURCE_TIMEOUT' || error?.name === 'AbortError') {
        warnings.push(`Evidence source "${sourceId}" timed out after ${timeoutMs}ms.`);
      } else {
        const msg = error?.message ? String(error.message).split('\n')[0] : 'unexpected error';
        warnings.push(`Evidence source "${sourceId}" failed: ${msg}.`);
      }
      continue;
    }

    if (rawItems === null || rawItems === undefined) continue;
    if (!Array.isArray(rawItems)) {
      warnings.push(`Evidence source "${sourceId}" returned a non-array result.`);
      continue;
    }

    for (const raw of rawItems) {
      if (isEvidenceDenied(raw, null, opts.isDenied)) continue;
      let normalized;
      try {
        normalized = normalizeEvidence(raw, { redactPII: Boolean(opts.redactPII) });
      } catch (error) {
        warnings.push(`Evidence source "${sourceId}" item skipped: ${error.message}.`);
        continue;
      }
      if (isEvidenceDenied(raw, normalized, opts.isDenied)) continue;
      collected.push(normalized);
    }
  }

  collected.sort(compareEvidence);

  const seenIds = new Set();
  const deduped = [];
  for (const item of collected) {
    if (seenIds.has(item.id)) continue;
    seenIds.add(item.id);
    deduped.push(item);
  }

  const finalEvidence =
    Number.isInteger(opts.limit) && opts.limit > 0 ? deduped.slice(0, opts.limit) : deduped;

  return { evidence: finalEvidence, warnings };
}

export default {
  DEFAULT_SOURCE_TIMEOUT_MS,
  compareEvidence,
  isEvidenceDenied,
  runSources,
};

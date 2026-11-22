/**
 * SQLite-backed conditional HTTP cache (`ETag` / `If-None-Match` / `If-Modified-Since`)
 * for GitHub and GitLab evidence sources (`lib/evidence/sources/github-cache.js`).
 *
 * Uses Node 22+ built-in `node:sqlite` (`DatabaseSync`) with warning suppression,
 * secret redaction before persistence, `--since` staleness gating, and safe offline
 * or rate-limit fallback.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { redactSecrets } from '../../utils/secret-redactor.js';

export const DEFAULT_EVIDENCE_CACHE_RELPATH = '.ctxman/evidence/github.sqlite';
const SCHEMA_VERSION = '1';
const DEFAULT_MAX_PAGES = 10;

const require = createRequire(import.meta.url);
let cachedDatabaseSync = null;

/**
 * Lazily load `DatabaseSync` from `node:sqlite` while suppressing Node's
 * one-time `ExperimentalWarning: SQLite is an experimental feature` on stderr.
 */
function getDatabaseSync() {
  if (cachedDatabaseSync) return cachedDatabaseSync;
  const origEmitWarning = process.emitWarning;
  process.emitWarning = function (warning, ...args) {
    const msg = typeof warning === 'string' ? warning : warning?.message || '';
    if (/SQLite is an experimental feature/i.test(msg)) return;
    return origEmitWarning.call(this, warning, ...args);
  };
  try {
    ({ DatabaseSync: cachedDatabaseSync } = require('node:sqlite'));
    return cachedDatabaseSync;
  } finally {
    process.emitWarning = origEmitWarning;
  }
}

/**
 * Case-insensitive header lookup across Web `Headers`, `Map`, and plain objects.
 *
 * @param {Headers|Map<string, string>|Record<string, unknown>|null|undefined} headers
 * @param {string} name
 * @returns {string|null}
 */
export function getHeader(headers, name) {
  if (!headers || typeof headers !== 'object') return null;
  const target = String(name).toLowerCase();

  if (typeof headers.get === 'function') {
    const direct = headers.get(name) ?? headers.get(target);
    if (direct !== undefined && direct !== null) return String(direct);
    if (typeof headers.entries === 'function') {
      for (const [k, v] of headers.entries()) {
        if (String(k).toLowerCase() === target && v !== undefined && v !== null) {
          return String(v);
        }
      }
    }
    return null;
  }

  for (const [k, v] of Object.entries(headers)) {
    if (String(k).toLowerCase() === target && v !== undefined && v !== null) {
      return Array.isArray(v) ? v.join(', ') : String(v);
    }
  }
  return null;
}

/**
 * Strip embedded `user:pass@` credentials from URLs before caching or logging.
 *
 * @param {string} value
 * @returns {string}
 */
export function stripUrlCredentials(value) {
  return String(value ?? '').replace(/^([a-z][a-z0-9+.-]*:\/\/)[^/@\s]*@/i, '$1');
}

/**
 * Scrub known secret formats plus an explicit runtime token string from text.
 *
 * @param {string} text
 * @param {string|null|undefined} [secret]
 * @returns {string}
 */
export function scrubSecret(text, secret = null) {
  let cleaned = String(text ?? '');
  if (typeof secret === 'string' && secret.length > 0) {
    cleaned = cleaned.split(secret).join('[REDACTED:token]');
  }
  return redactSecrets(cleaned).text;
}

/**
 * Recursively redact secrets in parsed JSON payloads before writing to SQLite.
 *
 * @param {unknown} value
 * @param {string|null|undefined} [secret]
 * @returns {unknown}
 */
export function redactPayloadDeep(value, secret = null) {
  if (typeof value === 'string') {
    return scrubSecret(value, secret);
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactPayloadDeep(item, secret));
  }
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      out[key] = redactPayloadDeep(item, secret);
    }
    return out;
  }
  return value;
}

/**
 * Parse pagination `rel="next"` from a `Link` header (or GitLab `X-Next-Page`),
 * rejecting cross-origin redirect targets.
 *
 * @param {string|null} linkHeader
 * @param {string|null} allowedOrigin
 * @param {'github'|'gitlab'} [paginationMode='github']
 * @param {string} [currentUrl='']
 * @param {string|null} [xNextPage=null]
 * @returns {string|null}
 */
export function parseNextLink(
  linkHeader,
  allowedOrigin,
  paginationMode = 'github',
  currentUrl = '',
  xNextPage = null
) {
  const checkOrigin = (candidate) => {
    try {
      const parsed = new URL(candidate);
      if (allowedOrigin && parsed.origin !== allowedOrigin) return null;
      return parsed.toString();
    } catch {
      return null;
    }
  };

  if (typeof linkHeader === 'string' && linkHeader.trim()) {
    for (const part of linkHeader.split(',')) {
      const urlMatch = /<([^>]+)>/.exec(part);
      if (urlMatch && /;\s*rel\s*=\s*"?next"?/i.test(part)) {
        const safe = checkOrigin(urlMatch[1].trim());
        if (safe) return safe;
      }
    }
  }

  if (paginationMode === 'gitlab' && typeof xNextPage === 'string') {
    const pageNum = xNextPage.trim();
    if (/^[1-9]\d*$/.test(pageNum) && currentUrl) {
      try {
        const next = new URL(currentUrl);
        next.searchParams.set('page', pageNum);
        return checkOrigin(next.toString());
      } catch {
        return null;
      }
    }
  }

  return null;
}

const RELATIVE_UNITS_MS = {
  second: 1000,
  minute: 60 * 1000,
  hour: 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
  year: 365 * 24 * 60 * 60 * 1000,
};

/**
 * Parse `--since` timestamps (ISO-8601, Date, epoch ms, or `"N <unit> ago"`).
 *
 * @param {string|number|Date|null|undefined} since
 * @returns {number|null}
 */
export function parseSinceTimestamp(since) {
  if (since === undefined || since === null || since === '') return null;
  if (since instanceof Date) {
    return Number.isFinite(since.getTime()) ? since.getTime() : null;
  }
  if (typeof since === 'number') {
    return Number.isFinite(since) ? since : null;
  }
  const trimmed = String(since).trim();
  if (!trimmed) return null;

  const relMatch = /^(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago$/i.exec(trimmed);
  if (relMatch) {
    const count = Number(relMatch[1]);
    const unitMs = RELATIVE_UNITS_MS[relMatch[2].toLowerCase()];
    if (Number.isFinite(count) && unitMs) {
      return Date.now() - count * unitMs;
    }
  }

  const parsed = Date.parse(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function nowIsoUtc() {
  return new Date().toISOString().replace(/\.000Z$/, 'Z');
}

function createCombinedSignal(parentSignal, timeoutSignal) {
  if (!parentSignal) return timeoutSignal;
  if (typeof AbortSignal.any === 'function') {
    return AbortSignal.any([parentSignal, timeoutSignal]);
  }
  const combined = new AbortController();
  const forward = (src) => {
    if (!combined.signal.aborted) combined.abort(src.reason);
  };
  if (parentSignal.aborted) forward(parentSignal);
  else if (timeoutSignal.aborted) forward(timeoutSignal);
  else {
    parentSignal.addEventListener('abort', () => forward(parentSignal), { once: true });
    timeoutSignal.addEventListener('abort', () => forward(timeoutSignal), { once: true });
  }
  return combined.signal;
}

/**
 * SQLite cache storing HTTP responses keyed by `(host, repo, url)` with ETag /
 * Last-Modified metadata and `fetched_at` timestamps.
 */
export class EvidenceHttpCache {
  /**
   * @param {string} dbPath
   * @param {{ onWarning?: (message: string) => void }} [options]
   */
  constructor(dbPath, options = {}) {
    this.dbPath = dbPath;
    this.onWarning = typeof options.onWarning === 'function' ? options.onWarning : null;
    this.db = null;
    this.disabled = false;
    this._warned = new Set();
    this._stmtGet = null;
    this._stmtUpsert = null;
    this._stmtTouch = null;
  }

  _warnOnce(key, message) {
    if (this._warned.has(key)) return;
    this._warned.add(key);
    this.onWarning?.(message);
  }

  /**
   * Open the SQLite cache database, initializing tables and schema version.
   * Never throws: corrupt or locked databases degrade cleanly to uncached mode.
   *
   * @returns {boolean}
   */
  open() {
    if (this.db) return true;
    if (!this.dbPath) {
      this.disabled = true;
      return false;
    }

    try {
      fs.mkdirSync(path.dirname(this.dbPath), { recursive: true, mode: 0o700 });
      const DatabaseSync = getDatabaseSync();
      this.db = new DatabaseSync(this.dbPath);
      this.db.exec('PRAGMA busy_timeout = 1000;');
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS meta (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS http_cache (
          host TEXT NOT NULL,
          repo TEXT NOT NULL,
          url TEXT NOT NULL,
          etag TEXT,
          last_modified TEXT,
          fetched_at TEXT NOT NULL,
          next_url TEXT,
          body TEXT NOT NULL,
          PRIMARY KEY (host, repo, url)
        );
        CREATE INDEX IF NOT EXISTS idx_http_cache_repo ON http_cache(host, repo);
      `);

      const row = this.db.prepare('SELECT value FROM meta WHERE key = ?').get('schema_version');
      if (!row) {
        this.db
          .prepare('INSERT INTO meta (key, value) VALUES (?, ?)')
          .run('schema_version', SCHEMA_VERSION);
      } else if (String(row.value) !== SCHEMA_VERSION) {
        this.db.exec('DELETE FROM http_cache;');
        this.db
          .prepare('UPDATE meta SET value = ? WHERE key = ?')
          .run(SCHEMA_VERSION, 'schema_version');
      }

      this._stmtGet = this.db.prepare(
        'SELECT etag, last_modified, fetched_at, next_url, body FROM http_cache WHERE host = ? AND repo = ? AND url = ?'
      );
      this._stmtUpsert = this.db.prepare(`
        INSERT INTO http_cache (host, repo, url, etag, last_modified, fetched_at, next_url, body)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(host, repo, url) DO UPDATE SET
          etag = excluded.etag,
          last_modified = excluded.last_modified,
          fetched_at = excluded.fetched_at,
          next_url = excluded.next_url,
          body = excluded.body
      `);
      this._stmtTouch = this.db.prepare(`
        UPDATE http_cache
        SET fetched_at = ?,
            etag = COALESCE(?, etag),
            last_modified = COALESCE(?, last_modified),
            next_url = ?
        WHERE host = ? AND repo = ? AND url = ?
      `);

      this.disabled = false;
      return true;
    } catch (error) {
      this.disabled = true;
      this.close();
      const detail = scrubSecret(error?.message || 'database error');
      this._warnOnce('open', `Evidence cache disabled (${detail}): continuing without cache.`);
      return false;
    }
  }

  /**
   * Look up a cached response entry.
   *
   * @param {string} host
   * @param {string} repo
   * @param {string} url
   * @returns {{etag: string|null, lastModified: string|null, fetchedAt: string, nextUrl: string|null, body: unknown}|null}
   */
  get(host, repo, url) {
    if (this.disabled || !this.db) return null;
    try {
      const row = this._stmtGet.get(host, repo, stripUrlCredentials(url));
      if (!row) return null;
      return {
        etag: row.etag || null,
        lastModified: row.last_modified || null,
        fetchedAt: row.fetched_at,
        nextUrl: row.next_url || null,
        body: JSON.parse(row.body),
      };
    } catch (error) {
      const detail = scrubSecret(error?.message || 'read error');
      this._warnOnce('read', `Evidence cache read error (${detail}): continuing without cache.`);
      return null;
    }
  }

  /**
   * Store a redacted JSON payload and validator headers.
   *
   * @param {{host: string, repo: string, url: string, etag?: string|null, lastModified?: string|null, fetchedAt: string, nextUrl?: string|null, body: unknown}} entry
   */
  set(entry) {
    if (this.disabled || !this.db) return;
    try {
      this._stmtUpsert.run(
        entry.host,
        entry.repo,
        stripUrlCredentials(entry.url),
        entry.etag ?? null,
        entry.lastModified ?? null,
        entry.fetchedAt,
        entry.nextUrl ?? null,
        JSON.stringify(entry.body)
      );
    } catch (error) {
      const detail = scrubSecret(error?.message || 'write error');
      this._warnOnce('write', `Evidence cache write error (${detail}): continuing without cache.`);
    }
  }

  /**
   * Refresh `fetched_at` (and optionally validators/next_url) after HTTP 304.
   *
   * @param {string} host
   * @param {string} repo
   * @param {string} url
   * @param {string} fetchedAt
   * @param {string|null} etag
   * @param {string|null} lastModified
   * @param {string|null} nextUrl
   */
  touch(host, repo, url, fetchedAt, etag, lastModified, nextUrl) {
    if (this.disabled || !this.db) return;
    try {
      this._stmtTouch.run(
        fetchedAt,
        etag ?? null,
        lastModified ?? null,
        nextUrl ?? null,
        host,
        repo,
        stripUrlCredentials(url)
      );
    } catch (error) {
      const detail = scrubSecret(error?.message || 'update error');
      this._warnOnce('write', `Evidence cache update error (${detail}): continuing without cache.`);
    }
  }

  /**
   * Close the underlying SQLite connection safely.
   */
  close() {
    this._stmtGet = null;
    this._stmtUpsert = null;
    this._stmtTouch = null;
    if (this.db) {
      try {
        this.db.close();
      } catch {
        // Ignore close errors on corrupt/already-closed handles
      }
      this.db = null;
    }
  }
}

function buildAuthHint(providerLabel, hasToken) {
  if (hasToken) return '';
  if (providerLabel === 'GitLab') {
    return ' (set GITLAB_TOKEN or GL_TOKEN for private projects and higher rate limits)';
  }
  return ' (set GITHUB_TOKEN, GH_TOKEN, or authenticate with gh for private repositories and higher rate limits)';
}

/**
 * Perform a conditional JSON `GET` backed by `EvidenceHttpCache`.
 *
 * @param {object} params
 * @returns {Promise<{ok: boolean, status: number, fromCache?: boolean, stale?: boolean, notModified?: boolean, rateLimited?: boolean, notFound?: boolean, aborted?: boolean, offline?: boolean, data?: unknown, nextUrl?: string|null}>}
 */
export async function cachedFetchJson(params) {
  const {
    cache,
    host,
    repo,
    url,
    fetchFn,
    headers,
    timeoutMs = 5000,
    signal,
    sinceMs = null,
    token = null,
    hasToken = false,
    providerLabel = 'GitHub',
    paginationMode = 'github',
    state,
    warn,
  } = params;

  const cleanUrl = stripUrlCredentials(url);
  const cached = cache ? cache.get(host, repo, cleanUrl) : null;

  if (cached && sinceMs !== null) {
    const fetchedMs = Date.parse(cached.fetchedAt);
    if (Number.isFinite(fetchedMs) && fetchedMs >= sinceMs) {
      return {
        ok: true,
        status: 200,
        fromCache: true,
        stale: false,
        notModified: false,
        rateLimited: false,
        data: cached.body,
        nextUrl: cached.nextUrl,
      };
    }
  }

  if (state.offline) {
    if (cached) {
      state.offlineCacheTimestamp = state.offlineCacheTimestamp || cached.fetchedAt;
      return {
        ok: true,
        status: 200,
        fromCache: true,
        stale: true,
        notModified: false,
        rateLimited: false,
        data: cached.body,
        nextUrl: cached.nextUrl,
      };
    }
    return { ok: false, status: 0, offline: true, rateLimited: false };
  }

  if (signal?.aborted) {
    return { ok: false, status: 0, aborted: true, rateLimited: false };
  }

  const reqHeaders = { ...headers };
  if (cached?.etag) {
    reqHeaders['If-None-Match'] = cached.etag;
  } else if (cached?.lastModified) {
    reqHeaders['If-Modified-Since'] = cached.lastModified;
  }

  let urlOrigin = null;
  try {
    urlOrigin = new URL(cleanUrl).origin;
  } catch {
    return { ok: false, status: 0, rateLimited: false };
  }

  const remainingBudgetMs = state.deadlineAt ? state.deadlineAt - Date.now() : timeoutMs;
  if (state.deadlineAt && remainingBudgetMs <= 0) {
    return { ok: false, status: 0, aborted: true, rateLimited: false };
  }
  const perReqTimeout = Math.max(10, Math.min(timeoutMs, remainingBudgetMs));

  const timeoutCtrl = new AbortController();
  const timer = setTimeout(() => {
    timeoutCtrl.abort(new Error('Request timed out'));
  }, perReqTimeout);
  const combinedSignal = createCombinedSignal(signal, timeoutCtrl.signal);

  let response;
  try {
    response = await fetchFn(cleanUrl, {
      method: 'GET',
      headers: reqHeaders,
      signal: combinedSignal,
    });
  } catch (error) {
    if (signal?.aborted) {
      return { ok: false, status: 0, aborted: true, rateLimited: false };
    }
    state.offline = true;
    if (cached) {
      state.offlineCacheTimestamp = state.offlineCacheTimestamp || cached.fetchedAt;
      return {
        ok: true,
        status: 200,
        fromCache: true,
        stale: true,
        notModified: false,
        rateLimited: false,
        data: cached.body,
        nextUrl: cached.nextUrl,
      };
    }
    if (!state.warnedUnreachable) {
      state.warnedUnreachable = true;
      const reason =
        error?.name === 'AbortError' || timeoutCtrl.signal.aborted
          ? 'request timed out'
          : scrubSecret(error?.message || 'network unreachable', token);
      warn(
        `${providerLabel} API unreachable (${reason})${buildAuthHint(providerLabel, hasToken)}.`
      );
    }
    return { ok: false, status: 0, offline: true, rateLimited: false };
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 304) {
    if (!cached) {
      return { ok: false, status: 304, rateLimited: false };
    }
    const fetchedAt = nowIsoUtc();
    const linkHeader = getHeader(response.headers, 'link');
    const xNextPage = getHeader(response.headers, 'x-next-page');
    const refreshedNext =
      parseNextLink(linkHeader, urlOrigin, paginationMode, cleanUrl, xNextPage) ??
      cached.nextUrl ??
      null;
    const refreshedEtag = getHeader(response.headers, 'etag') ?? cached.etag;
    const refreshedLastMod = getHeader(response.headers, 'last-modified') ?? cached.lastModified;
    cache?.touch(host, repo, cleanUrl, fetchedAt, refreshedEtag, refreshedLastMod, refreshedNext);
    return {
      ok: true,
      status: 304,
      fromCache: true,
      stale: false,
      notModified: true,
      rateLimited: false,
      data: cached.body,
      nextUrl: refreshedNext,
    };
  }

  if (response.ok) {
    let rawJson;
    try {
      rawJson = await response.json();
    } catch (error) {
      const detail = scrubSecret(error?.message || 'invalid JSON response', token);
      warn(`${providerLabel} API returned malformed JSON (${detail}).`);
      return { ok: false, status: response.status, rateLimited: false };
    }

    const redacted = redactPayloadDeep(rawJson, token);
    const fetchedAt = nowIsoUtc();
    const etag = getHeader(response.headers, 'etag');
    const lastModified = getHeader(response.headers, 'last-modified');
    const linkHeader = getHeader(response.headers, 'link');
    const xNextPage = getHeader(response.headers, 'x-next-page');
    const nextUrl = parseNextLink(linkHeader, urlOrigin, paginationMode, cleanUrl, xNextPage);

    cache?.set({
      host,
      repo,
      url: cleanUrl,
      etag,
      lastModified,
      fetchedAt,
      nextUrl,
      body: redacted,
    });

    return {
      ok: true,
      status: response.status,
      fromCache: false,
      stale: false,
      notModified: false,
      rateLimited: false,
      data: redacted,
      nextUrl,
    };
  }

  if (response.status === 401 || response.status === 403 || response.status === 429) {
    state.rateLimited = true;
    const rlRemaining =
      getHeader(response.headers, 'x-ratelimit-remaining') ??
      getHeader(response.headers, 'ratelimit-remaining');
    const retryAfter = getHeader(response.headers, 'retry-after');
    const rlReset = getHeader(response.headers, 'x-ratelimit-reset');
    const isRateLimit = response.status === 429 || rlRemaining === '0' || Boolean(retryAfter);
    let resetNote = '';
    if (rlReset && /^\d+$/.test(rlReset.trim())) {
      const resetMs = Number(rlReset.trim()) * 1000;
      if (Number.isFinite(resetMs)) {
        resetNote = ` (resets ${new Date(resetMs).toISOString().replace(/\.\d{3}Z$/, 'Z')})`;
      }
    }
    const label = isRateLimit ? ' (rate limit exceeded)' : '';
    const authHint = buildAuthHint(providerLabel, hasToken);
    warn(`${providerLabel} API returned HTTP ${response.status}${label}${resetNote}${authHint}.`);

    if (cached) {
      return {
        ok: true,
        status: response.status,
        fromCache: true,
        stale: true,
        notModified: false,
        rateLimited: true,
        data: cached.body,
        nextUrl: cached.nextUrl,
      };
    }
    return { ok: false, status: response.status, rateLimited: true };
  }

  if (response.status === 404) {
    return { ok: false, status: 404, notFound: true, rateLimited: false };
  }

  if (cached && response.status >= 500) {
    state.offlineCacheTimestamp = state.offlineCacheTimestamp || cached.fetchedAt;
    return {
      ok: true,
      status: response.status,
      fromCache: true,
      stale: true,
      notModified: false,
      rateLimited: false,
      data: cached.body,
      nextUrl: cached.nextUrl,
    };
  }

  warn(`${providerLabel} API returned HTTP ${response.status}.`);
  return { ok: false, status: response.status, rateLimited: false };
}

/**
 * Fetch all pages of a paginated array endpoint with AbortSignal / deadline /
 * rate-limit awareness and cycle protection.
 *
 * @param {object} params
 * @returns {Promise<{items: Array<object>, ok: boolean, status?: number, notFound?: boolean, aborted?: boolean, rateLimited?: boolean}>}
 */
export async function fetchPaginatedJson(params) {
  const { initialUrl, maxPages = DEFAULT_MAX_PAGES, signal, state, warn, providerLabel } = params;
  const items = [];
  const seenUrls = new Set();
  let nextUrl = initialUrl;
  let lastStatus = 200;

  for (let page = 0; page < maxPages && nextUrl; page++) {
    if (signal?.aborted || (state.deadlineAt && Date.now() >= state.deadlineAt)) {
      if (!state.warnedPartial) {
        state.warnedPartial = true;
        warn(
          `${providerLabel} evidence fetch interrupted before completing pagination; returning partial results.`
        );
      }
      return {
        items,
        ok: items.length > 0,
        status: lastStatus,
        aborted: true,
        rateLimited: Boolean(state.rateLimited),
      };
    }

    if (state.rateLimited) {
      return {
        items,
        ok: items.length > 0,
        status: lastStatus,
        rateLimited: true,
      };
    }

    if (seenUrls.has(nextUrl)) break;
    seenUrls.add(nextUrl);

    const res = await cachedFetchJson({ ...params, url: nextUrl });
    lastStatus = res.status;

    if (res.aborted) {
      if (!state.warnedPartial) {
        state.warnedPartial = true;
        warn(
          `${providerLabel} evidence fetch interrupted before completing pagination; returning partial results.`
        );
      }
      return {
        items,
        ok: items.length > 0,
        status: lastStatus,
        aborted: true,
        rateLimited: Boolean(state.rateLimited || res.rateLimited),
      };
    }

    if (!res.ok) {
      if (page === 0) {
        return {
          items: [],
          ok: false,
          status: res.status,
          notFound: Boolean(res.notFound),
          rateLimited: Boolean(res.rateLimited),
        };
      }
      return {
        items,
        ok: items.length > 0,
        status: res.status,
        rateLimited: Boolean(res.rateLimited),
      };
    }

    if (!Array.isArray(res.data)) {
      if (page === 0) {
        return { items: [], ok: false, status: res.status, rateLimited: Boolean(res.rateLimited) };
      }
      break;
    }

    items.push(...res.data);
    nextUrl = res.nextUrl || null;

    if (nextUrl && (signal?.aborted || (state.deadlineAt && Date.now() >= state.deadlineAt))) {
      if (!state.warnedPartial) {
        state.warnedPartial = true;
        warn(
          `${providerLabel} evidence fetch interrupted before completing pagination; returning partial results.`
        );
      }
      return {
        items,
        ok: true,
        status: lastStatus,
        aborted: true,
        rateLimited: Boolean(state.rateLimited),
      };
    }
  }

  return {
    items,
    ok: true,
    status: lastStatus,
    rateLimited: Boolean(state.rateLimited),
  };
}

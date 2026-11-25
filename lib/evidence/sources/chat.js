/**
 * Local AI-assistant chat EvidenceSource (`lib/evidence/sources/chat.js`)
 *
 * Reads local conversation history exclusively through the `keyflip` CLI
 * (`conv capabilities` / `conv search ... --json --limit N --no-subagents`),
 * applies client-side repository-root filtering on `hit.cwd`, redacts secrets
 * before capping excerpts at 800 characters, and never opens keyflip index
 * files or persists conversation text to disk.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFile as nodeExecFile } from 'node:child_process';
import { normalizeEvidence } from '../contract.js';
import { DEFAULT_SOURCE_TIMEOUT_MS } from '../source.js';
import { redactSecrets } from '../../utils/secret-redactor.js';

export const DEFAULT_CHAT_BIN = 'keyflip';
export const DEFAULT_CHAT_LIMIT = 10;
export const DEFAULT_CHAT_TIMEOUT_MS = DEFAULT_SOURCE_TIMEOUT_MS;
export const DEFAULT_CHAT_MAX_BUFFER = 4 * 1024 * 1024;

function canonicalizePath(targetPath) {
  const resolved = path.resolve(targetPath);
  let probe = resolved;
  const tail = [];

  while (true) {
    try {
      const real = fs.realpathSync(probe);
      return tail.length > 0 ? path.join(real, ...tail.reverse()) : real;
    } catch {
      const parent = path.dirname(probe);
      if (parent === probe) return resolved;
      tail.push(path.basename(probe));
      probe = parent;
    }
  }
}

function isPathInsideOrEqual(rootDir, candidateDir) {
  const canonRoot = canonicalizePath(rootDir);
  const canonCandidate = canonicalizePath(candidateDir);
  const rel = path.relative(canonRoot, canonCandidate);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function runExecFile(customExecFile, bin, args, execOpts) {
  const fn = customExecFile ?? nodeExecFile;
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (err, stdout = '', stderr = '') => {
      if (settled) return;
      settled = true;
      if (err) reject(err);
      else resolve({ stdout: String(stdout ?? ''), stderr: String(stderr ?? '') });
    };

    try {
      const maybePromise = fn(bin, args, execOpts, (err, stdout, stderr) => {
        finish(err, stdout, stderr);
      });
      if (maybePromise && typeof maybePromise.then === 'function') {
        maybePromise.then(
          (res) => {
            if (typeof res === 'string') finish(null, res, '');
            else finish(null, res?.stdout ?? '', res?.stderr ?? '');
          },
          (err) => finish(err)
        );
      }
    } catch (err) {
      finish(err);
    }
  });
}

function isTimeoutOrAbortError(err, signal) {
  return Boolean(
    signal?.aborted ||
    err?.killed ||
    err?.code === 'ABORT_ERR' ||
    err?.name === 'AbortError' ||
    err?.code === 'ETIMEDOUT' ||
    err?.signal === 'SIGTERM' ||
    err?.signal === 'SIGKILL'
  );
}

function buildSearchQuery(query, searchOpts) {
  const parts = [];
  const seen = new Set();
  const baseQuery = typeof query === 'string' ? query.trim() : '';
  if (baseQuery) {
    parts.push(baseQuery);
    seen.add(baseQuery);
  }

  if (Array.isArray(searchOpts?.symbols)) {
    for (const sym of searchOpts.symbols) {
      if (typeof sym !== 'string') continue;
      const trimmed = sym.trim();
      if (!trimmed || seen.has(trimmed)) continue;
      if (baseQuery && baseQuery.includes(trimmed)) continue;
      seen.add(trimmed);
      parts.push(trimmed);
    }
  }

  if (parts.length === 0 && Array.isArray(searchOpts?.paths) && searchOpts.paths[0]) {
    const fallbackPath = String(searchOpts.paths[0]).trim();
    if (fallbackPath) parts.push(fallbackPath);
  }

  return parts.join(' ').trim();
}

function safeTimestamp(hit) {
  const candidate = hit?.updatedAt ?? hit?.ts ?? null;
  if (candidate === undefined || candidate === null || candidate === '') return null;
  if (candidate instanceof Date) {
    return Number.isFinite(candidate.getTime()) ? candidate : null;
  }
  if (typeof candidate === 'number') {
    return Number.isFinite(candidate) ? candidate : null;
  }
  if (typeof candidate === 'string') {
    const trimmed = candidate.trim();
    if (!trimmed) return null;
    return Number.isFinite(Date.parse(trimmed)) ? trimmed : null;
  }
  return null;
}

/**
 * Create a local AI-assistant chat `EvidenceSource` (`id: 'chat'`) backed by `keyflip`.
 *
 * @param {object} [options]
 * @param {string} [options.root=process.cwd()]
 * @param {string} [options.bin='keyflip']
 * @param {number} [options.timeoutMs=5000]
 * @param {Function} [options.execFile]
 * @param {NodeJS.ProcessEnv} [options.env]
 * @param {number} [options.limit=10]
 * @param {number} [options.maxBuffer=4194304]
 * @param {boolean} [options.redactPII=false]
 * @param {(message: string) => void} [options.onWarning]
 * @returns {{id: string, available: (opts?: {signal?: AbortSignal}) => Promise<boolean>, search: (query: string, searchOpts?: object) => Promise<Array<object>>}}
 */
export function createChatEvidenceSource(options = {}) {
  const resolvedRoot = path.resolve(options.root || process.cwd());
  const bin =
    typeof options.bin === 'string' && options.bin.trim() ? options.bin.trim() : DEFAULT_CHAT_BIN;
  const defaultTimeoutMs =
    typeof options.timeoutMs === 'number' &&
    Number.isFinite(options.timeoutMs) &&
    options.timeoutMs > 0
      ? options.timeoutMs
      : DEFAULT_CHAT_TIMEOUT_MS;
  const defaultLimit =
    Number.isInteger(options.limit) && options.limit > 0 ? options.limit : DEFAULT_CHAT_LIMIT;
  const maxBuffer =
    Number.isInteger(options.maxBuffer) && options.maxBuffer > 0
      ? options.maxBuffer
      : DEFAULT_CHAT_MAX_BUFFER;
  const customExecFile = typeof options.execFile === 'function' ? options.execFile : null;
  const effectiveEnv = options.env ?? process.env;
  const redactPII = Boolean(options.redactPII);

  const redactText = (value) => redactSecrets(String(value ?? ''), { redactPII }).text;

  return {
    id: 'chat',

    async available(availOpts = {}) {
      try {
        await runExecFile(customExecFile, bin, ['conv', 'capabilities'], {
          cwd: resolvedRoot,
          env: effectiveEnv,
          timeout: defaultTimeoutMs,
          maxBuffer,
          signal: availOpts?.signal,
          windowsHide: true,
        });
        return true;
      } catch (error) {
        if (isTimeoutOrAbortError(error, availOpts?.signal)) {
          throw error;
        }
        return false;
      }
    },

    async search(query, searchOpts = {}) {
      const searchQuery = buildSearchQuery(query, searchOpts);
      if (!searchQuery) return [];

      const warn = searchOpts.onWarning ?? options.onWarning;
      const effectiveLimit =
        Number.isInteger(searchOpts.limit) && searchOpts.limit > 0
          ? searchOpts.limit
          : defaultLimit;
      const effectiveTimeoutMs =
        typeof searchOpts.timeoutMs === 'number' &&
        Number.isFinite(searchOpts.timeoutMs) &&
        searchOpts.timeoutMs > 0
          ? searchOpts.timeoutMs
          : defaultTimeoutMs;

      let stdout;
      try {
        const res = await runExecFile(
          customExecFile,
          bin,
          [
            'conv',
            'search',
            searchQuery,
            '--json',
            '--limit',
            String(effectiveLimit),
            '--no-subagents',
          ],
          {
            cwd: resolvedRoot,
            env: effectiveEnv,
            timeout: effectiveTimeoutMs,
            maxBuffer,
            signal: searchOpts.signal,
            windowsHide: true,
          }
        );
        stdout = res.stdout;
      } catch (error) {
        if (error?.code === 'ENOENT') return [];
        if (isTimeoutOrAbortError(error, searchOpts.signal)) {
          throw error;
        }
        const firstLine = error?.message ? String(error.message).split('\n')[0] : 'command failed';
        warn?.(`Chat evidence source ("${bin}") failed: ${firstLine}.`);
        return [];
      }

      if (!stdout || !stdout.trim()) {
        warn?.(`Chat evidence source ("${bin}") returned empty output.`);
        return [];
      }

      let parsed;
      try {
        parsed = JSON.parse(stdout);
      } catch {
        warn?.(`Chat evidence source ("${bin}") returned invalid JSON.`);
        return [];
      }

      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        warn?.(`Chat evidence source ("${bin}") returned invalid JSON payload.`);
        return [];
      }

      if (parsed.schemaVersion !== 1) {
        warn?.(
          `Chat evidence source ("${bin}") returned unsupported schemaVersion (${JSON.stringify(parsed.schemaVersion)}).`
        );
        return [];
      }

      const hits = Array.isArray(parsed.hits)
        ? parsed.hits
        : Array.isArray(parsed.results)
          ? parsed.results
          : Array.isArray(parsed.items)
            ? parsed.items
            : null;
      if (!hits) {
        warn?.(`Chat evidence source ("${bin}") JSON payload is missing a hits array.`);
        return [];
      }

      const results = [];
      for (const hit of hits) {
        if (!hit || typeof hit !== 'object' || Array.isArray(hit)) continue;
        if (typeof hit.id !== 'string' || !hit.id.trim()) continue;
        if (typeof hit.cwd !== 'string' || !hit.cwd.trim()) continue;
        if (!isPathInsideOrEqual(resolvedRoot, hit.cwd)) continue;

        const chunk = hit.chunk ?? 0;
        const ref = redactText(`${hit.id.trim()}#${chunk}`).trim();
        const id = `chat:${ref}`;
        const author =
          typeof hit.role === 'string' && hit.role.trim() ? redactText(hit.role.trim()) : undefined;
        const title =
          typeof hit.title === 'string' && hit.title.trim()
            ? redactText(hit.title.trim())
            : undefined;
        const excerpt = redactText(typeof hit.snippet === 'string' ? hit.snippet : '');
        const score =
          typeof hit.score === 'number' && Number.isFinite(hit.score) ? Math.max(0, hit.score) : 0;

        results.push(
          normalizeEvidence(
            {
              id,
              kind: 'chat',
              source: 'keyflip',
              url: null,
              ref,
              timestamp: safeTimestamp(hit),
              ...(author !== undefined ? { author } : {}),
              ...(title !== undefined ? { title } : {}),
              excerpt,
              score,
            },
            { redactPII }
          )
        );
      }

      return results;
    },
  };
}

export default {
  DEFAULT_CHAT_BIN,
  DEFAULT_CHAT_LIMIT,
  DEFAULT_CHAT_TIMEOUT_MS,
  DEFAULT_CHAT_MAX_BUFFER,
  createChatEvidenceSource,
};

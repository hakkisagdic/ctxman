import fs from 'node:fs';
import path from 'node:path';
import { DigestError } from './gate.js';
import {
  writeDigest as writeStoreDigest,
  listDigests,
  resolveDigestRef,
  splitLines,
} from './store.js';

const SUMMARY_KEYS = ['done', 'result', 'open', 'needs'];
const MAX_SUMMARY_LINE_CHARS = 160;
const MAX_GREP_PATTERN_CHARS = 200;
const MAX_GREP_MATCHES = 500;

function cleanSummaryValue(value) {
  return String(value)
    .replace(/[\r\n]+/g, ' ')
    .trim()
    .slice(0, MAX_SUMMARY_LINE_CHARS);
}

/**
 * Build up to 4 concise summary fields (done, result, open, needs), each capped at 160 chars.
 * Uses writer-supplied fields when any are non-empty; otherwise falls back to rule-based extraction.
 * @param {string} text
 * @param {Object} [fields={}]
 * @returns {Record<string, string>}
 */
export function summarize(text, fields = {}) {
  const supplied = {};
  if (fields && typeof fields === 'object') {
    for (const key of SUMMARY_KEYS) {
      if (fields[key] !== undefined && fields[key] !== null) {
        const cleaned = cleanSummaryValue(fields[key]);
        if (cleaned.length > 0) {
          supplied[key] = cleaned;
        }
      }
    }
  }

  if (Object.keys(supplied).length > 0) {
    return supplied;
  }

  const nonEmpty = splitLines(typeof text === 'string' ? text : '')
    .map((line) => line.trim())
    .filter(Boolean);

  const candidates = {
    done: nonEmpty[0],
    result: nonEmpty[1],
    open: nonEmpty.find((line) => /^(open|todo|pending)/i.test(line)),
    needs: nonEmpty.find((line) => /^(needs?|question)/i.test(line)),
  };

  const derived = {};
  for (const key of SUMMARY_KEYS) {
    if (candidates[key]) {
      const cleaned = cleanSummaryValue(candidates[key]);
      if (cleaned.length > 0) {
        derived[key] = cleaned;
      }
    }
  }
  return derived;
}

/**
 * Write a digest to the store and format its compact <=7-line stdout summary.
 * Supports `(id, text, options)` or `({ id, text, fields, done, result, open, needs, storeDir, env, force })`.
 * @param {string|Object} idOrOptions
 * @param {string} [maybeText]
 * @param {Object} [maybeOptions={}]
 * @returns {{ id: string, path: string, bytes: number, lines: number, summary: Record<string, string>, output: string }}
 */
export function writeDigest(idOrOptions, maybeText, maybeOptions = {}) {
  let id;
  let text;
  let storeDir;
  let env;
  let force;
  let writerFields;

  if (idOrOptions && typeof idOrOptions === 'object') {
    ({ id, text, storeDir, env, force } = idOrOptions);
    writerFields = {
      ...(idOrOptions.fields || {}),
      ...(idOrOptions.done !== undefined ? { done: idOrOptions.done } : {}),
      ...(idOrOptions.result !== undefined ? { result: idOrOptions.result } : {}),
      ...(idOrOptions.open !== undefined ? { open: idOrOptions.open } : {}),
      ...(idOrOptions.needs !== undefined ? { needs: idOrOptions.needs } : {}),
    };
  } else {
    id = idOrOptions;
    text = maybeText;
    const opts = typeof maybeOptions === 'string' ? { storeDir: maybeOptions } : maybeOptions || {};
    ({ storeDir, env, force } = opts);
    writerFields = {
      ...(opts.fields || {}),
      ...(opts.done !== undefined ? { done: opts.done } : {}),
      ...(opts.result !== undefined ? { result: opts.result } : {}),
      ...(opts.open !== undefined ? { open: opts.open } : {}),
      ...(opts.needs !== undefined ? { needs: opts.needs } : {}),
    };
  }

  const stored = writeStoreDigest(id, text, { storeDir, env, force });
  const summary = summarize(text, writerFields);

  const outLines = [`id: ${stored.id}`, `path: ${stored.path}`];
  for (const key of SUMMARY_KEYS) {
    if (summary[key]) {
      outLines.push(`${key}: ${summary[key]}`);
    }
  }

  return {
    ...stored,
    summary,
    output: `${outLines.join('\n')}\n`,
  };
}

function parseLineRange(linesSpec) {
  const match = /^(\d+)(?:-(\d+))?$/.exec(String(linesSpec).trim());
  if (!match) {
    throw new DigestError(`Invalid line range: ${linesSpec}`, 'INVALID_LINES');
  }
  const start = Number.parseInt(match[1], 10);
  const end = match[2] !== undefined ? Number.parseInt(match[2], 10) : start;
  if (start < 1 || end < 1 || start > end) {
    throw new DigestError(`Invalid line range: ${linesSpec}`, 'INVALID_LINES');
  }
  return { start, end };
}

function buildGrepMatcher(pattern) {
  if (typeof pattern !== 'string' || pattern.length === 0) {
    throw new DigestError('Grep pattern must be a non-empty string', 'INVALID_GREP');
  }
  if (pattern.length > MAX_GREP_PATTERN_CHARS) {
    throw new DigestError(
      `Grep pattern exceeds maximum length of ${MAX_GREP_PATTERN_CHARS} characters`,
      'INVALID_GREP'
    );
  }
  try {
    const regex = new RegExp(pattern);
    return (line) => regex.test(line);
  } catch {
    return (line) => line.includes(pattern);
  }
}

/**
 * Read a stored digest by id or store-contained path, with optional 1-based line range and JS regex grep.
 * `grep` compiles as a JavaScript RegExp (falling back to literal substring match on invalid regex syntax),
 * enforces a 200-character pattern limit, and caps output at 500 matching lines.
 * @param {string|Object} refOrOptions
 * @param {Object} [maybeOptions={}]
 * @returns {{ id: string, path: string, totalLines: number, truncated: boolean, matches: Array<{ line: number, content: string }>, text: string }}
 */
export function readDigest(refOrOptions, maybeOptions = {}) {
  let ref;
  let lines;
  let grep;
  let storeDir;
  let env;

  if (refOrOptions && typeof refOrOptions === 'object') {
    ({ ref, lines, grep, storeDir, env } = refOrOptions);
  } else {
    ref = refOrOptions;
    const opts = typeof maybeOptions === 'string' ? { storeDir: maybeOptions } : maybeOptions || {};
    ({ lines, grep, storeDir, env } = opts);
  }

  const resolvedPath = resolveDigestRef(ref, { storeDir, env });
  const allLines = splitLines(fs.readFileSync(resolvedPath, 'utf8'));

  let entries = allLines.map((content, idx) => ({ line: idx + 1, content }));

  if (lines !== undefined && lines !== null && lines !== '') {
    const { start, end } = parseLineRange(lines);
    entries =
      start > allLines.length ? [] : entries.slice(start - 1, Math.min(end, allLines.length));
  }

  let truncated = false;
  if (grep !== undefined && grep !== null) {
    const matcher = buildGrepMatcher(grep);
    const matched = [];
    for (const entry of entries) {
      if (matcher(entry.content)) {
        if (matched.length >= MAX_GREP_MATCHES) {
          truncated = true;
          break;
        }
        matched.push(entry);
      }
    }
    entries = matched;
  }

  const text =
    entries.length > 0 ? `${entries.map((e) => `${e.line}: ${e.content}`).join('\n')}\n` : '';

  return {
    id: path.basename(resolvedPath, '.md'),
    path: resolvedPath,
    totalLines: allLines.length,
    truncated,
    matches: entries,
    text,
  };
}

export { listDigests, DigestError };

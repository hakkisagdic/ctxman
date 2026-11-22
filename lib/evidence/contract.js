/**
 * Uniform Evidence contract (`lib/evidence/contract.js`)
 *
 * Every evidence connector normalizes its items through `normalizeEvidence(raw)` so
 * consumers receive a validated, secret-redacted, token-counted record with an excerpt
 * capped at 800 characters.
 */

import { redactSecrets } from '../utils/secret-redactor.js';
import TokenUtils from '../utils/token-utils.js';

export const EVIDENCE_KINDS = Object.freeze([
  'commit',
  'pr',
  'review-comment',
  'issue',
  'chat',
  'decision',
  'doc',
  'ci-log',
  'code',
]);

const KIND_SET = new Set(EVIDENCE_KINDS);

export const MAX_EXCERPT_CHARS = 800;

export class EvidenceError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   */
  constructor(code, message) {
    super(message);
    this.name = 'EvidenceError';
    this.code = code;
  }
}

function stripUrlCredentials(value) {
  return value.replace(/^([a-z][a-z0-9+.-]*:\/\/)[^/@\s]*@/i, '$1');
}

function toCanonicalUtcIso(ms) {
  return new Date(ms).toISOString().replace(/\.000Z$/, 'Z');
}

function normalizeTimestamp(value) {
  if (value === undefined || value === null || value === '') return null;
  if (value instanceof Date) {
    const ms = value.getTime();
    if (!Number.isFinite(ms)) {
      throw new EvidenceError('INVALID_EVIDENCE', 'Evidence timestamp Date is invalid');
    }
    return toCanonicalUtcIso(ms);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new EvidenceError('INVALID_EVIDENCE', 'Evidence timestamp number must be finite');
    }
    return toCanonicalUtcIso(value);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const ms = Date.parse(trimmed);
    if (!Number.isFinite(ms)) {
      throw new EvidenceError(
        'INVALID_EVIDENCE',
        `Invalid evidence timestamp: ${JSON.stringify(value)}`
      );
    }
    return toCanonicalUtcIso(ms);
  }
  throw new EvidenceError(
    'INVALID_EVIDENCE',
    'Evidence timestamp must be an ISO-8601 string, Date, epoch milliseconds, or null'
  );
}

function capExcerpt(redactedText, maxChars) {
  const normalized = redactedText.replace(/\r\n/g, '\n').trim();
  if (normalized.length <= maxChars) return normalized;
  if (maxChars <= 1) return normalized.slice(0, Math.max(0, maxChars));
  return `${normalized.slice(0, maxChars - 1).trimEnd()}…`;
}

/**
 * Validate and normalize a raw evidence record.
 *
 * Applies `redactSecrets` before truncating `excerpt` to 800 characters so a secret
 * straddling the truncation boundary cannot be cut in half and evade pattern matching.
 *
 * @param {object} raw
 * @param {object} [options]
 * @param {boolean} [options.redactPII=false]
 * @returns {{
 *   id: string,
 *   kind: string,
 *   source: string,
 *   url: string|null,
 *   ref: string|null,
 *   timestamp: string|null,
 *   author?: string,
 *   title?: string,
 *   excerpt: string,
 *   score: number,
 *   tokens: number
 * }}
 */
export function normalizeEvidence(raw, options = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new EvidenceError('INVALID_EVIDENCE', 'Evidence record must be a non-null object');
  }

  if (typeof raw.id !== 'string' || !raw.id.trim()) {
    throw new EvidenceError('INVALID_EVIDENCE', 'Evidence id must be a non-empty string');
  }
  const id = raw.id.trim();

  if (typeof raw.kind !== 'string' || !KIND_SET.has(raw.kind)) {
    throw new EvidenceError(
      'INVALID_EVIDENCE',
      `Evidence kind must be one of ${EVIDENCE_KINDS.join(', ')} (got ${JSON.stringify(raw.kind)})`
    );
  }
  const kind = raw.kind;

  if (typeof raw.source !== 'string' || !raw.source.trim()) {
    throw new EvidenceError('INVALID_EVIDENCE', 'Evidence source must be a non-empty string');
  }
  const source = redactSecrets(raw.source.trim(), options).text;

  if (raw.url !== undefined && raw.url !== null && typeof raw.url !== 'string') {
    throw new EvidenceError('INVALID_EVIDENCE', 'Evidence url must be a string or null');
  }
  if (raw.ref !== undefined && raw.ref !== null && typeof raw.ref !== 'string') {
    throw new EvidenceError('INVALID_EVIDENCE', 'Evidence ref must be a string or null');
  }

  const cleanedUrl = raw.url
    ? redactSecrets(stripUrlCredentials(raw.url.trim()), options).text.trim()
    : '';
  const cleanedRef = raw.ref ? redactSecrets(raw.ref.trim(), options).text.trim() : '';
  const url = cleanedUrl || null;
  const ref = cleanedRef || null;

  if (!url && !ref) {
    throw new EvidenceError('INVALID_EVIDENCE', 'Evidence requires a non-empty url or ref');
  }

  const timestamp = normalizeTimestamp(raw.timestamp);

  let author;
  if (raw.author !== undefined && raw.author !== null) {
    if (typeof raw.author !== 'string') {
      throw new EvidenceError('INVALID_EVIDENCE', 'Evidence author must be a string');
    }
    const trimmedAuthor = redactSecrets(raw.author, options).text.trim();
    if (trimmedAuthor) author = trimmedAuthor;
  }

  let title;
  if (raw.title !== undefined && raw.title !== null) {
    if (typeof raw.title !== 'string') {
      throw new EvidenceError('INVALID_EVIDENCE', 'Evidence title must be a string');
    }
    const trimmedTitle = redactSecrets(raw.title, options).text.trim();
    if (trimmedTitle) title = trimmedTitle;
  }

  if (raw.excerpt !== undefined && raw.excerpt !== null && typeof raw.excerpt !== 'string') {
    throw new EvidenceError('INVALID_EVIDENCE', 'Evidence excerpt must be a string');
  }
  const redactedExcerpt = redactSecrets(raw.excerpt ?? '', options).text;
  const excerpt = capExcerpt(redactedExcerpt, MAX_EXCERPT_CHARS);

  const score = raw.score === undefined ? 0 : raw.score;
  if (typeof score !== 'number' || !Number.isFinite(score) || score < 0) {
    throw new EvidenceError(
      'INVALID_EVIDENCE',
      `Evidence score must be a finite number >= 0 (got ${JSON.stringify(raw.score)})`
    );
  }

  const tokenBasis = title ? (excerpt ? `${title}\n${excerpt}` : title) : excerpt;
  const tokens = TokenUtils.calculate(tokenBasis, 'evidence.md');

  return {
    id,
    kind,
    source,
    url,
    ref,
    timestamp,
    ...(author !== undefined ? { author } : {}),
    ...(title !== undefined ? { title } : {}),
    excerpt,
    score,
    tokens,
  };
}

export default {
  EVIDENCE_KINDS,
  MAX_EXCERPT_CHARS,
  EvidenceError,
  normalizeEvidence,
};

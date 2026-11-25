/**
 * Uniform citation builder and `[n]` text renderer (`lib/evidence/citations.js`)
 */

import { normalizeEvidence } from './contract.js';
import { compareEvidence, isEvidenceDenied } from './source.js';

function singleLine(text) {
  return String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatDay(timestamp) {
  return typeof timestamp === 'string' && timestamp.length >= 10 ? timestamp.slice(0, 10) : null;
}

function formatLocator(item) {
  if (item.url && item.ref && item.url !== item.ref) {
    return `${item.url} (${item.ref})`;
  }
  return item.url || item.ref || '';
}

/**
 * Normalize, policy-filter, deduplicate, and deterministically order an `Evidence[]` list
 * suitable for `citations[]` in JSON output.
 *
 * @param {Array<object>} items
 * @param {object} [options]
 * @param {(pathOrRef: string) => boolean} [options.isDenied]
 * @param {boolean} [options.redactPII=false]
 * @returns {Array<object>}
 */
export function buildCitations(items, options = {}) {
  if (!Array.isArray(items) || items.length === 0) return [];

  const normalized = [];
  for (const raw of items) {
    if (isEvidenceDenied(raw, null, options.isDenied)) continue;
    const ev = normalizeEvidence(raw, { redactPII: Boolean(options.redactPII) });
    if (isEvidenceDenied(raw, ev, options.isDenied)) continue;
    normalized.push(ev);
  }

  normalized.sort(compareEvidence);

  const seen = new Set();
  const result = [];
  for (const ev of normalized) {
    if (seen.has(ev.id)) continue;
    seen.add(ev.id);
    result.push(ev);
  }
  return result;
}

/**
 * Format code links attached to an evidence record (e.g. `path:src/cart.js, symbol:total`).
 *
 * @param {Array<{type: string, value: string, confidence: number}>|undefined} links
 * @returns {string}
 */
export function formatLinkSummary(links) {
  if (!Array.isArray(links) || links.length === 0) return '';
  return links
    .map((link) => {
      const displayValue =
        (link.type === 'sha' || link.type === 'time') && /^[0-9a-f]{13,40}$/i.test(link.value)
          ? link.value.slice(0, 12)
          : link.value;
      return `${link.type}:${displayValue}`;
    })
    .join(', ');
}

/**
 * Format metadata summary for a single Evidence citation entry.
 *
 * @param {object} item
 * @returns {string}
 */
export function formatSourceMeta(item) {
  const meta = [`${item.kind} (${item.source})`];
  const day = formatDay(item.timestamp);
  if (day) meta.push(day);
  if (item.author) meta.push(item.author);
  const locator = formatLocator(item);
  if (locator) meta.push(locator);
  const linkSummary = formatLinkSummary(item.links);
  if (linkSummary) meta.push(`links: ${linkSummary}`);
  return meta.join(' \u00b7 ');
}

/**
 * Render the trailing `Sources:` list for `citations[]`.
 *
 * @param {Array<object>} citations
 * @returns {string[]}
 */
export function renderSourcesList(citations) {
  if (!Array.isArray(citations) || citations.length === 0) return [];
  const lines = ['Sources:'];
  citations.forEach((item, index) => {
    lines.push(`- [${index + 1}] ${formatSourceMeta(item)}`);
  });
  return lines;
}

/**
 * Render numbered `[n]` evidence lines followed by a trailing `Sources:` list.
 *
 * @param {Array<object>} citations
 * @returns {string}
 */
export function renderCitations(citations) {
  if (!Array.isArray(citations) || citations.length === 0) return '';

  const inlineLines = [];

  citations.forEach((item, index) => {
    const n = index + 1;
    const titlePart = item.title ? singleLine(item.title) : '';
    const excerptPart = item.excerpt ? singleLine(item.excerpt) : '';

    let bodyText;
    if (titlePart && excerptPart && titlePart !== excerptPart) {
      bodyText = `${titlePart} — ${excerptPart}`;
    } else {
      bodyText = titlePart || excerptPart || item.ref || item.url || item.id;
    }
    inlineLines.push(`[${n}] ${bodyText}`);
  });

  const sourceLines = renderSourcesList(citations);
  return `${inlineLines.join('\n')}\n\n${sourceLines.join('\n')}`;
}

export default {
  buildCitations,
  formatLinkSummary,
  formatSourceMeta,
  renderSourcesList,
  renderCitations,
};

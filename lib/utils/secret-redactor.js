/**
 * Secret Redaction
 * Masks credentials before file contents are exported for an LLM.
 *
 * Only high-precision patterns (fixed prefixes, documented formats): a false
 * positive silently changes the code the model sees, so generic heuristics such
 * as `password = "..."` or entropy checks are deliberately left out.
 */

const SECRET_PATTERNS = [
  {
    type: 'private-key',
    regex:
      /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----[\s\S]*?-----END (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----/g,
  },
  { type: 'aws-access-key-id', regex: /\b(?:AKIA|ASIA|ABIA|ACCA)[0-9A-Z]{16}\b/g },
  {
    type: 'github-token',
    regex: /\b(?:gh[pousr]_[A-Za-z0-9]{36,255}|github_pat_[A-Za-z0-9_]{22,255})\b/g,
  },
  { type: 'gitlab-token', regex: /\bglpat-[A-Za-z0-9_-]{20,}/g },
  { type: 'slack-token', regex: /\bxox[abposr]-[A-Za-z0-9-]{10,}/g },
  { type: 'stripe-secret-key', regex: /\b[rs]k_live_[A-Za-z0-9]{20,}\b/g },
  { type: 'google-api-key', regex: /\bAIza[0-9A-Za-z_-]{35}(?![0-9A-Za-z_-])/g },
  { type: 'anthropic-api-key', regex: /\bsk-ant-[A-Za-z0-9_-]{20,}/g },
  // OpenAI keys embed the base64 of "OpenAI" (T3BlbkFJ)
  { type: 'openai-api-key', regex: /\bsk-[A-Za-z0-9_-]{20,}T3BlbkFJ[A-Za-z0-9_-]{20,}/g },
  { type: 'npm-token', regex: /\bnpm_[A-Za-z0-9]{36}\b/g },
];

/**
 * Replace known secret formats with `[REDACTED:<type>]`
 * @param {string} text - Content to scan
 * @returns {{text: string, findings: string[]}} Redacted text and one entry per match
 */
export function redactSecrets(text) {
  const findings = [];
  let redacted = text;

  for (const { type, regex } of SECRET_PATTERNS) {
    redacted = redacted.replace(regex, () => {
      findings.push(type);
      return `[REDACTED:${type}]`;
    });
  }

  return { text: redacted, findings };
}

/**
 * Format redaction counts for console output, e.g. "2 aws-access-key-id, 1 private-key"
 * @param {Object<string, number>} counts - Matches per secret type
 * @returns {string}
 */
export function formatRedactionSummary(counts) {
  return Object.entries(counts)
    .map(([type, count]) => `${count} ${type}`)
    .join(', ');
}

export default { redactSecrets, formatRedactionSummary };

/**
 * Secret & KVKK/BDDK PII Redaction
 * Masks credentials and regulated Turkish/Global PII before file contents are exported for an LLM.
 *
 * Only high-precision patterns (fixed prefixes, documented formats, or algorithmic checksums
 * such as TCKN mod-10/mod-11 and Credit Card Luhn): a false positive silently changes the code
 * the model sees, so generic heuristics are deliberately left out.
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
 * Validate an 11-digit Turkish Republic Identity Number (TCKN) using the official
 * NVI mod-10 / mod-11 checksum algorithm.
 * @param {string} value
 * @returns {boolean}
 */
export function isValidTCKN(value) {
  const str = String(value ?? '').trim();
  if (!/^[1-9]\d{10}$/.test(str)) return false;

  const digits = str.split('').map(Number);
  const oddSum = digits[0] + digits[2] + digits[4] + digits[6] + digits[8];
  const evenSum = digits[1] + digits[3] + digits[5] + digits[7];

  const tenth = (((oddSum * 7 - evenSum) % 10) + 10) % 10;
  if (digits[9] !== tenth) return false;

  const firstTenSum = digits.slice(0, 10).reduce((acc, d) => acc + d, 0);
  if (digits[10] !== firstTenSum % 10) return false;

  return true;
}

/**
 * Validate a 13–19 digit payment card number (Visa, Mastercard, Amex, Troy, etc.)
 * using the Luhn checksum algorithm.
 * @param {string} raw
 * @returns {boolean}
 */
export function isValidLuhn(raw) {
  const digitsOnly = String(raw ?? '').replace(/[\s-]/g, '');
  if (!/^\d{13,19}$/.test(digitsOnly)) return false;
  // Reject all-identical digits like 0000000000000000
  if (/^(\d)\1+$/.test(digitsOnly)) return false;

  let sum = 0;
  let shouldDouble = false;
  for (let i = digitsOnly.length - 1; i >= 0; i--) {
    let digit = digitsOnly.charCodeAt(i) - 48;
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

/**
 * Redact KVKK / BDDK regulated PII (TR IBAN, TCKN, Credit Card, Email, TR Phone)
 * @param {string} text
 * @returns {{text: string, findings: string[]}}
 */
export function redactPII(text) {
  const findings = [];
  let redacted = text;

  // 1. TR IBAN (TR + 2 check digits + 22 alphanumeric/digits, optionally space-grouped)
  redacted = redacted.replace(/\bTR\d{2}(?:\s?\d{4}){5}\s?\d{2}\b/g, () => {
    findings.push('TR_IBAN');
    return '[REDACTED:TR_IBAN]';
  });

  // 2. Credit Card numbers (13–19 digits with optional spaces or hyphens, Luhn-verified)
  redacted = redacted.replace(/\b\d{4}(?:[\s-]?\d{4}){2,3}(?:[\s-]?\d{1,3})?\b/g, (match) => {
    if (!isValidLuhn(match)) return match;
    findings.push('CREDIT_CARD');
    return '[REDACTED:CREDIT_CARD]';
  });

  // 3. Turkish National ID (TCKN) — 11 digits verified with mod-10 / mod-11 checksum
  redacted = redacted.replace(/\b[1-9]\d{10}\b/g, (match) => {
    if (!isValidTCKN(match)) return match;
    findings.push('TCKN');
    return '[REDACTED:TCKN]';
  });

  // 4. Turkish mobile phone numbers (+90 5xx xxx xx xx, 05xx xxx xx xx)
  redacted = redacted.replace(
    /(?:\+90|0090|\b0)[\s.-]*\(?5\d{2}\)?[\s.-]*\d{3}[\s.-]*\d{2}[\s.-]*\d{2}\b/g,
    () => {
      findings.push('TR_PHONE');
      return '[REDACTED:TR_PHONE]';
    }
  );

  // 5. Email addresses
  redacted = redacted.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, () => {
    findings.push('EMAIL');
    return '[REDACTED:EMAIL]';
  });

  return { text: redacted, findings };
}

/**
 * Replace known secret formats (and optionally KVKK/BDDK PII) with `[REDACTED:<type>]`
 * @param {string} text - Content to scan
 * @param {object} [options]
 * @param {boolean} [options.redactPII=false] - Also mask TCKN, TR_IBAN, CREDIT_CARD, EMAIL, TR_PHONE
 * @returns {{text: string, findings: string[]}} Redacted text and one entry per match
 */
export function redactSecrets(text, options = {}) {
  const findings = [];
  let redacted = text;

  for (const { type, regex } of SECRET_PATTERNS) {
    redacted = redacted.replace(regex, () => {
      findings.push(type);
      return `[REDACTED:${type}]`;
    });
  }

  if (options?.redactPII) {
    const piiResult = redactPII(redacted);
    redacted = piiResult.text;
    findings.push(...piiResult.findings);
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

export default {
  redactSecrets,
  redactPII,
  isValidTCKN,
  isValidLuhn,
  formatRedactionSummary,
};

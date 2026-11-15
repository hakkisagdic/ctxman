const SENSITIVITY_PATTERNS = {
  RESTRICTED_SECRET: [
    /\b(?:privateKey|secretKey|apiSecret|jwtSecret|masterKey|encryptionKey|passwordHash)\b/i,
    /\b(?:BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY|ak_live_|sk_live_)\b/,
  ],
  CONFIDENTIAL_FINANCIAL_PII: [
    /\b(?:tckn|tcKimlik|iban|creditCard|cardNumber|cvv|panNumber|taxNumber|vergiNo|salary|maas)\b/i,
    /\b(?:kvkk|bddk|iyzico)\b/i,
  ],
  INTERNAL_AUTH_OPERATIONAL: [
    /\b(?:sessionId|accessToken|refreshToken|userId|customerEmail|phoneNumber|auditLog)\b/i,
  ],
};

/**
 * Classifies source files into enterprise data sensitivity tiers
 * (`RESTRICTED`, `CONFIDENTIAL`, `INTERNAL`, `PUBLIC`) based on PII, financial,
 * and cryptographic indicators (F10-4).
 *
 * @param {object} options
 * @param {Array<{path: string, content: string}>} [options.files=[]]
 * @returns {{
 *   classifications: Array<{
 *     file: string,
 *     tier: 'RESTRICTED' | 'CONFIDENTIAL' | 'INTERNAL' | 'PUBLIC',
 *     matchedIndicators: string[],
 *     requiresRedaction: boolean
 *   }>,
 *   summary: {
 *     totalFiles: number,
 *     byTier: Record<'RESTRICTED' | 'CONFIDENTIAL' | 'INTERNAL' | 'PUBLIC', number>
 *   }
 * }}
 */
export function classifyDataSensitivity(options = {}) {
  const { files = [] } = options;
  const classifications = [];
  const byTier = {
    RESTRICTED: 0,
    CONFIDENTIAL: 0,
    INTERNAL: 0,
    PUBLIC: 0,
  };

  for (const fileObj of files) {
    const file = String(fileObj.path || '').replace(/\\/g, '/');
    const content = String(fileObj.content || '');
    if (!file) continue;

    const matchedIndicators = [];

    for (const rx of SENSITIVITY_PATTERNS.RESTRICTED_SECRET) {
      const m = content.match(rx);
      if (m) matchedIndicators.push(`secret:${m[0]}`);
    }
    for (const rx of SENSITIVITY_PATTERNS.CONFIDENTIAL_FINANCIAL_PII) {
      const m = content.match(rx);
      if (m) matchedIndicators.push(`financial_pii:${m[0]}`);
    }
    for (const rx of SENSITIVITY_PATTERNS.INTERNAL_AUTH_OPERATIONAL) {
      const m = content.match(rx);
      if (m) matchedIndicators.push(`internal:${m[0]}`);
    }

    let tier = 'PUBLIC';
    if (matchedIndicators.some((i) => i.startsWith('secret:'))) {
      tier = 'RESTRICTED';
    } else if (matchedIndicators.some((i) => i.startsWith('financial_pii:'))) {
      tier = 'CONFIDENTIAL';
    } else if (matchedIndicators.some((i) => i.startsWith('internal:'))) {
      tier = 'INTERNAL';
    }

    byTier[tier]++;
    classifications.push({
      file,
      tier: /** @type {'RESTRICTED'|'CONFIDENTIAL'|'INTERNAL'|'PUBLIC'} */ (tier),
      matchedIndicators,
      requiresRedaction: tier === 'RESTRICTED' || tier === 'CONFIDENTIAL',
    });
  }

  return {
    classifications,
    summary: {
      totalFiles: classifications.length,
      byTier,
    },
  };
}

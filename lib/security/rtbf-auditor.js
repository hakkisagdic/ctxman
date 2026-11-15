/**
 * F15-4: KVKK / GDPR Right-to-be-Forgotten (RTBF) Data Erasure Auditor
 * Verifies that user deletion/anonymization workflows cover all PII tables, caches, and search indexes.
 */

/**
 * Audit whether an account deletion / RTBF handler erases or anonymizes all user PII stores.
 *
 * @param {object} options
 * @param {string[]} [options.piiStores] - All known tables/buckets/indexes storing user PII
 * @param {string} [options.deletionHandlerCode] - Source code of the RTBF / deleteAccount workflow
 * @param {string[]} [options.explicitlyCoveredStores]
 * @param {boolean} [options.hasAuditTombstone=false]
 * @returns {object}
 */
export function auditRightToBeForgotten(options = {}) {
  const piiStores = Array.isArray(options.piiStores) ? options.piiStores : [];
  const code = String(options.deletionHandlerCode || '');
  const explicitSet = new Set(
    Array.isArray(options.explicitlyCoveredStores) ? options.explicitlyCoveredStores : []
  );

  const coveredStores = [];
  const orphanedPiiStores = [];

  for (const store of piiStores) {
    const escaped = store.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const storeRegex = new RegExp(`\\b${escaped}\\b`, 'i');
    if (explicitSet.has(store) || storeRegex.test(code)) {
      coveredStores.push(store);
    } else {
      orphanedPiiStores.push(store);
    }
  }

  const hasAuditTombstone =
    Boolean(options.hasAuditTombstone) ||
    /\b(?:erasure_log|rtbf_audit|anonymized_at|tombstone)\b/i.test(code);

  const compliant = orphanedPiiStores.length === 0 && hasAuditTombstone;

  return {
    compliant,
    coveredStores,
    orphanedPiiStores,
    hasAuditTombstone,
    summary: {
      totalPiiStores: piiStores.length,
      coveredCount: coveredStores.length,
      orphanedCount: orphanedPiiStores.length,
      hasAuditTombstone,
    },
  };
}

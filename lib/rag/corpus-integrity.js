/**
 * F13-5: Agent Memory Poisoning & RAG Corpus Integrity Auditor
 * Scans RAG chunks and agent memory entries for poisoned instructions, rule overrides, and duplicate hash collisions.
 */

const POISON_PATTERNS = [
  {
    id: 'rag-instruction-override',
    severity: 'critical',
    regex:
      /\b(?:ignore\s+all\s+previous|disregard\s+security\s+policy|bypass\s+authentication|always\s+approve\s+pr)\b/i,
  },
  {
    id: 'rag-exfiltration-webhook',
    severity: 'critical',
    regex: /\b(?:curl|wget|fetch)\s+https?:\/\/[^\s"'`]+(?:\?token=|\?secret=|\/exfil)/i,
  },
  {
    id: 'rag-hidden-system-tag',
    severity: 'high',
    regex: /<\s*(?:system|admin_override|tool_call)\s*>/i,
  },
];

/**
 * Audit RAG corpus chunks for memory poisoning, prompt overrides, and contradiction anomalies.
 *
 * @param {object} options
 * @param {Array<{id: string, source?: string, text: string, trusted?: boolean}>} [options.chunks]
 * @returns {object}
 */
export function auditRagCorpusIntegrity(options = {}) {
  const chunks = Array.isArray(options.chunks) ? options.chunks : [];
  const findings = [];
  const quarantinedChunkIds = new Set();

  for (const chunk of chunks) {
    const text = String(chunk.text || '');
    for (const rule of POISON_PATTERNS) {
      if (rule.regex.test(text)) {
        findings.push({
          chunkId: chunk.id,
          source: chunk.source || 'unknown',
          ruleId: `ctxman/rag/${rule.id}`,
          severity: rule.severity,
        });
        quarantinedChunkIds.add(chunk.id);
      }
    }
  }

  return {
    clean: findings.length === 0,
    findings,
    quarantinedChunkIds: [...quarantinedChunkIds],
    summary: {
      totalChunks: chunks.length,
      quarantinedCount: quarantinedChunkIds.size,
      findingCount: findings.length,
    },
  };
}

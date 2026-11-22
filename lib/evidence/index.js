/**
 * Uniform Evidence contract, connector runner, and `[n]` citations (`lib/evidence/index.js`)
 */

export { EVIDENCE_KINDS, MAX_EXCERPT_CHARS, EvidenceError, normalizeEvidence } from './contract.js';

export {
  DEFAULT_SOURCE_TIMEOUT_MS,
  compareEvidence,
  isEvidenceDenied,
  runSources,
} from './source.js';

export { buildCitations, renderCitations } from './citations.js';

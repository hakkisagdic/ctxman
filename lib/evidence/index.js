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

export { buildCitations, formatLinkSummary, renderCitations } from './citations.js';

export { DEFAULT_EVIDENCE_CACHE_RELPATH, EvidenceHttpCache } from './sources/github-cache.js';

export { createGitHubEvidenceSource, resolveGitHubToken, githubApiBase } from './sources/github.js';

export { createGitLabEvidenceSource, resolveGitLabToken, gitlabApiBase } from './sources/gitlab.js';

export { DEFAULT_CHAT_BIN, DEFAULT_CHAT_LIMIT, createChatEvidenceSource } from './sources/chat.js';

export {
  STRONG_LINK_TYPES,
  WEAK_LINK_TYPES,
  TIME_WINDOW_MS,
  isStrongLink,
  hasStrongLink,
  isTimeOnlyPart,
  linkChatToCode,
} from './chat-linker.js';

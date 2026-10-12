/**
 * Export policy and audit log
 *
 * The calls an exporting command makes:
 *
 *   const policy = loadPolicy(root);                 // once, before scanning
 *   const scanner = new Scanner(root, { policy });   // drops denied files
 *   ...build the export...
 *   guardExport(policy, { command, destination, format, targetModel, files, tokens,
 *                         redact, redactions, text });  // throws PolicyViolationError
 *   ...write / send the export...
 *
 * guardExport() is enforceExport() plus recordExport(); call the two separately when the
 * export must be checked before it is built.
 */

export {
  loadPolicy,
  Policy,
  PolicyConfigError,
  validatePolicyDocument,
  createStarterPolicy,
  normalizeRelativePath,
  relativePathOf,
  modelGlobToRegex,
  POLICY_FILE,
  POLICY_ENV,
  DEFAULT_AUDIT_PATH,
  POLICY_DOCS_URL,
} from './policy.js';
export {
  enforceExport,
  guardExport,
  PolicyViolationError,
  POLICY_VIOLATION_EXIT_CODE,
} from './enforce.js';
export {
  recordExport,
  buildAuditRecord,
  readAuditLog,
  filterAuditEvents,
  formatAuditTable,
  parseSince,
  getGitHead,
  sha256,
} from './audit.js';
export {
  KNOWN_IGNORE_FILES,
  resolveIgnoreFileNames,
  loadIgnoreFileRules,
  IgnoreFileRules,
} from './ignore-files.js';

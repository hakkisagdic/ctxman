/**
 * Export enforcement: checks an export request against the effective policy
 */

import { recordExport } from './audit.js';
import { relativePathOf } from './policy.js';

/** Exit code of a CLI export the policy refused */
export const POLICY_VIOLATION_EXIT_CODE = 3;

/**
 * An export the policy does not allow
 */
export class PolicyViolationError extends Error {
  /**
   * @param {Array<{rule: string, message: string, sources: string[]}>} violations
   */
  constructor(violations) {
    super(
      `Export refused by the ctxman policy:\n${violations.map((v) => `  - ${v.message}`).join('\n')}`
    );
    this.name = 'PolicyViolationError';
    this.code = 'POLICY_VIOLATION';
    this.violations = violations;
    this.statusCode = 403;
    this.exitCode = POLICY_VIOLATION_EXIT_CODE;
  }
}

const formatNumber = (value) => value.toLocaleString('en-US');
const inFiles = (files) => (files.length > 0 ? ` (set in ${files.join(', ')})` : '');

/**
 * Check an export against the policy. Callers remove denied files before exporting; a
 * denied file still in `files` is reported as a violation.
 * @param {import('./policy.js').Policy} policy - From loadPolicy()
 * @param {object} request
 * @param {Array<string|{relativePath?: string, path?: string, tokens?: number}>} [request.files]
 *   Files in the export
 * @param {number} [request.tokens] - Token total of the export (default: sum of files[].tokens)
 * @param {boolean} [request.redact=true] - False when secret redaction was turned off (--no-redact)
 * @param {string|null} [request.targetModel] - Model named with --target-model, if any
 * @throws {PolicyViolationError} Listing every rule the export breaks
 */
export function enforceExport(
  policy,
  { files = [], tokens, redact = true, targetModel = null } = {}
) {
  if (!policy?.active) return;

  const violations = [];

  const deniedSources = new Set();
  let denied = 0;
  for (const file of files) {
    const source = policy.deniedBy(relativePathOf(file));
    if (source) {
      denied++;
      deniedSources.add(source);
    }
  }
  if (denied > 0) {
    violations.push({
      rule: 'deny',
      message: `${denied} file${denied === 1 ? '' : 's'} in the export ${denied === 1 ? 'matches' : 'match'} the policy's deny rules and can never be exported${inFiles([...deniedSources])}`,
      sources: [...deniedSources],
    });
  }

  if (redact === false && policy.requireRedaction) {
    violations.push({
      rule: 'requireRedaction',
      message: `secret redaction is required, so --no-redact is refused${inFiles(policy.requireRedactionSources)}`,
      sources: policy.requireRedactionSources,
    });
  }

  const total =
    typeof tokens === 'number'
      ? tokens
      : files.reduce((sum, file) => sum + (Number(file?.tokens) || 0), 0);
  if (policy.maxExportTokens !== null && total > policy.maxExportTokens) {
    violations.push({
      rule: 'maxExportTokens',
      message: `the export has ${formatNumber(total)} tokens, over the limit of ${formatNumber(policy.maxExportTokens)}${inFiles([policy.maxExportTokensSource])}; narrow it with .contextinclude, --changed-only or a template`,
      sources: [policy.maxExportTokensSource],
    });
  }

  if (targetModel && !policy.isModelAllowed(targetModel)) {
    const rejecting = policy.modelRules.filter(
      (rule) => !rule.regexes.some((regex) => regex.test(targetModel))
    );
    const allowed = rejecting.map((rule) => rule.patterns.join(', ')).join('; and ');
    violations.push({
      rule: 'allowedTargetModels',
      message: `target model "${targetModel}" is not allowed (allowed: ${allowed})${inFiles(rejecting.map((rule) => rule.file))}`,
      sources: rejecting.map((rule) => rule.file),
    });
  }

  if (violations.length > 0) throw new PolicyViolationError(violations);
}

/**
 * enforceExport() followed by recordExport(): the usual call right before an export is
 * handed out. A refused export is logged with outcome "refused" and the error re-thrown.
 * @param {import('./policy.js').Policy} policy
 * @param {import('./audit.js').AuditEvent & {redact?: boolean}} event
 * @param {object} [options] - Passed to recordExport()
 * @returns {object|null} The audit record, or null when auditing is off
 * @throws {PolicyViolationError}
 */
export function guardExport(policy, event, options) {
  if (!policy?.active) return null;
  try {
    enforceExport(policy, event);
  } catch (error) {
    if (error instanceof PolicyViolationError) {
      recordExport(policy, { ...event, outcome: 'refused', violations: error.violations }, options);
    }
    throw error;
  }
  return recordExport(policy, event, options);
}

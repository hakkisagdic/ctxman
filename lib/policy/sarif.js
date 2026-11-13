/**
 * OASIS SARIF v2.1.0 Report Builder (P2-1)
 *
 * Converts ctxman policy validation errors, export policy violations
 * (PolicyViolationError), secret/PII redaction findings, and PR scoped
 * rule violations into a standard SARIF v2.1.0 JSON document suitable
 * for GitHub Code Scanning, GitLab SAST, Kondukto, and CI/CD quality gates.
 */

import path from 'path';

export const SARIF_SCHEMA = 'https://json.schemastore.org/sarif-2.1.0.json';
export const SARIF_VERSION = '2.1.0';

function toSarifLevel(severity) {
  const s = String(severity || '').toLowerCase();
  if (s === 'error' || s === 'high' || s === 'critical') return 'error';
  if (s === 'info' || s === 'note' || s === 'low') return 'note';
  return 'warning';
}

function normalizeUri(filePath, rootPath = null) {
  if (!filePath || typeof filePath !== 'string') return '.ctxman/policy.json';
  let normalized = filePath;
  if (rootPath && path.isAbsolute(filePath)) {
    const rel = path.relative(rootPath, filePath);
    if (rel && !rel.startsWith('..')) normalized = rel;
  }
  return normalized.replace(/\\/g, '/').replace(/^\.\//, '');
}

/**
 * Build a standard OASIS SARIF v2.1.0 report object.
 *
 * @param {object} [input]
 * @param {string} [input.rootPath] - Project root for normalizing artifact URIs
 * @param {string} [input.toolVersion='3.2.0'] - Tool semantic version
 * @param {object} [input.policyResult] - Single-repo or workspace policy check result
 * @param {Array<object>} [input.policyViolations] - Violations from PolicyViolationError
 * @param {Array<object>|Object<string, number>} [input.secretFindings] - Secret/PII findings
 * @param {Array<object>} [input.ruleViolations] - Scoped PR rule violations from P1-2
 * @returns {object} SARIF v2.1.0 report
 */
export function buildSarifReport({
  rootPath = null,
  toolVersion = '3.2.0',
  policyResult = null,
  policyViolations = [],
  secretFindings = null,
  ruleViolations = [],
} = {}) {
  const rulesMap = new Map();
  const results = [];

  const ensureRule = (id, shortDescription, defaultLevel = 'warning') => {
    if (!rulesMap.has(id)) {
      rulesMap.set(id, {
        id,
        shortDescription: { text: shortDescription || id },
        defaultConfiguration: { level: defaultLevel },
      });
    }
  };

  // 1. Policy configuration validation errors (single-repo or multi-repo workspace)
  if (policyResult && policyResult.valid === false) {
    const ruleId = 'ctxman/policy-config-invalid';
    ensureRule(ruleId, 'Export policy configuration file is invalid', 'error');

    if (Array.isArray(policyResult.errors)) {
      for (const errMsg of policyResult.errors) {
        results.push({
          ruleId,
          level: 'error',
          message: { text: String(errMsg) },
          locations: [
            {
              physicalLocation: {
                artifactLocation: {
                  uri: normalizeUri(policyResult.file || '.ctxman/policy.json', rootPath),
                },
                region: { startLine: 1 },
              },
            },
          ],
        });
      }
    }

    if (Array.isArray(policyResult.repos)) {
      for (const repo of policyResult.repos) {
        if (repo && repo.valid === false) {
          const errs =
            Array.isArray(repo.errors) && repo.errors.length > 0
              ? repo.errors
              : [repo.message || 'Invalid repository policy'];
          for (const errMsg of errs) {
            results.push({
              ruleId,
              level: 'error',
              message: { text: `[${repo.alias || repo.root}] ${errMsg}` },
              locations: [
                {
                  physicalLocation: {
                    artifactLocation: {
                      uri: normalizeUri(
                        repo.file || `${repo.alias || ''}/.ctxman/policy.json`,
                        rootPath
                      ),
                    },
                    region: { startLine: 1 },
                  },
                },
              ],
            });
          }
        }
      }
    }
  }

  // 2. Runtime export policy violations (PolicyViolationError)
  if (Array.isArray(policyViolations)) {
    for (const v of policyViolations) {
      if (!v) continue;
      const ruleId = `ctxman/policy-${v.type || 'violation'}`;
      ensureRule(ruleId, `Export policy violation (${v.type || 'general'})`, 'error');
      results.push({
        ruleId,
        level: 'error',
        message: { text: v.message || `Export policy violation: ${v.type || 'unknown'}` },
        locations: [
          {
            physicalLocation: {
              artifactLocation: {
                uri: normalizeUri(v.file || '.ctxman/policy.json', rootPath),
              },
              region: { startLine: Number.isInteger(v.line) && v.line > 0 ? v.line : 1 },
            },
          },
        ],
      });
    }
  }

  // 3. Secret & KVKK/BDDK PII findings
  if (Array.isArray(secretFindings)) {
    for (const finding of secretFindings) {
      if (!finding) continue;
      const type = typeof finding === 'string' ? finding : finding.type || 'secret';
      const ruleId = `ctxman/redaction-${type}`;
      ensureRule(ruleId, `Sensitive secret or PII detected (${type})`, 'warning');
      results.push({
        ruleId,
        level: toSarifLevel(finding.severity || 'warning'),
        message: {
          text:
            finding.message ||
            `Sensitive data matching "${type}" was detected and requires redaction`,
        },
        locations: [
          {
            physicalLocation: {
              artifactLocation: {
                uri: normalizeUri(finding.file || 'context-export', rootPath),
              },
              region: {
                startLine: Number.isInteger(finding.line) && finding.line > 0 ? finding.line : 1,
              },
            },
          },
        ],
      });
    }
  } else if (secretFindings && typeof secretFindings === 'object') {
    for (const [type, count] of Object.entries(secretFindings)) {
      if (!count || count <= 0) continue;
      const ruleId = `ctxman/redaction-${type}`;
      ensureRule(ruleId, `Sensitive secret or PII detected (${type})`, 'warning');
      results.push({
        ruleId,
        level: 'warning',
        message: {
          text: `${count} instance(s) of "${type}" detected during scan`,
        },
        locations: [
          {
            physicalLocation: {
              artifactLocation: { uri: 'context-export' },
              region: { startLine: 1 },
            },
          },
        ],
      });
    }
  }

  // 4. Scoped PR rule violations (.ctxman/rules.json / P1-2)
  if (Array.isArray(ruleViolations)) {
    for (const rv of ruleViolations) {
      if (!rv) continue;
      const ruleId = `ctxman/pr-rule/${rv.ruleId || rv.type || 'rule'}`;
      const level = toSarifLevel(rv.severity || 'warning');
      ensureRule(ruleId, `PR rule check (${rv.type || rv.ruleId || 'rule'})`, level);
      results.push({
        ruleId,
        level,
        message: { text: rv.message || `PR rule violation: ${ruleId}` },
        locations: [
          {
            physicalLocation: {
              artifactLocation: {
                uri: normalizeUri(rv.file || '.ctxman/rules.json', rootPath),
              },
              region: {
                startLine: Number.isInteger(rv.line) && rv.line > 0 ? rv.line : 1,
              },
            },
          },
        ],
      });
    }
  }

  return {
    $schema: SARIF_SCHEMA,
    version: SARIF_VERSION,
    runs: [
      {
        tool: {
          driver: {
            name: 'ctxman',
            informationUri: 'https://github.com/hakkisagdic/ctxman',
            version: toolVersion,
            rules: [...rulesMap.values()],
          },
        },
        results,
        ...(policyResult
          ? {
              properties: {
                valid: Boolean(policyResult.valid),
                active: Boolean(policyResult.active),
                compliancePreset: policyResult.compliancePreset || null,
              },
            }
          : {}),
      },
    ],
  };
}

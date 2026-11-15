import fs from 'node:fs';
import path from 'node:path';
import { buildRepoGraph } from '../map/index.js';

const OUTBOUND_CALL_RE =
  /\b(?:await\s+)?(?:fetch|axios\.(?:get|post|put|delete|request)|http\.request|https\.request)\s*\(/;
const TIMEOUT_HINT_RE =
  /\b(?:AbortSignal\.timeout|AbortController|signal\s*:|timeout\s*:|setTimeout)\b/;

/**
 * Audit outbound HTTP / network calls across repository source files for missing
 * timeout or abort-signal guards (`F7-3`: Outbound HTTP Resilience Auditor).
 *
 * @param {string} root - Repository root directory
 * @param {object} [options]
 * @param {object} [options.graph] - Optional prebuilt `buildRepoGraph` result
 * @returns {object}
 */
export function auditResiliencePatterns(root, options = {}) {
  const absRoot = path.resolve(root || process.cwd());
  const graph = options.graph || buildRepoGraph(absRoot, { history: 0, redact: true });

  const findings = [];
  let totalOutboundCalls = 0;

  for (const node of graph.nodes || []) {
    if (!node || !node.path) continue;
    const fullPath = path.join(absRoot, node.path);
    if (!fs.existsSync(fullPath)) continue;

    let src = '';
    try {
      src = fs.readFileSync(fullPath, 'utf8');
    } catch {
      continue;
    }

    const lines = src.split('\n');
    for (let idx = 0; idx < lines.length; idx++) {
      const line = lines[idx];
      if (!OUTBOUND_CALL_RE.test(line)) continue;
      totalOutboundCalls += 1;

      const windowText = lines
        .slice(Math.max(0, idx - 3), Math.min(lines.length, idx + 8))
        .join('\n');
      const hasTimeout = TIMEOUT_HINT_RE.test(windowText);

      if (!hasTimeout) {
        findings.push({
          ruleId: 'ctxman/resilience/missing-http-timeout',
          severity: 'warning',
          file: node.path,
          line: idx + 1,
          snippet: line.trim(),
          message: `Outbound HTTP request at '${node.path}:${idx + 1}' has no visible timeout or AbortSignal guard within its call window.`,
        });
      }
    }
  }

  return {
    root: absRoot,
    passed: findings.length === 0,
    totalOutboundCalls,
    findingCount: findings.length,
    findings,
  };
}

/**
 * F12-2: API Idempotency & Double-Charge Risk Auditor
 * Audits payment, checkout, and financial mutation handlers for idempotency keys and replay guards.
 */

import fs from 'fs';
import path from 'path';
import { Scanner } from '../core/Scanner.js';

const FINANCIAL_SINK_REGEX =
  /\b(?:charge|createPayment|capturePayment|refund|payout|transferFunds|issueInvoice|processCheckout|iyzico)\b/i;

const IDEMPOTENCY_GUARD_REGEX =
  /\b(?:idempotency[-_]?key|idempotencyKey|x-idempotency-key|dedupKey|paymentIntentId|transactionLock|withIdempotency)\b/i;

/**
 * Audit source files for financial mutation endpoints or service calls lacking idempotency guards.
 *
 * @param {object} [options]
 * @param {string} [options.rootPath]
 * @param {Array<{path: string, content: string}>} [options.files]
 * @returns {object}
 */
export function auditPaymentIdempotency(options = {}) {
  let fileEntries = [];
  if (Array.isArray(options.files)) {
    fileEntries = options.files;
  } else if (options.rootPath) {
    const scanner = new Scanner(options.rootPath);
    fileEntries = scanner
      .scan()
      .filter((f) => /\.(?:js|ts|mjs|cjs)$/.test(f.relativePath))
      .map((f) => ({
        path: f.relativePath,
        content: fs.readFileSync(path.join(options.rootPath, f.relativePath), 'utf8'),
      }));
  }

  const findings = [];

  for (const file of fileEntries) {
    const content = String(file.content || '');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;
      if (line.includes('function ') || line.includes('import ')) continue;

      if (FINANCIAL_SINK_REGEX.test(line)) {
        const start = Math.max(0, i - 6);
        const end = Math.min(lines.length, i + 7);
        const contextWindow = lines.slice(start, end).join('\n');

        if (!IDEMPOTENCY_GUARD_REGEX.test(contextWindow)) {
          findings.push({
            file: file.path,
            line: i + 1,
            ruleId: 'ctxman/billing/missing-idempotency-key',
            severity: 'critical',
            snippet: line.trim(),
            remediation:
              'Pass and persist an Idempotency-Key (or x-idempotency-key header) around financial charge/refund operations to prevent double charges on retry.',
          });
        }
      }
    }
  }

  return {
    safe: findings.length === 0,
    findings,
    summary: {
      scannedFiles: fileEntries.length,
      violationCount: findings.length,
      criticalCount: findings.length,
    },
  };
}

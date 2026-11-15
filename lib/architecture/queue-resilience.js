/**
 * F12-4: Async Queue & Dead-Letter (DLQ) Resilience Auditor
 * Audits queue/event consumers for missing try/catch error boundaries, DLQ routing, and retry backoff.
 */

import fs from 'fs';
import path from 'path';
import { Scanner } from '../core/Scanner.js';

const CONSUMER_START_REGEX =
  /\b(?:queue\.process|channel\.consume|consumer\.run|worker\.on\s*\(\s*['"]message['"]|subscribe\s*\()/;

/**
 * Audit async queue/message consumers for DLQ, retry backoff, and error-handling resilience.
 *
 * @param {object} [options]
 * @param {string} [options.rootPath]
 * @param {Array<{path: string, content: string}>} [options.files]
 * @returns {object}
 */
export function auditQueueConsumerResilience(options = {}) {
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
    const lines = String(file.content || '').split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (CONSUMER_START_REGEX.test(lines[i])) {
        const block = lines.slice(i, Math.min(lines.length, i + 18)).join('\n');
        const hasTryCatch = /\btry\s*\{/.test(block) || /\.catch\s*\(/.test(block);
        const hasDlqOrNack = /\b(?:dlq|deadLetter|nack|moveToFailed|reject)\b/i.test(block);
        const hasBackoffOrAttempts = /\b(?:backoff|attempts|maxRetries|retry)\b/i.test(block);

        if (!hasTryCatch) {
          findings.push({
            file: file.path,
            line: i + 1,
            ruleId: 'ctxman/queue/missing-error-boundary',
            severity: 'high',
            description: 'Queue consumer handler lacks a try/catch or .catch() error boundary.',
          });
        }
        if (!hasDlqOrNack) {
          findings.push({
            file: file.path,
            line: i + 1,
            ruleId: 'ctxman/queue/missing-dlq-or-nack',
            severity: 'medium',
            description:
              'Queue consumer does not route poison messages to a Dead-Letter Queue (DLQ) or nack.',
          });
        }
        if (!hasBackoffOrAttempts) {
          findings.push({
            file: file.path,
            line: i + 1,
            ruleId: 'ctxman/queue/missing-retry-backoff',
            severity: 'medium',
            description: 'Queue consumer does not configure retry attempts or exponential backoff.',
          });
        }
      }
    }
  }

  return {
    resilient: findings.length === 0,
    findings,
    summary: {
      scannedFiles: fileEntries.length,
      findingCount: findings.length,
      highCount: findings.filter((f) => f.severity === 'high').length,
      mediumCount: findings.filter((f) => f.severity === 'medium').length,
    },
  };
}

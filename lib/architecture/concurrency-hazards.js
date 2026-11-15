/**
 * F14-4: Concurrency & Race-Condition Hazard Detector
 * Detects check-then-act (TOCTOU) balance/inventory mutations without transactions or locks, and shared state races.
 */

import fs from 'fs';
import path from 'path';
import { Scanner } from '../core/Scanner.js';

const READ_BALANCE_REGEX =
  /\b(?:SELECT\s+.*?\b(?:balance|stock|quota|credits)\b|findUnique|findOne|getBalance)/i;
const WRITE_BALANCE_REGEX =
  /\b(?:UPDATE\s+.*?\bSET\s+(?:balance|stock|quota|credits)|update\s*\(|save\s*\(|deduct)/i;
const LOCK_OR_TX_REGEX =
  /\b(?:FOR\s+UPDATE|BEGIN|TRANSACTION|\$transaction|withLock|mutex|acquireLock|atomic)/i;

/**
 * Detect concurrency hazards, TOCTOU check-then-act races, and unawaited lock acquisitions.
 *
 * @param {object} [options]
 * @param {string} [options.rootPath]
 * @param {Array<{path: string, content: string}>} [options.files]
 * @returns {object}
 */
export function detectConcurrencyHazards(options = {}) {
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

  const hazards = [];

  for (const file of fileEntries) {
    const lines = String(file.content || '').split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // 1. Check-then-act (TOCTOU) on balance/stock/quota without lock or transaction
      if (READ_BALANCE_REGEX.test(line)) {
        const windowText = lines.slice(i, Math.min(lines.length, i + 10)).join('\n');
        if (WRITE_BALANCE_REGEX.test(windowText) && !LOCK_OR_TX_REGEX.test(windowText)) {
          hazards.push({
            file: file.path,
            line: i + 1,
            ruleId: 'ctxman/concurrency/toctou-unlocked-mutation',
            severity: 'critical',
            description:
              'Check-then-act (TOCTOU) read and mutation on balance/stock/quota without a transaction or row lock (FOR UPDATE).',
          });
        }
      }

      // 2. Unawaited mutex/lock acquisition
      if (
        /\b(?:mutex\.acquire|lock\.acquire|acquireLock)\s*\(/.test(line) &&
        !/\bawait\b/.test(line) &&
        !line.trim().startsWith('//')
      ) {
        hazards.push({
          file: file.path,
          line: i + 1,
          ruleId: 'ctxman/concurrency/unawaited-lock-acquire',
          severity: 'high',
          description:
            'Lock acquisition is invoked without `await`, leaving critical section unprotected.',
        });
      }
    }
  }

  return {
    safe: hazards.length === 0,
    hazards,
    summary: {
      scannedFiles: fileEntries.length,
      hazardCount: hazards.length,
      criticalCount: hazards.filter((h) => h.severity === 'critical').length,
      highCount: hazards.filter((h) => h.severity === 'high').length,
    },
  };
}

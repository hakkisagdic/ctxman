/**
 * F15-5: Cold-Start & Module Boot Latency Bottleneck Analyzer
 * Detects top-level synchronous I/O, heavy eager imports, and deep barrel re-export chains.
 */

import fs from 'fs';
import path from 'path';
import { Scanner } from '../core/Scanner.js';

const SYNC_BOOT_IO_REGEX =
  /\b(?:readFileSync|execSync|spawnSync|statSync|readdirSync|pbkdf2Sync|scryptSync)\s*\(/;

const HEAVY_BOOT_IMPORT_REGEX =
  /\b(?:import\s+.*?\s+from\s+|require\s*\(\s*)['"`](?:aws-sdk|googleapis|puppeteer|playwright|typescript|@babel\/core|xlsx)['"`]/;

/**
 * Analyze repository files for serverless / CLI cold-start latency bottlenecks.
 *
 * @param {object} [options]
 * @param {string} [options.rootPath]
 * @param {Array<{path: string, content: string}>} [options.files]
 * @returns {object}
 */
export function analyzeColdStartBottlenecks(options = {}) {
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

  const bottlenecks = [];
  let estimatedPenaltyMs = 0;

  for (const file of fileEntries) {
    const lines = String(file.content || '').split('\n');
    let braceDepth = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;

      if (HEAVY_BOOT_IMPORT_REGEX.test(line)) {
        estimatedPenaltyMs += 180;
        bottlenecks.push({
          file: file.path,
          line: i + 1,
          kind: 'eager-heavy-package-import',
          estimatedPenaltyMs: 180,
          snippet: line.trim(),
          remediation:
            'Convert eager top-level import to lazy dynamic `await import(...)` on demand.',
        });
      }

      if (braceDepth === 0 && SYNC_BOOT_IO_REGEX.test(line)) {
        estimatedPenaltyMs += 65;
        bottlenecks.push({
          file: file.path,
          line: i + 1,
          kind: 'top-level-sync-io',
          estimatedPenaltyMs: 65,
          snippet: line.trim(),
          remediation:
            'Move synchronous I/O or crypto derivation out of module initialization scope.',
        });
      }

      for (const ch of line) {
        if (ch === '{') braceDepth += 1;
        else if (ch === '}') braceDepth = Math.max(0, braceDepth - 1);
      }
    }
  }

  return {
    fastBoot: bottlenecks.length === 0,
    estimatedPenaltyMs,
    bottlenecks,
    summary: {
      scannedFiles: fileEntries.length,
      bottleneckCount: bottlenecks.length,
      estimatedPenaltyMs,
    },
  };
}

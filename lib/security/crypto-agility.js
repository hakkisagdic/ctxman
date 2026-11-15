/**
 * F15-1: Post-Quantum Cryptography (PQC) & Weak-Crypto Agility Auditor
 * Detects broken/weak hashes (MD5, SHA-1), insecure ciphers (DES, RC4, ECB), and non-PQC asymmetric primitives.
 */

import fs from 'fs';
import path from 'path';
import { Scanner } from '../core/Scanner.js';

const CRYPTO_PATTERNS = [
  {
    id: 'weak-hash-algorithm',
    severity: 'high',
    regex: /createHash\s*\(\s*['"`](?:md5|sha1)['"`]\s*\)/i,
    replacement: "crypto.createHash('sha256') or 'sha512'",
  },
  {
    id: 'insecure-cipher-mode',
    severity: 'critical',
    regex: /createCipher(?:iv)?\s*\(\s*['"`](?:des|rc4|bf|aes-\d+-ecb)['"`]/i,
    replacement: "crypto.createCipheriv('aes-256-gcm', key, iv)",
  },
  {
    id: 'quantum-vulnerable-asymmetric',
    severity: 'medium',
    regex: /generateKeyPair(?:Sync)?\s*\(\s*['"`](?:rsa|dsa|ec)['"`]/i,
    replacement: 'Hybrid PQC key exchange/signature (ML-KEM-768 / ML-DSA-65 + Ed25519)',
  },
];

/**
 * Audit repository files for weak cryptographic primitives and Post-Quantum (PQC) readiness.
 *
 * @param {object} [options]
 * @param {string} [options.rootPath]
 * @param {Array<{path: string, content: string}>} [options.files]
 * @returns {object}
 */
export function auditCryptoAgility(options = {}) {
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
      const line = lines[i];
      if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;

      for (const rule of CRYPTO_PATTERNS) {
        if (rule.regex.test(line)) {
          findings.push({
            file: file.path,
            line: i + 1,
            ruleId: `ctxman/crypto/${rule.id}`,
            severity: rule.severity,
            snippet: line.trim(),
            recommendedReplacement: rule.replacement,
          });
        }
      }
    }
  }

  const criticalCount = findings.filter((f) => f.severity === 'critical').length;
  const highCount = findings.filter((f) => f.severity === 'high').length;
  const mediumCount = findings.filter((f) => f.severity === 'medium').length;
  const agilityScore = Math.max(0, 100 - criticalCount * 35 - highCount * 20 - mediumCount * 10);

  return {
    pqcReady: findings.length === 0,
    agilityScore,
    findings,
    summary: {
      scannedFiles: fileEntries.length,
      findingCount: findings.length,
      criticalCount,
      highCount,
      mediumCount,
    },
  };
}

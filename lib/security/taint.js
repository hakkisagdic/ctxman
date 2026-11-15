import fs from 'node:fs';
import path from 'node:path';
import { selectFiles } from '../pack/select.js';

const SENSITIVE_SOURCE_REGEX =
  /\b(tckn|tcKimlik|kimlikNo|iban|cardNumber|creditCard|cvv|password|passwd|secretKey|apiKey|privateKey|accessToken|refreshToken|ssn)\b/i;

const SINK_PATTERNS = [
  { type: 'console_sink', regex: /\bconsole\.(log|info|warn|error|debug|trace)\s*\(([^)]*)\)/ },
  { type: 'logger_sink', regex: /\blogger\.(log|info|warn|error|debug|trace)\s*\(([^)]*)\)/ },
  {
    type: 'network_sink',
    regex: /\b(fetch|axios\.(?:post|put|get|request)|http\.request)\s*\(([^)]*)\)/,
  },
  { type: 'response_sink', regex: /\bres\.(send|json|end|write)\s*\(([^)]*)\)/ },
];

const SANITIZER_REGEX =
  /\b(redactSecrets|redactPII|sanitize|maskSecret|maskPII|hashPassword|sha256|encrypt)\s*\(/i;

/**
 * Scans repository source files for sensitive PII/secret variables flowing into
 * logging, HTTP, or response sinks without passing through a sanitizer (`redactSecrets`) (`C-5`).
 *
 * @param {string} root - Repository root directory
 * @param {object} [options={}]
 * @param {string[]} [options.include]
 * @param {string[]} [options.exclude]
 */
export function analyzeTaintFlows(root, options = {}) {
  const absRoot = path.resolve(root || process.cwd());
  const selection = selectFiles(absRoot, {
    include: options.include || [],
    exclude: options.exclude || [],
  });
  const candidates = (selection.files || []).filter((f) =>
    /\.(?:js|cjs|mjs|ts|tsx|jsx|py)$/i.test(f.path)
  );

  const flows = [];
  for (const fileObj of candidates) {
    const relPath = fileObj.path;
    if (relPath.startsWith('test/') || relPath.includes('.test.')) continue;
    let content = '';
    try {
      content = fs.readFileSync(fileObj.absolutePath, 'utf8');
    } catch {
      continue;
    }

    const lines = content.split(/\r?\n/);
    const taintedVars = new Map();

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('*')) continue;

      const assignMatch = trimmed.match(/(?:const|let|var)?\s*([a-zA-Z_$][\w$]*)\s*=\s*(.+)$/);
      if (assignMatch) {
        const [, lhs, rhs] = assignMatch;
        if (SANITIZER_REGEX.test(rhs)) {
          taintedVars.delete(lhs);
        } else if (SENSITIVE_SOURCE_REGEX.test(lhs) || SENSITIVE_SOURCE_REGEX.test(rhs)) {
          taintedVars.set(lhs, { line: i + 1, variable: lhs });
        } else {
          for (const [taintedName, meta] of taintedVars.entries()) {
            if (new RegExp(`\\b${taintedName}\\b`).test(rhs)) {
              taintedVars.set(lhs, { line: meta.line, variable: meta.variable });
              break;
            }
          }
        }
      }

      for (const sink of SINK_PATTERNS) {
        const match = trimmed.match(sink.regex);
        if (!match) continue;
        const argsExpr = match[2] || match[0];
        if (SANITIZER_REGEX.test(argsExpr)) continue;

        let matchedTaint = null;
        for (const [varName, meta] of taintedVars.entries()) {
          if (new RegExp(`\\b${varName}\\b`).test(argsExpr)) {
            matchedTaint = { variable: varName, sourceLine: meta.line };
            break;
          }
        }

        if (!matchedTaint) {
          const inlineMatch = argsExpr.match(SENSITIVE_SOURCE_REGEX);
          if (inlineMatch) {
            matchedTaint = { variable: inlineMatch[1], sourceLine: i + 1 };
          }
        }

        if (matchedTaint) {
          flows.push({
            ruleId: 'TAINT-UNREDACTED-SINK',
            severity: sink.type === 'network_sink' ? 'error' : 'warning',
            file: relPath,
            sourceLine: matchedTaint.sourceLine,
            sinkLine: i + 1,
            variable: matchedTaint.variable,
            sinkType: sink.type,
            snippet: trimmed.slice(0, 160),
          });
        }
      }
    }
  }

  return {
    passed: flows.length === 0,
    scannedFiles: candidates.length,
    flows,
  };
}

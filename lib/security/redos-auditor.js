/**
 * Faz 18 (F18-1): Regular Expression (ReDoS) & Catastrophic Backtracking Auditor.
 * Scans regex literals and RegExp constructors for nested quantifiers, overlapping alternations, and dynamic unescaped input.
 */
export function auditRegexDosRisk(options = {}) {
  const { files = [], patterns = [] } = options;
  const findings = [];

  const analyzePattern = (patternStr, sourcePath = 'inline', line = 1) => {
    const raw = String(patternStr || '');
    if (!raw) return;

    // 1. Nested quantifiers: e.g. (a+)+, ([a-z]+)*, (.*)+, (\w+){2,}
    const nestedQuantifier = /\([^()]*[+*?\}][^()]*\)\s*(?:[+*]|\{\d+,\d*\})/.test(raw);
    if (nestedQuantifier) {
      findings.push({
        type: 'nested-quantifier',
        path: sourcePath,
        line,
        pattern: raw,
        severity: 'critical',
        reason: `Regex "${raw}" contains nested quantifiers capable of exponential catastrophic backtracking (ReDoS).`,
        remediation:
          'Flatten nested quantifiers into a single character class/quantifier, bound input length prior to matching, or use an atomic/possessive equivalent.',
      });
    }

    // 2. Overlapping alternation under repetition: e.g. (a|ab)+ or (.+|\w+)+
    const altMatch = raw.match(/\(([^()]+\|[^()]+)\)\s*(?:[+*]|\{\d+,\d*\})/);
    if (altMatch && !nestedQuantifier) {
      const branches = altMatch[1].split('|').map((b) => b.trim());
      const hasOverlap =
        branches.length >= 2 &&
        (branches[0] === branches[1] ||
          branches[1].startsWith(branches[0]) ||
          branches[0].startsWith(branches[1]) ||
          branches.some((b) => b === '.*' || b === '.+'));
      if (hasOverlap) {
        findings.push({
          type: 'overlapping-alternation',
          path: sourcePath,
          line,
          pattern: raw,
          severity: 'high',
          reason: `Regex "${raw}" repeats an alternation with overlapping prefixes.`,
          remediation:
            'Factor out the common prefix across alternation branches or remove redundant wildcards.',
        });
      }
    }
  };

  for (const pat of patterns) {
    if (typeof pat === 'string') analyzePattern(pat, 'patterns', 1);
    else if (pat && typeof pat === 'object') {
      analyzePattern(pat.pattern || pat.source, pat.path || 'patterns', pat.line || 1);
    }
  }

  for (const file of files) {
    const filePath = file.path || 'unknown.js';
    const content = String(file.content || '');
    if (!content.trim()) continue;

    const lines = content.split(/\r?\n/);
    lines.forEach((lineText, idx) => {
      const lineNo = idx + 1;

      // Detect dynamic unescaped RegExp(req.query / userInput)
      if (/\bnew\s+RegExp\s*\(\s*(?!['"`])/i.test(lineText)) {
        findings.push({
          type: 'dynamic-unescaped-regexp',
          path: filePath,
          line: lineNo,
          pattern: lineText.trim(),
          severity: 'high',
          reason:
            'Dynamic variable passed to `new RegExp(...)` without escaping user-controlled metacharacters.',
          remediation:
            'Escape regex metacharacters (`str.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")`) and enforce a maximum length before constructing RegExp.',
        });
      }

      // Extract regex literals on the line
      const literalRegex = /\/((?:\\\/|[^/\r\n])+)\/[gimsuy]*/g;
      let match;
      while ((match = literalRegex.exec(lineText)) !== null) {
        const body = match[1];
        if (body.startsWith('/') || body.startsWith('*')) continue;
        analyzePattern(body, filePath, lineNo);
      }
    });
  }

  const criticalCount = findings.filter((f) => f.severity === 'critical').length;
  const highCount = findings.filter((f) => f.severity === 'high').length;
  const status = findings.length === 0 ? 'safe' : 'redos-vulnerable';

  return {
    status,
    vulnerableCount: findings.length,
    criticalCount,
    highCount,
    findings,
    summary:
      status === 'safe'
        ? 'No catastrophic backtracking (ReDoS) or unescaped dynamic RegExp risks detected.'
        : `Detected ${findings.length} ReDoS risk(s) (${criticalCount} critical, ${highCount} high).`,
  };
}

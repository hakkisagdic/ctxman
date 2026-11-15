/**
 * Detects non-deterministic / flaky test patterns in test files (F8-2).
 *
 * Scans for:
 * - hardcoded-sleep: setTimeout / sleep with fixed delays without fake timers
 * - unseeded-random: Math.random() inside test suites
 * - wall-clock-dependency: Date.now() / new Date() assertions without fake timers
 * - floating-promise: expect(...).resolves / .rejects without await
 * - shared-mutable-state: top-level `let` mutated in tests without beforeEach reset
 *
 * @param {object} options
 * @param {Array<{path: string, content: string}>} [options.files=[]]
 * @returns {{
 *   findings: Array<{
 *     file: string,
 *     line: number,
 *     pattern: string,
 *     severity: 'high' | 'medium' | 'low',
 *     snippet: string,
 *     remediation: string
 *   }>,
 *   summary: {
 *     scannedFiles: number,
 *     totalFindings: number,
 *     flakyRiskScore: number,
 *     byPattern: Record<string, number>
 *   }
 * }}
 */
export function detectFlakyTestPatterns(options = {}) {
  const { files = [] } = options;
  const findings = [];
  const byPattern = {};

  const recordFinding = (finding) => {
    findings.push(finding);
    byPattern[finding.pattern] = (byPattern[finding.pattern] || 0) + 1;
  };

  for (const fileObj of files) {
    const file = String(fileObj.path || '').replace(/\\/g, '/');
    const content = String(fileObj.content || '');
    if (!file || !content) continue;

    const usesFakeTimers = /\b(?:vi|jest)\.useFakeTimers\s*\(/.test(content);
    const hasBeforeEach = /\bbeforeEach\s*\(/.test(content);
    const lines = content.split(/\r?\n/);

    for (let idx = 0; idx < lines.length; idx++) {
      const lineText = lines[idx];
      const trimmed = lineText.trim();
      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('*')) continue;
      const lineNumber = idx + 1;

      // 1. Hardcoded sleep / setTimeout delay
      if (
        !usesFakeTimers &&
        (/\bsetTimeout\s*\([^,]+,\s*\d+\s*\)/.test(trimmed) ||
          /\bsleep\s*\(\s*\d+\s*\)/.test(trimmed))
      ) {
        recordFinding({
          file,
          line: lineNumber,
          pattern: 'hardcoded-sleep',
          severity: 'high',
          snippet: trimmed,
          remediation:
            'Replace fixed setTimeout/sleep delays with fake timers (vi.useFakeTimers) or condition polling.',
        });
      }

      // 2. Unseeded Math.random()
      if (/\bMath\.random\s*\(\s*\)/.test(trimmed)) {
        recordFinding({
          file,
          line: lineNumber,
          pattern: 'unseeded-random',
          severity: 'medium',
          snippet: trimmed,
          remediation:
            'Use a deterministic seed or fixed fixture value instead of Math.random() in tests.',
        });
      }

      // 3. Unawaited async expect().resolves / .rejects
      if (
        /\bexpect\s*\(.+\)\s*\.\s*(?:resolves|rejects)\b/.test(trimmed) &&
        !/\b(?:await|return)\s+expect\b/.test(trimmed)
      ) {
        recordFinding({
          file,
          line: lineNumber,
          pattern: 'floating-promise',
          severity: 'high',
          snippet: trimmed,
          remediation: 'Add `await` or `return` before `expect(...).resolves/.rejects`.',
        });
      }

      // 4. Wall-clock dependency inside expect()
      if (
        !usesFakeTimers &&
        /\bexpect\s*\(.*(?:Date\.now\s*\(\s*\)|new\s+Date\s*\(\s*\))/.test(trimmed)
      ) {
        recordFinding({
          file,
          line: lineNumber,
          pattern: 'wall-clock-dependency',
          severity: 'medium',
          snippet: trimmed,
          remediation:
            'Freeze system time using vi.setSystemTime() / vi.useFakeTimers() before asserting timestamps.',
        });
      }

      // 5. Shared mutable top-level state without beforeEach
      if (!hasBeforeEach && /^let\s+[a-zA-Z_$][\w$]*\s*=/.test(trimmed)) {
        recordFinding({
          file,
          line: lineNumber,
          pattern: 'shared-mutable-state',
          severity: 'low',
          snippet: trimmed,
          remediation:
            'Reset mutable suite-level variables inside a `beforeEach()` hook to prevent test order coupling.',
        });
      }
    }
  }

  const penalty = findings.reduce(
    (acc, f) => acc + (f.severity === 'high' ? 25 : f.severity === 'medium' ? 15 : 5),
    0
  );
  const flakyRiskScore = Math.min(100, penalty);

  return {
    findings,
    summary: {
      scannedFiles: files.length,
      totalFindings: findings.length,
      flakyRiskScore,
      byPattern,
    },
  };
}

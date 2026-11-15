/**
 * F16-1: Supply-Chain Typosquatting & Malicious Package Shield
 * Detects Levenshtein-close typosquats of popular packages and suspicious install-lifecycle scripts.
 */

const POPULAR_PACKAGES = [
  'express',
  'lodash',
  'react',
  'axios',
  'commander',
  'chalk',
  'vitest',
  'typescript',
  'tiktoken',
  'openai',
  'eslint',
  'prettier',
  'webpack',
  'next',
  'zod',
];

function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

/**
 * Audit package.json dependencies and scripts for typosquatting and supply-chain install risks.
 *
 * @param {object} options
 * @param {object} [options.packageJson]
 * @param {string[]} [options.trustedPackages]
 * @returns {object}
 */
export function auditDependencyTyposquatting(options = {}) {
  const pkg = options.packageJson || {};
  const trusted = new Set([
    ...POPULAR_PACKAGES,
    ...(Array.isArray(options.trustedPackages) ? options.trustedPackages : []),
  ]);

  const allDeps = {
    ...(pkg.dependencies || {}),
    ...(pkg.devDependencies || {}),
    ...(pkg.optionalDependencies || {}),
  };

  const findings = [];

  for (const depName of Object.keys(allDeps)) {
    const cleanName = depName.replace(/^@[^/]+\//, '').toLowerCase();
    if (trusted.has(cleanName) || trusted.has(depName)) continue;

    for (const target of POPULAR_PACKAGES) {
      if (cleanName === target) continue;
      const dist = levenshtein(cleanName, target);
      if (dist > 0 && dist <= 2 && Math.abs(cleanName.length - target.length) <= 2) {
        findings.push({
          kind: 'typosquat-suspect',
          severity: dist === 1 ? 'critical' : 'high',
          package: depName,
          suspectedTarget: target,
          editDistance: dist,
          remediation: `Verify '${depName}' is not a typosquat of '${target}'.`,
        });
        break;
      }
    }
  }

  const scripts = pkg.scripts || {};
  for (const hookName of ['preinstall', 'install', 'postinstall']) {
    const cmd = String(scripts[hookName] || '');
    if (cmd && /\b(?:curl|wget|nc|bash\s+-c|powershell|eval|node\s+-e)\b/i.test(cmd)) {
      findings.push({
        kind: 'suspicious-install-hook',
        severity: 'critical',
        package: pkg.name || 'root',
        hook: hookName,
        command: cmd,
        remediation: `Remove network/shell execution from '${hookName}' lifecycle script.`,
      });
    }
  }

  return {
    safe: findings.length === 0,
    findings,
    summary: {
      dependencyCount: Object.keys(allDeps).length,
      findingCount: findings.length,
      typosquatCount: findings.filter((f) => f.kind === 'typosquat-suspect').length,
      installHookRiskCount: findings.filter((f) => f.kind === 'suspicious-install-hook').length,
    },
  };
}

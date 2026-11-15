/**
 * Audits build and dependency configuration (`package.json`, `Dockerfile`, lockfile presence)
 * for non-deterministic version ranges, `file:`/`link:` paths, and floating container tags (F10-5).
 *
 * @param {object} options
 * @param {object|string} [options.packageJson={}]
 * @param {boolean} [options.hasLockfile=true]
 * @param {string} [options.dockerfileContent='']
 * @returns {{
 *   reproducible: boolean,
 *   score: number,
 *   issues: Array<{
 *     ruleId: string,
 *     severity: 'high' | 'medium' | 'low',
 *     target: string,
 *     message: string
 *   }>,
 *   summary: {
 *     totalIssues: number,
 *     highCount: number,
 *     mediumCount: number
 *   }
 * }}
 */
export function auditBuildReproducibility(options = {}) {
  const { packageJson = {}, hasLockfile = true, dockerfileContent = '' } = options;
  const pkg =
    typeof packageJson === 'string' && packageJson.trim()
      ? JSON.parse(packageJson)
      : packageJson || {};

  const issues = [];

  if (!hasLockfile) {
    issues.push({
      ruleId: 'ctxman/build/missing-lockfile',
      severity: 'high',
      target: 'package-lock.json',
      message: 'No lockfile detected; dependency resolution may vary across builds.',
    });
  }

  if (!pkg.engines || !pkg.engines.node) {
    issues.push({
      ruleId: 'ctxman/build/missing-node-engine',
      severity: 'low',
      target: 'package.json#engines.node',
      message: 'Specify `engines.node` in package.json to enforce runtime parity.',
    });
  }

  const allDeps = {
    ...(pkg.dependencies || {}),
    ...(pkg.devDependencies || {}),
  };

  for (const [depName, spec] of Object.entries(allDeps)) {
    const versionSpec = String(spec || '').trim();
    if (
      versionSpec === '*' ||
      versionSpec === 'latest' ||
      versionSpec === 'next' ||
      /^(?:github:|git\+|http:\/\/|https:\/\/)/.test(versionSpec)
    ) {
      issues.push({
        ruleId: 'ctxman/build/floating-dependency-spec',
        severity: 'high',
        target: `${depName}@${versionSpec}`,
        message: `Dependency '${depName}' uses non-deterministic spec '${versionSpec}'.`,
      });
    } else if (/^(?:file:|link:)/.test(versionSpec)) {
      issues.push({
        ruleId: 'ctxman/build/local-path-dependency',
        severity: 'high',
        target: `${depName}@${versionSpec}`,
        message: `Dependency '${depName}' points to a local machine path '${versionSpec}'.`,
      });
    }
  }

  if (dockerfileContent) {
    for (const rawLine of String(dockerfileContent).split(/\r?\n/)) {
      const line = rawLine.trim();
      const fromMatch = line.match(/^FROM\s+([^\s]+)/i);
      if (fromMatch) {
        const imageRef = fromMatch[1];
        if (!imageRef.includes(':') || imageRef.endsWith(':latest')) {
          issues.push({
            ruleId: 'ctxman/build/unpinned-docker-base-image',
            severity: 'medium',
            target: imageRef,
            message: `Docker base image '${imageRef}' is unpinned or uses ':latest'. Pin to a version or SHA-256 digest.`,
          });
        }
      }
    }
  }

  const highCount = issues.filter((i) => i.severity === 'high').length;
  const mediumCount = issues.filter((i) => i.severity === 'medium').length;
  const penalty = highCount * 30 + mediumCount * 15 + (issues.length - highCount - mediumCount) * 5;
  const score = Math.max(0, 100 - penalty);

  return {
    reproducible: highCount === 0 && mediumCount === 0,
    score,
    issues,
    summary: {
      totalIssues: issues.length,
      highCount,
      mediumCount,
    },
  };
}

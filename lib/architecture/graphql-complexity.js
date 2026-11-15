/**
 * F16-3: GraphQL Query Depth & Complexity DoS Auditor
 * Computes maximum nesting depth and fan-out complexity of GraphQL queries to prevent DoS amplification.
 */

/**
 * Audit GraphQL queries for excessive nesting depth and unbounded fan-out complexity.
 *
 * @param {object} options
 * @param {string[]} [options.queries]
 * @param {number} [options.maxDepth=5]
 * @param {number} [options.maxComplexity=50]
 * @returns {object}
 */
export function auditGraphqlQueryComplexity(options = {}) {
  const queries = Array.isArray(options.queries) ? options.queries : [];
  const maxDepth = Number(options.maxDepth ?? 5);
  const maxComplexity = Number(options.maxComplexity ?? 50);

  const results = [];
  const violations = [];

  for (let idx = 0; idx < queries.length; idx++) {
    const q = String(queries[idx] || '');
    let currentDepth = 0;
    let peakDepth = 0;
    let fieldCount = 0;

    const tokens = q.match(/\{|\}|\b[a-zA-Z_][a-zA-Z0-9_]*\b/g) || [];
    for (const tok of tokens) {
      if (tok === '{') {
        currentDepth += 1;
        if (currentDepth > peakDepth) peakDepth = currentDepth;
      } else if (tok === '}') {
        currentDepth = Math.max(0, currentDepth - 1);
      } else if (!['query', 'mutation', 'subscription', 'fragment', 'on'].includes(tok)) {
        fieldCount += 1;
      }
    }

    // Effective nesting depth excludes the outer operation envelope
    const depth = Math.max(0, peakDepth - 1);
    const complexity = depth * fieldCount * (depth >= 4 ? 2 : 1);

    const entry = {
      index: idx,
      depth,
      fieldCount,
      complexity,
      exceedsDepth: depth > maxDepth,
      exceedsComplexity: complexity > maxComplexity,
    };
    results.push(entry);

    if (entry.exceedsDepth || entry.exceedsComplexity) {
      violations.push({
        index: idx,
        depth,
        complexity,
        severity: depth > maxDepth + 2 ? 'critical' : 'high',
        remediation: `Restrict GraphQL query depth <= ${maxDepth} and complexity <= ${maxComplexity}.`,
      });
    }
  }

  return {
    safe: violations.length === 0,
    results,
    violations,
    summary: {
      totalQueries: queries.length,
      violationCount: violations.length,
      maxDepthAllowed: maxDepth,
      maxComplexityAllowed: maxComplexity,
    },
  };
}

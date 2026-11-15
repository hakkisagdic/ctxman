/**
 * Faz 17 (F17-5): API Lifecycle & RFC 8594 Sunset/Deprecation Header Auditor.
 * Checks deprecated endpoints and legacy API routes for standard Deprecation, Sunset, and successor Link headers.
 */
export function auditApiDeprecationHeaders(options = {}) {
  const { endpoints = [], files = [] } = options;
  const normalizedEndpoints = [...endpoints];

  for (const file of files) {
    const filePath = file.path || 'unknown.js';
    const content = String(file.content || '');
    if (!content.trim()) continue;

    // Match route definitions preceded by @deprecated or containing /v1/ when v2 exists
    const routeRegex =
      /(?:\/\*\*[\s\S]*?@deprecated[\s\S]*?\*\/\s*)?(?:app|router)\.(get|post|put|patch|delete)\s*\(\s*['"]([^'"]+)['"]\s*,([\s\S]*?)(?=(?:app|router)\.(?:get|post|put|patch|delete)\b|$)/gi;
    let match;
    while ((match = routeRegex.exec(content)) !== null) {
      const fullBlock = match[0];
      const method = match[1].toUpperCase();
      const routePath = match[2];
      const handlerBody = match[3] || '';
      const isDeprecated =
        /@deprecated/i.test(fullBlock) ||
        /deprecated\s*:\s*true/i.test(handlerBody) ||
        Boolean(file.isDeprecated);

      if (!isDeprecated) continue;

      const hasDeprecationHeader = /['"]Deprecation['"]/i.test(handlerBody);
      const hasSunsetHeader = /['"]Sunset['"]/i.test(handlerBody);
      const hasSuccessorLink = /rel=["']?successor-version["']?/i.test(handlerBody);

      normalizedEndpoints.push({
        path: filePath,
        method,
        route: routePath,
        deprecated: true,
        headers: {
          Deprecation: hasDeprecationHeader,
          Sunset: hasSunsetHeader,
          LinkSuccessor: hasSuccessorLink,
        },
      });
    }
  }

  const findings = [];
  let compliantCount = 0;

  for (const ep of normalizedEndpoints) {
    if (!ep.deprecated) continue;
    const headers = ep.headers || {};
    const hasDeprecation = Boolean(headers.Deprecation || headers.deprecation);
    const hasSunset = Boolean(headers.Sunset || headers.sunset);
    const hasSuccessor = Boolean(headers.LinkSuccessor || headers.link);

    const missing = [];
    if (!hasDeprecation) missing.push('Deprecation');
    if (!hasSunset) missing.push('Sunset');
    if (!hasSuccessor) missing.push('Link (rel="successor-version")');

    if (missing.length === 0) {
      compliantCount += 1;
    } else {
      findings.push({
        path: ep.path || 'api',
        method: ep.method || 'GET',
        route: ep.route || '/unknown',
        missingHeaders: missing,
        severity: !hasDeprecation || !hasSunset ? 'high' : 'medium',
        remediation: `Set RFC 8594 headers on "${ep.method || 'GET'} ${ep.route}": Deprecation: true, Sunset: <HTTP-date>, and Link: <successor>; rel="successor-version".`,
      });
    }
  }

  const deprecatedEndpointsCount = normalizedEndpoints.filter((e) => e.deprecated).length;
  const violationsCount = findings.length;
  const status = violationsCount === 0 ? 'compliant' : 'missing-headers';

  return {
    status,
    deprecatedEndpointsCount,
    compliantCount,
    violationsCount,
    findings,
    summary:
      status === 'compliant'
        ? `All ${deprecatedEndpointsCount} deprecated endpoint(s) emit RFC 8594 Deprecation and Sunset headers.`
        : `Found ${violationsCount} deprecated endpoint(s) missing RFC 8594 Sunset/Deprecation headers.`,
  };
}

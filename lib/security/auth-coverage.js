/**
 * F14-2: Zero-Trust Endpoint Auth & RBAC Coverage Auditor
 * Scans REST/HTTP route definitions for missing authentication or RBAC authorization middleware.
 */

import fs from 'fs';
import path from 'path';
import { Scanner } from '../core/Scanner.js';

const ROUTE_DEF_REGEX =
  /\b(?:app|router|server)\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]\s*,([\s\S]*?)\)/g;

const AUTH_GUARD_REGEX =
  /\b(?:requireAuth|authenticate|verifyToken|verifyJwt|checkRole|requireRole|requirePermission|authorize|withAuth|isAdmin|rbac)\b/i;

const DEFAULT_PUBLIC_ROUTES = new Set([
  '/health',
  '/healthz',
  '/readyz',
  '/metrics',
  '/api/v1/health',
]);

/**
 * Audit HTTP route registrations for Zero-Trust authentication and RBAC middleware coverage.
 *
 * @param {object} [options]
 * @param {string} [options.rootPath]
 * @param {Array<{path: string, content: string}>} [options.files]
 * @param {string[]} [options.publicRoutes]
 * @returns {object}
 */
export function auditEndpointAuthCoverage(options = {}) {
  const allowedPublic = new Set([
    ...DEFAULT_PUBLIC_ROUTES,
    ...(Array.isArray(options.publicRoutes) ? options.publicRoutes : []),
  ]);

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

  const unprotectedRoutes = [];
  let totalRoutes = 0;
  let protectedCount = 0;

  for (const file of fileEntries) {
    const content = String(file.content || '');
    let match;
    ROUTE_DEF_REGEX.lastIndex = 0;
    while ((match = ROUTE_DEF_REGEX.exec(content)) !== null) {
      const method = match[1].toUpperCase();
      const routePath = match[2];
      const argsTail = match[3] || '';
      totalRoutes += 1;

      if (allowedPublic.has(routePath) || argsTail.includes('@public-route')) {
        protectedCount += 1;
        continue;
      }

      if (AUTH_GUARD_REGEX.test(argsTail)) {
        protectedCount += 1;
      } else {
        const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
        unprotectedRoutes.push({
          file: file.path,
          method,
          route: routePath,
          severity: isMutation ? 'critical' : 'high',
          ruleId: 'ctxman/security/unauthenticated-endpoint',
          remediation: `Attach authentication/RBAC middleware (e.g. requireAuth, requireRole) to '${method} ${routePath}'.`,
        });
      }
    }
  }

  const coveragePct = totalRoutes > 0 ? Math.round((protectedCount / totalRoutes) * 100) : 100;

  return {
    compliant: unprotectedRoutes.length === 0,
    coveragePct,
    unprotectedRoutes,
    summary: {
      totalRoutes,
      protectedCount,
      unprotectedCount: unprotectedRoutes.length,
      coveragePct,
    },
  };
}

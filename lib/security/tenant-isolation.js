/**
 * F11-3: Multi-Tenant Query Isolation Auditor
 * Detects SQL and ORM queries lacking tenant scoping filters (tenant_id, org_id, workspace_id).
 */

import fs from 'fs';
import path from 'path';
import { Scanner } from '../core/Scanner.js';

const TENANT_FILTER_REGEX =
  /\b(?:tenant_id|tenantId|org_id|orgId|organization_id|organizationId|workspace_id|workspaceId|account_id|accountId)\b/i;

const SQL_QUERY_REGEX =
  /\b(?:SELECT\s+.+?\s+FROM|UPDATE\s+\w+\s+SET|DELETE\s+FROM)\s+([a-zA-Z0-9_]+)/i;

const ORM_QUERY_REGEX =
  /\b([a-zA-Z0-9_]+)\.(?:findMany|findFirst|findUnique|updateMany|deleteMany|count|aggregate)\s*\(/;

const GLOBAL_TABLES = new Set([
  'migrations',
  'schema_migrations',
  'plans',
  'system_config',
  'countries',
  'currencies',
]);

function extractStatementWindow(lines, startIndex) {
  const collected = [];
  for (let j = startIndex; j < Math.min(lines.length, startIndex + 5); j++) {
    collected.push(lines[j]);
    if (lines[j].includes(';')) break;
  }
  return collected.join(' ');
}

/**
 * Audit repository files for multi-tenant data isolation leaks.
 *
 * @param {object} [options]
 * @param {string} [options.rootPath]
 * @param {Array<{path: string, content: string}>} [options.files]
 * @param {string[]} [options.globalTables]
 * @returns {object}
 */
export function auditTenantIsolation(options = {}) {
  const allowedGlobal = new Set([
    ...GLOBAL_TABLES,
    ...(Array.isArray(options.globalTables)
      ? options.globalTables.map((t) => t.toLowerCase())
      : []),
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

  const findings = [];

  for (const file of fileEntries) {
    const lines = String(file.content || '').split('\n');
    for (let i = 0; i < lines.length; i++) {
      const windowText = extractStatementWindow(lines, i);
      if (windowText.includes('@tenant-global')) continue;

      const sqlMatch = lines[i].match(SQL_QUERY_REGEX);
      if (sqlMatch) {
        const table = sqlMatch[1].toLowerCase();
        if (!allowedGlobal.has(table) && !TENANT_FILTER_REGEX.test(windowText)) {
          const isMutation = /\b(?:UPDATE|DELETE)\b/i.test(lines[i]);
          findings.push({
            file: file.path,
            line: i + 1,
            kind: 'unscoped-sql-query',
            modelOrTable: table,
            severity: isMutation ? 'critical' : 'high',
            snippet: lines[i].trim(),
            remediation: `Add a WHERE tenant_id = ? (or org_id) predicate to query on '${table}'.`,
          });
        }
        continue;
      }

      const ormMatch = lines[i].match(ORM_QUERY_REGEX);
      if (ormMatch) {
        const model = ormMatch[1].toLowerCase();
        if (!allowedGlobal.has(model) && !TENANT_FILTER_REGEX.test(windowText)) {
          const isMutation = /\b(?:updateMany|deleteMany)\b/.test(lines[i]);
          findings.push({
            file: file.path,
            line: i + 1,
            kind: 'unscoped-orm-query',
            modelOrTable: model,
            severity: isMutation ? 'critical' : 'high',
            snippet: lines[i].trim(),
            remediation: `Include tenantId / orgId in the 'where' filter for '${model}'.`,
          });
        }
      }
    }
  }

  const criticalCount = findings.filter((f) => f.severity === 'critical').length;
  const highCount = findings.filter((f) => f.severity === 'high').length;

  return {
    isolated: findings.length === 0,
    findings,
    summary: {
      scannedFiles: fileEntries.length,
      violationCount: findings.length,
      criticalCount,
      highCount,
    },
  };
}

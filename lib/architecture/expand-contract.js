import fs from 'node:fs';
import path from 'node:path';

const DESTRUCTIVE_PATTERNS = [
  {
    type: 'rename-column',
    regex:
      /ALTER\s+TABLE\s+([a-zA-Z0-9_."`]+)\s+RENAME\s+COLUMN\s+([a-zA-Z0-9_."`]+)\s+TO\s+([a-zA-Z0-9_."`]+)/gi,
    buildPhases: (table, fromCol, toCol) => ({
      expand: `ALTER TABLE ${table} ADD COLUMN ${toCol} <TYPE>; -- Dual-write to both ${fromCol} and ${toCol}`,
      migrate: `UPDATE ${table} SET ${toCol} = ${fromCol} WHERE ${toCol} IS NULL; -- Switch application reads to ${toCol}`,
      contract: `ALTER TABLE ${table} DROP COLUMN ${fromCol}; -- Execute after all old app instances are drained`,
    }),
  },
  {
    type: 'drop-column',
    regex:
      /ALTER\s+TABLE\s+([a-zA-Z0-9_."`]+)\s+DROP\s+COLUMN(?:\s+IF\s+EXISTS)?\s+([a-zA-Z0-9_."`]+)/gi,
    buildPhases: (table, col) => ({
      expand: `-- Stop reading/writing ${table}.${col} in application code and ignore column in ORM select projections`,
      migrate: `-- Deploy application version that has zero references to ${table}.${col} and verify telemetry`,
      contract: `ALTER TABLE ${table} DROP COLUMN IF EXISTS ${col};`,
    }),
  },
  {
    type: 'alter-column-type',
    regex:
      /ALTER\s+TABLE\s+([a-zA-Z0-9_."`]+)\s+ALTER\s+COLUMN\s+([a-zA-Z0-9_."`]+)\s+(?:SET\s+DATA\s+)?TYPE\s+([a-zA-Z0-9_(),\s]+?)(?:;|USING|$)/gi,
    buildPhases: (table, col, newType) => ({
      expand: `ALTER TABLE ${table} ADD COLUMN ${col}_v2 ${newType.trim()}; -- Dual-write converted values`,
      migrate: `UPDATE ${table} SET ${col}_v2 = CAST(${col} AS ${newType.trim()}) WHERE ${col}_v2 IS NULL; -- Switch reads to ${col}_v2`,
      contract: `ALTER TABLE ${table} DROP COLUMN ${col}; -- Optionally rename ${col}_v2 in a maintenance window`,
    }),
  },
  {
    type: 'set-not-null',
    regex:
      /ALTER\s+TABLE\s+([a-zA-Z0-9_."`]+)\s+ALTER\s+COLUMN\s+([a-zA-Z0-9_."`]+)\s+SET\s+NOT\s+NULL/gi,
    buildPhases: (table, col) => ({
      expand: `ALTER TABLE ${table} ADD CONSTRAINT ${col}_not_null_chk CHECK (${col} IS NOT NULL) NOT VALID;`,
      migrate: `UPDATE ${table} SET ${col} = <DEFAULT> WHERE ${col} IS NULL; ALTER TABLE ${table} VALIDATE CONSTRAINT ${col}_not_null_chk;`,
      contract: `ALTER TABLE ${table} ALTER COLUMN ${col} SET NOT NULL; ALTER TABLE ${table} DROP CONSTRAINT ${col}_not_null_chk;`,
    }),
  },
];

function collectMigrationFiles(projectRoot) {
  if (!projectRoot || !fs.existsSync(projectRoot)) return [];
  const candidateDirs = ['migrations', 'db/migrations', 'prisma/migrations', 'drizzle'];
  const collected = [];
  for (const rel of candidateDirs) {
    const fullDir = path.join(projectRoot, rel);
    if (!fs.existsSync(fullDir)) continue;
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(sql|js|ts)$/i.test(entry.name)) {
          collected.push({
            path: path.relative(projectRoot, full).replace(/\\/g, '/'),
            sql: fs.readFileSync(full, 'utf8'),
          });
        }
      }
    };
    walk(fullDir);
  }
  return collected;
}

/**
 * Faz 17 (F17-1): Zero-Downtime Expand-Contract Schema Migration Planner.
 * Transforms destructive single-step SQL schema changes into a 3-phase Expand-Contract plan.
 */
export function planZeroDowntimeSchemaMigration(options = {}) {
  const { projectRoot = process.cwd(), migrations } = options;
  const items = Array.isArray(migrations) ? migrations : collectMigrationFiles(projectRoot);

  const operations = [];
  const threePhasePlan = [];

  for (const item of items) {
    const filePath = item.path || 'inline.sql';
    const sql = String(item.sql || item.content || '');
    if (!sql.trim()) continue;

    for (const pattern of DESTRUCTIVE_PATTERNS) {
      const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
      let match;
      while ((match = regex.exec(sql)) !== null) {
        const table = match[1];
        const col = match[2];
        const arg3 = match[3] || '';
        const phases = pattern.buildPhases(table, col, arg3);

        operations.push({
          path: filePath,
          type: pattern.type,
          table,
          column: col,
          target: arg3 ? arg3.trim() : null,
          statement: match[0].trim(),
          risk: 'high',
        });

        threePhasePlan.push({
          path: filePath,
          operationType: pattern.type,
          table,
          column: col,
          phases: [
            { phase: 1, stage: 'expand', action: phases.expand },
            { phase: 2, stage: 'migrate', action: phases.migrate },
            { phase: 3, stage: 'contract', action: phases.contract },
          ],
        });
      }
    }
  }

  const destructiveChangesCount = operations.length;
  const status = destructiveChangesCount === 0 ? 'safe' : 'requires-expand-contract';

  return {
    status,
    scannedMigrationsCount: items.length,
    destructiveChangesCount,
    operations,
    threePhasePlan,
    summary:
      status === 'safe'
        ? `All ${items.length} migration(s) are compatible with zero-downtime rolling deployments.`
        : `Detected ${destructiveChangesCount} destructive schema change(s); generated ${threePhasePlan.length} Expand-Contract 3-phase migration plan(s).`,
  };
}

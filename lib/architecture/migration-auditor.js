/**
 * Audits database SQL / ORM migration files for table lock hazards, destructive DDL,
 * and missing rollback (`down`) handlers (F9-1).
 *
 * @param {object} options
 * @param {Array<{path: string, content: string}>} [options.files=[]]
 * @returns {{
 *   safe: boolean,
 *   riskScore: number,
 *   findings: Array<{
 *     file: string,
 *     line: number,
 *     ruleId: string,
 *     severity: 'critical' | 'high' | 'medium',
 *     statement: string,
 *     remediation: string
 *   }>,
 *   summary: {
 *     scannedFiles: number,
 *     totalFindings: number,
 *     criticalCount: number,
 *     highCount: number,
 *     missingRollbackFiles: string[]
 *   }
 * }}
 */
export function auditMigrationSafety(options = {}) {
  const { files = [] } = options;
  const findings = [];
  const missingRollbackFiles = [];

  for (const fileObj of files) {
    const file = String(fileObj.path || '').replace(/\\/g, '/');
    const content = String(fileObj.content || '');
    if (!file || !content) continue;

    const lines = content.split(/\r?\n/);

    // Check if JS/TS migration exports `up` without `down`
    const hasUpExport = /\b(?:export\s+(?:async\s+)?function\s+up|exports\.up)\b/.test(content);
    const hasDownExport = /\b(?:export\s+(?:async\s+)?function\s+down|exports\.down)\b/.test(
      content
    );
    const hasDownSqlComment = /--\s*\+goose\s+Down|--\s*down\b/i.test(content);
    if (hasUpExport && !hasDownExport && !hasDownSqlComment) {
      missingRollbackFiles.push(file);
      findings.push({
        file,
        line: 1,
        ruleId: 'ctxman/migration/missing-down-rollback',
        severity: 'medium',
        statement: 'export function up(...) without matching down(...)',
        remediation: 'Provide an idempotent `down` rollback migration to allow safe revert.',
      });
    }

    for (let idx = 0; idx < lines.length; idx++) {
      const lineText = lines[idx];
      const trimmed = lineText.trim();
      if (!trimmed || trimmed.startsWith('--') || trimmed.startsWith('//')) continue;
      const lineNumber = idx + 1;

      // 1. Destructive DROP TABLE / TRUNCATE
      if (/\b(?:DROP\s+TABLE|TRUNCATE\s+TABLE)\b/i.test(trimmed)) {
        findings.push({
          file,
          line: lineNumber,
          ruleId: 'ctxman/migration/destructive-drop-table',
          severity: 'critical',
          statement: trimmed,
          remediation:
            'Rename deprecated tables first and drop in a subsequent release after verifying zero reads.',
        });
      }

      // 2. Destructive DROP COLUMN
      if (/\bALTER\s+TABLE\b[\s\S]*?\bDROP\s+COLUMN\b/i.test(trimmed)) {
        findings.push({
          file,
          line: lineNumber,
          ruleId: 'ctxman/migration/destructive-drop-column',
          severity: 'high',
          statement: trimmed,
          remediation:
            'Use expand-and-contract: ignore the column in application code before dropping it in a later migration.',
        });
      }

      // 3. ADD COLUMN ... NOT NULL without DEFAULT (causes full table rewrite / failure on populated tables)
      if (
        /\bADD\s+(?:COLUMN\s+)?[\w"`]+\s+[^;]*\bNOT\s+NULL\b/i.test(trimmed) &&
        !/\bDEFAULT\b/i.test(trimmed)
      ) {
        findings.push({
          file,
          line: lineNumber,
          ruleId: 'ctxman/migration/not-null-without-default',
          severity: 'critical',
          statement: trimmed,
          remediation:
            'Add the column as nullable first, backfill in batches, or provide a constant DEFAULT value.',
        });
      }

      // 4. CREATE INDEX without CONCURRENTLY (locks writes on PostgreSQL)
      if (
        /\bCREATE\s+(?:UNIQUE\s+)?INDEX\b/i.test(trimmed) &&
        !/\bCONCURRENTLY\b/i.test(trimmed) &&
        !/\bIF\s+NOT\s+EXISTS\s+idx_sqlite/i.test(trimmed)
      ) {
        findings.push({
          file,
          line: lineNumber,
          ruleId: 'ctxman/migration/non-concurrent-index',
          severity: 'high',
          statement: trimmed,
          remediation:
            'Use `CREATE INDEX CONCURRENTLY` to avoid blocking table writes during index creation.',
        });
      }
    }
  }

  const criticalCount = findings.filter((f) => f.severity === 'critical').length;
  const highCount = findings.filter((f) => f.severity === 'high').length;
  const riskScore = Math.min(
    100,
    criticalCount * 40 + highCount * 25 + (findings.length - criticalCount - highCount) * 10
  );

  return {
    safe: criticalCount === 0 && highCount === 0,
    riskScore,
    findings,
    summary: {
      scannedFiles: files.length,
      totalFindings: findings.length,
      criticalCount,
      highCount,
      missingRollbackFiles,
    },
  };
}

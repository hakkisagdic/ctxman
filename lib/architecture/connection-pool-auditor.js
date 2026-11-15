/**
 * Faz 18 (F18-3): Database Connection Pool & Leak Risk Auditor.
 * Detects unreleased DB clients (`pool.connect()` without `finally { client.release() }`), per-request pool creation, and missing pool timeouts.
 */
export function auditConnectionPoolExhaustion(options = {}) {
  const { files = [], poolConfig = null } = options;
  const findings = [];

  if (poolConfig && typeof poolConfig === 'object') {
    const max = Number(poolConfig.max ?? poolConfig.connectionLimit ?? 0);
    const idleTimeoutMillis = Number(poolConfig.idleTimeoutMillis ?? poolConfig.idleTimeout ?? 0);
    const connectionTimeoutMillis = Number(
      poolConfig.connectionTimeoutMillis ?? poolConfig.acquireTimeout ?? 0
    );

    if (!max || max > 100) {
      findings.push({
        type: 'unsafe-pool-max-limit',
        path: 'poolConfig',
        severity: 'high',
        reason: `Database pool max connections (${max || 'unbounded'}) is either unbounded or exceeds safe per-instance limits.`,
        remediation:
          'Configure an explicit `max` (e.g., 10–30 per worker) coordinated with PostgreSQL/MySQL max_connections and PgBouncer.',
      });
    }
    if (idleTimeoutMillis <= 0 || connectionTimeoutMillis <= 0) {
      findings.push({
        type: 'missing-pool-timeouts',
        path: 'poolConfig',
        severity: 'medium',
        reason:
          'Database pool configuration is missing `idleTimeoutMillis` or `connectionTimeoutMillis`.',
        remediation:
          'Set `connectionTimeoutMillis` (e.g., 3000ms) and `idleTimeoutMillis` (e.g., 30000ms) to fail fast instead of hanging requests.',
      });
    }
  }

  for (const file of files) {
    const filePath = file.path || 'unknown.js';
    const content = String(file.content || '');
    if (!content.trim()) continue;

    // 1. pool.connect() / getConnection() without finally { ... release() }
    const borrowsConnection = /\b(?:pool\.connect|getConnection|acquireConnection)\s*\(/.test(
      content
    );
    if (borrowsConnection) {
      const hasRelease = /\.\s*(?:release|close|end)\s*\(/.test(content);
      const hasFinally = /\bfinally\s*\{[\s\S]*?\.\s*(?:release|close)\s*\(/.test(content);

      if (!hasRelease) {
        findings.push({
          type: 'unreleased-connection-leak',
          path: filePath,
          severity: 'critical',
          reason: `File "${filePath}" acquires a pooled DB connection without calling client.release().`,
          remediation:
            'Always wrap `const client = await pool.connect()` in a `try { ... } finally { client.release(); }` block.',
        });
      } else if (!hasFinally) {
        findings.push({
          type: 'release-outside-finally',
          path: filePath,
          severity: 'high',
          reason: `File "${filePath}" releases a pooled DB connection outside a \`finally\` block, leaking connections when queries throw.`,
          remediation:
            'Move `client.release()` into a `finally` block so exceptions cannot leak the connection.',
        });
      }
    }

    // 2. Instantiating new Pool / PrismaClient inside a function/handler
    const handlerPoolRegex =
      /(?:function\s+\w+|=>\s*\{)[\s\S]*?\bnew\s+(?:Pool|PrismaClient|Sequelize|Knex)\s*\(/m;
    if (handlerPoolRegex.test(content)) {
      findings.push({
        type: 'per-request-pool-instantiation',
        path: filePath,
        severity: 'critical',
        reason: `File "${filePath}" instantiates a new database Pool/ORM client inside a function body instead of reusing a singleton.`,
        remediation:
          'Hoist `new Pool(...)` / `new PrismaClient()` to a module-level singleton to prevent connection exhaustion under load.',
      });
    }
  }

  const status = findings.length === 0 ? 'healthy' : 'exhaustion-risk';

  return {
    status,
    scannedFilesCount: files.length,
    findingsCount: findings.length,
    findings,
    summary:
      status === 'healthy'
        ? `No database connection pool leaks or timeout misconfigurations found across ${files.length} file(s).`
        : `Detected ${findings.length} database connection pool exhaustion/leak risk(s).`,
  };
}

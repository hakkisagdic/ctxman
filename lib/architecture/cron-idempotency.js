/**
 * Faz 19 (F19-5): Background Cron / Scheduled Job Overlap & Distributed Lock Auditor.
 * Audits scheduled cron jobs and recurring background tasks for distributed lock protection (`withDistributedLock`, `pg_try_advisory_lock`, `redlock`) and execution timeout guards.
 */
export function auditCronJobIdempotency(options = {}) {
  const { files = [], jobs = [] } = options;
  const findings = [];
  let auditedJobsCount = 0;

  for (const job of jobs) {
    auditedJobsCount += 1;
    const name = job.name || 'unnamed-cron';
    if (!job.distributedLock) {
      findings.push({
        type: 'missing-distributed-lock',
        jobName: name,
        schedule: job.schedule || '* * * * *',
        severity: 'critical',
        reason: `Scheduled job "${name}" runs without a distributed lock, risking duplicate concurrent execution across replicas.`,
        remediation:
          'Acquire a distributed lease/lock (e.g. Redis Redlock or PostgreSQL `pg_try_advisory_lock`) before running the job handler.',
      });
    }
    if (!job.timeoutMs || Number(job.timeoutMs) <= 0) {
      findings.push({
        type: 'missing-job-timeout',
        jobName: name,
        severity: 'medium',
        reason: `Scheduled job "${name}" does not define an execution timeout or overlap guard.`,
        remediation: 'Configure a maximum runtime (`timeoutMs`) shorter than the cron interval.',
      });
    }
  }

  for (const file of files) {
    const filePath = file.path || 'unknown.js';
    const content = String(file.content || '');
    if (!content.trim()) continue;

    const isCronFile = /\b(?:cron\.schedule|scheduleJob|new\s+CronJob|setInterval)\s*\(/i.test(
      content
    );
    if (!isCronFile) continue;

    auditedJobsCount += 1;

    const hasDistributedLock =
      /redlock|acquireLock|withLock|withDistributedLock|pg_try_advisory_lock|SET\s+.*\bNX\b/i.test(
        content
      );
    if (!hasDistributedLock) {
      findings.push({
        type: 'missing-distributed-lock',
        path: filePath,
        severity: 'critical',
        reason: `Cron/scheduled task in "${filePath}" lacks a distributed lock, allowing duplicate execution on multi-instance deployments.`,
        remediation:
          'Guard the scheduled handler with a distributed lock (`withDistributedLock` / `pg_try_advisory_lock`) and idempotent checkpointing.',
      });
    }
  }

  const status = findings.length === 0 ? 'idempotent' : 'overlap-risk';

  return {
    status,
    auditedJobsCount,
    findingsCount: findings.length,
    findings,
    summary:
      status === 'idempotent'
        ? `All ${auditedJobsCount} scheduled cron job(s) enforce distributed locks and overlap guards.`
        : `Detected ${findings.length} cron overlap/idempotency risk(s) across ${auditedJobsCount} scheduled job(s).`,
  };
}

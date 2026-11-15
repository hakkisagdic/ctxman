/**
 * Faz 17 (F17-3): Enterprise Secret Rotation & Dual-Key Readiness Auditor.
 * Audits secret inventory age and code verification patterns for zero-downtime key rotation (dual-key/keyring support).
 */
export function auditSecretRotationReadiness(options = {}) {
  const { files = [], secrets = [], maxAgeDays = 90 } = options;
  const findings = [];

  for (const secret of secrets) {
    const name = secret.name || 'UNKNOWN_SECRET';
    const ageDays = Number(secret.ageDays || 0);
    const limit = Number(secret.maxAgeDays || maxAgeDays);
    if (ageDays > limit) {
      findings.push({
        type: 'expired-secret',
        secretName: name,
        severity: ageDays > limit * 1.5 ? 'critical' : 'high',
        ageDays,
        maxAgeDays: limit,
        remediation: `Rotate "${name}" immediately (age ${ageDays}d exceeds ${limit}d policy).`,
      });
    }
    if (secret.supportsDualKey === false) {
      findings.push({
        type: 'missing-dual-key-support',
        secretName: name,
        severity: 'medium',
        remediation: `Configure primary + secondary (previous) key ring verification for "${name}" to allow zero-downtime rotation.`,
      });
    }
  }

  for (const file of files) {
    const filePath = file.path || 'unknown.js';
    const content = String(file.content || '');
    if (!content.trim()) continue;

    // Detect single-key verification calls without fallback/array/previous key support
    const singleKeyVerifyRegex =
      /(?:jwt\.verify|createHmac|timingSafeEqual)\s*\([^)]*process\.env\.([A-Z0-9_]*(?:SECRET|KEY|TOKEN)[A-Z0-9_]*)/g;
    let match;
    while ((match = singleKeyVerifyRegex.exec(content)) !== null) {
      const envVar = match[1];
      const hasFallbackKey =
        content.includes(`${envVar}_PREVIOUS`) ||
        content.includes(`${envVar}_SECONDARY`) ||
        content.includes(`${envVar}_OLD`) ||
        content.includes(`${envVar}S`) ||
        /verifyWithKeyring|rotateKeys|dualKey/i.test(content);

      if (!hasFallbackKey) {
        findings.push({
          type: 'single-key-verification',
          path: filePath,
          secretName: envVar,
          severity: 'high',
          remediation: `Support a key array or fallback env var (${envVar}_PREVIOUS) during verification so active tokens/webhooks do not fail during rotation.`,
        });
      }
    }

    // Detect top-level frozen env secret assignments that require process restart on rotation
    const topLevelSecretRegex =
      /^(?:export\s+)?const\s+[A-Z0-9_]+\s*=\s*process\.env\.([A-Z0-9_]*(?:SECRET|PRIVATE_KEY|API_KEY)[A-Z0-9_]*)/gm;
    let topMatch;
    while ((topMatch = topLevelSecretRegex.exec(content)) !== null) {
      const envVar = topMatch[1];
      findings.push({
        type: 'static-secret-binding',
        path: filePath,
        secretName: envVar,
        severity: 'medium',
        remediation: `Read "${envVar}" dynamically via a secret provider or getter function instead of caching at module load time.`,
      });
    }
  }

  const penalty = findings.reduce((sum, f) => {
    if (f.severity === 'critical') return sum + 30;
    if (f.severity === 'high') return sum + 20;
    return sum + 10;
  }, 0);
  const readinessScore = Math.max(0, 100 - penalty);
  const status = findings.length === 0 ? 'ready' : 'rotation-risk';

  return {
    status,
    readinessScore,
    findingsCount: findings.length,
    findings,
    summary:
      status === 'ready'
        ? `Secret rotation readiness score is ${readinessScore}/100 with dual-key and age policies satisfied.`
        : `Detected ${findings.length} secret rotation risk(s) (readiness score: ${readinessScore}/100).`,
  };
}

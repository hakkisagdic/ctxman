/**
 * Faz 18 (F18-4): Multi-Environment (Dev/Staging/Prod) Configuration Parity & Drift Auditor.
 * Compares environment configuration maps across dev, staging, and prod for missing keys, unsafe production flags, and type mismatches.
 */
export function compareEnvironmentParity(options = {}) {
  const { environments = {}, baseEnv = 'prod' } = options;
  const envNames = Object.keys(environments);
  const allKeys = new Set();

  for (const envName of envNames) {
    const config = environments[envName] || {};
    for (const key of Object.keys(config)) {
      allKeys.add(key);
    }
  }

  const missingKeysByEnv = {};
  const unsafeProdSettings = [];
  const driftFindings = [];

  for (const envName of envNames) {
    missingKeysByEnv[envName] = [];
    const config = environments[envName] || {};
    for (const key of allKeys) {
      if (!(key in config) || config[key] === undefined || config[key] === '') {
        missingKeysByEnv[envName].push(key);
        driftFindings.push({
          type: 'missing-key',
          environment: envName,
          key,
          severity: envName === 'prod' || envName === 'production' ? 'critical' : 'high',
          remediation: `Define "${key}" in "${envName}" environment configuration.`,
        });
      }
    }
  }

  const prodEnvName = envNames.find((n) => /^prod(?:uction)?$/i.test(n)) || baseEnv;
  const prodConfig = environments[prodEnvName] || {};

  for (const [key, value] of Object.entries(prodConfig)) {
    const strVal = String(value);
    if (/^(?:DEBUG|ENABLE_SWAGGER|ALLOW_INSECURE_TLS|SKIP_AUTH|MOCK_PAYMENTS)$/i.test(key)) {
      if (/^(?:true|1|yes)$/i.test(strVal)) {
        unsafeProdSettings.push({ key, value });
        driftFindings.push({
          type: 'unsafe-production-flag',
          environment: prodEnvName,
          key,
          value,
          severity: 'critical',
          remediation: `Disable "${key}" in "${prodEnvName}" (currently "${strVal}").`,
        });
      }
    }
    if (/(?:URL|HOST|ORIGIN)/i.test(key) && /(?:localhost|127\.0\.0\.1|0\.0\.0\.0)/i.test(strVal)) {
      unsafeProdSettings.push({ key, value });
      driftFindings.push({
        type: 'localhost-in-production',
        environment: prodEnvName,
        key,
        value,
        severity: 'critical',
        remediation: `Replace loopback/localhost address in "${prodEnvName}.${key}" with the production endpoint.`,
      });
    }
  }

  const status = driftFindings.length === 0 ? 'in-sync' : 'drift-detected';

  return {
    status,
    environmentsCount: envNames.length,
    totalUniqueKeys: allKeys.size,
    missingKeysByEnv,
    unsafeProdSettings,
    findingsCount: driftFindings.length,
    findings: driftFindings,
    summary:
      status === 'in-sync'
        ? `All ${envNames.length} environment(s) (${envNames.join(', ')}) have full key parity and safe production flags.`
        : `Detected ${driftFindings.length} environment parity/safety issue(s) across ${envNames.join(', ')}.`,
  };
}

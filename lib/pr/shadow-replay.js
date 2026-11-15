/**
 * F15-3: Shadow Traffic & Regression Replay Plan Generator
 * Generates a safe production traffic mirroring and response-diffing plan for modified endpoints.
 */

const SENSITIVE_HEADERS = ['authorization', 'cookie', 'x-api-key', 'x-iyzico-signature'];
const VOLATILE_FIELDS = ['timestamp', 'requestId', 'traceId', 'durationMs', 'nonce'];

/**
 * Generate a shadow traffic replay and response-diffing plan for changed API routes.
 *
 * @param {object} options
 * @param {Array<{method?: string, path: string, riskTier?: 'low'|'medium'|'high'}>} [options.routes]
 * @param {string} [options.primaryBaseUrl='https://api.prod.internal']
 * @param {string} [options.shadowBaseUrl='https://api.canary.internal']
 * @returns {object}
 */
export function generateShadowReplayPlan(options = {}) {
  const routes = Array.isArray(options.routes) ? options.routes : [];
  const primaryBaseUrl = options.primaryBaseUrl || 'https://api.prod.internal';
  const shadowBaseUrl = options.shadowBaseUrl || 'https://api.canary.internal';

  const replayTargets = routes.map((r) => {
    const method = String(r.method || 'GET').toUpperCase();
    const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
    const samplePct = r.riskTier === 'high' ? 25 : r.riskTier === 'medium' ? 10 : 5;

    return {
      method,
      path: r.path,
      replayMode: isMutation ? 'dry-run-sandbox' : 'read-only-mirror',
      sampleRatePct: samplePct,
      redactHeaders: SENSITIVE_HEADERS,
      ignoreVolatileFields: VOLATILE_FIELDS,
      maxDiffToleranceMs: 50,
    };
  });

  return {
    primaryBaseUrl,
    shadowBaseUrl,
    replayTargets,
    summary: {
      totalRoutes: replayTargets.length,
      readOnlyMirrorCount: replayTargets.filter((t) => t.replayMode === 'read-only-mirror').length,
      sandboxMutationCount: replayTargets.filter((t) => t.replayMode === 'dry-run-sandbox').length,
    },
  };
}

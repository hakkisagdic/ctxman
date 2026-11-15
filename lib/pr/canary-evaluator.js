/**
 * F13-1: Live Canary Telemetry & Automated Rollback Decision Engine
 * Compares canary vs baseline error rates, p99 latency, and saturation to decide promote, hold, or rollback.
 */

/**
 * Evaluate canary deployment health against baseline telemetry.
 *
 * @param {object} options
 * @param {{errorRatePct: number, p99LatencyMs: number, cpuSaturationPct?: number, sampleSize?: number}} options.baseline
 * @param {{errorRatePct: number, p99LatencyMs: number, cpuSaturationPct?: number, sampleSize?: number}} options.canary
 * @param {number} [options.maxErrorRateDeltaPct=1.0]
 * @param {number} [options.maxLatencyRegressionRatio=1.35]
 * @param {number} [options.minSampleSize=100]
 * @returns {object}
 */
export function evaluateCanaryRollout(options = {}) {
  const baseline = options.baseline || { errorRatePct: 0.1, p99LatencyMs: 120, sampleSize: 1000 };
  const canary = options.canary || { errorRatePct: 0.1, p99LatencyMs: 120, sampleSize: 500 };

  const maxErrorRateDeltaPct = Number(options.maxErrorRateDeltaPct ?? 1.0);
  const maxLatencyRegressionRatio = Number(options.maxLatencyRegressionRatio ?? 1.35);
  const minSampleSize = Number(options.minSampleSize ?? 100);

  const errorRateDeltaPct = Number(
    (Number(canary.errorRatePct || 0) - Number(baseline.errorRatePct || 0)).toFixed(3)
  );
  const latencyRatio = Number(
    (Number(canary.p99LatencyMs || 1) / Math.max(1, Number(baseline.p99LatencyMs || 1))).toFixed(2)
  );
  const canaryCpu = Number(canary.cpuSaturationPct ?? 40);
  const sampleSize = Number(canary.sampleSize ?? 500);

  const anomalies = [];
  let decision = 'promote';

  if (errorRateDeltaPct > maxErrorRateDeltaPct) {
    anomalies.push(
      `Canary error rate increased by +${errorRateDeltaPct}% (threshold: +${maxErrorRateDeltaPct}%).`
    );
    decision = 'rollback';
  }

  if (latencyRatio > maxLatencyRegressionRatio) {
    anomalies.push(
      `Canary p99 latency regressed by ${latencyRatio}x (${canary.p99LatencyMs}ms vs ${baseline.p99LatencyMs}ms).`
    );
    decision = 'rollback';
  }

  if (canaryCpu >= 90) {
    anomalies.push(`Canary CPU saturation is critical (${canaryCpu}% >= 90%).`);
    decision = 'rollback';
  }

  if (decision === 'promote' && sampleSize < minSampleSize) {
    anomalies.push(
      `Canary sample size (${sampleSize}) is below minimum statistical threshold (${minSampleSize}).`
    );
    decision = 'hold';
  }

  const healthScore = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        100 -
          Math.max(0, errorRateDeltaPct) * 25 -
          Math.max(0, latencyRatio - 1) * 50 -
          (canaryCpu > 80 ? (canaryCpu - 80) * 2 : 0)
      )
    )
  );

  return {
    healthy: decision === 'promote',
    decision,
    healthScore,
    anomalies,
    metrics: {
      errorRateDeltaPct,
      latencyRatio,
      canaryCpu,
      sampleSize,
    },
  };
}

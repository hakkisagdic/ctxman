/**
 * F14-1: FinOps & LLM Token/Billing Cost Anomaly Detector
 * Detects daily token/cost spikes per model or tenant and recommends prompt-cache or model downgrade mitigations.
 */

/**
 * Analyze daily LLM/cloud usage records for spend spikes and budget anomalies.
 *
 * @param {object} options
 * @param {Array<{date: string, model?: string, tenant?: string, costUsd: number, inputTokens?: number, cachedTokens?: number}>} [options.dailyRecords]
 * @param {number} [options.baselineCostUsd]
 * @param {number} [options.dailyBudgetUsd=50]
 * @param {number} [options.spikeRatioThreshold=2.0]
 * @returns {object}
 */
export function detectFinopsCostAnomalies(options = {}) {
  const dailyRecords = Array.isArray(options.dailyRecords) ? options.dailyRecords : [];
  const dailyBudgetUsd = Number(options.dailyBudgetUsd ?? 50);
  const spikeRatioThreshold = Number(options.spikeRatioThreshold ?? 2.0);

  const costs = dailyRecords.map((r) => Number(r.costUsd || 0));
  const computedBaseline =
    options.baselineCostUsd !== undefined
      ? Number(options.baselineCostUsd)
      : costs.length > 1
        ? costs.slice(0, -1).reduce((a, b) => a + b, 0) / (costs.length - 1)
        : costs[0] || 10;

  const baselineCostUsd = Math.max(0.01, Number(computedBaseline.toFixed(2)));
  const anomalies = [];
  const mitigations = new Set();

  for (const rec of dailyRecords) {
    const cost = Number(rec.costUsd || 0);
    const ratio = Number((cost / baselineCostUsd).toFixed(2));
    const inputTokens = Number(rec.inputTokens || 0);
    const cachedTokens = Number(rec.cachedTokens || 0);
    const cacheHitRatio = inputTokens > 0 ? cachedTokens / inputTokens : 0;

    if (cost > dailyBudgetUsd || ratio >= spikeRatioThreshold) {
      const severity = cost > dailyBudgetUsd * 1.5 || ratio >= 3.0 ? 'critical' : 'high';
      anomalies.push({
        date: rec.date,
        model: rec.model || 'unknown',
        tenant: rec.tenant || 'default',
        costUsd: cost,
        spikeRatio: ratio,
        exceededBudget: cost > dailyBudgetUsd,
        severity,
      });

      if (cacheHitRatio < 0.5) {
        mitigations.add(
          `Enable prompt prefix caching (packContext cacheControl) for ${rec.model || 'model'} to cut input cost by up to 75%.`
        );
      }
      if (/opus|gpt-4\b|o1|pro/i.test(rec.model || '')) {
        mitigations.add(
          `Route routine sub-tasks from '${rec.model}' to a fast tier model via recommendModelRoute().`
        );
      }
      if (cost > dailyBudgetUsd) {
        mitigations.add(
          `Enforce hard tenant quota cap in BillingStore ($${dailyBudgetUsd}/day exceeded on ${rec.date}).`
        );
      }
    }
  }

  const totalCostUsd = Number(costs.reduce((a, b) => a + b, 0).toFixed(2));

  return {
    anomalyDetected: anomalies.length > 0,
    anomalies,
    mitigations: [...mitigations],
    summary: {
      analyzedDays: dailyRecords.length,
      anomalyCount: anomalies.length,
      baselineCostUsd,
      dailyBudgetUsd,
      totalCostUsd,
    },
  };
}

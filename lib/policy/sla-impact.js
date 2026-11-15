/**
 * F14-5: Enterprise Customer SLA & Breaking-Change Impact Reporter
 * Intersects modified/degraded API endpoints with enterprise customer SLA contracts to calculate penalty risk.
 */

/**
 * Build an enterprise customer SLA impact and proactive notification report.
 *
 * @param {object} options
 * @param {string[]} [options.affectedEndpoints]
 * @param {number} [options.estimatedDowntimeMinutes=0]
 * @param {Array<{customer: string, tier?: string, endpoints: string[], maxMonthlyDowntimeMinutes?: number, penaltyUsd?: number}>} [options.contracts]
 * @returns {object}
 */
export function buildSlaImpactReport(options = {}) {
  const affectedSet = new Set(
    Array.isArray(options.affectedEndpoints) ? options.affectedEndpoints : []
  );
  const estimatedDowntimeMinutes = Number(options.estimatedDowntimeMinutes ?? 0);
  const contracts = Array.isArray(options.contracts) ? options.contracts : [];

  const impactedCustomers = [];
  let totalPenaltyRiskUsd = 0;

  for (const c of contracts) {
    const endpoints = Array.isArray(c.endpoints) ? c.endpoints : [];
    const matchedEndpoints = endpoints.filter((ep) => affectedSet.has(ep));
    if (matchedEndpoints.length === 0) continue;

    const maxDowntime = Number(c.maxMonthlyDowntimeMinutes ?? 43.2); // 99.9% SLA default
    const slaBreached = estimatedDowntimeMinutes > maxDowntime;
    const penaltyUsd = slaBreached ? Number(c.penaltyUsd ?? 1000) : 0;
    totalPenaltyRiskUsd += penaltyUsd;

    impactedCustomers.push({
      customer: c.customer,
      tier: c.tier || 'enterprise',
      matchedEndpoints,
      maxMonthlyDowntimeMinutes: maxDowntime,
      slaBreached,
      penaltyUsd,
    });
  }

  return {
    slaBreached: impactedCustomers.some((c) => c.slaBreached),
    impactedCustomers,
    totalPenaltyRiskUsd,
    summary: {
      totalContracts: contracts.length,
      impactedCustomerCount: impactedCustomers.length,
      breachedCustomerCount: impactedCustomers.filter((c) => c.slaBreached).length,
      totalPenaltyRiskUsd,
    },
  };
}

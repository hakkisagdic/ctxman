/**
 * Ctxman Commercial Plans, Quotas & Add-On Packs
 * Supports TRY (₺) and USD ($) pricing across monthly and annual billing cycles.
 */

export const PLANS = Object.freeze({
  community: Object.freeze({
    id: 'community',
    name: 'Community (Free / Open Source)',
    trialDays: 0,
    pricing: Object.freeze({
      TRY: Object.freeze({ monthly: 0, yearly: 0 }),
      USD: Object.freeze({ monthly: 0, yearly: 0 }),
    }),
    quotas: Object.freeze({
      maxRepos: 1,
      dailyRequests: 100,
      monthlyRequests: 1000,
      monthlyTokens: 500_000,
      includedSeats: 1,
      complianceShield: false,
      sarifGate: false,
    }),
  }),
  pro: Object.freeze({
    id: 'pro',
    name: 'Pro (Individual & Consultant)',
    trialDays: 14,
    pricing: Object.freeze({
      TRY: Object.freeze({ monthly: 690_00, yearly: 6_600_00 }), // in kuruş (minor units)
      USD: Object.freeze({ monthly: 19_00, yearly: 180_00 }), // in cents (minor units)
    }),
    quotas: Object.freeze({
      maxRepos: 3,
      dailyRequests: 2_000,
      monthlyRequests: 10_000,
      monthlyTokens: 25_000_000,
      includedSeats: 1,
      complianceShield: false,
      sarifGate: false,
    }),
  }),
  team: Object.freeze({
    id: 'team',
    name: 'Team & Fintech',
    trialDays: 14,
    pricing: Object.freeze({
      TRY: Object.freeze({ monthly: 2_990_00, yearly: 28_680_00, extraSeatMonthly: 490_00 }),
      USD: Object.freeze({ monthly: 79_00, yearly: 750_00, extraSeatMonthly: 14_00 }),
    }),
    quotas: Object.freeze({
      maxRepos: Infinity,
      dailyRequests: 20_000,
      monthlyRequests: 100_000,
      monthlyTokens: 250_000_000,
      includedSeats: 5,
      complianceShield: true,
      sarifGate: true,
    }),
  }),
  enterprise: Object.freeze({
    id: 'enterprise',
    name: 'Enterprise On-Prem & Air-Gapped',
    trialDays: 21,
    pricing: Object.freeze({
      TRY: Object.freeze({ monthly: 19_900_00, yearly: 190_800_00 }),
      USD: Object.freeze({ monthly: 590_00, yearly: 5_600_00 }),
    }),
    quotas: Object.freeze({
      maxRepos: Infinity,
      dailyRequests: Infinity,
      monthlyRequests: Infinity,
      monthlyTokens: Infinity,
      includedSeats: 50,
      complianceShield: true,
      sarifGate: true,
    }),
  }),
});

export const TOPUP_PACKS = Object.freeze({
  'credits-1k': Object.freeze({
    id: 'credits-1k',
    name: '+1,000 API/PR Credits Pack',
    extraRequests: 1_000,
    extraTokens: 10_000_000,
    pricing: Object.freeze({ TRY: 450_00, USD: 12_00 }),
  }),
  'tokens-100m': Object.freeze({
    id: 'tokens-100m',
    name: '+100M Context Tokens Pack',
    extraRequests: 5_000,
    extraTokens: 100_000_000,
    pricing: Object.freeze({ TRY: 350_00, USD: 10_00 }),
  }),
});

/**
 * Retrieve a plan definition by ID (`community`, `pro`, `team`, `enterprise`).
 * @param {string} planId
 */
export function getPlan(planId) {
  const normalized = String(planId || 'community')
    .trim()
    .toLowerCase();
  const plan = PLANS[normalized];
  if (!plan) {
    throw new Error(`Unknown billing plan: ${planId} (expected: ${Object.keys(PLANS).join(', ')})`);
  }
  return plan;
}

/**
 * Return serializable list of all plans (replacing `Infinity` with `null` for JSON output).
 */
export function listPlans() {
  return Object.values(PLANS).map((plan) => ({
    id: plan.id,
    name: plan.name,
    trialDays: plan.trialDays,
    pricing: {
      TRY: {
        monthly: plan.pricing.TRY.monthly / 100,
        yearly: plan.pricing.TRY.yearly / 100,
        monthlyMinor: plan.pricing.TRY.monthly,
        yearlyMinor: plan.pricing.TRY.yearly,
      },
      USD: {
        monthly: plan.pricing.USD.monthly / 100,
        yearly: plan.pricing.USD.yearly / 100,
        monthlyMinor: plan.pricing.USD.monthly,
        yearlyMinor: plan.pricing.USD.yearly,
      },
    },
    quotas: {
      maxRepos: Number.isFinite(plan.quotas.maxRepos) ? plan.quotas.maxRepos : null,
      dailyRequests: Number.isFinite(plan.quotas.dailyRequests) ? plan.quotas.dailyRequests : null,
      monthlyRequests: Number.isFinite(plan.quotas.monthlyRequests)
        ? plan.quotas.monthlyRequests
        : null,
      monthlyTokens: Number.isFinite(plan.quotas.monthlyTokens) ? plan.quotas.monthlyTokens : null,
      includedSeats: plan.quotas.includedSeats,
      complianceShield: plan.quotas.complianceShield,
      sarifGate: plan.quotas.sarifGate,
    },
  }));
}

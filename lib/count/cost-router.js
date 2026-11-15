/**
 * Multi-LLM Token & Cost Arbitrage Router (`F3-2`).
 *
 * Evaluates a task description and token count across major LLM providers
 * (Anthropic, OpenAI, Google, DeepSeek) to recommend the most cost-effective model
 * and prompt-caching strategy.
 */

export const MODEL_CATALOG = [
  {
    id: 'deepseek-v3',
    vendor: 'DeepSeek',
    tier: 'fast',
    contextWindow: 128000,
    inputPer1M: 0.27,
    cachedInputPer1M: 0.07,
    outputPer1M: 1.1,
  },
  {
    id: 'gemini-2.5-flash',
    vendor: 'Google',
    tier: 'fast',
    contextWindow: 1000000,
    inputPer1M: 0.15,
    cachedInputPer1M: 0.0375,
    outputPer1M: 0.6,
  },
  {
    id: 'gpt-4o-mini',
    vendor: 'OpenAI',
    tier: 'fast',
    contextWindow: 128000,
    inputPer1M: 0.15,
    cachedInputPer1M: 0.075,
    outputPer1M: 0.6,
  },
  {
    id: 'claude-3-5-haiku',
    vendor: 'Anthropic',
    tier: 'balanced',
    contextWindow: 200000,
    inputPer1M: 0.8,
    cachedInputPer1M: 0.08,
    outputPer1M: 4.0,
  },
  {
    id: 'gpt-4o',
    vendor: 'OpenAI',
    tier: 'balanced',
    contextWindow: 128000,
    inputPer1M: 2.5,
    cachedInputPer1M: 1.25,
    outputPer1M: 10.0,
  },
  {
    id: 'claude-sonnet-4-5',
    vendor: 'Anthropic',
    tier: 'reasoning',
    contextWindow: 200000,
    inputPer1M: 3.0,
    cachedInputPer1M: 0.3,
    outputPer1M: 15.0,
  },
  {
    id: 'gemini-2.5-pro',
    vendor: 'Google',
    tier: 'reasoning',
    contextWindow: 1000000,
    inputPer1M: 1.25,
    cachedInputPer1M: 0.3125,
    outputPer1M: 10.0,
  },
];

const HIGH_COMPLEXITY_RE =
  /\b(architecture|security|taint|refactor|migration|concurrency|deadlock|race condition|cryptography|distributed|blast radius)\b/i;
const LOW_COMPLEXITY_RE = /\b(typo|format|rename|comment|readme|lint|doc|changelog|spelling)\b/i;

export function classifyTaskComplexity(task = '', inputTokens = 10000) {
  const text = String(task || '');
  if (HIGH_COMPLEXITY_RE.test(text) || inputTokens > 80000) {
    return 'reasoning';
  }
  if (LOW_COMPLEXITY_RE.test(text) && inputTokens <= 25000) {
    return 'fast';
  }
  return 'balanced';
}

/**
 * Computes multi-turn LLM cost estimates and recommends the optimal model & budget.
 *
 * @param {object} [params={}]
 * @param {string} [params.task=''] - Task description
 * @param {number} [params.inputTokens=12000] - Context pack token size
 * @param {number} [params.outputTokens=1500] - Expected completion tokens per turn
 * @param {number} [params.turns=5] - Number of agent session turns
 * @param {number} [params.cacheableRatio=0.75] - Fraction of input tokens in static cache prefix
 */
export function recommendModelRoute(params = {}) {
  const inputTokens = Math.max(100, Number(params.inputTokens) || 12000);
  const outputTokens = Math.max(50, Number(params.outputTokens) || 1500);
  const turns = Math.max(1, Number(params.turns) || 5);
  const cacheableRatio = Math.min(0.95, Math.max(0, Number(params.cacheableRatio ?? 0.75)));
  const requiredTier = classifyTaskComplexity(params.task, inputTokens);

  const tierOrder = { fast: 1, balanced: 2, reasoning: 3 };
  const minTierRank = tierOrder[requiredTier] || 2;

  const candidates = [];
  for (const model of MODEL_CATALOG) {
    const fitsWindow = inputTokens + outputTokens <= model.contextWindow;
    if (!fitsWindow) continue;

    const uncachedInputCostPerTurn = (inputTokens / 1_000_000) * model.inputPer1M;
    const outputCostPerTurn = (outputTokens / 1_000_000) * model.outputPer1M;
    const uncachedSessionUsd = Number(
      ((uncachedInputCostPerTurn + outputCostPerTurn) * turns).toFixed(6)
    );

    const cachedTokens = inputTokens * cacheableRatio;
    const dynamicTokens = inputTokens - cachedTokens;
    const cachedFollowupInputCost =
      (cachedTokens / 1_000_000) * model.cachedInputPer1M +
      (dynamicTokens / 1_000_000) * model.inputPer1M;

    const cachedSessionUsd = Number(
      (
        uncachedInputCostPerTurn +
        outputCostPerTurn +
        Math.max(0, turns - 1) * (cachedFollowupInputCost + outputCostPerTurn)
      ).toFixed(6)
    );

    const savingsPct =
      uncachedSessionUsd > 0
        ? Math.round(((uncachedSessionUsd - cachedSessionUsd) / uncachedSessionUsd) * 1000) / 10
        : 0;

    candidates.push({
      id: model.id,
      vendor: model.vendor,
      tier: model.tier,
      contextWindow: model.contextWindow,
      meetsComplexity: (tierOrder[model.tier] || 1) >= minTierRank,
      uncachedSessionUsd,
      cachedSessionUsd,
      savingsPct,
    });
  }

  const qualified = candidates
    .filter((c) => c.meetsComplexity)
    .sort((a, b) => a.cachedSessionUsd - b.cachedSessionUsd);

  const recommended =
    qualified[0] || candidates.sort((a, b) => a.cachedSessionUsd - b.cachedSessionUsd)[0] || null;

  return {
    taskComplexity: requiredTier,
    inputTokens,
    outputTokens,
    turns,
    cacheableRatio,
    recommended,
    recommendedBudget:
      requiredTier === 'reasoning' ? 32000 : requiredTier === 'balanced' ? 20000 : 12000,
    candidates: candidates.sort((a, b) => a.cachedSessionUsd - b.cachedSessionUsd),
  };
}

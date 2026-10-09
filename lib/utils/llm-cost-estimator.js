/**
 * LLM Cost Estimator
 * Estimates API costs for different LLM providers
 * FEAT-010 feature
 */

import { getLogger } from './logger.js';
import { LLMDetector } from './llm-detector.js';

const logger = getLogger('LLMCostEstimator');

/** Provider key for a profile's vendor, e.g. `OpenAI` → `openai`, `xAI` → `xai` */
function providerKey(vendor) {
  return String(vendor || 'other')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Per-1M-token prices (USD) of the models in .ctxman/llm-profiles.json, grouped by
 * provider. The profiles are the single source: they carry the context window, the
 * output limit and the pricing, with the date and the provider pages they were checked
 * against. Deprecated and retired models are left out unless asked for.
 * @param {object} [options]
 * @param {boolean} [options.includeInactive=false] - Include deprecated/retired models
 * @returns {Object<string, Object<string, object>>} provider → model id → pricing
 */
export function buildPricingTable({ includeInactive = false } = {}) {
  const table = {};
  for (const [id, profile] of Object.entries(LLMDetector.getAllProfiles())) {
    if (!profile.pricing) continue;
    if (!includeInactive && ['deprecated', 'retired'].includes(profile.status)) continue;
    const provider = providerKey(profile.vendor);
    table[provider] ??= {};
    table[provider][id] = {
      name: profile.name,
      input: profile.pricing.input,
      output: profile.pricing.output,
      tiers: profile.pricing.tiers || [],
      context: profile.contextWindow,
      maxOutput: profile.outputWindow || null,
      tier: profile.tier || null,
      featured: Boolean(profile.featured),
    };
  }
  return table;
}

/** Pricing of the current models, read from the LLM profiles */
export const LLM_PRICING = buildPricingTable();

/**
 * Cost Estimator class
 * Calculates and compares LLM API costs
 */
export class LLMCostEstimator {
  /**
   * Create a cost estimator
   * @param {number} tokens - Total tokens in repository
   */
  constructor(tokens) {
    this.tokens = tokens;
    logger.debug(`Initialized cost estimator with ${tokens.toLocaleString()} tokens`);
  }

  /**
   * Calculate cost for a specific model
   * @param {string} modelId - Model identifier (e.g., 'gpt-4o')
   * @param {string} provider - Provider name (e.g., 'openai')
   * @returns {object|null} Cost breakdown or null if model not found
   */
  calculateCost(modelId, provider) {
    const pricing = LLM_PRICING[provider]?.[modelId];
    if (!pricing) {
      logger.debug(`Model not found: ${provider}/${modelId}`);
      return null;
    }

    // Some models charge a higher rate for every token once the prompt is long
    const tier = pricing.tiers.filter((t) => this.tokens > t.above).at(-1);
    const rates = tier || pricing;

    // Input cost: straightforward
    const inputCost = (this.tokens / 1_000_000) * rates.input;

    // Output cost: estimate output tokens as 2/3 of input (typical conversation ratio),
    // but a response can't be longer than the model's output limit
    const estimatedOutputTokens = Math.min(
      Math.round(this.tokens * (2 / 3)),
      pricing.maxOutput || Infinity
    );
    const outputCost = (estimatedOutputTokens / 1_000_000) * rates.output;

    // Full conversation cost
    const fullCost = inputCost + outputCost;

    // Check if fits in context
    const fitsInContext = this.tokens <= pricing.context;

    return {
      modelId,
      name: pricing.name,
      provider,
      inputCost,
      outputCost,
      fullCost,
      estimatedOutputTokens,
      fitsInContext,
      contextLimit: pricing.context,
      longContextRate: rates !== pricing,
      tier: pricing.tier,
    };
  }

  /**
   * Compare costs across all models
   * @returns {object[]} Array of cost comparisons sorted by full cost
   */
  compareAll() {
    const comparisons = [];

    for (const [provider, models] of Object.entries(LLM_PRICING)) {
      for (const modelId of Object.keys(models)) {
        const cost = this.calculateCost(modelId, provider);
        if (cost) {
          comparisons.push(cost);
        }
      }
    }

    // Sort by full cost (ascending)
    comparisons.sort((a, b) => a.fullCost - b.fullCost);

    logger.debug(`Compared costs across ${comparisons.length} models`);
    return comparisons;
  }

  /**
   * Get cheapest option that fits in context
   * @param {object[]} comparisons - Cost comparisons array
   * @returns {object|null} Cheapest option or null
   */
  getCheapest(comparisons) {
    const validOptions = comparisons.filter((c) => c.fitsInContext);
    return validOptions.length > 0 ? validOptions[0] : null;
  }

  /**
   * Get best value recommendation: the cheapest fitting model of the providers'
   * balanced tier (Sonnet-class models), falling back to the cheapest fitting model
   * @param {object[]} comparisons - Cost comparisons array
   * @returns {object|null} Best value option or null
   */
  getBestValue(comparisons) {
    const validOptions = comparisons.filter((c) => c.fitsInContext);

    if (validOptions.length === 0) {
      return null;
    }

    return validOptions.find((c) => c.tier === 'balanced') || validOptions[0];
  }

  /**
   * Get recommendation message
   * @param {object[]} comparisons - Cost comparisons array
   * @returns {object} Recommendation object
   */
  getRecommendation(comparisons) {
    const cheapest = this.getCheapest(comparisons);
    const bestValue = this.getBestValue(comparisons);

    if (!cheapest) {
      return {
        type: 'warning',
        message: 'Context exceeds all model limits. Consider chunking or filtering files.',
        cheapest: null,
        bestValue: null,
      };
    }

    return {
      type: 'recommendation',
      cheapest,
      bestValue,
      message:
        bestValue.modelId === cheapest.modelId
          ? `${cheapest.name} offers the best value`
          : `${bestValue.name} offers the best balance of cost and quality`,
    };
  }

  /**
   * Format cost estimates for display
   * @param {object[]} comparisons - Cost comparisons array
   * @param {object} recommendation - Recommendation object
   * @returns {string} Formatted output
   */
  formatEstimates(comparisons, recommendation) {
    const lines = [];

    lines.push('');
    lines.push('💰 LLM Cost Estimation:');
    lines.push('════════════════════════════════════════════════════');
    lines.push(`   Repository: ${this.tokens.toLocaleString()} tokens`);
    lines.push('');
    lines.push('   Cost by Provider:');
    lines.push('   ┌──────────────────────────┬────────────┬────────────┐');
    lines.push('   │ Model                    │ Input Cost │ Full Cost  │');
    lines.push('   ├──────────────────────────┼────────────┼────────────┤');

    // One or two featured models per provider keep the table short
    const featured = comparisons
      .filter((c) => LLM_PRICING[c.provider]?.[c.modelId]?.featured)
      .sort((a, b) => a.provider.localeCompare(b.provider) || b.fullCost - a.fullCost);

    for (const cost of featured) {
      const inputStr = this.formatCost(cost.inputCost).padStart(10);
      const fullStr = cost.fitsInContext
        ? this.formatCost(cost.fullCost).padStart(10)
        : "won't fit".padStart(10);
      lines.push(`   │ ${cost.name.padEnd(24)} │${inputStr} │${fullStr} │`);
    }

    lines.push('   └──────────────────────────┴────────────┴────────────┘');
    const checked = LLMDetector.getDataDate();
    lines.push(
      `   Full cost assumes a response 2/3 the size of the input.${checked ? ` Prices checked ${checked}.` : ''}`
    );
    lines.push('');

    // Show recommendation
    if (recommendation.type === 'warning') {
      lines.push(`   ⚠️  ${recommendation.message}`);
    } else if (recommendation.cheapest) {
      lines.push(
        `   💡 Cheapest: ${recommendation.cheapest.name} (${this.formatCost(recommendation.cheapest.inputCost)})`
      );
    }

    if (
      recommendation.bestValue &&
      recommendation.bestValue.modelId !== recommendation.cheapest?.modelId
    ) {
      lines.push(
        `   ⚡ Best Value: ${recommendation.bestValue.name} (${this.formatCost(recommendation.bestValue.inputCost)})`
      );
    }

    lines.push('');

    return lines.join('\n');
  }

  /**
   * Format cost with proper precision
   * @param {number} cost - Cost in USD
   * @returns {string} Formatted cost string
   */
  formatCost(cost) {
    if (cost < 0.01) {
      return `$${cost.toFixed(4)}`;
    } else if (cost < 1) {
      return `$${cost.toFixed(3)}`;
    } else {
      return `$${cost.toFixed(2)}`;
    }
  }

  /**
   * Run full cost estimation and return formatted output
   * @returns {string} Formatted cost estimation
   */
  estimate() {
    const comparisons = this.compareAll();
    const recommendation = this.getRecommendation(comparisons);
    return this.formatEstimates(comparisons, recommendation);
  }
}

export default LLMCostEstimator;

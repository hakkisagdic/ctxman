/**
 * LLM Cost Estimator
 * Estimates API costs for different LLM providers
 * FEAT-010 feature
 */

import { getLogger } from './logger.js';

const logger = getLogger('LLMCostEstimator');

/**
 * LLM Pricing Data (per 1M tokens in USD)
 * Last updated: 2025-01
 * Sources: OpenAI, Anthropic, Google, DeepSeek pricing pages
 */
export const LLM_PRICING = {
  openai: {
    'gpt-4o': {
      name: 'GPT-4o',
      input: 2.50,
      output: 10.00,
      context: 128000,
    },
    'gpt-4o-mini': {
      name: 'GPT-4o Mini',
      input: 0.15,
      output: 0.60,
      context: 128000,
    },
    'gpt-4-turbo': {
      name: 'GPT-4 Turbo',
      input: 10.00,
      output: 30.00,
      context: 128000,
    },
  },
  anthropic: {
    'claude-sonnet-4.5': {
      name: 'Claude Sonnet 4.5',
      input: 3.00,
      output: 15.00,
      context: 200000,
    },
    'claude-opus-4': {
      name: 'Claude Opus 4',
      input: 15.00,
      output: 75.00,
      context: 200000,
    },
  },
  google: {
    'gemini-1.5-pro': {
      name: 'Gemini 1.5 Pro',
      input: 1.25,
      output: 5.00,
      context: 1000000,
    },
    'gemini-2.0-flash': {
      name: 'Gemini 2.0 Flash',
      input: 0.075,
      output: 0.30,
      context: 1000000,
    },
  },
  deepseek: {
    'deepseek-coder': {
      name: 'DeepSeek Coder',
      input: 0.14,
      output: 0.28,
      context: 64000,
    },
  },
};

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

    // Input cost: straightforward
    const inputCost = (this.tokens / 1_000_000) * pricing.input;

    // Output cost: estimate output tokens as 2/3 of input (typical conversation ratio)
    const estimatedOutputTokens = Math.round(this.tokens * (2 / 3));
    const outputCost = (estimatedOutputTokens / 1_000_000) * pricing.output;

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
    const validOptions = comparisons.filter(c => c.fitsInContext);
    return validOptions.length > 0 ? validOptions[0] : null;
  }

  /**
   * Get best value recommendation
   * Balances cost and quality - prefers GPT-4o-mini for good quality at low cost
   * @param {object[]} comparisons - Cost comparisons array
   * @returns {object|null} Best value option or null
   */
  getBestValue(comparisons) {
    const validOptions = comparisons.filter(c => c.fitsInContext);
    
    if (validOptions.length === 0) {
      return null;
    }

    // Prefer GPT-4o-mini for best value (good quality, low cost)
    const gpt4oMini = validOptions.find(c => c.modelId === 'gpt-4o-mini');
    if (gpt4oMini) {
      return gpt4oMini;
    }

    // Fall back to cheapest
    return validOptions[0];
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
      message: bestValue.modelId === cheapest.modelId
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
    lines.push('   ┌─────────────────────┬────────────┬────────────┐');
    lines.push('   │ Model               │ Input Cost │ Full Cost  │');
    lines.push('   ├─────────────────────┼────────────┼────────────┤');

    // Select key models to display (avoid overwhelming output)
    const displayModels = [
      { id: 'gpt-4o', provider: 'openai' },
      { id: 'gpt-4o-mini', provider: 'openai' },
      { id: 'claude-sonnet-4.5', provider: 'anthropic' },
      { id: 'claude-opus-4', provider: 'anthropic' },
      { id: 'gemini-1.5-pro', provider: 'google' },
      { id: 'gemini-2.0-flash', provider: 'google' },
      { id: 'deepseek-coder', provider: 'deepseek' },
    ];

    for (const { id, provider } of displayModels) {
      const cost = comparisons.find(c => c.modelId === id && c.provider === provider);
      if (cost) {
        const inputStr = this.formatCost(cost.inputCost).padStart(10);
        const fullStr = this.formatCost(cost.fullCost).padStart(10);
        lines.push(`   │ ${cost.name.padEnd(19)} │${inputStr} │${fullStr} │`);
      }
    }

    lines.push('   └─────────────────────┴────────────┴────────────┘');
    lines.push('');

    // Show recommendation
    if (recommendation.type === 'warning') {
      lines.push(`   ⚠️  ${recommendation.message}`);
    } else if (recommendation.cheapest) {
      lines.push(`   💡 Cheapest: ${recommendation.cheapest.name} (${this.formatCost(recommendation.cheapest.inputCost)})`);
    }

    if (recommendation.bestValue && recommendation.bestValue.modelId !== recommendation.cheapest?.modelId) {
      lines.push(`   ⚡ Best Value: ${recommendation.bestValue.name} (${this.formatCost(recommendation.bestValue.inputCost)})`);
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

# LLM Cost Estimator

**ID**: FEAT-010
**Status**: Planned
**Priority**: Medium
**Effort**: Low (4-6 hours)
**Dependencies**: None

---

## Problem Statement

### Why This Matters

LLM API calls cost money, but users have no visibility into costs before sending context:

**Cost Blind Spots**:

- No estimate of API costs per analysis
- Unexpected bills from large contexts
- No comparison between providers
- Budget planning impossible

**Current Experience**:

```
$ ctxman --cli
Total tokens: 150,000

# User sends to Claude
# Later receives bill: $3.75 for one request
# No warning, no budget tracking
```

**User Impact**:

- Unexpected API costs
- Hesitation to use LLM assistance
- No cost optimization awareness
- Budget overruns for teams

**Business Impact**:

- Reduced tool usage due to cost concerns
- Lack of enterprise budget planning
- Missed optimization opportunities

---

## Proposed Solution

### What We Will Build

An **LLM cost estimator** that:

1. Estimates API costs for each provider
2. Compares costs across LLM providers
3. Tracks cumulative costs over time
4. Provides budget alerts and recommendations

### User Experience

```
+-------------------------------------------------------------+
|                    LLM Cost Estimator                        |
+-------------------------------------------------------------+
|                                                             |
|  $ ctxman --estimate-cost                                   |
|                                                             |
|  Project: 150,000 tokens                                    |
|                                                             |
|  +---------------------------------------------------+      |
|  | Provider        | Model           | Cost (Input) |      |
|  +---------------------------------------------------+      |
|  | OpenAI          | GPT-4 Turbo     | $1.50        |      |
|  | OpenAI          | GPT-4o          | $0.75        |      |
|  | OpenAI          | GPT-4o Mini     | $0.08        |      |
|  | Anthropic       | Claude Opus 4   | $3.75        |      |
|  | Anthropic       | Claude Sonnet   | $0.75        |      |
|  | Google          | Gemini 1.5 Pro  | $0.38        |      |
|  | Google          | Gemini 2.0      | $0.00        |      |
|  | DeepSeek        | DeepSeek Chat   | $0.02        |      |
|  +---------------------------------------------------+      |
|                                                             |
|  Monthly projection (10 similar queries):                   |
|  - GPT-4o Mini: $0.80                                       |
|  - Claude Sonnet: $7.50                                     |
|  - GPT-4 Turbo: $15.00                                      |
|                                                             |
|  Recommendation: Consider GPT-4o Mini for 90% cost savings  |
|  with minimal quality difference for this context size.     |
|                                                             |
+-------------------------------------------------------------+
```

---

## Implementation Steps

### Step 1: Define Pricing Data

```javascript
// lib/costs/LLMPricing.js

export const LLM_PRICING = {
  openai: {
    'gpt-4-turbo': {
      input: 10.0 / 1_000_000, // $10 per 1M tokens
      output: 30.0 / 1_000_000,
      context: 128000,
    },
    'gpt-4': {
      input: 30.0 / 1_000_000,
      output: 60.0 / 1_000_000,
      context: 8192,
    },
    'gpt-4o': {
      input: 5.0 / 1_000_000,
      output: 15.0 / 1_000_000,
      context: 128000,
    },
    'gpt-4o-mini': {
      input: 0.15 / 1_000_000,
      output: 0.6 / 1_000_000,
      context: 128000,
    },
    'gpt-3.5-turbo': {
      input: 0.5 / 1_000_000,
      output: 1.5 / 1_000_000,
      context: 16385,
    },
  },
  anthropic: {
    'claude-opus-4': {
      input: 15.0 / 1_000_000,
      output: 75.0 / 1_000_000,
      context: 200000,
    },
    'claude-sonnet-4.5': {
      input: 3.0 / 1_000_000,
      output: 15.0 / 1_000_000,
      context: 200000,
    },
    'claude-haiku-3.5': {
      input: 0.25 / 1_000_000,
      output: 1.25 / 1_000_000,
      context: 200000,
    },
  },
  google: {
    'gemini-1.5-pro': {
      input: 2.5 / 1_000_000,
      output: 10.0 / 1_000_000,
      context: 1000000,
    },
    'gemini-2.0-flash': {
      input: 0.0, // Free tier available
      output: 0.0,
      context: 1000000,
    },
  },
  deepseek: {
    'deepseek-chat': {
      input: 0.14 / 1_000_000,
      output: 0.28 / 1_000_000,
      context: 64000,
    },
    'deepseek-coder': {
      input: 0.14 / 1_000_000,
      output: 0.28 / 1_000_000,
      context: 64000,
    },
  },
};

// Update pricing from API (optional)
export async function fetchCurrentPricing() {
  try {
    const response = await fetch('https://api.openai.com/v1/models');
    // Parse and update pricing
  } catch {
    // Use hardcoded values as fallback
  }
}
```

### Step 2: Create Cost Calculator

```javascript
// lib/costs/CostCalculator.js

import { LLM_PRICING } from './LLMPricing.js';

export class CostCalculator {
  constructor(tokens) {
    this.tokens = tokens;
  }

  calculateCost(model, provider) {
    const pricing = LLM_PRICING[provider]?.[model];
    if (!pricing) return null;

    const inputCost = this.tokens * pricing.input;
    const outputCost = this.tokens * pricing.output; // Assume 1:1 for estimate

    return {
      input: inputCost,
      output: outputCost,
      total: inputCost + outputCost,
      fits: this.tokens <= pricing.context,
    };
  }

  compareAll() {
    const comparisons = [];

    for (const [provider, models] of Object.entries(LLM_PRICING)) {
      for (const [model, pricing] of Object.entries(models)) {
        const cost = this.calculateCost(model, provider);
        if (cost) {
          comparisons.push({
            provider,
            model,
            inputCost: cost.input,
            outputCost: cost.output,
            totalCost: cost.total,
            fitsInContext: cost.fits,
            contextLimit: pricing.context,
          });
        }
      }
    }

    return comparisons.sort((a, b) => a.totalCost - b.totalCost);
  }

  getRecommendation(comparisons) {
    // Find best value (lowest cost that fits)
    const validOptions = comparisons.filter((c) => c.fitsInContext);

    if (validOptions.length === 0) {
      return {
        type: 'warning',
        message: 'Context exceeds all model limits. Consider splitting.',
      };
    }

    const cheapest = validOptions[0];
    const bestValue =
      validOptions.find((c) => c.provider === 'openai' && c.model.includes('gpt-4o-mini')) ||
      cheapest;

    return {
      type: 'recommendation',
      model: bestValue.model,
      provider: bestValue.provider,
      cost: bestValue.totalCost,
      savings: comparisons[0].totalCost - bestValue.totalCost,
      reason: 'Best value for money with good quality',
    };
  }

  projectMonthly(cost, queriesPerMonth = 10) {
    return {
      cost: cost * queriesPerMonth,
      queries: queriesPerMonth,
    };
  }
}
```

### Step 3: Create Cost Tracker

```javascript
// lib/costs/CostTracker.js

export class CostTracker {
  constructor(projectRoot) {
    this.trackingFile = path.join(projectRoot, '.ctxman', 'costs.json');
    this.history = this.load();
  }

  load() {
    try {
      return JSON.parse(fs.readFileSync(this.trackingFile, 'utf-8'));
    } catch {
      return { entries: [] };
    }
  }

  record(analysis) {
    const entry = {
      timestamp: new Date().toISOString(),
      tokens: analysis.tokens,
      model: analysis.model,
      provider: analysis.provider,
      cost: analysis.cost,
    };

    this.history.entries.push(entry);
    this.save();

    return entry;
  }

  getSummary(period = '30d') {
    const cutoff = this.getCutoffDate(period);
    const filtered = this.history.entries.filter((e) => new Date(e.timestamp) >= cutoff);

    const totalCost = filtered.reduce((sum, e) => sum + e.cost, 0);
    const totalTokens = filtered.reduce((sum, e) => sum + e.tokens, 0);
    const byProvider = this.groupBy(filtered, 'provider');
    const byModel = this.groupBy(filtered, 'model');

    return {
      period,
      entries: filtered.length,
      totalCost,
      totalTokens,
      averageCostPerQuery: totalCost / filtered.length || 0,
      byProvider,
      byModel,
    };
  }

  save() {
    fs.writeFileSync(this.trackingFile, JSON.stringify(this.history, null, 2));
  }

  groupBy(entries, key) {
    return entries.reduce((acc, e) => {
      const k = e[key];
      acc[k] = (acc[k] || 0) + e.cost;
      return acc;
    }, {});
  }
}
```

### Step 4: Add CLI Commands

```javascript
// bin/cli.js

program
  .option('--estimate-cost', 'Show cost estimates for all LLM providers')
  .option('--track-cost', 'Record cost after analysis')
  .option('--cost-summary', 'Show historical cost summary')
  .option('--budget <amount>', 'Set monthly budget for alerts')
  .action(async (options) => {
    if (options.estimateCost) {
      const result = await runAnalysis();
      const calculator = new CostCalculator(result.totalTokens);
      const comparisons = calculator.compareAll();
      const recommendation = calculator.getRecommendation(comparisons);

      displayCostEstimates(comparisons, recommendation);
    }

    if (options.costSummary) {
      const tracker = new CostTracker(process.cwd());
      const summary = tracker.getSummary('30d');
      displayCostSummary(summary);
    }
  });

function displayCostEstimates(comparisons, recommendation) {
  console.log('\n💰 LLM Cost Estimates\n');
  console.log('Provider         Model              Cost (Input)');
  console.log('-'.repeat(50));

  for (const c of comparisons) {
    const fits = c.fitsInContext ? '✓' : '✗';
    console.log(
      `${c.provider.padEnd(16)} ${c.model.padEnd(18)} $${c.inputCost.toFixed(4)} ${fits}`
    );
  }

  console.log('\n📊 Recommendation:\n');
  if (recommendation.type === 'recommendation') {
    console.log(`  Use ${recommendation.model} for best value`);
    console.log(`  Estimated cost: $${recommendation.cost.toFixed(4)}`);
    if (recommendation.savings > 0) {
      console.log(`  Savings vs most expensive: $${recommendation.savings.toFixed(4)}`);
    }
  } else {
    console.log(`  ⚠️ ${recommendation.message}`);
  }

  console.log('');
}

function displayCostSummary(summary) {
  console.log('\n💰 Cost Summary (Last 30 Days)\n');
  console.log(`  Total queries: ${summary.entries}`);
  console.log(`  Total cost: $${summary.totalCost.toFixed(2)}`);
  console.log(`  Total tokens: ${summary.totalTokens.toLocaleString()}`);
  console.log(`  Avg cost/query: $${summary.averageCostPerQuery.toFixed(4)}`);

  if (Object.keys(summary.byProvider).length > 0) {
    console.log('\n  By Provider:\n');
    for (const [provider, cost] of Object.entries(summary.byProvider)) {
      console.log(`    ${provider}: $${cost.toFixed(2)}`);
    }
  }

  console.log('');
}
```

---

## Acceptance Criteria

### Must Have

- [ ] `--estimate-cost` shows cost for all providers
- [ ] Cost comparison table displayed
- [ ] Model recommendation provided
- [ ] Context fit warning when exceeded

### Should Have

- [ ] `--cost-summary` shows historical costs
- [ ] `--budget <amount>` enables alerts
- [ ] Monthly cost projection
- [ ] Cost tracking persistence

### Nice to Have

- [ ] Real-time pricing from APIs
- [ ] Team cost aggregation
- [ ] Budget alerts via notifications
- [ ] Export cost reports

---

## Success Metrics

### Quantitative Metrics

| Metric                | Target             | Measurement    |
| --------------------- | ------------------ | -------------- |
| Cost estimator usage  | 40% of analyses    | Analytics      |
| Cost savings          | 20% reduction      | User tracking  |
| Budget alert triggers | < 5% exceed budget | Alert tracking |

### Qualitative Metrics

- [ ] Users report better cost awareness
- [ ] Fewer billing surprises
- [ ] More informed model selection

---

## Timeline

| Task                   | Effort  | Week   |
| ---------------------- | ------- | ------ |
| Pricing data structure | 1 hour  | Week 1 |
| Cost calculator        | 2 hours | Week 1 |
| Cost tracker           | 1 hour  | Week 1 |
| CLI integration        | 1 hour  | Week 1 |
| Testing                | 1 hour  | Week 1 |

**Total Estimated Effort**: 6 hours over 1 week

---

## References

- [OpenAI Pricing](https://openai.com/pricing)
- [Anthropic Pricing](https://www.anthropic.com/pricing)
- [Google AI Pricing](https://ai.google.dev/pricing)
- [DeepSeek Pricing](https://deepseek.com/pricing)

---

_Planned by: Ctxman Development Team_
_Target: Q1 2025_

# Context Window Budget Alerts

**ID**: FEAT-002
**Status**: 📋 Planned
**Priority**: High
**Effort**: Low (4-8 hours)
**Dependencies**: None

---

## Problem Statement

### Why This Matters

LLM context windows have hard limits. When context exceeds these limits, several issues occur:

**Token Overflow Issues**:
- Incomplete context sent to LLM
- Important files silently truncated
- Confusing LLM responses
- Debug time wasted on missing context

**Current Experience**:
```
$ ctxman --cli
Total tokens: 185,000
# User sends to GPT-4 (128K limit) → FAILURE
# No warning, no guidance, confusing errors
```

**User Impact**:
- LLM produces incorrect or incomplete responses
- Users don't know what context was omitted
- Trial and error to reduce context

**Business Impact**:
- User frustration and mistrust
- Perceived tool unreliability
- Support requests for LLM errors

---

## Proposed Solution

### What We Will Build

A **context budget system** that:

1. Alerts when tokens exceed configured limits
2. Suggests strategies for reduction
3. Provides per-model preset limits
4. Shows token breakdown by category

### User Experience

```
┌─────────────────────────────────────────────────────────────┐
│                    Context Budget Alert                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ⚠️  Context Budget Warning                                 │
│                                                             │
│  Your project has 185,000 tokens                            │
│  GPT-4-turbo limit: 128,000 tokens                          │
│  Exceeded by: 57,000 tokens (44%)                           │
│                                                             │
│  📊 Token breakdown:                                        │
│  ├── JavaScript files: 95,000 (51%)                         │
│  ├── TypeScript files: 52,000 (28%)                         │
│  ├── Markdown files: 23,000 (12%)                           │
│  └── Other: 15,000 (8%)                                     │
│                                                             │
│  💡 Suggestions:                                            │
│  1. Add *.test.js to .contextignore (-18,000 tokens)       │
│  2. Add docs/ to .contextignore (-23,000 tokens)           │
│  3. Use --method-level to reduce by ~40%                    │
│                                                             │
│  Run: ctxman --cli --budget gpt-4-turbo                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementation Steps

### Step 1: Define Model Presets

```javascript
// lib/core/ContextBudget.js

export const MODEL_LIMITS = {
  // OpenAI models
  'gpt-4-turbo': { context: 128000, recommended: 100000 },
  'gpt-4': { context: 8192, recommended: 6500 },
  'gpt-4-32k': { context: 32768, recommended: 26000 },
  'gpt-3.5-turbo': { context: 16385, recommended: 13000 },
  'gpt-3.5-turbo-16k': { context: 16385, recommended: 13000 },
  
  // Anthropic models
  'claude-3-opus': { context: 200000, recommended: 160000 },
  'claude-3-sonnet': { context: 200000, recommended: 160000 },
  'claude-3-haiku': { context: 200000, recommended: 160000 },
  'claude-2': { context: 100000, recommended: 80000 },
  
  // Google models
  'gemini-pro': { context: 32760, recommended: 26000 },
  'gemini-1.5-pro': { context: 1000000, recommended: 800000 },
  
  // Open source models
  'llama-2-70b': { context: 4096, recommended: 3200 },
  'llama-3-70b': { context: 8192, recommended: 6500 },
  'mistral-large': { context: 32768, recommended: 26000 },
};

export class ContextBudget {
  constructor(modelKey) {
    this.model = MODEL_LIMITS[modelKey] || { context: 100000, recommended: 80000 };
    this.modelKey = modelKey;
  }
  
  check(totalTokens) {
    const exceeded = totalTokens > this.model.context;
    const warning = totalTokens > this.model.recommended;
    
    return {
      total: totalTokens,
      limit: this.model.context,
      recommended: this.model.recommended,
      exceeded,
      warning,
      overBy: exceeded ? totalTokens - this.model.context : 0,
      percentUsed: (totalTokens / this.model.context) * 100,
    };
  }
}
```

### Step 2: Add Budget Check to Analysis

```javascript
// lib/core/Analyzer.js

async analyze(options) {
  // ... existing analysis code ...
  
  const result = {
    files,
    totalTokens,
    // ... other fields ...
  };
  
  // Add budget check if model specified
  if (options.budget) {
    const budget = new ContextBudget(options.budget);
    result.budgetCheck = budget.check(totalTokens);
    result.suggestions = this.generateSuggestions(result);
  }
  
  return result;
}

generateSuggestions(result) {
  const suggestions = [];
  
  // Sort files by token count
  const sortedFiles = [...result.files].sort((a, b) => b.tokens - a.tokens);
  
  // Suggest excluding large test files
  const testFiles = sortedFiles.filter(f => 
    f.path.includes('.test.') || f.path.includes('.spec.')
  );
  const testTokens = testFiles.reduce((sum, f) => sum + f.tokens, 0);
  if (testTokens > 0) {
    suggestions.push({
      action: 'exclude',
      pattern: '*.test.js',
      savings: testTokens,
      reason: 'Test files excluded by default in most contexts',
    });
  }
  
  // Suggest excluding documentation
  const docFiles = sortedFiles.filter(f => 
    f.path.endsWith('.md') || f.path.includes('docs/')
  );
  const docTokens = docFiles.reduce((sum, f) => sum + f.tokens, 0);
  if (docTokens > 0) {
    suggestions.push({
      action: 'exclude',
      pattern: 'docs/',
      savings: docTokens,
      reason: 'Documentation can be referenced separately',
    });
  }
  
  // Suggest method-level analysis
  suggestions.push({
    action: 'flag',
    flag: '--method-level',
    savings: Math.floor(result.totalTokens * 0.4),
    reason: 'Method-level analysis reduces context by ~40%',
  });
  
  return suggestions;
}
```

### Step 3: Add CLI Flag

```javascript
// bin/cli.js

program
  .option('-b, --budget <model>', 'Check against LLM context limit', validateModel)
  .option('--budget-warn-only', 'Show warning but continue', false)
  .action(async (options) => {
    // ... existing code ...
    
    if (options.budget) {
      const budget = new ContextBudget(options.budget);
      const check = budget.check(result.totalTokens);
      
      if (check.exceeded) {
        displayBudgetWarning(check, result.suggestions);
        
        if (!options.budgetWarnOnly) {
          process.exit(1);
        }
      }
    }
  });

function validateModel(model) {
  if (!MODEL_LIMITS[model]) {
    console.error(`Unknown model: ${model}`);
    console.error('Available models:', Object.keys(MODEL_LIMITS).join(', '));
    process.exit(1);
  }
  return model;
}
```

### Step 4: Create Warning Display

```javascript
// lib/formatters/BudgetFormatter.js

export function displayBudgetWarning(check, suggestions) {
  console.log('\n⚠️  Context Budget Warning\n');
  console.log(`Your project has ${check.total.toLocaleString()} tokens`);
  console.log(`${check.modelKey} limit: ${check.limit.toLocaleString()} tokens`);
  console.log(`Exceeded by: ${check.overBy.toLocaleString()} tokens (${check.percentUsed.toFixed(1)}%)\n`);
  
  if (suggestions && suggestions.length > 0) {
    console.log('💡 Suggestions:\n');
    suggestions.forEach((s, i) => {
      console.log(`  ${i + 1}. ${s.action === 'exclude' ? `Add ${s.pattern} to .contextignore` : `Use ${s.flag}`}`);
      console.log(`     Savings: ~${s.savings.toLocaleString()} tokens`);
      console.log(`     ${s.reason}\n`);
    });
  }
  
  console.log('Run with --budget-warn-only to continue anyway\n');
}
```

---

## Acceptance Criteria

### Must Have
- [ ] `--budget` flag accepts model name
- [ ] Validates model name against preset list
- [ ] Shows warning when tokens exceed limit
- [ ] Shows suggestions for reducing tokens
- [ ] Exits with error code 1 when exceeded (unless `--budget-warn-only`)

### Should Have
- [ ] Custom budget limit via `--budget-limit <number>`
- [ ] Configuration file for custom model limits
- [ ] Per-file token breakdown in warning

### Nice to Have
- [ ] Auto-suggest optimal exclusion patterns
- [ ] Integration with `.ctxmanrc` for default budget
- [ ] Visual progress bar showing budget usage

---

## Success Metrics

### Quantitative Metrics

| Metric | Before | Target | Measurement |
|--------|--------|--------|-------------|
| Users hitting context limits | Unknown | < 5% | Analytics |
| Support tickets for overflow | ~3/week | < 1/week | Support tracking |
| Budget flag adoption | N/A | 40% of CLI users | Usage metrics |

### Qualitative Metrics

- [ ] Users report fewer LLM context errors
- [ ] Positive feedback on helpful suggestions
- [ ] Reduced frustration with token management

---

## Timeline

| Task | Effort | Week |
|------|--------|------|
| Model preset definitions | 1 hour | Week 1 |
| Budget check logic | 2 hours | Week 1 |
| CLI integration | 1 hour | Week 1 |
| Suggestion engine | 2 hours | Week 1 |
| Testing & documentation | 2 hours | Week 1 |

**Total Estimated Effort**: 8 hours over 1 week

---

## Dependencies

| Dependency | Type | Purpose |
|------------|------|---------|
| None | - | Uses existing token counting |

---

## References

- [OpenAI Models Overview](https://platform.openai.com/docs/models)
- [Anthropic Models Documentation](https://docs.anthropic.com/claude/docs/models-overview)
- [Google Gemini Models](https://ai.google.dev/models/gemini)

---

*Planned by: Ctxman Development Team*
*Target: Q1 2025*

import { describe, test, expect } from 'vitest';
import { readFileSync } from 'fs';
import { LLMDetector, DEFAULT_TARGET_MODEL } from '../lib/utils/llm-detector.js';
import {
  LLMCostEstimator,
  LLM_PRICING,
  buildPricingTable,
} from '../lib/utils/llm-cost-estimator.js';

const data = JSON.parse(readFileSync(new URL('../.ctxman/llm-profiles.json', import.meta.url)));
const STATUSES = ['active', 'preview', 'legacy', 'deprecated', 'retired'];
const TIERS = ['frontier', 'balanced', 'fast'];

describe('LLM profile data', () => {
  test('records when and where it was checked', () => {
    expect(data.lastUpdated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const vendors = new Set(Object.values(data.profiles).map((p) => p.vendor));
    for (const vendor of vendors) {
      expect(data.sources[vendor], vendor).toBeDefined();
    }
  });

  test.each(Object.entries(data.profiles))('%s is complete and consistent', (id, profile) => {
    expect(id).toBe(id.toLowerCase());
    expect(profile.contextWindow).toBeGreaterThan(0);
    expect(profile.maxRecommendedInput).toBe(Math.floor(profile.contextWindow * 0.6));
    expect(STATUSES).toContain(profile.status);
    expect(TIERS).toContain(profile.tier);
    if (profile.pricing) {
      expect(profile.pricing.input).toBeGreaterThan(0);
      expect(profile.pricing.output).toBeGreaterThan(0);
      const thresholds = (profile.pricing.tiers || []).map((t) => t.above);
      expect(thresholds).toEqual([...thresholds].sort((a, b) => a - b));
    }
    if (profile.replacement) {
      const replacement = data.profiles[profile.replacement];
      expect(replacement, profile.replacement).toBeDefined();
      expect(['active', 'preview']).toContain(replacement.status);
    }
  });

  test('aliases point at existing profiles', () => {
    for (const [alias, target] of Object.entries(data.aliases)) {
      expect(data.profiles[target], `${alias} -> ${target}`).toBeDefined();
    }
  });

  test('the default target model is a current profile', () => {
    expect(data.profiles[DEFAULT_TARGET_MODEL].status).toBe('active');
  });
});

describe('Model id resolution', () => {
  test.each([
    ['claude-sonnet-5-5', 'claude-sonnet-5-5'],
    ['claude-sonnet-4.5', 'claude-sonnet-4-5'], // id used by earlier ctxman versions
    ['claude-opus-4', 'claude-opus-4-0'],
    ['claude-haiku-4-5-20251001', 'claude-haiku-4-5'], // dated snapshot
    ['GPT-6.1-Sol', 'gpt-6.1-sol'],
    ['gpt-5.5-2026-04-23', 'gpt-5.5'],
    ['sonnet', 'claude-sonnet-5-5'],
    ['mistral-medium-latest', 'mistral-medium-3-5'],
  ])('%s resolves to %s', (name, id) => {
    expect(LLMDetector.resolveModelId(name)).toBe(id);
    expect(LLMDetector.getProfile(name).id).toBe(id);
  });

  test('unknown models fall back to the default profile under their own name', () => {
    expect(LLMDetector.resolveModelId('not-a-model')).toBeNull();
    const profile = LLMDetector.getProfile('not-a-model');
    expect(profile.name).toBe('not-a-model');
    expect(profile.contextWindow).toBe(data.default.contextWindow);
  });

  test('retired models still resolve so old configurations keep working', () => {
    const profile = LLMDetector.getProfile('gemini-2.0-flash');
    expect(profile.status).toBe('retired');
    expect(profile.replacement).toBeDefined();
  });

  test('the model list leaves out retired models unless asked', () => {
    const ids = LLMDetector.getModelList().map((m) => m.id);
    expect(ids).not.toContain('gemini-1.5-pro');
    expect(ids).toContain('claude-opus-5-5');
    const all = LLMDetector.getModelList({ includeRetired: true }).map((m) => m.id);
    expect(all).toContain('gemini-1.5-pro');
  });
});

describe('Cost estimation from the profiles', () => {
  test('prices come from the profiles and skip deprecated and retired models', () => {
    expect(LLM_PRICING.anthropic['claude-opus-5-5']).toMatchObject({ input: 4, output: 20 });
    expect(LLM_PRICING.openai['gpt-4-turbo']).toBeUndefined();
    expect(buildPricingTable({ includeInactive: true }).openai['gpt-4-turbo']).toBeDefined();
  });

  test('long prompts use the higher rate tier', () => {
    const short = new LLMCostEstimator(100000).calculateCost('claude-haiku-5-5', 'anthropic');
    expect(short.inputCost).toBeCloseTo(0.01);
    expect(short.longContextRate).toBe(false);

    const long = new LLMCostEstimator(200000).calculateCost('claude-haiku-5-5', 'anthropic');
    expect(long.inputCost).toBeCloseTo(0.1);
    expect(long.longContextRate).toBe(true);
  });

  test('picks the highest tier a prompt crosses', () => {
    const cost = new LLMCostEstimator(300000).calculateCost('qwen3-coder-plus', 'qwen');
    expect(cost.inputCost).toBeCloseTo(0.3 * 6);
  });

  test('the estimated response never exceeds the output limit', () => {
    const cost = new LLMCostEstimator(900000).calculateCost('claude-sonnet-5-5', 'anthropic');
    expect(cost.estimatedOutputTokens).toBe(128000);
  });

  test('best value is the cheapest fitting balanced model', () => {
    const estimator = new LLMCostEstimator(50000);
    const comparisons = estimator.compareAll();
    const best = estimator.getBestValue(comparisons);
    expect(best.tier).toBe('balanced');
    const cheaperBalanced = comparisons.filter(
      (c) => c.tier === 'balanced' && c.fitsInContext && c.fullCost < best.fullCost
    );
    expect(cheaperBalanced).toEqual([]);
  });

  test('the table lists featured models and the date prices were checked', () => {
    const output = new LLMCostEstimator(50000).estimate();
    expect(output).toContain('Claude Sonnet 5.5');
    expect(output).toContain(`Prices checked ${data.lastUpdated}`);
    expect(output).not.toContain('GPT-4 Turbo');
  });

  test('models whose window is too small are marked as not fitting', () => {
    const output = new LLMCostEstimator(600000).estimate();
    expect(output).toContain("won't fit"); // Grok 4.7 has a 500K window
  });
});

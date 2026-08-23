import { describe, test, expect } from 'vitest';
import { LLMDetector } from '../lib/utils/llm-detector.js';

describe('LLM Detection (v2.3.7)', () => {
  describe('Profile Loading', () => {
    test('Should load LLM profiles from JSON', () => {
      const profiles = LLMDetector.getAllProfiles();
      expect(profiles).toBeDefined();
      expect(Object.keys(profiles).length).toBeGreaterThan(0);
    });

    test('Should get Claude Sonnet 4.5 profile', () => {
      const profile = LLMDetector.getProfile('claude-sonnet-4.5');
      expect(profile.name).toBe('Claude Sonnet 4.5');
      expect(profile.vendor).toBe('Anthropic');
      expect(profile.contextWindow).toBe(200000);
      expect(profile.preferredFormat).toBe('toon');
    });

    test('Should get GPT-4o profile', () => {
      const profile = LLMDetector.getProfile('gpt-4o');
      expect(profile.name).toBe('GPT-4o');
      expect(profile.vendor).toBe('OpenAI');
      expect(profile.contextWindow).toBe(128000);
    });

    test('Should return default profile for unknown model', () => {
      const profile = LLMDetector.getProfile('unknown-model');
      expect(profile).toBeDefined();
      expect(profile.contextWindow).toBeGreaterThan(0);
    });
  });

  describe('Model Listing', () => {
    test('Should list all available models', () => {
      const models = LLMDetector.listProfiles();
      expect(Array.isArray(models)).toBe(true);
      expect(models.length).toBeGreaterThan(0);
      expect(models).toContain('claude-sonnet-4.5');
      expect(models).toContain('gpt-4o');
      expect(models).toContain('gemini-2.0-flash');
    });

    test('Should get model list with details', () => {
      const modelList = LLMDetector.getModelList();
      expect(Array.isArray(modelList)).toBe(true);
      expect(modelList.length).toBeGreaterThan(0);

      const claude = modelList.find((m) => m.id === 'claude-sonnet-4.5');
      expect(claude).toBeDefined();
      expect(claude.vendor).toBe('Anthropic');
      expect(claude.contextWindow).toBeGreaterThan(0);
    });
  });

  describe('Environment Detection', () => {
    test('Should detect "unknown" when no env keys present', () => {
      // Clean environment
      const oldAnthropicKey = process.env.ANTHROPIC_API_KEY;
      const oldOpenAIKey = process.env.OPENAI_API_KEY;
      const oldGoogleKey = process.env.GOOGLE_API_KEY;
      const oldLLM = process.env.CTXMAN_LLM;

      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.OPENAI_API_KEY;
      delete process.env.GOOGLE_API_KEY;
      delete process.env.CTXMAN_LLM;

      const detected = LLMDetector.detect();
      expect(detected).toBe('unknown');

      // Restore
      if (oldAnthropicKey) process.env.ANTHROPIC_API_KEY = oldAnthropicKey;
      if (oldOpenAIKey) process.env.OPENAI_API_KEY = oldOpenAIKey;
      if (oldGoogleKey) process.env.GOOGLE_API_KEY = oldGoogleKey;
      if (oldLLM) process.env.CTXMAN_LLM = oldLLM;
    });
  });

  describe('Configuration Recommendations', () => {
    test('Should recommend configuration for small repo', () => {
      const profile = LLMDetector.getProfile('claude-sonnet-4.5');
      const stats = { totalTokens: 50000, totalFiles: 20 };
      const config = LLMDetector.recommendConfiguration(profile, stats);

      expect(config.chunkingEnabled).toBe(false);
      expect(config.fitsInContext).toBe(true);
      expect(config.outputFormat).toBe('toon');
    });

    test('Should recommend chunking for large repo', () => {
      const profile = LLMDetector.getProfile('gpt-4o');
      const stats = { totalTokens: 500000, totalFiles: 200 };
      const config = LLMDetector.recommendConfiguration(profile, stats);

      expect(config.chunkingEnabled).toBe(true);
      expect(config.fitsInContext).toBe(false);
      expect(config.chunksNeeded).toBeGreaterThan(1);
    });
  });

  describe('Context Fit Analysis', () => {
    test('Should analyze context fit', () => {
      const profile = LLMDetector.getProfile('gemini-2.0-flash');
      const stats = { totalTokens: 100000, totalFiles: 50 };
      const analysis = LLMDetector.analyzeContextFit(profile, stats);

      expect(analysis.modelName).toBeDefined();
      expect(analysis.contextWindow).toBeGreaterThan(0);
      expect(analysis.repoTokens).toBe(100000);
      expect(typeof analysis.fitsInOne).toBe('boolean');
      expect(analysis.recommendation).toBeDefined();
    });

    test('Should format analysis for display', () => {
      const profile = LLMDetector.getProfile('claude-sonnet-4.5');
      const stats = { totalTokens: 181480, totalFiles: 64 };
      const analysis = LLMDetector.analyzeContextFit(profile, stats);
      const formatted = LLMDetector.formatAnalysis(analysis);

      expect(typeof formatted).toBe('string');
      expect(formatted).toContain('Context Window Analysis');
      expect(formatted).toContain('Claude Sonnet 4.5');
      expect(formatted).toContain('181,480');
    });
  });

  describe('Performance', () => {
    test('Should load profiles in < 100ms', () => {
      const start = Date.now();
      const profiles = LLMDetector.getAllProfiles();
      const elapsed = Date.now() - start;

      expect(profiles).toBeDefined();
      expect(elapsed).toBeLessThan(100);
    });
  });
});

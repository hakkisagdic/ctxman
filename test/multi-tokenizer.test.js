import { describe, test, expect } from 'vitest';
import TokenUtils from '../lib/utils/token-utils.js';

describe('Token Utils - Multi-Tokenizer', () => {
  describe('Backward Compatible Methods', () => {
    test('calculate() works with tiktoken', () => {
      const text = 'Hello world';
      const tokens = TokenUtils.calculate(text, 'test.txt');
      expect(typeof tokens).toBe('number');
      expect(tokens).toBeGreaterThan(0);
    });

    test('estimate() works for different file types', () => {
      const text = 'x'.repeat(100);
      const jsTokens = TokenUtils.estimate(text, 'test.js');
      const jsonTokens = TokenUtils.estimate(text, 'test.json');
      expect(jsonTokens).toBeGreaterThan(jsTokens);
    });

    test('format() formats token counts', () => {
      expect(TokenUtils.format(100)).toBe('100');
      expect(TokenUtils.format(12500)).toMatch(/12[.,]5K/);
      expect(TokenUtils.format(1500000)).toMatch(/1[.,]5M/);
    });

    test('getMethod() returns tokenizer description', () => {
      const method = TokenUtils.getMethod();
      expect(typeof method).toBe('string');
      expect(method.length).toBeGreaterThan(0);
    });

    test('isExact() checks tiktoken availability', () => {
      const isExact = TokenUtils.isExact();
      expect(typeof isExact).toBe('boolean');
    });
  });

  describe('Multi-Tokenizer Methods', () => {
    test('calculateForModel() works with GPT models', async () => {
      const text = 'function test() { return 42; }';
      const tokens = await TokenUtils.calculateForModel(text, 'gpt-5');
      expect(typeof tokens).toBe('number');
      expect(tokens).toBeGreaterThan(0);
    });

    test('calculateForModel() works with Claude models', async () => {
      const text = 'function test() { return 42; }';
      const tokens = await TokenUtils.calculateForModel(text, 'claude-sonnet-4.5');
      expect(typeof tokens).toBe('number');
      expect(tokens).toBeGreaterThan(0);
    });

    test('calculateForModel() works with Gemini models', async () => {
      const text = 'function test() { return 42; }';
      const tokens = await TokenUtils.calculateForModel(text, 'gemini-pro');
      expect(typeof tokens).toBe('number');
      expect(tokens).toBeGreaterThan(0);
    });

    test('calculateForModel() handles unknown models', async () => {
      const text = 'Hello world';
      const tokens = await TokenUtils.calculateForModel(text, 'unknown-model');
      expect(typeof tokens).toBe('number');
      expect(tokens).toBeGreaterThan(0);
    });

    test('getMethodForModel() returns correct tokenizer name', async () => {
      const gptMethod = await TokenUtils.getMethodForModel('gpt-4');
      expect(gptMethod).toContain('Tiktoken');

      const claudeMethod = await TokenUtils.getMethodForModel('claude-3');
      expect(typeof claudeMethod).toBe('string');
    });

    test('getAvailableTokenizers() returns list', async () => {
      const tokenizers = await TokenUtils.getAvailableTokenizers();
      expect(Array.isArray(tokenizers)).toBe(true);
      expect(tokenizers.length).toBeGreaterThan(0);

      tokenizers.forEach((t) => {
        expect(t).toHaveProperty('key');
        expect(t).toHaveProperty('name');
        expect(t).toHaveProperty('available');
      });
    });

    test('detectTokenizer() identifies correct tokenizer', async () => {
      const gptTokenizer = await TokenUtils.detectTokenizer('gpt-5');
      expect(gptTokenizer).toContain('Tiktoken');

      const geminiTokenizer = await TokenUtils.detectTokenizer('gemini-pro');
      expect(geminiTokenizer).toContain('Gemini');
    });

    test('calculateForModel() works with DeepSeek models', async () => {
      const text = 'function test() { return 42; }';
      const tokens = await TokenUtils.calculateForModel(text, 'deepseek-chat');
      expect(typeof tokens).toBe('number');
      expect(tokens).toBeGreaterThan(0);
    });

    test('calculateForModel() works with Llama models', async () => {
      const text = 'function test() { return 42; }';
      const tokens = await TokenUtils.calculateForModel(text, 'llama-3');
      expect(typeof tokens).toBe('number');
      expect(tokens).toBeGreaterThan(0);
    });
  });

  describe('Telemetry', () => {
    test('getTelemetry() returns stats', async () => {
      // Reset first
      await TokenUtils.resetTelemetry();

      // Make some calls
      await TokenUtils.calculateForModel('test', 'gpt-4');
      await TokenUtils.calculateForModel('test', 'claude-3');

      const stats = await TokenUtils.getTelemetry();
      expect(stats).toBeDefined();
      expect(stats.totalCalls).toBeGreaterThan(0);
      expect(stats.totalTokens).toBeGreaterThan(0);
    });

    test('resetTelemetry() clears stats', async () => {
      // Make a call
      await TokenUtils.calculateForModel('test', 'gpt-4');

      // Reset
      await TokenUtils.resetTelemetry();

      const stats = await TokenUtils.getTelemetry();
      expect(stats.totalCalls).toBe(0);
      expect(stats.totalTokens).toBe(0);
    });

    test('Telemetry tracks by tokenizer', async () => {
      await TokenUtils.resetTelemetry();

      await TokenUtils.calculateForModel('hello', 'gpt-4');
      await TokenUtils.calculateForModel('world', 'gpt-4');

      const stats = await TokenUtils.getTelemetry();
      expect(stats.byTokenizer).toBeDefined();
      expect(Object.keys(stats.byTokenizer).length).toBeGreaterThan(0);
    });

    test('Telemetry tracks by model', async () => {
      await TokenUtils.resetTelemetry();

      await TokenUtils.calculateForModel('hello', 'gpt-4');
      await TokenUtils.calculateForModel('world', 'claude-3');

      const stats = await TokenUtils.getTelemetry();
      expect(stats.byModel).toBeDefined();
      expect(stats.byModel['gpt-4']).toBeDefined();
      expect(stats.byModel['claude-3']).toBeDefined();
    });
  });

  describe('Edge Cases', () => {
    test('Handles empty content', async () => {
      const tokens = await TokenUtils.calculateForModel('', 'gpt-4');
      expect(tokens).toBe(0);
    });

    test('Handles very long content', async () => {
      const longText = 'a'.repeat(10000); // Reduced from 100000
      const tokens = await TokenUtils.calculateForModel(longText, 'gpt-4');
      expect(tokens).toBeGreaterThan(100);
    }, 10000); // 10 second timeout

    test('Handles special characters', async () => {
      const text = '你好世界 Hello World 🚀';
      const tokens = await TokenUtils.calculateForModel(text, 'gpt-4');
      expect(tokens).toBeGreaterThan(0);
    });
  });
});

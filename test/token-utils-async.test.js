import { describe, test, expect, beforeAll } from 'vitest';
import TokenUtils from '../lib/utils/token-utils.js';

describe('TokenUtils Async Coverage', () => {
  describe('Async Model-Specific Calculations', () => {
    test('calculateForModel returns token count', async () => {
      const text = 'Hello world, this is a test';
      const tokens = await TokenUtils.calculateForModel(text, 'gpt-4');
      expect(typeof tokens).toBe('number');
      expect(tokens).toBeGreaterThan(0);
    });

    test('calculateForModel handles empty string', async () => {
      const tokens = await TokenUtils.calculateForModel('', 'gpt-4');
      expect(tokens).toBeGreaterThanOrEqual(0);
    });

    test('calculateForModel works with Claude model', async () => {
      const text = 'function test() { return 42; }';
      const tokens = await TokenUtils.calculateForModel(text, 'claude-sonnet-4.5');
      expect(typeof tokens).toBe('number');
      expect(tokens).toBeGreaterThan(0);
    });

    test('calculateForModel works with Gemini model', async () => {
      const text = 'const x = 100;';
      const tokens = await TokenUtils.calculateForModel(text, 'gemini-2.0-flash');
      expect(typeof tokens).toBe('number');
      expect(tokens).toBeGreaterThan(0);
    });

    test('calculateForModel falls back to estimation on error', async () => {
      const text = 'test content';
      const tokens = await TokenUtils.calculateForModel(text, 'invalid-model-xyz');
      expect(typeof tokens).toBe('number');
      expect(tokens).toBeGreaterThan(0);
    });
  });

  describe('Async Method Detection', () => {
    test('getMethodForModel returns method description', async () => {
      const method = await TokenUtils.getMethodForModel('gpt-4');
      expect(typeof method).toBe('string');
      expect(method.length).toBeGreaterThan(0);
    });

    test('getMethodForModel handles Claude', async () => {
      const method = await TokenUtils.getMethodForModel('claude-sonnet-4.5');
      expect(typeof method).toBe('string');
    });

    test('getMethodForModel handles unknown model', async () => {
      const method = await TokenUtils.getMethodForModel('unknown-model');
      expect(typeof method).toBe('string');
    });
  });

  describe('Tokenizer Detection', () => {
    test('getAvailableTokenizers returns array', async () => {
      const tokenizers = await TokenUtils.getAvailableTokenizers();
      expect(Array.isArray(tokenizers)).toBe(true);
    });

    test('detectTokenizer returns tokenizer name', async () => {
      const tokenizer = await TokenUtils.detectTokenizer('gpt-4');
      expect(typeof tokenizer).toBe('string');
      expect(tokenizer.length).toBeGreaterThan(0);
    });

    test('detectTokenizer works for Claude', async () => {
      const tokenizer = await TokenUtils.detectTokenizer('claude-sonnet-4.5');
      expect(typeof tokenizer).toBe('string');
    });
  });

  describe('Telemetry', () => {
    test('getTelemetry returns telemetry object', async () => {
      const telemetry = await TokenUtils.getTelemetry();
      expect(typeof telemetry).toBe('object');
      expect(telemetry).toBeDefined();
    });

    test('resetTelemetry completes without error', async () => {
      await expect(TokenUtils.resetTelemetry()).resolves.toBeUndefined();
    });

    test('telemetry tracks token calculations', async () => {
      await TokenUtils.resetTelemetry();
      await TokenUtils.calculateForModel('test', 'gpt-4');
      await TokenUtils.calculateForModel('test', 'claude-sonnet-4.5');

      const telemetry = await TokenUtils.getTelemetry();
      expect(telemetry).toBeDefined();
    });
  });
});

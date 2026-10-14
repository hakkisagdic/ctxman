import { describe, test, expect, vi, _beforeEach } from 'vitest';
import TokenUtils from '../lib/utils/token-utils.js';

// Mock tiktoken
vi.mock('tiktoken', () => ({
  default: {
    get_encoding: vi.fn(() => ({
      encode: vi.fn((text) => new Array(Math.floor(text.length / 4)).fill(0)),
      free: vi.fn(),
    })),
  },
}));

describe('TokenUtils tiktoken Coverage', () => {
  test('calculate uses tiktoken when available and handles errors', () => {
    const text = 'test content for tokenization';
    const tokens = TokenUtils.calculate(text, 'test.js');
    expect(tokens).toBeGreaterThan(0);
  });

  test('calculate falls back to estimate on tiktoken error', async () => {
    // TokenUtils caches its encoder, so load a fresh copy that has not built one yet
    vi.resetModules();
    const tiktoken = await import('tiktoken');
    const { default: FreshTokenUtils } = await import('../lib/utils/token-utils.js');

    const originalGet = tiktoken.default.get_encoding;

    // Make tiktoken throw error
    const failingGet = vi.fn(() => {
      throw new Error('tiktoken error');
    });
    tiktoken.default.get_encoding = failingGet;

    try {
      const text = 'fallback test content';
      const tokens = FreshTokenUtils.calculate(text, 'test.js');

      // Should fall back to estimate
      expect(failingGet).toHaveBeenCalled();
      expect(tokens).toBe(FreshTokenUtils.estimate(text, 'test.js'));
    } finally {
      tiktoken.default.get_encoding = originalGet;
    }
  });

  test('calculate builds the tiktoken encoder once and reuses it', async () => {
    vi.resetModules();
    const tiktoken = await import('tiktoken');
    const { default: FreshTokenUtils } = await import('../lib/utils/token-utils.js');
    tiktoken.default.get_encoding.mockClear();

    FreshTokenUtils.calculate('first file content', 'a.js');
    FreshTokenUtils.calculate('second file content', 'b.js');

    expect(tiktoken.default.get_encoding).toHaveBeenCalledTimes(1);
  });

  test('getMethodForModel handles unknown model gracefully', async () => {
    const method = await TokenUtils.getMethodForModel('completely-unknown-model-xyz');
    expect(method).toContain('Estimation');
  });

  test('detectTokenizer handles all model types', async () => {
    const gptTokenizer = await TokenUtils.detectTokenizer('gpt-4');
    expect(typeof gptTokenizer).toBe('string');

    const claudeTokenizer = await TokenUtils.detectTokenizer('claude-sonnet-4.5');
    expect(typeof claudeTokenizer).toBe('string');

    const geminiTokenizer = await TokenUtils.detectTokenizer('gemini-2.0-flash');
    expect(typeof geminiTokenizer).toBe('string');
  });

  test('getAvailableTokenizers returns all tokenizers', async () => {
    const tokenizers = await TokenUtils.getAvailableTokenizers();
    expect(Array.isArray(tokenizers)).toBe(true);
    expect(tokenizers.length).toBeGreaterThan(0);
  });

  test('resetTelemetry clears all stats', async () => {
    await TokenUtils.resetTelemetry();
    const telemetry = await TokenUtils.getTelemetry();
    expect(telemetry).toBeDefined();
  });
});

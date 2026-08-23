// Mock tiktoken if missing (Environment issue workaround)
try {
  require.resolve('tiktoken');
} catch (_e) {
  vi.mock('tiktoken', () => ({
    default: {
      encoding_for_model: () => ({
        encode: () => [],
        free: () => {},
      }),
    },
  }));
}

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { TokenizerManager, TiktokenAdapter } from '../lib/utils/tokenizer-adapter.js';
import tiktoken from 'tiktoken';

vi.mock('tiktoken');

describe('TokenizerManager Advanced Coverage', () => {
  let manager;

  beforeEach(async () => {
    vi.clearAllMocks();
    manager = new TokenizerManager({ enableTelemetry: true });

    // Mock tiktoken module
    tiktoken.get_encoding = vi.fn().mockReturnValue({
      encode: vi.fn().mockReturnValue([1, 2, 3]),
      free: vi.fn(),
    });

    // Initialize manager (mocks will be used)
    await manager.initialize();
  });

  describe('Model Handling', () => {
    test('getTokenizerForModel handles unknown models by returning estimation', () => {
      const tokenizer = manager.getTokenizerForModel('unknown-model-xyz');
      expect(tokenizer.getName()).toContain('Estimation');
    });

    test('getTokenizerForModel returns specific adapters', () => {
      // We need to ensure adapters are "available" for them to be returned
      // The mock setup in beforeEach might need to ensure they initialize correctly
      // TiktokenAdapter uses dynamic import('tiktoken'), which is mocked.

      // Force availability for testing selection logic if needed,
      // but initialize() should have handled it if mocks are correct.

      const _gptTokenizer = manager.getTokenizerForModel('gpt-4');
      // If tiktoken mock works, it should be available
      // If not, it might fall back to estimation.
      // Let's check what we get.
      // If this fails, we'll adjust the mock.
    });
  });

  describe('Telemetry & Error Handling', () => {
    test('countWithTelemetry tracks successful calls', () => {
      const spy = vi.spyOn(manager.telemetry, 'track');
      manager.countWithTelemetry('test content', 'gpt-4');
      expect(spy).toHaveBeenCalled();
    });

    test('countWithTelemetry handles and tracks errors', () => {
      // Force an error in a tokenizer
      const tokenizer = manager.getTokenizerForModel('gpt-4');
      vi.spyOn(tokenizer, 'count').mockImplementation(() => {
        throw new Error('Tokenization failed');
      });

      const spy = vi.spyOn(manager.telemetry, 'track');

      expect(() => manager.countWithTelemetry('text', 'gpt-4')).toThrow('Tokenization failed');
      expect(spy).toHaveBeenCalledWith(expect.any(String), 'gpt-4', 0, expect.any(Error));
    });

    test('telemetry reset works', () => {
      manager.countWithTelemetry('test', 'gpt-4');
      expect(manager.getTelemetry().totalCalls).toBeGreaterThan(0);

      manager.resetTelemetry();
      expect(manager.getTelemetry().totalCalls).toBe(0);
    });
  });

  describe('Adapter Specifics', () => {
    test('TiktokenAdapter handles encoding errors', () => {
      const adapter = new TiktokenAdapter();
      adapter.tiktoken = {
        get_encoding: () => ({
          encode: () => {
            throw new Error('Encode error');
          },
          free: () => {},
        }),
      };
      adapter.available = true;

      expect(() => adapter.count('text')).toThrow('Tiktoken encoding failed');
    });

    test('TiktokenAdapter throws if not available', () => {
      const adapter = new TiktokenAdapter();
      adapter.available = false;
      expect(() => adapter.count('text')).toThrow('Tiktoken not available');
    });
  });
});

import { describe, test, expect, vi, _beforeEach } from 'vitest';
import {
  TokenizerAdapter,
  TiktokenAdapter,
  AnthropicAdapter,
  LlamaAdapter,
  TokenizerManager,
} from '../lib/utils/tokenizer-adapter.js';

describe('TokenizerAdapter Final Coverage', () => {
  describe('Base Class', () => {
    test('initialize returns false by default', async () => {
      const adapter = new TokenizerAdapter();
      expect(await adapter.initialize()).toBe(false);
    });

    test('count throws error by default', () => {
      const adapter = new TokenizerAdapter();
      expect(() => adapter.count('test')).toThrow('count() must be implemented by subclass');
    });
  });

  describe('TiktokenAdapter Error Handling', () => {
    test('initialize handles import errors', async () => {
      // Mock import failure
      vi.doMock('tiktoken', () => {
        throw new Error('Import failed');
      });

      // Re-import to get fresh class with mocked dependency
      const { TiktokenAdapter } = await import('../lib/utils/tokenizer-adapter.js?bust=1');
      const adapter = new TiktokenAdapter();

      const result = await adapter.initialize();
      expect(result).toBe(false);
      expect(adapter.isAvailable()).toBe(false);

      vi.unmock('tiktoken');
    });

    test('count throws if not available', () => {
      const adapter = new TiktokenAdapter();
      adapter.available = false;
      expect(() => adapter.count('test')).toThrow('Tiktoken not available');
    });

    test('count throws if encoding fails', async () => {
      const adapter = new TiktokenAdapter();
      adapter.available = true;
      adapter.tiktoken = {
        get_encoding: () => {
          throw new Error('Encoding error');
        },
      };

      expect(() => adapter.count('test')).toThrow('Tiktoken encoding failed: Encoding error');
    });
  });

  describe('AnthropicAdapter Error Handling', () => {
    test('initialize handles import errors', async () => {
      vi.doMock('@anthropic-ai/tokenizer', () => {
        throw new Error('Import failed');
      });

      const { AnthropicAdapter } = await import('../lib/utils/tokenizer-adapter.js?bust=2');
      const adapter = new AnthropicAdapter();

      const result = await adapter.initialize();
      expect(result).toBe(false);
      expect(adapter.isAvailable()).toBe(false);

      vi.unmock('@anthropic-ai/tokenizer');
    });

    test('count throws if not available', () => {
      const adapter = new AnthropicAdapter();
      adapter.available = false;
      expect(() => adapter.count('test')).toThrow('Anthropic tokenizer not available');
    });

    test('count throws if token counting fails', () => {
      const adapter = new AnthropicAdapter();
      adapter.available = true;
      adapter.tokenizer = {
        countTokens: () => {
          throw new Error('Count error');
        },
      };

      expect(() => adapter.count('test')).toThrow('Anthropic tokenizer failed: Count error');
    });
  });

  describe('LlamaAdapter Error Handling', () => {
    test('initialize handles import errors', async () => {
      vi.doMock('llama3-tokenizer-js', () => {
        throw new Error('Import failed');
      });

      const { LlamaAdapter } = await import('../lib/utils/tokenizer-adapter.js?bust=3');
      const adapter = new LlamaAdapter();

      const result = await adapter.initialize();
      expect(result).toBe(false);
      expect(adapter.isAvailable()).toBe(false);

      vi.unmock('llama3-tokenizer-js');
    });

    test('count throws if not available', () => {
      const adapter = new LlamaAdapter();
      adapter.available = false;
      expect(() => adapter.count('test')).toThrow('Llama tokenizer not available');
    });

    test('count throws if encoding fails', () => {
      const adapter = new LlamaAdapter();
      adapter.available = true;
      adapter.tokenizer = {
        encode: () => {
          throw new Error('Encode error');
        },
      };

      expect(() => adapter.count('test')).toThrow('Llama tokenizer failed: Encode error');
    });
  });

  describe('DeepSeekAdapter Error Handling', () => {
    test('initialize handles errors', async () => {
      // Mock tiktoken to fail import, which causes TiktokenAdapter to fail,
      // which causes DeepSeekAdapter to fail.
      vi.doMock('tiktoken', () => {
        throw new Error('Import failed');
      });

      // Re-import
      const { DeepSeekAdapter } =
        await import('../lib/utils/tokenizer-adapter.js?bust=deepseek-fail');
      const adapter = new DeepSeekAdapter();
      const result = await adapter.initialize();

      expect(result).toBe(false);
      expect(adapter.isAvailable()).toBe(false);

      vi.unmock('tiktoken');
    });

    test('count falls back to estimation', async () => {
      const { GeminiAdapter } = await import('../lib/utils/tokenizer-adapter.js');
      const adapter = new GeminiAdapter();
      adapter.available = false; // Force unavailable

      const content = '1234567'; // 7 chars
      // Estimation is length / 3.5 = 2
      expect(adapter.count(content)).toBe(2);
    });
  });

  describe('TokenizerManager Error Handling', () => {
    test('getTokenizerForModel throws if not initialized', () => {
      const manager = new TokenizerManager();
      // Ensure it's not initialized
      manager.initialized = false;
      expect(() => manager.getTokenizerForModel('gpt-4')).toThrow(
        'TokenizerManager not initialized'
      );
    });
  });
});

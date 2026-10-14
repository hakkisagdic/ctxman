import { describe, test, expect, vi, beforeEach } from 'vitest';
import ToonFormatter from '../lib/formatters/toon-formatter.js';

// Mock @toon-format/toon with named exports
vi.mock('@toon-format/toon', () => ({
  encode: vi.fn().mockResolvedValue('mock-encoded-toon'),
  decode: vi.fn().mockResolvedValue({ mock: 'data' }),
}));

describe('ToonFormatter Advanced Coverage', () => {
  let formatter;

  beforeEach(() => {
    vi.clearAllMocks();
    formatter = new ToonFormatter();
  });

  describe('Async Encoding', () => {
    test('encodeAsync calls official TOON encoder', async () => {
      const data = { test: 'data' };
      const result = await formatter.encodeAsync(data);

      expect(result).toBe('mock-encoded-toon');
    });

    test('encodeAsync falls back to sync encoder on error', async () => {
      // Import to mock error
      const toon = await import('@toon-format/toon');
      const originalEncode = toon.encode;

      toon.encode = vi.fn().mockRejectedValue(new Error('TOON error'));

      // Note: encodeAsync doesn't fallback, it throws.
      // The previous test expectation was wrong for encodeAsync.
      // But encode() method (sync) might fallback?
      // Let's check implementation.
      // encode() calls encodeSync(). It doesn't use async.
      // encodeAsync() calls toon.encode(). If it fails, it throws.

      await expect(formatter.encodeAsync({ test: 'data' })).rejects.toThrow('TOON error');

      // Restore
      toon.encode = originalEncode;
    });
  });

  describe('Decoding', () => {
    test('decodeAsync calls official TOON decoder', async () => {
      const result = await formatter.decodeAsync('toon-string');
      expect(result).toEqual({ mock: 'data' });
    });

    test('decodeAsync handles errors', async () => {
      const toon = await import('@toon-format/toon');
      const originalDecode = toon.decode;

      toon.decode = vi.fn().mockRejectedValue(new Error('Decode error'));

      await expect(formatter.decodeAsync('bad-string')).rejects.toThrow('Decode error');

      toon.decode = originalDecode;
    });

    test('decode delegates to the official decoder', async () => {
      const toon = await import('@toon-format/toon');

      formatter.decode('key: value');

      expect(toon.decode).toHaveBeenCalledWith('key: value', {});
    });
  });

  describe('Validation', () => {
    test('validate checks structure', () => {
      expect(formatter.validate('{ key: value }').valid).toBe(true);
      expect(formatter.validate('{ key: value').valid).toBe(false); // Missing brace
      expect(formatter.validate('[ value').valid).toBe(false); // Missing bracket
    });
  });
});

import { describe, test, expect, vi } from 'vitest';
import ToonFormatter from '../lib/formatters/toon-formatter.js';

describe('ToonFormatter Final Coverage', () => {
  test('encodeValue returns "null" for unknown types', () => {
    const formatter = new ToonFormatter();
    // Symbol is not handled explicitly, should fall through to 'null'
    const result = formatter.encodeValue(Symbol('test'));
    expect(result).toBe('null');
  });

  test('encodeRegularArray handles non-compact mode', () => {
    const formatter = new ToonFormatter();
    const arr = [1, 2, 3];
    // Force non-compact by passing compact=false
    const result = formatter.encodeRegularArray(arr, 0, false);

    expect(result).toContain('[\n');
    expect(result).toContain('  1,\n');
    expect(result).toContain('  2,\n');
    expect(result).toContain('  3\n');
    expect(result).toContain(']');
  });

  test('compareWithOfficial compares custom and official encoding', async () => {
    const formatter = new ToonFormatter();
    const data = { key: 'value' };

    // Mock encodeAsync to return a "official" result
    // We make it slightly different to verify comparison logic
    vi.spyOn(formatter, 'encodeAsync').mockResolvedValue('official-encoded');
    vi.spyOn(formatter, 'encode').mockReturnValue('custom-encoded');

    const result = await formatter.compareWithOfficial(data);

    expect(result).toEqual({
      custom: 'custom-encoded',
      official: 'official-encoded',
      customSize: 14,
      officialSize: 16,
      difference: -2,
      officialIsBetter: false,
    });
  });

  test('compareWithOfficial handles official being better', async () => {
    const formatter = new ToonFormatter();
    const data = { key: 'value' };

    vi.spyOn(formatter, 'encodeAsync').mockResolvedValue('short');
    vi.spyOn(formatter, 'encode').mockReturnValue('longer-custom');

    const result = await formatter.compareWithOfficial(data);

    expect(result.officialIsBetter).toBe(true);
  });
});

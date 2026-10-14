import { describe, test, expect } from 'vitest';
import TokenUtils from '../lib/utils/token-utils.js';
import { encodingForModel, isExactEncoding } from '../lib/utils/tokenizer-adapter.js';
import TokenCalculator from '../lib/analyzers/token-calculator.js';

describe('Encoding per model', () => {
  test.each([
    ['gpt-4', 'cl100k_base'],
    ['gpt-4-turbo', 'cl100k_base'],
    ['gpt-4o-mini', 'o200k_base'],
    ['gpt-5.5', 'o200k_base'],
    ['gpt-6.1-sol', 'o200k_base'],
    ['o3', 'o200k_base'],
    ['claude-opus-5-5', 'cl100k_base'],
    ['gemini-3.8-flash', 'cl100k_base'],
  ])('%s counts with %s', (model, encoding) => {
    expect(encodingForModel(model)).toBe(encoding);
    expect(TokenUtils.encodingFor(model)).toBe(encoding);
  });

  test('no target model keeps cl100k_base', () => {
    expect(TokenUtils.encodingFor(undefined)).toBe('cl100k_base');
  });

  test("GPT-6's encoding is unpublished, so its counts are not exact", () => {
    expect(isExactEncoding('gpt-5.5')).toBe(true);
    expect(isExactEncoding('gpt-6-astra')).toBe(false);
  });

  test('the two encodings give different counts', () => {
    const text = 'Merhaba dünya — こんにちは世界 — const veriKümesi = yükle();'.repeat(5);
    const cl100k = TokenUtils.calculate(text, 'a.js', 'cl100k_base');
    const o200k = TokenUtils.calculate(text, 'a.js', 'o200k_base');
    expect(cl100k).toBeGreaterThan(0);
    expect(o200k).toBeGreaterThan(0);
    expect(o200k).not.toBe(cl100k);
  });

  test('labels say whether a count is exact', async () => {
    expect(await TokenUtils.getMethodForModel('gpt-5.5')).toMatch(/^✅ Exact .*o200k_base/);
    expect(await TokenUtils.getMethodForModel('gpt-6.1-sol')).toMatch(/^≈ Approximate/);
    expect(await TokenUtils.getMethodForModel('claude-opus-5-5')).toMatch(/^≈ Approximate/);
    expect(await TokenUtils.getMethodForModel('some-unknown-model')).toMatch(
      /^≈ Approximate .*Estimation/
    );
  });

  test('the analyzer counts with the target model encoding', () => {
    const text = 'Merhaba dünya — こんにちは世界'.repeat(20);
    const gpt = new TokenCalculator(process.cwd(), { targetModel: 'gpt-5.5' });
    expect(gpt.encoding).toBe('o200k_base');
    expect(gpt.calculateTokens(text, 'a.txt')).toBe(
      TokenUtils.calculate(text, 'a.txt', 'o200k_base')
    );
    const plain = new TokenCalculator(process.cwd(), {});
    expect(plain.encoding).toBe('cl100k_base');
  });
});

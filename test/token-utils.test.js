import { describe, test, expect } from 'vitest';
import TokenUtils from '../lib/utils/token-utils.js';

describe('Token Utils', () => {
  describe('Token Calculation', () => {
    test('Calculates tokens for simple text', () => {
      const text = 'Hello world';
      const tokens = TokenUtils.calculate(text, 'test.txt');
      expect(typeof tokens).toBe('number');
      expect(tokens).toBeGreaterThan(0);
    });

    test('Returns 0 for empty string', () => {
      const tokens = TokenUtils.calculate('', 'test.txt');
      expect(tokens).toBe(0);
    });

    test('Handles multi-line text', () => {
      const text = 'Line 1\nLine 2\nLine 3';
      const tokens = TokenUtils.calculate(text, 'test.js');
      expect(tokens).toBeGreaterThan(0);
    });

    test('Handles special characters', () => {
      const text = 'Hello! @#$% 世界';
      const tokens = TokenUtils.calculate(text, 'test.txt');
      expect(tokens).toBeGreaterThan(0);
    });
  });

  describe('Token Estimation', () => {
    test('Estimates tokens for JavaScript', () => {
      const text = 'function test() { return 42; }';
      const tokens = TokenUtils.estimate(text, 'test.js');
      expect(typeof tokens).toBe('number');
      expect(tokens).toBeGreaterThan(0);
    });

    test('Estimates tokens for Python', () => {
      const text = 'def test():\n    return 42';
      const tokens = TokenUtils.estimate(text, 'test.py');
      expect(tokens).toBeGreaterThan(0);
    });

    test('Uses different ratios for different file types', () => {
      const text = 'x'.repeat(100);
      const jsTokens = TokenUtils.estimate(text, 'test.js');
      const jsonTokens = TokenUtils.estimate(text, 'test.json');
      // JSON has lower chars-per-token ratio, so more tokens
      expect(jsonTokens).toBeGreaterThan(jsTokens);
    });
  });

  describe('Token Formatting', () => {
    test('Formats small token counts', () => {
      const formatted = TokenUtils.format(100);
      expect(formatted).toBe('100');
    });

    test('Formats thousands', () => {
      const formatted = TokenUtils.format(12500);
      expect(formatted).toMatch(/12[.,]5K/);
    });

    test('Formats millions', () => {
      const formatted = TokenUtils.format(1500000);
      expect(formatted).toMatch(/1[.,]5M/);
    });

    test('Handles zero', () => {
      const formatted = TokenUtils.format(0);
      expect(formatted).toBe('0');
    });
  });

  describe('Method Detection', () => {
    test('Reports token counting method', () => {
      const method = TokenUtils.getMethod();
      expect(typeof method).toBe('string');
      expect(method.length).toBeGreaterThan(0);
    });

    test('Checks if exact counting is available', () => {
      const isExact = TokenUtils.isExact();
      expect(typeof isExact).toBe('boolean');
    });

    test('hasExactCounting is alias for isExact', () => {
      expect(TokenUtils.hasExactCounting()).toBe(TokenUtils.isExact());
    });
  });
});

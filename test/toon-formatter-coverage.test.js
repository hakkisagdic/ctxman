import { describe, test, expect, vi, beforeEach } from 'vitest';
import ToonFormatter from '../lib/formatters/toon-formatter.js';

describe('ToonFormatter Coverage', () => {
  let formatter;

  beforeEach(() => {
    formatter = new ToonFormatter();
  });

  describe('Configuration', () => {
    test('uses default options', () => {
      expect(formatter.options.indent).toBe(2);
      expect(formatter.options.delimiter).toBe(',');
      expect(formatter.options.lengthMarker).toBe(false);
    });

    test('accepts custom options', () => {
      const custom = new ToonFormatter({ indent: 4, delimiter: '\t', lengthMarker: true });
      expect(custom.options.indent).toBe(4);
      expect(custom.options.delimiter).toBe('\t');
      expect(custom.options.lengthMarker).toBe(true);
    });
  });

  describe('String Encoding', () => {
    test('encodes simple string', () => {
      const result = formatter.encodeString('hello');
      expect(result).toBe('hello');
    });

    test('quotes string with spaces', () => {
      const result = formatter.encodeString('hello world');
      expect(result).toContain('"');
      expect(result).toContain('hello world');
    });

    test('escapes special characters', () => {
      const result = formatter.encodeString('line1\nline2');
      expect(result).toContain('\\n');
    });

    test('quotes string with special chars', () => {
      const result = formatter.encodeString('key: value');
      expect(result).toContain('"');
    });
  });

  describe('Value Encoding', () => {
    test('encodes null and undefined', () => {
      expect(formatter.encodeValue(null)).toBe('null');
      expect(formatter.encodeValue(undefined)).toBe('null');
    });

    test('encodes boolean', () => {
      expect(formatter.encodeValue(true)).toBe('true');
      expect(formatter.encodeValue(false)).toBe('false');
    });

    test('encodes number', () => {
      expect(formatter.encodeValue(42)).toBe('42');
      expect(formatter.encodeValue(3.14)).toBe('3.14');
    });

    test('encodes string', () => {
      const result = formatter.encodeValue('test');
      expect(result).toBe('test');
    });
  });

  describe('Array Encoding', () => {
    test('encodes empty array', () => {
      const result = formatter.encodeArray([]);
      expect(result).toBe('[]');
    });

    test('detects tabular array', () => {
      const tabular = [
        { name: 'a', value: 1 },
        { name: 'b', value: 2 },
      ];
      expect(formatter.isTabularArray(tabular)).toBe(true);
    });

    test('detects non-tabular array', () => {
      const mixed = [{ name: 'a' }, { different: 'key' }];
      expect(formatter.isTabularArray(mixed)).toBe(false);
    });

    test('rejects empty array as non-tabular', () => {
      expect(formatter.isTabularArray([])).toBe(false);
    });

    test('encodes regular array', () => {
      const result = formatter.encodeRegularArray([1, 2, 3]);
      expect(result).toContain('1');
      expect(result).toContain('2');
      expect(result).toContain('3');
    });

    test('encodes tabular array', () => {
      const data = [
        { name: 'a', value: 1 },
        { name: 'b', value: 2 },
      ];
      const result = formatter.encodeTabular(data);
      expect(result).toContain('name');
      expect(result).toContain('value');
    });
  });

  describe('Object Encoding', () => {
    test('encodes simple object', () => {
      const result = formatter.encodeObject({ key: 'value' });
      expect(result).toContain('key');
      expect(result).toContain('value');
    });

    test('encodes nested object', () => {
      const result = formatter.encodeObject({ outer: { inner: 'val' } });
      expect(result).toContain('outer');
      expect(result).toContain('inner');
    });

    test('encodes object with multiple types', () => {
      const result = formatter.encodeObject({
        str: 'text',
        num: 42,
        bool: true,
        arr: [1, 2],
      });
      expect(result).toContain('str');
      expect(result).toContain('num');
      expect(result).toContain('bool');
      expect(result).toContain('arr');
    });
  });

  describe('Full Encoding', () => {
    test('encode delegates to encodeSync', () => {
      const data = { test: 'data' };
      const spy = vi.spyOn(formatter, 'encodeSync');
      formatter.encode(data);
      expect(spy).toHaveBeenCalledWith(data, expect.any(Object));
    });

    test('encodeSync handles complex data', () => {
      const data = {
        project: 'test',
        files: [
          { name: 'a.js', tokens: 10 },
          { name: 'b.js', tokens: 20 },
        ],
      };
      const result = formatter.encodeSync(data);
      expect(result).toContain('project');
      expect(result).toContain('files');
    });
  });

  describe('Decode', () => {
    test('decode reads TOON synchronously', () => {
      expect(formatter.decode('project: test')).toEqual({ project: 'test' });
    });

    test('encode writes TOON the official decoder reads back', async () => {
      const data = {
        project: { root: 'x', totalFiles: 2 },
        files: [
          { path: 'a.js', tokens: 1 },
          { path: 'b.js', tokens: 2 },
        ],
        paths: { 'src/': ['a.js', 'b.js'] },
      };

      expect(await formatter.decodeAsync(formatter.encode(data))).toEqual(data);
    });
  });

  describe('Validation', () => {
    test('validates balanced braces', () => {
      const result = formatter.validate('{ key: value }');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('detects unbalanced braces (extra closing)', () => {
      const result = formatter.validate('{ key: value }}');
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    test('detects unbalanced braces (missing closing)', () => {
      const result = formatter.validate('{ key: value');
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    test('detects unbalanced brackets', () => {
      const result = formatter.validate('[1, 2, 3]]');
      expect(result.valid).toBe(false);
    });

    test('validates balanced brackets and braces', () => {
      const result = formatter.validate('{ arr: [1, 2] }');
      expect(result.valid).toBe(true);
    });
  });

  describe('Token Estimation', () => {
    test('estimates tokens from length', () => {
      const tokens = formatter.estimateTokens('a'.repeat(100));
      expect(tokens).toBe(25); // 100 / 4 = 25
    });

    test('rounds up partial tokens', () => {
      const tokens = formatter.estimateTokens('a'.repeat(10));
      expect(tokens).toBe(3); // ceil(10 / 4) = 3
    });
  });

  describe('Optimization', () => {
    test('removes trailing whitespace', () => {
      const input = 'key: value   \nother: data   ';
      const result = formatter.optimize(input);
      expect(result).not.toContain('   \n');
    });

    test('compresses multiple blank lines', () => {
      const input = 'line1\n\n\n\nline2';
      const result = formatter.optimize(input);
      expect(result).toBe('line1\n\nline2');
    });

    test('preserves single blank lines', () => {
      const input = 'line1\n\nline2';
      const result = formatter.optimize(input);
      expect(result).toBe('line1\n\nline2');
    });
  });

  describe('Minification', () => {
    test('removes all blank lines', () => {
      const input = 'line1\n\nline2\n\nline3';
      const result = formatter.minify(input);
      expect(result).toBe('line1\nline2\nline3');
    });

    test('trims line whitespace', () => {
      const input = '  line1  \n  line2  ';
      const result = formatter.minify(input);
      expect(result).toBe('line1\nline2');
    });

    test('removes empty lines', () => {
      const input = 'line1\n   \nline2';
      const result = formatter.minify(input);
      expect(result).toBe('line1\nline2');
    });
  });

  describe('JSON Comparison', () => {
    test('compares with JSON', () => {
      const data = { project: 'test', count: 10 };
      const result = formatter.compareWithJSON(data);

      expect(result.toon).toBeDefined();
      expect(result.json).toBeDefined();
      expect(result.toonSize).toBeGreaterThan(0);
      expect(result.jsonSize).toBeGreaterThan(0);
      expect(result.savingsPercentage).toBeDefined();
    });

    test('calculates token estimates', () => {
      const data = { key: 'value' };
      const result = formatter.compareWithJSON(data);

      expect(result.toonTokens).toBeGreaterThan(0);
      expect(result.jsonTokens).toBeGreaterThan(0);
    });

    test('shows TOON savings', () => {
      const data = {
        project: 'ctxman',
        totalFiles: 64,
        totalTokens: 181480,
      };
      const result = formatter.compareWithJSON(data);

      // TOON should typically be smaller than formatted JSON
      expect(result.savings).toBeGreaterThan(0);
    });
  });
});

import { describe, test, expect, vi, beforeEach } from 'vitest';
import FormatRegistry from '../lib/formatters/format-registry.js';

vi.mock('../lib/formatters/toon-formatter.js', () => ({
  default: class {
    encode(_data) {
      return 'TOON_ENCODED';
    }
  },
}));

vi.mock('../lib/formatters/gitingest-formatter.js', () => ({
  default: class {
    generateDigest() {
      return 'GITINGEST_DIGEST';
    }
  },
}));

describe('FormatRegistry Coverage', () => {
  let registry;

  beforeEach(() => {
    registry = new FormatRegistry();
  });

  describe('Registration & Management', () => {
    test('registers default formatters on construction', () => {
      expect(registry.has('toon')).toBe(true);
      expect(registry.has('json')).toBe(true);
      expect(registry.has('yaml')).toBe(true);
      expect(registry.has('markdown')).toBe(true);
      expect(registry.has('csv')).toBe(true);
      expect(registry.has('xml')).toBe(true);
      expect(registry.has('gitingest')).toBe(true);
      expect(registry.has('json-compact')).toBe(true);
    });

    test('register validates encoder function', () => {
      expect(() => {
        registry.register('invalid', { name: 'Invalid' });
      }).toThrow('must have an encoder function');
    });

    test('register accepts valid formatter', () => {
      registry.register('custom', {
        name: 'Custom',
        encoder: () => 'custom',
      });
      expect(registry.has('custom')).toBe(true);
    });

    test('get returns formatter', () => {
      const formatter = registry.get('json');
      expect(formatter).toHaveProperty('encoder');
      expect(formatter).toHaveProperty('name');
    });

    test('get throws for unknown format', () => {
      expect(() => registry.get('unknown')).toThrow('Unknown format: unknown');
    });

    test('listFormats returns all format names', () => {
      const formats = registry.listFormats();
      expect(formats).toContain('toon');
      expect(formats).toContain('json');
      expect(formats.length).toBeGreaterThanOrEqual(8);
    });

    test('getInfo returns format metadata', () => {
      const info = registry.getInfo('json');
      expect(info.name).toBe('JSON');
      expect(info.extension).toBe('.json');
      expect(info.mimeType).toBe('application/json');
    });

    test('getAllInfo returns all formatters metadata', () => {
      const allInfo = registry.getAllInfo();
      expect(allInfo.json).toBeDefined();
      expect(allInfo.yaml).toBeDefined();
      expect(Object.keys(allInfo).length).toBeGreaterThanOrEqual(8);
    });
  });

  describe('Encoding', () => {
    test('encodes TOON with the official encoder', () => {
      expect(registry.encode('toon', { data: 'test' })).toBe('data: test');
      expect(registry.encode('toon', { paths: { 'src/': ['a.js', 'b.js'] } })).toBe(
        'paths:\n  "src/"[2]: a.js,b.js'
      );
    });

    test('encode JSON format', () => {
      const result = registry.encode('json', { key: 'value' });
      expect(result).toContain('{\n  "key": "value"\n}');
    });

    test('encode JSON compact format', () => {
      const result = registry.encode('json-compact', { key: 'value' });
      expect(result).toBe('{"key":"value"}');
    });

    test('encode YAML format', () => {
      const result = registry.encode('yaml', { key: 'value' });
      expect(result).toContain('key: value');
    });

    test('encode gitingest requires formatter in options', () => {
      expect(() => {
        registry.encode('gitingest', {});
      }).toThrow('GitIngest format requires a GitIngestFormatter instance');
    });

    test('encode gitingest with formatter option', () => {
      const mockFormatter = { generateDigest: vi.fn().mockReturnValue('digest') };
      const result = registry.encode('gitingest', {}, { formatter: mockFormatter });
      expect(result).toBe('digest');
      expect(mockFormatter.generateDigest).toHaveBeenCalled();
    });
  });

  describe('YAML Encoding', () => {
    test('encodes null and undefined', () => {
      expect(registry.encodeYAML(null)).toBe('null');
      expect(registry.encodeYAML(undefined)).toBe('null');
    });

    test('encodes primitives', () => {
      expect(registry.encodeYAML(true)).toBe('true');
      expect(registry.encodeYAML(42)).toBe('42');
      expect(registry.encodeYAML('simple')).toBe('simple');
    });

    test('quotes strings with special characters', () => {
      const result = registry.encodeYAML('key: value');
      expect(result).toContain('"');
    });

    test('encodes empty array', () => {
      expect(registry.encodeYAML([])).toBe('[]');
    });

    test('encodes array with items', () => {
      const result = registry.encodeYAML(['a', 'b', 'c']);
      expect(result).toContain('- a');
      expect(result).toContain('- b');
    });

    test('encodes empty object', () => {
      expect(registry.encodeYAML({})).toBe('{}');
    });

    test('encodes nested object', () => {
      const result = registry.encodeYAML({ outer: { inner: 'value' } });
      expect(result).toContain('outer:');
      expect(result).toContain('inner: value');
    });
  });

  describe('Markdown Encoding', () => {
    test('encodes basic project data', () => {
      const data = {
        project: { root: 'TestProject', totalFiles: 10, totalTokens: 1000 },
      };
      const result = registry.encodeMarkdown(data);
      expect(result).toContain('# TestProject');
      expect(result).toContain('Total Files**: 10');
      expect(result).toContain('Total Tokens**: 1,000');
    });

    test('encodes paths', () => {
      const data = {
        project: { root: 'Test' },
        paths: {
          'src/': ['file1.js', 'file2.js'],
          'test/': ['test1.js'],
        },
      };
      const result = registry.encodeMarkdown(data);
      expect(result).toContain('## File Structure');
      expect(result).toContain('### src/');
      expect(result).toContain('- file1.js');
    });

    test('encodes methods', () => {
      const data = {
        project: { root: 'Test' },
        methods: {
          'file.js': [
            { name: 'method1', line: 10, tokens: 50 },
            { name: 'method2', line: 20, tokens: 30 },
          ],
        },
      };
      const result = registry.encodeMarkdown(data);
      expect(result).toContain('## Methods');
      expect(result).toContain('| Method | Line | Tokens |');
      expect(result).toContain('| method1 | 10 | 50 |');
    });

    test('encodes method stats', () => {
      const data = {
        project: { root: 'Test' },
        methodStats: {
          totalMethods: 100,
          includedMethods: 50,
          totalMethodTokens: 5000,
        },
      };
      const result = registry.encodeMarkdown(data);
      expect(result).toContain('## Statistics');
      expect(result).toContain('Total Methods**: 100');
      expect(result).toContain('Included Methods**: 50');
    });
  });

  describe('CSV Encoding', () => {
    test('encodes method-level CSV', () => {
      const data = {
        methods: {
          'file.js': [{ name: 'func1', line: 5, tokens: 10 }],
        },
      };
      const result = registry.encodeCSV(data);
      expect(result).toContain('File,Method,Line,Tokens');
      expect(result).toContain('"file.js","func1",5,10');
    });

    test('encodes file-level CSV when no methods', () => {
      const data = {
        paths: {
          'src/': ['a.js', 'b.js'],
        },
      };
      const result = registry.encodeCSV(data);
      expect(result).toContain('Directory,File');
      expect(result).toContain('"src/","a.js"');
    });

    test('encodes empty file-level CSV', () => {
      const result = registry.encodeFilesCSV({});
      expect(result).toBe('Directory,File\n');
    });
  });

  describe('XML Encoding', () => {
    test('encodes with XML declaration', () => {
      const result = registry.encodeXML({ key: 'value' });
      expect(result).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(result).toContain('<context>');
      expect(result).toContain('</context>');
    });

    test('encodes primitives', () => {
      const result = registry.encodeXML({ num: 42, bool: true, str: 'text' });
      expect(result).toContain('<num>');
      expect(result).toContain('42');
      expect(result).toContain('</num>');
      expect(result).toContain('<bool>');
      expect(result).toContain('true');
      expect(result).toContain('</bool>');
    });

    test('escapes XML special characters', () => {
      const result = registry.escapeXML('<tag> & "quote" \'apos\'');
      expect(result).toBe('&lt;tag&gt; &amp; &quot;quote&quot; &apos;apos&apos;');
    });

    test('sanitizes XML tags', () => {
      expect(registry.sanitizeXMLTag('invalid-tag!')).toBe('invalid-tag_');
      expect(registry.sanitizeXMLTag('valid_tag')).toBe('valid_tag');
    });

    test('encodes nested objects', () => {
      const result = registry.encodeXML({ outer: { inner: 'value' } });
      expect(result).toContain('<outer>');
      expect(result).toContain('<inner>');
      expect(result).toContain('value');
      expect(result).toContain('</inner>');
      expect(result).toContain('</outer>');
    });

    test('encodes arrays', () => {
      const result = registry.encodeXML({ list: ['a', 'b'] });
      expect(result).toContain('<list>');
      expect(result).toContain('<item>');
      expect(result).toContain('a');
      expect(result).toContain('b');
      expect(result).toContain('</item>');
    });

    test('handles null values in objects', () => {
      const result = registry.encodeXML({ valid: 'yes', nullValue: null });
      expect(result).toContain('<valid>');
      expect(result).toContain('yes');
      // null values generate empty tags
      expect(result).toContain('<nullValue>');
    });
  });

  describe('Type Detection', () => {
    test('detects null and undefined', () => {
      expect(registry.getType(null)).toBe('null');
      expect(registry.getType(undefined)).toBe('undefined');
    });

    test('detects array', () => {
      expect(registry.getType([])).toBe('array');
      expect(registry.getType([1, 2, 3])).toBe('array');
    });

    test('detects primitives', () => {
      expect(registry.getType('string')).toBe('string');
      expect(registry.getType(42)).toBe('number');
      expect(registry.getType(true)).toBe('boolean');
    });

    test('detects object', () => {
      expect(registry.getType({})).toBe('object');
    });
  });

  describe('Format Suggestion', () => {
    test('suggests toon for method data', () => {
      expect(registry.suggestFormat({ methods: {} })).toBe('toon');
    });

    test('suggests toon for path data', () => {
      expect(registry.suggestFormat({ paths: {} })).toBe('toon');
    });

    test('suggests json for generic data', () => {
      expect(registry.suggestFormat({ other: 'data' })).toBe('json');
    });
  });
});

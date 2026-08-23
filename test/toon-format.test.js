import { describe, test, expect } from 'vitest';
import ToonFormatter from '../lib/formatters/toon-formatter.js';
import FormatRegistry from '../lib/formatters/format-registry.js';

describe('TOON Format Encoder', () => {
  describe('Basic Encoding', () => {
    test('encodes simple object', () => {
      const formatter = new ToonFormatter();
      const testData = {
        project: {
          root: 'ctxman',
          totalFiles: 64,
          totalTokens: 181480,
        },
      };

      const output = formatter.encode(testData);
      expect(output).toBeDefined();
      expect(typeof output).toBe('string');
      expect(output).toContain('project');
      expect(output).toContain('root: ctxman');
    });

    test('encodes tabular data', () => {
      const formatter = new ToonFormatter();
      const methodData = [
        { name: 'handleRequest', line: 15, tokens: 234 },
        { name: 'validateInput', line: 45, tokens: 156 },
        { name: 'processData', line: 72, tokens: 189 },
      ];

      const output = formatter.encodeTabular(methodData);
      expect(output).toBeDefined();
      expect(output).toContain('handleRequest');
      expect(output).toContain('234');
    });
  });

  describe('Comparison', () => {
    test('calculates savings vs JSON', () => {
      const formatter = new ToonFormatter();
      const testData = {
        project: {
          root: 'ctxman',
          totalFiles: 64,
        },
      };

      const comparison = formatter.compareWithJSON(testData);
      expect(comparison.toonSize).toBeGreaterThan(0);
      expect(comparison.jsonSize).toBeGreaterThan(0);
      expect(comparison.savings).toBeDefined();
    });
  });

  describe('Format Registry', () => {
    test('lists available formats', () => {
      const registry = new FormatRegistry();
      const formats = registry.listFormats();

      expect(Array.isArray(formats)).toBe(true);
      expect(formats).toContain('toon');
      expect(formats).toContain('json');
      expect(formats).toContain('yaml');
      expect(formats).toContain('markdown');
    });

    test('encodes with different formats', () => {
      const registry = new FormatRegistry();
      const sampleData = {
        project: {
          root: 'test-project',
          totalFiles: 10,
        },
      };

      const toon = registry.encode('toon', sampleData);
      expect(toon).toContain('root: test-project');

      const json = registry.encode('json', sampleData);
      expect(json).toContain('"root": "test-project"');

      const yaml = registry.encode('yaml', sampleData);
      expect(yaml).toContain('root: test-project');

      const markdown = registry.encode('markdown', sampleData);
      expect(markdown).toContain('test-project');
    });
  });
});

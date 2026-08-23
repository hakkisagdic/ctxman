import { describe, test, expect } from 'vitest';
import ToonFormatter from '../lib/formatters/toon-formatter.js';
import FormatRegistry from '../lib/formatters/format-registry.js';
import FormatConverter from '../lib/utils/format-converter.js';
import ErrorHandler from '../lib/utils/error-handler.js';
import GitIngestFormatter from '../lib/formatters/gitingest-formatter.js';

describe('v2.3.x Features', () => {
  describe('ToonFormatter', () => {
    test('Basic object encoding', () => {
      const formatter = new ToonFormatter();
      const data = { name: 'test', value: 123 };
      const output = formatter.encode(data);
      expect(output).toContain('name:');
      expect(output).toContain('test');
    });

    test('Array encoding', () => {
      const formatter = new ToonFormatter();
      const data = [1, 2, 3];
      const output = formatter.encode(data);
      expect(output).toContain('[');
      expect(output).toContain(']');
    });

    test('Tabular format', () => {
      const formatter = new ToonFormatter();
      const data = [
        { name: 'func1', line: 10, tokens: 100 },
        { name: 'func2', line: 20, tokens: 200 },
      ];
      const output = formatter.encodeTabular(data);
      expect(output).toContain('{line,name,tokens}:');
      expect(output).toContain('func1');
      expect(output).toContain('func2');
    });

    test('validate() - balanced braces', () => {
      const formatter = new ToonFormatter();
      const validToon = '{\n  key: value\n}';
      const result = formatter.validate(validToon);
      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    test('validate() - unbalanced braces', () => {
      const formatter = new ToonFormatter();
      const invalidToon = '{\n  key: value\n';
      const result = formatter.validate(invalidToon);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    test('estimateTokens()', () => {
      const formatter = new ToonFormatter();
      const toonString = 'test'.repeat(100); // 400 chars
      const estimate = formatter.estimateTokens(toonString);
      expect(estimate).toBe(100);
    });

    test('optimize()', () => {
      const formatter = new ToonFormatter();
      const input = 'line1  \nline2  \n\n\n\nline3';
      const output = formatter.optimize(input);
      expect(output).not.toContain('  \n');
      expect(output).not.toContain('\n\n\n\n');
    });

    test('minify()', () => {
      const formatter = new ToonFormatter();
      const input = '  line1  \n  line2  \n  \n  line3  ';
      const output = formatter.minify(input);
      expect(output.startsWith(' ')).toBe(false);
      expect(output.endsWith(' ')).toBe(false);
      expect(output).not.toContain('\n\n');
    });

    test('compareWithJSON()', () => {
      const formatter = new ToonFormatter();
      const data = { project: { files: 10, tokens: 5000 } };
      const comparison = formatter.compareWithJSON(data);
      expect(comparison.toonSize).toBeGreaterThan(0);
      expect(comparison.jsonSize).toBeGreaterThan(0);
      expect(comparison.savingsPercentage).toBeDefined();
      expect(comparison.savings).toBeDefined();
      expect(comparison.toonTokens).toBeGreaterThan(0);
      expect(comparison.jsonTokens).toBeGreaterThan(0);
    });
  });

  describe('FormatRegistry', () => {
    test('List all formats', () => {
      const registry = new FormatRegistry();
      const formats = registry.listFormats();
      expect(formats.length).toBeGreaterThanOrEqual(7);
      expect(formats).toContain('toon');
      expect(formats).toContain('json');
      expect(formats).toContain('yaml');
    });

    test('Get format info', () => {
      const registry = new FormatRegistry();
      const info = registry.getInfo('toon');
      expect(info.name).toBeDefined();
      expect(info.description).toBeDefined();
      expect(info.extension).toBeDefined();
      expect(info.mimeType).toBeDefined();
    });

    test('Encode to TOON', () => {
      const registry = new FormatRegistry();
      const data = { test: 'value' };
      const output = registry.encode('toon', data);
      expect(output).toContain('test:');
    });

    test('Encode to JSON', () => {
      const registry = new FormatRegistry();
      const data = { test: 'value' };
      const output = registry.encode('json', data);
      const parsed = JSON.parse(output);
      expect(parsed.test).toBe('value');
    });

    test('Encode to YAML', () => {
      const registry = new FormatRegistry();
      const data = { test: 'value', number: 123 };
      const output = registry.encode('yaml', data);
      expect(output).toContain('test:');
      expect(output).toContain('value');
    });

    test('Encode to CSV', () => {
      const registry = new FormatRegistry();
      const data = {
        methods: {
          'file.js': [
            { name: 'func1', line: 10, tokens: 100 },
            { name: 'func2', line: 20, tokens: 200 },
          ],
        },
      };
      const output = registry.encode('csv', data);
      expect(output).toContain('File,Method,Line,Tokens');
      expect(output).toContain('func1');
    });

    test('Encode to XML', () => {
      const registry = new FormatRegistry();
      const data = { test: 'value' };
      const output = registry.encode('xml', data);
      expect(output).toContain('<?xml');
      expect(output).toContain('<context>');
      expect(output).toContain('</context>');
    });

    test('Encode to Markdown', () => {
      const registry = new FormatRegistry();
      const data = {
        project: { root: 'test-project', totalFiles: 10, totalTokens: 5000 },
      };
      const output = registry.encode('markdown', data);
      expect(output).toContain('# test-project');
      expect(output).toContain('## Project Summary');
    });
  });

  describe('FormatConverter', () => {
    test('JSON to TOON conversion', () => {
      const converter = new FormatConverter();
      const jsonInput = '{"test": "value", "number": 123}';
      const result = converter.convert(jsonInput, 'json', 'toon');
      expect(result.output).toBeDefined();
      expect(result.output).toContain('test:');
      expect(result.metadata).toBeDefined();
      expect(result.metadata.savingsPercentage).toBeDefined();
    });

    test('JSON to YAML conversion', () => {
      const converter = new FormatConverter();
      const jsonInput = '{"test": "value"}';
      const result = converter.convert(jsonInput, 'json', 'yaml');
      expect(result.output).toBeDefined();
      expect(result.output).toContain('test:');
      expect(result.metadata).toBeDefined();
    });

    test('CSV parsing', () => {
      const converter = new FormatConverter();
      const csvInput = 'Name,Age\nJohn,30\nJane,25';
      const parsed = converter.parseCSV(csvInput);
      expect(parsed.headers.length).toBe(2);
      expect(parsed.rows.length).toBe(2);
      expect(parsed.rows[0].Name).toBe('John');
    });

    test('Extension to format mapping', () => {
      const converter = new FormatConverter();
      expect(converter.extensionToFormat('json')).toBe('json');
      expect(converter.extensionToFormat('toon')).toBe('toon');
      expect(converter.extensionToFormat('yaml')).toBe('yaml');
      expect(converter.extensionToFormat('csv')).toBe('csv');
    });

    test('Get supported conversions', () => {
      const converter = new FormatConverter();
      const supported = converter.getSupportedConversions();
      expect(supported.fullySupported.length).toBeGreaterThan(0);
      expect(Array.isArray(supported.partialSupport)).toBe(true);
      expect(Array.isArray(supported.planned)).toBe(true);
    });
  });

  describe('GitIngest Chunking', () => {
    test('Basic instantiation', () => {
      const formatter = new GitIngestFormatter(
        process.cwd(),
        { totalFiles: 10, totalTokens: 5000 },
        []
      );
      expect(formatter).not.toBeNull();
    });

    test('Chunking configuration', () => {
      const options = {
        chunking: {
          enabled: true,
          strategy: 'smart',
          maxTokensPerChunk: 50000,
          overlap: 1000,
        },
      };
      const formatter = new GitIngestFormatter(process.cwd(), {}, [], options);
      expect(formatter.chunking.enabled).toBe(true);
      expect(formatter.chunking.strategy).toBe('smart');
      expect(formatter.chunking.maxTokensPerChunk).toBe(50000);
      expect(formatter.chunking.overlap).toBe(1000);
    });

    test('Chunk overlap enabled', () => {
      const options = {
        chunking: { enabled: true, overlap: 500 },
      };
      const formatter = new GitIngestFormatter(process.cwd(), {}, [], options);
      expect(formatter.chunking.overlap).toBe(500);
    });

    test('Metadata inclusion', () => {
      const options = {
        chunking: { includeMetadata: true, crossReferences: true },
      };
      const formatter = new GitIngestFormatter(process.cwd(), {}, [], options);
      expect(formatter.chunking.includeMetadata).toBe(true);
      expect(formatter.chunking.crossReferences).toBe(true);
    });
  });

  describe('ErrorHandler', () => {
    test('Instance creation', () => {
      const handler = new ErrorHandler();
      expect(handler).not.toBeNull();
    });

    test('Verbose mode', () => {
      const handler = new ErrorHandler({ verbose: true });
      expect(handler.verbose).toBe(true);
    });

    test('Format validation - valid format', () => {
      const handler = new ErrorHandler();
      const formats = ['json', 'toon', 'yaml'];
      expect(() => handler.validateFormat('json', formats)).not.toThrow();
      expect(() => handler.validateFormat('toon', formats)).not.toThrow();
    });

    test('Format validation - invalid format', () => {
      const handler = new ErrorHandler();
      const formats = ['json', 'toon'];
      expect(() => handler.validateFormat('invalid', formats)).toThrow('Unsupported format');
    });

    test('Create user message', () => {
      const handler = new ErrorHandler();
      const error = new Error('Test error');
      error.code = 'ENOENT';
      const message = handler.createUserMessage(error, 'File operation');
      expect(message).toContain('File not found');
      expect(message).toContain('File operation');
    });

    test('Wrap async function', () => {
      const handler = new ErrorHandler();
      const asyncFn = async () => {
        return 'success';
      };
      const wrapped = handler.wrapAsync(asyncFn, 'Test context');
      expect(typeof wrapped).toBe('function');
    });
  });
});

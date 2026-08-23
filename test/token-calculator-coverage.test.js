import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import TokenCalculator from '../lib/analyzers/token-calculator.js';
import fs from 'fs';
import _path from 'path';
import readline from 'readline';
import ClipboardUtils from '../lib/utils/clipboard-utils.js';
import GitIngestFormatter from '../lib/formatters/gitingest-formatter.js';

vi.mock('fs');
vi.mock('readline');
vi.mock('../lib/utils/clipboard-utils.js');
vi.mock('../lib/formatters/gitingest-formatter.js');
vi.mock('../lib/utils/token-utils.js', () => ({
  default: {
    calculate: vi.fn().mockReturnValue(10),
    hasExactCounting: vi.fn().mockReturnValue(true),
  },
}));
vi.mock('../lib/utils/config-utils.js', () => ({
  default: {
    initGitIgnore: () => ({
      isIgnored: vi.fn().mockReturnValue(false),
      patterns: [],
      contextPatterns: [],
    }),
    initMethodFilter: () => ({
      shouldIncludeMethod: vi.fn().mockReturnValue(true),
      hasIncludeFile: false,
    }),
    findConfigFile: vi.fn(),
  },
}));

describe('TokenCalculator Coverage', () => {
  let calculator;
  let consoleLogSpy;
  let consoleErrorSpy;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Mock fs calls
    fs.statSync.mockReturnValue({
      isDirectory: () => false,
      size: 100,
      mtime: new Date(),
    });
    fs.readFileSync.mockReturnValue('content');
    fs.readdirSync.mockReturnValue([]);

    calculator = new TokenCalculator('/test/root');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Method Analysis', () => {
    test('analyzes file methods when enabled', () => {
      calculator = new TokenCalculator('/test/root', { methodLevel: true });

      // Mock MethodAnalyzer
      calculator.methodAnalyzer = {
        extractMethods: vi.fn().mockReturnValue([{ name: 'testMethod', line: 1 }]),
        extractMethodContent: vi.fn().mockReturnValue('method content'),
      };

      const result = calculator.analyzeFileMethods('content', 'test.js');

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('testMethod');
      expect(calculator.methodStats.includedMethods).toBe(1);
    });

    test('filters methods based on config', () => {
      calculator = new TokenCalculator('/test/root', { methodLevel: true });

      calculator.methodFilter.shouldIncludeMethod.mockReturnValue(false);
      calculator.methodAnalyzer = {
        extractMethods: vi.fn().mockReturnValue([{ name: 'ignoredMethod' }]),
      };

      const result = calculator.analyzeFileMethods('content', 'test.js');
      expect(result).toHaveLength(0);
    });
  });

  describe('Context Generation', () => {
    test('generates method context', () => {
      calculator = new TokenCalculator('/test/root', { methodLevel: true });
      const analysisResults = [
        {
          relativePath: 'test.js',
          methods: [{ name: 'foo', tokens: 5 }],
        },
      ];

      const context = calculator.generateLLMContext(analysisResults);
      expect(context.methods['test.js']).toBeDefined();
      expect(context.methods['test.js'][0].name).toBe('foo');
    });

    test('generates compact paths context', () => {
      const analysisResults = [
        { relativePath: 'src/a.js', tokens: 10 },
        { relativePath: 'src/b.js', tokens: 20 },
      ];

      const context = calculator.generateLLMContext(analysisResults);
      expect(context.paths['src/']).toEqual(expect.arrayContaining(['a.js', 'b.js']));
    });
  });

  describe('Export Handling', () => {
    test('exports to clipboard successfully', () => {
      ClipboardUtils.copy.mockReturnValue(true);
      calculator.exportContextToClipboard({});
      expect(ClipboardUtils.copy).toHaveBeenCalled();
      expect(consoleLogSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('saved to llm-context.json')
      );
    });

    test('falls back to file when clipboard fails', () => {
      ClipboardUtils.copy.mockReturnValue(false);
      calculator.exportContextToClipboard({});
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('llm-context.json'),
        expect.any(String)
      );
    });

    test('saves detailed report', () => {
      calculator.saveDetailedReport([]);
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('token-analysis-report.json'),
        expect.any(String)
      );
    });

    test('saves GitIngest digest', () => {
      GitIngestFormatter.prototype.saveToFile.mockReturnValue(1024);
      calculator.saveGitIngestDigest([]);
      expect(GitIngestFormatter.prototype.saveToFile).toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('GitIngest digest saved'));
    });
  });

  describe('Prompt Interaction', () => {
    test('handles user choice 1 (Detailed Report)', () => {
      const mockRl = {
        question: vi.fn((q, cb) => cb('1')),
        close: vi.fn(),
      };
      readline.createInterface.mockReturnValue(mockRl);

      const saveSpy = vi.spyOn(calculator, 'saveDetailedReport').mockImplementation(() => {});

      calculator.promptForExport([]);

      expect(saveSpy).toHaveBeenCalled();
      expect(mockRl.close).toHaveBeenCalled();
    });

    test('handles user choice 5 (Skip)', () => {
      const mockRl = {
        question: vi.fn((q, cb) => cb('5')),
        close: vi.fn(),
      };
      readline.createInterface.mockReturnValue(mockRl);

      calculator.promptForExport([]);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('No export selected'));
    });

    test('handles invalid input', () => {
      const mockRl = {
        question: vi.fn((q, cb) => cb('invalid')),
        close: vi.fn(),
      };
      readline.createInterface.mockReturnValue(mockRl);

      calculator.promptForExport([]);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid option'));
    });
  });

  describe('Directory Scanning', () => {
    test('counts ignored files', () => {
      calculator.gitIgnore.isIgnored.mockReturnValue(true);
      fs.readdirSync.mockReturnValue(['ignored.js']);

      calculator.scanDirectory('/test/root');

      expect(calculator.stats.ignoredFiles).toBe(1);
    });

    test('handles scan errors gracefully', () => {
      fs.readdirSync.mockImplementation(() => {
        throw new Error('Access denied');
      });
      calculator.scanDirectory('/test/root');
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error scanning directory'),
        expect.any(String)
      );
    });
  });
});

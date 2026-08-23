import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import TokenCalculator from '../lib/analyzers/token-calculator.js';
import fs from 'fs';
import _path from 'path';
import readline from 'readline';
import ConfigUtils from '../lib/utils/config-utils.js';
import TokenUtils from '../lib/utils/token-utils.js';
import _GitIgnoreParser from '../lib/parsers/gitignore-parser.js';

vi.mock('fs');
vi.mock('readline');
vi.mock('../lib/utils/config-utils.js');
vi.mock('../lib/utils/token-utils.js');
vi.mock('../lib/parsers/gitignore-parser.js', () => ({
  default: class {
    constructor() {
      this.patterns = [];
      this.contextPatterns = [];
      this.hasIncludeFile = false;
      this._lastIgnoreReason = null;
    }
    isIgnored() {
      return false;
    }
  },
}));

describe('TokenCalculator Advanced Coverage', () => {
  let calculator;
  let consoleLogSpy;
  const mockProjectRoot = '/mock/project';

  beforeEach(() => {
    vi.clearAllMocks();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    // Default mocks
    fs.existsSync.mockReturnValue(true);
    fs.statSync.mockReturnValue({ isDirectory: () => false, size: 100 });
    fs.readdirSync.mockReturnValue([]);

    ConfigUtils.findConfigFile.mockReturnValue(null);
    // Mock initGitIgnore to return a mock object
    ConfigUtils.initGitIgnore.mockReturnValue({
      patterns: [],
      contextPatterns: [],
      hasIncludeFile: false,
      _lastIgnoreReason: null,
      isIgnored: vi.fn().mockReturnValue(false),
    });
    ConfigUtils.initMethodFilter.mockReturnValue(null);

    TokenUtils.hasExactCounting.mockReturnValue(false);

    calculator = new TokenCalculator(mockProjectRoot);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  describe('Ignored Files Counting', () => {
    test('countIgnoredFiles tracks calculator-specific ignores', () => {
      // Mock gitIgnore to simulate calculator ignore reason
      calculator.gitIgnore = {
        _lastIgnoreReason: 'calculator',
        isIgnored: () => true,
      };

      // Mock directory structure for recursion
      fs.statSync.mockImplementation((p) => {
        if (p.endsWith('dir')) return { isDirectory: () => true };
        return { isDirectory: () => false };
      });

      fs.readdirSync.mockReturnValue(['file.txt']);

      // Test directory case
      calculator.countIgnoredFiles('/mock/project/dir');
      expect(calculator.stats.calculatorIgnoredFiles).toBeGreaterThan(0);

      // Test file case
      calculator.countIgnoredFiles('/mock/project/file.txt');
      expect(calculator.stats.calculatorIgnoredFiles).toBeGreaterThan(1);
    });
  });

  describe('Method Context Generation', () => {
    test('generateLLMContext includes method stats', () => {
      calculator.options.methodLevel = true;
      calculator.methodStats = {
        totalMethods: 10,
        includedMethods: 5,
        methodTokens: { 'a.method': 100, 'b.method': 200 },
      };

      const analysisResults = [
        { relativePath: 'a.js', methods: [{ name: 'method', line: 1, tokens: 100 }] },
      ];

      const context = calculator.generateLLMContext(analysisResults);

      expect(context.methodStats).toBeDefined();
      expect(context.methodStats.totalMethodTokens).toBe(300);
    });
  });

  describe('Export Prompt', () => {
    test('promptForExport handles empty input (default skip)', () => {
      const mockRl = {
        question: vi.fn((q, cb) => cb('')),
        close: vi.fn(),
      };
      readline.createInterface.mockReturnValue(mockRl);

      calculator.promptForExport([]);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('No export selected'));
      expect(mockRl.close).toHaveBeenCalled();
    });
  });

  describe('Reporting & Logging', () => {
    test('printHeader logs calculator config mode', () => {
      ConfigUtils.findConfigFile.mockReturnValue('/mock/project/.contextinclude');
      // We need to ensure gitIgnore has the property.
      // The constructor initializes gitIgnore. We should modify it.
      Object.defineProperty(calculator.gitIgnore, 'hasIncludeFile', {
        value: true,
        writable: true,
      });

      calculator.printHeader();

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('using INCLUDE mode'));
    });

    test('printHeader logs method filtering mode', () => {
      calculator.options.methodLevel = true;
      calculator.methodFilter = { hasIncludeFile: true };

      calculator.printHeader();

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Method filtering: INCLUDE mode')
      );
    });

    test('printScanResults logs calculator ignored files', () => {
      calculator.stats.calculatorIgnoredFiles = 5;
      // Ensure hasIncludeFile is set on gitIgnore
      Object.defineProperty(calculator.gitIgnore, 'hasIncludeFile', {
        value: true,
        writable: true,
      });

      calculator.printScanResults([]);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Filtered 5 additional files')
      );
    });

    test('printScanResults logs method stats', () => {
      calculator.options.methodLevel = true;
      calculator.methodStats = { totalMethods: 10, includedMethods: 5 };

      calculator.printScanResults([]);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Total methods found: 10')
      );
    });
  });

  describe('Detailed Report', () => {
    test('saveDetailedReport includes correct metadata', () => {
      // Mock gitIgnore properties
      Object.defineProperty(calculator.gitIgnore, 'patterns', {
        value: [{ original: '*.log' }],
        writable: true,
      });
      Object.defineProperty(calculator.gitIgnore, 'contextPatterns', {
        value: [{ original: '*.test.js' }],
        writable: true,
      });

      calculator.saveDetailedReport([]);

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('token-analysis-report.json'),
        expect.stringContaining('*.log')
      );
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('token-analysis-report.json'),
        expect.stringContaining('*.test.js')
      );
    });
  });
});

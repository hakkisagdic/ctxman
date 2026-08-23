import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import TokenCalculator from '../lib/analyzers/token-calculator.js';
import TokenUtils from '../lib/utils/token-utils.js';
import ConfigUtils from '../lib/utils/config-utils.js';
import { LLMDetector } from '../lib/utils/llm-detector.js';
import ClipboardUtils from '../lib/utils/clipboard-utils.js';
import fs from 'fs';
import readline from 'readline';

const { mockRl } = vi.hoisted(() => {
  return {
    mockRl: {
      question: vi.fn(),
      close: vi.fn(),
      on: vi.fn(),
    },
  };
});

vi.mock('fs');
vi.mock('readline', () => ({
  default: {
    createInterface: vi.fn(() => mockRl),
  },
}));
vi.mock('../lib/utils/token-utils.js');
vi.mock('../lib/utils/config-utils.js');
vi.mock('../lib/utils/llm-detector.js');
vi.mock('../lib/utils/clipboard-utils.js');
vi.mock('../lib/formatters/gitingest-formatter.js', () => ({
  default: class {
    saveToFile() {
      return 1024;
    }
  },
}));

describe('TokenCalculator Output & Orchestration', () => {
  let calculator;
  const mockProjectRoot = '/mock/project';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    // Setup default mocks
    ConfigUtils.initGitIgnore.mockReturnValue({
      isIgnored: vi.fn().mockReturnValue(false),
      patterns: [],
      contextPatterns: [],
    });
    ConfigUtils.initMethodFilter.mockReturnValue(null);
    ConfigUtils.findConfigFile.mockReturnValue(null);
    TokenUtils.calculate.mockReturnValue(10);
    TokenUtils.hasExactCounting.mockReturnValue(true);
    TokenUtils.format.mockImplementation((n) => n.toString());

    fs.statSync.mockReturnValue({
      isDirectory: () => false,
      size: 100,
    });
    fs.readFileSync.mockReturnValue('content');
    fs.readdirSync.mockReturnValue(['file1.js', 'file2.js']);

    calculator = new TokenCalculator(mockProjectRoot);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('run()', () => {
    test('executes full analysis flow', () => {
      const stats = calculator.run();

      expect(stats.totalFiles).toBe(2);
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Analyzing project'));
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('PROJECT TOKEN ANALYSIS REPORT')
      );
    });

    test('skips exports in dashboard mode', () => {
      calculator = new TokenCalculator(mockProjectRoot, { dashboard: true });
      const spy = vi.spyOn(calculator, 'handleExports');

      calculator.run();

      expect(spy).not.toHaveBeenCalled();
    });

    test('prints context fit analysis if target model specified', () => {
      calculator = new TokenCalculator(mockProjectRoot, { targetModel: 'gpt-4' });
      LLMDetector.getProfile.mockReturnValue({});
      LLMDetector.analyzeContextFit.mockReturnValue({});
      LLMDetector.formatAnalysis.mockReturnValue('Fit Analysis');

      calculator.run();

      expect(console.log).toHaveBeenCalledWith('Fit Analysis');
    });
  });

  describe('Print Methods', () => {
    test('printHeader shows correct info', () => {
      calculator.printHeader();
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Analyzing project'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Exact (using tiktoken)'));
    });

    test('printScanResults shows file counts', () => {
      calculator.stats.ignoredFiles = 5;
      calculator.printScanResults(['a', 'b']);
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Found 2 text files'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Ignored 5 files'));
    });

    test('printReport shows detailed stats', () => {
      calculator.stats = {
        totalFiles: 10,
        totalTokens: 1000,
        totalBytes: 2048,
        totalLines: 100,
        ignoredFiles: 2,
        calculatorIgnoredFiles: 1,
        byExtension: { '.js': { count: 5, tokens: 500, bytes: 1024, lines: 50 } },
        byDirectory: { src: { count: 5, tokens: 500, bytes: 1024, lines: 50 } },
        largestFiles: [{ relativePath: 'a.js', tokens: 100, sizeBytes: 200, lines: 10 }],
      };

      calculator.printReport();

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Total files analyzed: 10'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Total tokens: 1,000'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('BY FILE TYPE'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('TOP 5 LARGEST FILES'));
    });
  });

  describe('Export Handling', () => {
    test('handleExports saves report if requested', () => {
      calculator = new TokenCalculator(mockProjectRoot, { saveReport: true });
      const spy = vi.spyOn(calculator, 'saveDetailedReport');

      calculator.handleExports([]);

      expect(spy).toHaveBeenCalled();
    });

    test('handleExports saves context if requested', () => {
      calculator = new TokenCalculator(mockProjectRoot, { contextExport: true });
      const spy = vi.spyOn(calculator, 'saveContextToFile');

      calculator.handleExports([]);

      expect(spy).toHaveBeenCalled();
    });

    test('handleExports copies to clipboard if requested', () => {
      calculator = new TokenCalculator(mockProjectRoot, { contextToClipboard: true });
      const spy = vi.spyOn(calculator, 'exportContextToClipboard');

      calculator.handleExports([]);

      expect(spy).toHaveBeenCalled();
    });

    test('handleExports generates gitingest if requested', () => {
      calculator = new TokenCalculator(mockProjectRoot, { gitingest: true });
      const spy = vi.spyOn(calculator, 'saveGitIngestDigest');

      calculator.handleExports([]);

      expect(spy).toHaveBeenCalled();
    });

    test('handleExports prompts if no option selected', () => {
      calculator = new TokenCalculator(mockProjectRoot, {});
      const spy = vi.spyOn(calculator, 'promptForExport');

      calculator.handleExports([]);

      expect(spy).toHaveBeenCalled();
    });
  });

  describe('Prompt Interaction', () => {
    test('promptForExport handles option 1 (Save Report)', () => {
      mockRl.question.mockImplementation((q, cb) => cb('1'));
      const spy = vi.spyOn(calculator, 'saveDetailedReport');

      calculator.promptForExport([]);

      expect(spy).toHaveBeenCalled();
      expect(mockRl.close).toHaveBeenCalled();
    });

    test('promptForExport handles option 2 (Save Context)', () => {
      mockRl.question.mockImplementation((q, cb) => cb('2'));
      const spy = vi.spyOn(calculator, 'saveContextToFile');

      calculator.promptForExport([]);

      expect(spy).toHaveBeenCalled();
    });

    test('promptForExport handles option 3 (Clipboard)', () => {
      mockRl.question.mockImplementation((q, cb) => cb('3'));
      const spy = vi.spyOn(calculator, 'exportContextToClipboard');

      calculator.promptForExport([]);

      expect(spy).toHaveBeenCalled();
    });

    test('promptForExport handles option 4 (GitIngest)', () => {
      mockRl.question.mockImplementation((q, cb) => cb('4'));
      const spy = vi.spyOn(calculator, 'saveGitIngestDigest');

      calculator.promptForExport([]);

      expect(spy).toHaveBeenCalled();
    });

    test('promptForExport handles option 5 (Skip)', () => {
      mockRl.question.mockImplementation((q, cb) => cb('5'));

      calculator.promptForExport([]);

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('No export selected'));
      expect(mockRl.close).toHaveBeenCalled();
    });

    test('promptForExport handles invalid input', () => {
      mockRl.question.mockImplementation((q, cb) => cb('invalid'));

      calculator.promptForExport([]);

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Invalid option'));
      expect(mockRl.close).toHaveBeenCalled();
    });
  });
});

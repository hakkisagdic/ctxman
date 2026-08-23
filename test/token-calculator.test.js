import { describe, test, expect, vi, beforeEach, _afterEach } from 'vitest';
import TokenCalculator from '../lib/analyzers/token-calculator.js';
import TokenUtils from '../lib/utils/token-utils.js';
import ConfigUtils from '../lib/utils/config-utils.js';
import FileUtils from '../lib/utils/file-utils.js';
import { LLMDetector } from '../lib/utils/llm-detector.js';
import fs from 'fs';
import path from 'path';

// Mock dependencies
vi.mock('fs');
vi.mock('../lib/utils/token-utils.js');
vi.mock('../lib/utils/config-utils.js');
vi.mock('../lib/utils/file-utils.js');
vi.mock('../lib/utils/llm-detector.js');
vi.mock('../lib/parsers/gitignore-parser.js', () => {
  return {
    default: class {
      constructor() {
        this.patterns = [];
        this.contextPatterns = [];
        this._lastIgnoreReason = '';
      }
      isIgnored(path) {
        return path.includes('ignored');
      }
    },
  };
});

describe('TokenCalculator', () => {
  let calculator;
  const mockProjectRoot = '/mock/project';

  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock implementations
    ConfigUtils.initGitIgnore.mockReturnValue({
      isIgnored: vi.fn().mockReturnValue(false),
      patterns: [],
      contextPatterns: [],
      _lastIgnoreReason: '',
    });
    ConfigUtils.initMethodFilter.mockReturnValue(null);
    TokenUtils.calculate.mockReturnValue(10);
    FileUtils.isText.mockReturnValue(true);
    FileUtils.isCode.mockReturnValue(true);

    // Mock fs
    fs.statSync.mockReturnValue({
      size: 100,
      isDirectory: () => false,
    });
    fs.readFileSync.mockReturnValue('mock content');
    fs.readdirSync.mockReturnValue([]);

    calculator = new TokenCalculator(mockProjectRoot);
  });

  describe('analyzeFile', () => {
    test('analyzes file correctly', () => {
      const result = calculator.analyzeFile('/mock/project/test.js');

      expect(result).toHaveProperty('path', '/mock/project/test.js');
      expect(result).toHaveProperty('tokens', 10);
      expect(result).toHaveProperty('sizeBytes', 100);
      expect(result).toHaveProperty('extension', '.js');
    });

    test('handles read errors gracefully', () => {
      fs.readFileSync.mockImplementation(() => {
        throw new Error('Read error');
      });

      const result = calculator.analyzeFile('/mock/project/error.js');

      expect(result).toHaveProperty('error', 'Read error');
      expect(result.tokens).toBe(0);
    });

    test('performs method-level analysis when enabled', () => {
      calculator = new TokenCalculator(mockProjectRoot, { methodLevel: true });
      // Mock method analyzer extraction
      calculator.methodAnalyzer.extractMethods = vi
        .fn()
        .mockReturnValue([{ name: 'testMethod', line: 1 }]);
      calculator.methodAnalyzer.extractMethodContent = vi.fn().mockReturnValue('method content');

      const result = calculator.analyzeFile('/mock/project/test.js');

      expect(result).toHaveProperty('methods');
      expect(result.methods).toHaveLength(1);
      expect(result.methods[0].name).toBe('testMethod');
    });
  });

  describe('scanDirectory', () => {
    test('scans directory recursively', () => {
      fs.readdirSync.mockReturnValue(['file1.js', 'subdir']);
      fs.statSync.mockImplementation((path) => ({
        isDirectory: () => path.endsWith('subdir'),
        size: 100,
      }));

      // Mock subdir scan
      const originalScan = calculator.scanDirectory.bind(calculator);
      vi.spyOn(calculator, 'scanDirectory').mockImplementation((dir) => {
        if (dir.endsWith('subdir')) return ['/mock/project/subdir/file2.js'];
        return originalScan(dir);
      });

      const files = calculator.scanDirectory(mockProjectRoot);
      expect(files).toContain(path.join(mockProjectRoot, 'file1.js'));
    });

    test('handles scan errors gracefully', () => {
      fs.readdirSync.mockImplementation(() => {
        throw new Error('Access denied');
      });
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const files = calculator.scanDirectory(mockProjectRoot);

      expect(files).toEqual([]);
      expect(consoleSpy).toHaveBeenCalled();
    });

    test('respects gitignore', () => {
      calculator.gitIgnore.isIgnored.mockReturnValue(true);
      fs.readdirSync.mockReturnValue(['ignored.js']);

      const files = calculator.scanDirectory(mockProjectRoot);
      expect(files).toHaveLength(0);
      expect(calculator.stats.ignoredFiles).toBe(1);
    });
  });

  describe('generateLLMContext', () => {
    const mockResults = [
      { relativePath: 'src/a.js', tokens: 100 },
      { relativePath: 'src/b.js', tokens: 50 },
      { relativePath: 'root.js', tokens: 20 },
    ];

    test('generates compact paths context', () => {
      const context = calculator.generateLLMContext(mockResults);

      expect(context).toHaveProperty('project');
      expect(context).toHaveProperty('paths');
      expect(context.paths).toHaveProperty('src/');
      expect(context.paths['src/']).toContain('a.js');
    });

    test('generates method-level context', () => {
      calculator.options.methodLevel = true;
      const methodResults = [
        {
          relativePath: 'test.js',
          methods: [{ name: 'func', tokens: 10 }],
        },
      ];

      const context = calculator.generateLLMContext(methodResults);

      expect(context).toHaveProperty('methods');
      expect(context.methods).toHaveProperty('test.js');
    });
  });

  describe('Reporting', () => {
    test('saveDetailedReport writes to file', () => {
      const _consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      calculator.saveDetailedReport([]);

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('token-analysis-report.json'),
        expect.any(String)
      );
    });

    test('saveContextToFile writes to file', () => {
      const _consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      calculator.saveContextToFile({});

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('llm-context.json'),
        expect.any(String)
      );
    });
  });

  describe('Context Fit Analysis', () => {
    test('prints analysis when target model is set', () => {
      calculator.options.targetModel = 'gpt-4';
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      LLMDetector.getProfile.mockReturnValue({});
      LLMDetector.analyzeContextFit.mockReturnValue({});
      LLMDetector.formatAnalysis.mockReturnValue('Analysis Output');

      calculator.printContextFitAnalysis();

      expect(consoleSpy).toHaveBeenCalledWith('Analysis Output');
    });

    test('handles analysis errors gracefully', () => {
      calculator.options.targetModel = 'gpt-4';
      LLMDetector.getProfile.mockImplementation(() => {
        throw new Error('Profile error');
      });

      expect(() => calculator.printContextFitAnalysis()).not.toThrow();
    });
  });
});

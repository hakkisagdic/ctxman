import { describe, test, expect } from 'vitest';
import _fs from 'fs';
import path from 'path';
import GitIngestFormatter from '../lib/formatters/gitingest-formatter.js';
import TokenCalculator from '../lib/analyzers/token-calculator.js';

describe('GitIngest Integration', () => {
  describe('GitIngestFormatter Class', () => {
    test('class is exported', () => {
      expect(GitIngestFormatter).toBeDefined();
    });

    test('can create instance', () => {
      const mockStats = {
        totalFiles: 3,
        totalTokens: 9353,
        totalBytes: 40000,
        totalLines: 1163,
      };

      const mockAnalysisResults = [
        {
          path: '/test/file1.js',
          relativePath: 'src/file1.js',
          tokens: 5000,
          lines: 100,
          sizeBytes: 20000,
        },
        {
          path: '/test/file2.js',
          relativePath: 'src/file2.js',
          tokens: 3000,
          lines: 80,
          sizeBytes: 15000,
        },
        {
          path: '/test/file3.js',
          relativePath: 'lib/file3.js',
          tokens: 1353,
          lines: 50,
          sizeBytes: 5000,
        },
      ];

      const formatter = new GitIngestFormatter(process.cwd(), mockStats, mockAnalysisResults);

      expect(formatter).toBeDefined();
    });
  });

  describe('Token Count Formatting', () => {
    let formatter;

    beforeEach(() => {
      const mockStats = { totalFiles: 1, totalTokens: 1000 };
      formatter = new GitIngestFormatter(process.cwd(), mockStats, []);
    });

    test('formats thousands with k suffix', () => {
      const result = formatter.formatTokenCount(1500);
      expect(result).toBe('1.5K');
    });

    test('formats millions with M suffix', () => {
      const result = formatter.formatTokenCount(1500000);
      expect(result).toBe('1.5M');
    });

    test('formats small numbers without suffix', () => {
      const result = formatter.formatTokenCount(500);
      expect(result).toBe('500');
    });
  });

  describe('Summary Generation', () => {
    test('includes file count', () => {
      const mockStats = {
        totalFiles: 3,
        totalTokens: 9353,
        totalBytes: 40000,
        totalLines: 1163,
      };

      const formatter = new GitIngestFormatter(process.cwd(), mockStats, []);
      const summary = formatter.generateSummary();

      expect(summary).toContain('Files analyzed: 3');
    });

    test('includes token count', () => {
      const mockStats = {
        totalFiles: 3,
        totalTokens: 9353,
        totalBytes: 40000,
        totalLines: 1163,
      };

      const formatter = new GitIngestFormatter(process.cwd(), mockStats, []);
      const summary = formatter.generateSummary();

      expect(summary).toContain('Estimated tokens: 9.4K');
    });
  });

  describe('File Tree Building', () => {
    test('builds tree with directories', () => {
      const mockAnalysisResults = [
        { relativePath: 'src/file1.js', tokens: 5000 },
        { relativePath: 'src/file2.js', tokens: 3000 },
        { relativePath: 'lib/file3.js', tokens: 1353 },
      ];

      const mockStats = { totalFiles: 3, totalTokens: 9353 };
      const formatter = new GitIngestFormatter(process.cwd(), mockStats, mockAnalysisResults);

      const tree = formatter.buildFileTree();

      expect(tree.children.src).toBeDefined();
      expect(tree.children.lib).toBeDefined();
    });
  });

  describe('Tree Generation', () => {
    test('includes directory structure header', () => {
      const mockAnalysisResults = [{ relativePath: 'src/file1.js', tokens: 5000 }];

      const mockStats = { totalFiles: 1, totalTokens: 5000 };
      const formatter = new GitIngestFormatter(process.cwd(), mockStats, mockAnalysisResults);

      const treeOutput = formatter.generateTree();

      expect(treeOutput).toContain('Directory structure:');
    });

    test('includes directory paths', () => {
      const mockAnalysisResults = [{ relativePath: 'src/file1.js', tokens: 5000 }];

      const mockStats = { totalFiles: 1, totalTokens: 5000 };
      const formatter = new GitIngestFormatter(process.cwd(), mockStats, mockAnalysisResults);

      const treeOutput = formatter.generateTree();

      expect(treeOutput).toContain('src/');
    });
  });

  describe('Digest Structure', () => {
    test('combines summary and tree', () => {
      const mockAnalysisResults = [{ relativePath: 'src/file1.js', tokens: 5000 }];

      const mockStats = { totalFiles: 1, totalTokens: 5000 };
      const formatter = new GitIngestFormatter(process.cwd(), mockStats, mockAnalysisResults);

      const digest = formatter.generateSummary() + '\n' + formatter.generateTree();

      expect(digest).toContain('Directory:');
    });
  });

  describe('Integration Test', () => {
    test('works with actual TokenCalculator', () => {
      const testDir = path.join(process.cwd(), 'test');
      const calculator = new TokenCalculator(testDir, { gitingest: false });

      // Scan a minimal set of files
      const files = calculator.scanDirectory(testDir).slice(0, 3);
      expect(files.length).toBeGreaterThan(0);

      const analysisResults = files.map((file) => calculator.analyzeFile(file));
      const formatter = new GitIngestFormatter(
        testDir,
        { totalFiles: files.length, totalTokens: 1000 },
        analysisResults
      );

      const digest = formatter.generateDigest();
      expect(digest).toContain('================================================');
    });
  });
});

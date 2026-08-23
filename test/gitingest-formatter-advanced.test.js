import { describe, test, expect, vi, beforeEach } from 'vitest';
import GitIngestFormatter from '../lib/formatters/gitingest-formatter.js';
import fs from 'fs';
import _path from 'path';

vi.mock('fs');
vi.mock('../lib/utils/file-utils.js', () => ({
  default: {
    isCode: vi.fn().mockReturnValue(true),
  },
}));

describe('GitIngestFormatter Advanced Coverage', () => {
  let formatter;
  const mockProjectRoot = '/mock/project';
  const mockStats = { totalFiles: 5, totalTokens: 1000 };
  const mockResults = [
    { relativePath: 'src/a.js', path: '/mock/project/src/a.js', tokens: 100 },
    { relativePath: 'src/b.js', path: '/mock/project/src/b.js', tokens: 200 },
    { relativePath: 'src/utils/c.js', path: '/mock/project/src/utils/c.js', tokens: 150 },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    formatter = new GitIngestFormatter(mockProjectRoot, mockStats, mockResults);
  });

  describe('Navigation & Metadata', () => {
    test('generateNavigationInfo creates correct links', () => {
      const nav = formatter.generateNavigationInfo(1, 5);
      expect(nav).toContain('Previous: chunk-1.txt');
      expect(nav).toContain('Next: chunk-3.txt');
      expect(nav).toContain('Current Position: 2 / 5');
    });

    test('generateNavigationInfo handles first chunk', () => {
      const nav = formatter.generateNavigationInfo(0, 5);
      expect(nav).not.toContain('Previous:');
      expect(nav).toContain('Next: chunk-2.txt');
    });

    test('generateNavigationInfo handles last chunk', () => {
      const nav = formatter.generateNavigationInfo(4, 5);
      expect(nav).toContain('Previous: chunk-4.txt');
      expect(nav).not.toContain('Next:');
    });

    test('generateChunkSummary includes directory info', () => {
      const chunk = {
        files: mockResults,
        tokens: 450,
        metadata: { directory: 'src' },
      };
      const summary = formatter.generateChunkSummary(chunk);
      expect(summary).toContain('Directory: src');
      expect(summary).toContain('Files in this chunk: 3');
    });
  });

  describe('Tree Generation', () => {
    test('generateChunkTree builds correct structure', () => {
      const chunk = { files: mockResults };
      const tree = formatter.generateChunkTree(chunk);

      expect(tree).toContain('src/');
      expect(tree).toContain('utils/');
      expect(tree).toContain('a.js');
      expect(tree).toContain('b.js');
      expect(tree).toContain('c.js');
    });

    test('buildFileTreeFromFiles handles deep nesting', () => {
      const deepFiles = [{ relativePath: 'a/b/c/d/e.js', tokens: 10 }];
      const tree = formatter.buildFileTreeFromFiles(deepFiles);
      expect(
        tree.children['a'].children['b'].children['c'].children['d'].children['e.js']
      ).toBeDefined();
    });
  });

  describe('File Content Generation', () => {
    test('generateChunkFileContents handles read errors', () => {
      const chunk = { files: [mockResults[0]] };
      fs.readFileSync.mockImplementation(() => {
        throw new Error('Read permission denied');
      });

      const content = formatter.generateChunkFileContents(chunk);
      expect(content).toContain('Error reading file: Read permission denied');
    });

    test('generateChunkFileContents applies method filtering', () => {
      formatter.methodFilterEnabled = true;
      formatter.methodFilter = {
        shouldIncludeMethod: vi.fn().mockReturnValue(true),
      };
      formatter.methodAnalyzer = {
        extractMethods: vi.fn().mockReturnValue([{ name: 'testMethod', line: 10 }]),
      };

      // Mock extractMethodBlock to return something
      formatter.extractMethodBlock = vi.fn().mockReturnValue('function testMethod() {}');

      const chunk = { files: [mockResults[0]] };
      fs.readFileSync.mockReturnValue('file content');

      const content = formatter.generateChunkFileContents(chunk);
      expect(content).toContain('// Method: testMethod');
      expect(content).toContain('function testMethod() {}');
    });

    test('generateFilteredFileContent returns note when no methods match', () => {
      formatter.methodFilterEnabled = true;
      formatter.methodFilter = {
        shouldIncludeMethod: vi.fn().mockReturnValue(false),
      };
      formatter.methodAnalyzer = {
        extractMethods: vi.fn().mockReturnValue([{ name: 'ignoredMethod', line: 10 }]),
      };

      const content = formatter.generateFilteredFileContent('content', 'file.js');
      expect(content).toContain('// No methods matched the filter criteria');
    });
  });

  describe('Method Extraction Logic', () => {
    test('extractMethodBlock extracts block correctly', () => {
      const lines = ['function test() {', '  console.log("hi");', '}', 'other code'];
      const block = formatter.extractMethodBlock(lines, 0);
      expect(block).toContain('console.log("hi")');
      expect(block).toContain('}');
      expect(block).not.toContain('other code');
    });

    test('extractMethodBlock truncates long methods', () => {
      const lines = ['function long() {'];
      for (let i = 0; i < 105; i++) lines.push('  line ' + i);
      lines.push('}');

      const block = formatter.extractMethodBlock(lines, 0);
      expect(block).toContain('method too long, truncated');
    });
  });
});

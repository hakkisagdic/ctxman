import { describe, test, expect, vi, beforeEach, _afterEach } from 'vitest';
import GitIngestFormatter from '../lib/formatters/gitingest-formatter.js';
import _MethodAnalyzer from '../lib/analyzers/method-analyzer.js';
import ConfigUtils from '../lib/utils/config-utils.js';
import fs from 'fs';
import _path from 'path';

vi.mock('fs');
vi.mock('../lib/analyzers/method-analyzer.js');
vi.mock('../lib/utils/config-utils.js');
vi.mock('../lib/utils/file-utils.js', () => ({
  default: {
    isCode: vi.fn().mockReturnValue(true),
  },
}));

describe('GitIngestFormatter Coverage', () => {
  let formatter;
  const mockProjectRoot = '/mock/project';
  const mockStats = { totalFiles: 5, totalTokens: 1000 };
  const mockResults = [
    { relativePath: 'src/a.js', path: '/mock/project/src/a.js', tokens: 100 },
    { relativePath: 'src/b.js', path: '/mock/project/src/b.js', tokens: 200 },
    { relativePath: 'test/c.js', path: '/mock/project/test/c.js', tokens: 50 },
    { relativePath: 'root.js', path: '/mock/project/root.js', tokens: 300 },
    { relativePath: 'src/utils/d.js', path: '/mock/project/src/utils/d.js', tokens: 150 },
  ];

  beforeEach(() => {
    vi.clearAllMocks();

    // Default mocks
    ConfigUtils.detectMethodFilters.mockReturnValue(false);
    ConfigUtils.initMethodFilter.mockReturnValue(null);
    fs.readFileSync.mockReturnValue('mock content');

    formatter = new GitIngestFormatter(mockProjectRoot, mockStats, mockResults);
  });

  describe('Chunking Strategies', () => {
    test('createSizeBasedChunks splits correctly', () => {
      formatter = new GitIngestFormatter(mockProjectRoot, mockStats, mockResults, {
        chunking: { enabled: true, strategy: 'size', maxTokensPerChunk: 400 },
      });

      const chunks = formatter.createSizeBasedChunks();
      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks[0].tokens).toBeLessThanOrEqual(400);
    });

    test('createFileBasedChunks creates one chunk per file', () => {
      formatter = new GitIngestFormatter(mockProjectRoot, mockStats, mockResults, {
        chunking: { enabled: true, strategy: 'file' },
      });

      const chunks = formatter.createFileBasedChunks();
      expect(chunks).toHaveLength(mockResults.length);
    });

    test('createDirectoryBasedChunks groups by directory', () => {
      formatter = new GitIngestFormatter(mockProjectRoot, mockStats, mockResults, {
        chunking: { enabled: true, strategy: 'directory' },
      });

      const chunks = formatter.createDirectoryBasedChunks();
      // src, test, root (.), src/utils -> 4 directories
      // Wait, path.dirname('root.js') is '.'
      // path.dirname('src/a.js') is 'src'
      // path.dirname('src/utils/d.js') is 'src/utils'
      expect(chunks.length).toBeGreaterThanOrEqual(3);
    });

    test('createSmartChunks groups intelligently', () => {
      formatter = new GitIngestFormatter(mockProjectRoot, mockStats, mockResults, {
        chunking: { enabled: true, strategy: 'smart', maxTokensPerChunk: 500 },
      });

      const chunks = formatter.createSmartChunks();
      expect(chunks.length).toBeGreaterThan(0);
      // Should group src files together if possible
    });
  });

  describe('Chunk Overlap', () => {
    test('addChunkOverlap adds files to next chunk', () => {
      const chunks = [
        { files: [{ relativePath: 'a.js', tokens: 100 }], tokens: 100 },
        { files: [{ relativePath: 'b.js', tokens: 100 }], tokens: 100 },
      ];

      formatter = new GitIngestFormatter(mockProjectRoot, mockStats, mockResults, {
        chunking: { enabled: true, overlap: 50 },
      });

      formatter.addChunkOverlap(chunks);

      expect(chunks[1].hasOverlap).toBe(true);
      expect(chunks[1].files[0].relativePath).toBe('a.js');
    });
  });

  describe('Method Filtering', () => {
    test('generateFilteredFileContent filters methods', () => {
      formatter.methodFilterEnabled = true;
      formatter.methodAnalyzer = {
        extractMethods: vi.fn().mockReturnValue([
          { name: 'keep', line: 1 },
          { name: 'drop', line: 10 },
        ]),
      };
      formatter.methodFilter = {
        shouldIncludeMethod: vi.fn((name) => name === 'keep'),
      };

      const content = `
function keep() {
  return true;
}

function drop() {
  return false;
}
`;
      const result = formatter.generateFilteredFileContent(content, 'test.js');

      expect(result).toContain('Method: keep');
      expect(result).not.toContain('Method: drop');
    });

    test('extractMethodBlock handles braces correctly', () => {
      const lines = ['function test() {', '  if (true) {', '    return;', '  }', '}'];

      const block = formatter.extractMethodBlock(lines, 0);
      expect(block).toBe(lines.join('\n'));
    });
  });

  describe('Tree Generation', () => {
    test('buildFileTree creates correct structure', () => {
      const tree = formatter.buildFileTree();
      expect(tree.children).toHaveProperty('src');
      expect(tree.children.src.children).toHaveProperty('a.js');
    });
  });

  describe('Chunk Metadata & Navigation', () => {
    test('generateChunkMetadata includes language stats', () => {
      const chunk = {
        files: [
          { relativePath: 'a.js', tokens: 10 },
          { relativePath: 'b.py', tokens: 20 },
          { relativePath: 'c.js', tokens: 30 },
        ],
      };
      const metadata = formatter.generateChunkMetadata(chunk, 0, [chunk]);
      expect(metadata).toContain('.js: 2 files');
      expect(metadata).toContain('.py: 1 files');
    });

    test('generateChunkMetadata includes shared directories', () => {
      formatter = new GitIngestFormatter(mockProjectRoot, mockStats, mockResults, {
        chunking: { enabled: true, crossReferences: true },
      });
      const chunk1 = { files: [{ relativePath: 'src/a.js', tokens: 10 }] };
      const chunk2 = { files: [{ relativePath: 'src/b.js', tokens: 10 }] };

      const metadata = formatter.generateChunkMetadata(chunk2, 1, [chunk1, chunk2]);
      expect(metadata).toContain('Shared with previous chunk: src');
    });

    test('generateNavigationInfo formats correctly', () => {
      const nav = formatter.generateNavigationInfo(1, 3);
      expect(nav).toContain('Previous: chunk-1.txt');
      expect(nav).toContain('Next: chunk-3.txt');
      expect(nav).toContain('Current Position: 2 / 3');
    });
  });

  describe('Dependency Strategy', () => {
    test('createDependencyBasedChunks falls back to smart chunking', () => {
      formatter = new GitIngestFormatter(mockProjectRoot, mockStats, mockResults, {
        chunking: { enabled: true, strategy: 'dependency' },
      });
      const spy = vi.spyOn(formatter, 'createSmartChunks');
      formatter.createChunks();
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('Method Extraction Edge Cases', () => {
    test('extractMethodBlock truncates long methods', () => {
      const lines = Array(105).fill('line');
      lines[0] = 'function long() {';
      lines[104] = '}';

      const block = formatter.extractMethodBlock(lines, 0);
      expect(block).toContain('(method too long, truncated)');
      expect(block.split('\n').length).toBeLessThan(105);
    });
  });

  describe('File Output', () => {
    test('saveToFile writes digest to disk', () => {
      const writeSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
      formatter.saveToFile('output.txt');
      expect(writeSpy).toHaveBeenCalledWith('output.txt', expect.any(String), 'utf8');
    });
  });

  describe('Error Handling', () => {
    test('generateFileContents handles read errors', () => {
      fs.readFileSync.mockImplementation(() => {
        throw new Error('Read failed');
      });

      const content = formatter.generateFileContents();
      expect(content).toContain('Error reading file');
    });
  });
});

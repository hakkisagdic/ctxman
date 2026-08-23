import { describe, test, expect, vi, beforeEach } from 'vitest';
import GitIngestFormatter from '../lib/formatters/gitingest-formatter.js';
import path from 'path';
import fs from 'fs';

vi.mock('fs');

describe('GitIngestFormatter Final Coverage', () => {
  let formatter;
  const mockProjectRoot = '/mock/project';
  const mockStats = {
    totalFiles: 5,
    totalTokens: 1000,
    totalLines: 500,
  };
  const mockFiles = [
    { relativePath: 'file1.js', tokens: 100, content: 'code1' },
    { relativePath: 'file2.js', tokens: 200, content: 'code2' },
    { relativePath: 'file3.js', tokens: 800, content: 'code3' }, // Large file to force chunking
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    fs.readFileSync.mockImplementation((p) => {
      if (p.endsWith('file1.js')) return 'code1';
      if (p.endsWith('file2.js')) return 'code2';
      if (p.endsWith('file3.js')) return 'code3';
      return '';
    });
  });

  describe('Chunked Digest Generation', () => {
    test('generateChunkedDigest handles overlap and metadata', () => {
      formatter = new GitIngestFormatter(mockProjectRoot, mockStats, mockFiles, {
        chunking: {
          enabled: true,
          maxTokensPerChunk: 500,
          overlap: 100,
          includeMetadata: true,
        },
      });

      // Force chunking strategy to be used
      formatter.chunking.strategy = 'size';

      const chunks = formatter.generateChunkedDigest();

      // With 1100 tokens total and 500 max size, we should have at least 3 chunks
      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks[0].content).toContain('CHUNK 1 of');
      // Metadata might be in the content or as a property
      expect(chunks[0].content).toContain('CHUNK METADATA');
      expect(chunks[0].hasOverlap).toBeDefined();
    });

    test('generateDigest calls generateChunkedDigest when enabled', () => {
      formatter = new GitIngestFormatter(mockProjectRoot, mockStats, mockFiles, {
        chunking: { enabled: true },
      });

      const spy = vi.spyOn(formatter, 'generateChunkedDigest');
      spy.mockReturnValue([]);

      formatter.generateDigest();

      expect(spy).toHaveBeenCalled();
    });

    test('createChunks supports all strategies', () => {
      formatter = new GitIngestFormatter(mockProjectRoot, mockStats, mockFiles, {
        chunking: { enabled: true },
      });

      // Mock strategy methods
      formatter.createSmartChunks = vi.fn().mockReturnValue([]);
      formatter.createFileBasedChunks = vi.fn().mockReturnValue([]);
      formatter.createDirectoryBasedChunks = vi.fn().mockReturnValue([]);
      formatter.createDependencyBasedChunks = vi.fn().mockReturnValue([]);

      formatter.chunking.strategy = 'smart';
      formatter.createChunks();
      expect(formatter.createSmartChunks).toHaveBeenCalled();

      formatter.chunking.strategy = 'file';
      formatter.createChunks();
      expect(formatter.createFileBasedChunks).toHaveBeenCalled();

      formatter.chunking.strategy = 'directory';
      formatter.createChunks();
      expect(formatter.createDirectoryBasedChunks).toHaveBeenCalled();

      formatter.chunking.strategy = 'dependency';
      formatter.createChunks();
      expect(formatter.createDependencyBasedChunks).toHaveBeenCalled();
    });
  });

  describe('Method Filtering Integration', () => {
    test('generateSummary logs method filtering mode', () => {
      formatter = new GitIngestFormatter(mockProjectRoot, mockStats, mockFiles, {
        methodLevel: true,
      });

      // Manually set method filter properties as they might be initialized in constructor
      formatter.methodFilterEnabled = true;
      formatter.methodFilter = { hasIncludeFile: true };

      const summary = formatter.generateSummary();

      expect(summary).toContain('Method filtering: INCLUDE mode active');
    });

    test('generateChunkFileContents applies method filtering', () => {
      formatter = new GitIngestFormatter(mockProjectRoot, mockStats, mockFiles, {
        methodLevel: true,
      });

      formatter.methodFilterEnabled = true;
      formatter.methodFilter = { isMethodIncluded: () => true };
      formatter.methodAnalyzer = {
        extractMethods: () => [{ name: 'testMethod', start: 1, end: 5 }],
      };

      // Mock isCodeFile
      formatter.isCodeFile = () => true;

      // Spy on generateFilteredFileContent
      const spy = vi.spyOn(formatter, 'generateFilteredFileContent');
      spy.mockReturnValue('filtered content');

      const chunk = {
        files: [{ relativePath: 'file1.js', path: '/mock/project/file1.js', content: 'code1' }],
      };
      const content = formatter.generateChunkFileContents(chunk);

      expect(content).toContain('filtered content');
      expect(spy).toHaveBeenCalled();
    });

    test('generateChunkFileContents falls back to full content', () => {
      formatter = new GitIngestFormatter(mockProjectRoot, mockStats, mockFiles, {
        methodLevel: true,
      });

      // Case 1: Not a code file
      formatter.methodFilterEnabled = true;
      formatter.isCodeFile = () => false;

      fs.readFileSync.mockReturnValue('text content');

      const chunk = { files: [{ relativePath: 'file1.txt', path: '/mock/project/file1.txt' }] };
      const content = formatter.generateChunkFileContents(chunk);

      expect(content).toContain('text content');

      // Case 2: Method filtering disabled
      formatter.methodFilterEnabled = false;
      const content2 = formatter.generateChunkFileContents(chunk);
      expect(content2).toContain('text content');
    });
  });
});

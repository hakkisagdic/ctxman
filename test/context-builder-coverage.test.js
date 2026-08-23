import { describe, test, expect, vi, beforeEach, _afterEach } from 'vitest';
import ContextBuilder from '../lib/core/ContextBuilder.js';
import { LLMDetector } from '../lib/utils/llm-detector.js';

vi.mock('../lib/utils/llm-detector.js');
vi.mock('../lib/utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

describe('ContextBuilder Coverage', () => {
  let builder;
  const mockFiles = [
    {
      relativePath: 'src/core.js',
      tokens: 100,
      modified: 1000,
      name: 'core.js',
      size: 500,
      language: 'JavaScript',
    },
    {
      relativePath: 'src/utils.js',
      tokens: 50,
      modified: 500,
      name: 'utils.js',
      size: 200,
      language: 'JavaScript',
    },
    {
      relativePath: 'test/test.js',
      tokens: 200,
      modified: 100,
      name: 'test.js',
      size: 800,
      language: 'JavaScript',
    },
  ];
  const mockStats = { totalFiles: 3, totalTokens: 350, totalSize: 1500 };
  const mockAnalysis = { files: mockFiles, stats: mockStats };

  beforeEach(() => {
    vi.clearAllMocks();
    builder = new ContextBuilder();

    // Mock LLMDetector
    LLMDetector.getProfile.mockReturnValue({
      name: 'Test Model',
      vendor: 'Test Vendor',
      contextWindow: 1000,
      maxRecommendedInput: 500,
      preferredFormat: 'json',
    });
  });

  describe('Initialization', () => {
    test('uses default options', () => {
      expect(builder.options.useCase).toBe('custom');
      expect(builder.options.includeTests).toBe(true);
    });

    test('accepts custom options', () => {
      const custom = new ContextBuilder({ useCase: 'debug', includeTests: false });
      expect(custom.options.useCase).toBe('debug');
      expect(custom.options.includeTests).toBe(false);
    });
  });

  describe('build()', () => {
    test('builds full context', () => {
      const context = builder.build(mockAnalysis);

      expect(context.metadata.totalFiles).toBe(3);
      expect(context.files['src']).toHaveLength(2);
      expect(context.files['test']).toHaveLength(1);
    });

    test('applies smart filtering when targetTokens set', () => {
      builder = new ContextBuilder({ targetTokens: 120 });
      const context = builder.build(mockAnalysis);

      // Should filter down to fit 120 tokens
      // core.js (100) + utils.js (50) > 120
      // core.js (100) fits
      expect(context.files['src']).toBeDefined();
      // Check that we don't have all files
      const totalFiles = Object.values(context.files).flat().length;
      expect(totalFiles).toBeLessThan(3);
    });

    test('optimizes for LLM when targetModel set', () => {
      builder = new ContextBuilder({ targetModel: 'gpt-4' });
      const context = builder.build(mockAnalysis);

      expect(context.metadata.targetLLM).toBeDefined();
      expect(context.metadata.recommendedFormat).toBe('json');
    });
  });

  describe('Smart Filtering', () => {
    test('returns all files if they fit', () => {
      const result = builder.applySmartFiltering(mockFiles, 1000);
      expect(result).toHaveLength(3);
    });

    test('prioritizes based on strategy: changed-first', () => {
      builder = new ContextBuilder({ priorityStrategy: 'changed-first' });
      // core.js (mod 1000), utils.js (mod 500), test.js (mod 100)
      const sorted = builder.prioritizeFiles(mockFiles);
      expect(sorted[0].name).toBe('core.js');
      expect(sorted[2].name).toBe('test.js');
    });

    test('prioritizes based on strategy: core-first', () => {
      builder = new ContextBuilder({ priorityStrategy: 'core-first' });
      const sorted = builder.prioritizeFiles(mockFiles);
      // src/core.js should be high priority
      expect(sorted[0].relativePath).toContain('src/');
    });

    test('prioritizes based on strategy: balanced', () => {
      builder = new ContextBuilder({ priorityStrategy: 'balanced' });
      const sorted = builder.prioritizeFiles(mockFiles);
      expect(sorted.length).toBe(3);
    });
  });

  describe('Structure Building', () => {
    test('builds file list grouped by directory', () => {
      const fileList = builder.buildFileList(mockFiles);
      expect(fileList['src']).toHaveLength(2);
      expect(fileList['test']).toHaveLength(1);
    });

    test('builds method list when enabled', () => {
      builder = new ContextBuilder({ methodLevel: true });
      const filesWithMethods = [
        {
          relativePath: 'a.js',
          methods: [{ name: 'foo', line: 1, type: 'function' }],
        },
      ];

      const methodList = builder.buildMethodList(filesWithMethods);
      expect(methodList['a.js']).toHaveLength(1);
      expect(methodList['a.js'][0].name).toBe('foo');
    });
  });

  describe('Optimization', () => {
    test('calculates chunking needs', () => {
      builder = new ContextBuilder({ targetModel: 'gpt-4' });
      // Mock profile maxRecommendedInput is 500
      // Total tokens is 350, so fits
      const context = builder.build(mockAnalysis);
      expect(context.metadata.fitsInContext).toBe(true);
      expect(context.metadata.chunksNeeded).toBe(1);
    });

    test('calculates chunks when exceeding limit', () => {
      builder = new ContextBuilder({ targetModel: 'gpt-4' });
      const largeStats = { ...mockStats, totalTokens: 1200 };
      const largeAnalysis = { files: mockFiles, stats: largeStats };

      const context = builder.build(largeAnalysis);
      expect(context.metadata.fitsInContext).toBe(false);
      expect(context.metadata.chunksNeeded).toBe(3); // 1200 / 500 = 2.4 -> 3
    });
  });

  describe('Utilities', () => {
    test('generateCompactPaths returns simple map', () => {
      const context = {
        files: {
          src: [{ name: 'a.js' }, { name: 'b.js' }],
          test: [{ name: 'c.js' }],
        },
      };
      const compact = builder.generateCompactPaths(context);
      expect(compact['src']).toEqual(['a.js', 'b.js']);
    });

    test('getSummary generates readable text', () => {
      const context = {
        metadata: { totalFiles: 5, totalTokens: 100, totalSize: 1024 },
        statistics: {},
      };
      const summary = builder.getSummary(context);
      expect(summary).toContain('Files: 5');
      expect(summary).toContain('Tokens: 100');
    });
  });
});

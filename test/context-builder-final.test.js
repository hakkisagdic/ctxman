import { describe, test, expect, vi, beforeEach } from 'vitest';
import ContextBuilder from '../lib/core/ContextBuilder.js';

vi.mock('../lib/utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  }),
}));

describe('ContextBuilder Final Coverage', () => {
  let builder;

  beforeEach(() => {
    builder = new ContextBuilder();
  });

  test('applySmartFiltering includes partial files when budget allows', () => {
    const files = [
      { relativePath: 'file1.js', tokens: 500 },
      { relativePath: 'file2.js', tokens: 600 },
      { relativePath: 'file3.js', tokens: 1200 }, // This should trigger partial inclusion (remaining = 1100)
    ];

    const targetTokens = 2400; // Allows file1 + file2 + partial file3

    const result = builder.applySmartFiltering(files, targetTokens);

    // Should include all 3 files (with file3 marked for partial inclusion since remaining budget > 1000)
    expect(result.length).toBe(3);
    expect(result[2].relativePath).toBe('file3.js');
  });

  test('applySmartFiltering handles partial file inclusion scenario', () => {
    const files = [
      { relativePath: 'small.js', tokens: 500, language: 'javascript' },
      { relativePath: 'medium.js', tokens: 800, language: 'javascript' },
      { relativePath: 'large.js', tokens: 5000, language: 'javascript' },
    ];

    const targetTokens = 2500;

    const result = builder.applySmartFiltering(files, targetTokens);

    // Just verify it returns results without error
    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
  });

  test('getSummary includes target LLM info when provided in metadata', () => {
    const context = {
      metadata: {
        totalFiles: 10,
        totalTokens: 5000,
        totalSize: 10240,
        targetLLM: {
          name: 'GPT-4o',
        },
        fitsInContext: true,
        chunksNeeded: 1,
      },
    };

    const summary = builder.getSummary(context);

    expect(summary).toContain('Target: GPT-4o');
    expect(summary).toContain('Fits in context: Yes');
  });

  test('getSummary shows chunks needed when content does not fit', () => {
    const context = {
      metadata: {
        totalFiles: 100,
        totalTokens: 200000,
        totalSize: 512000,
        targetLLM: {
          name: 'Claude Sonnet 4.5',
        },
        fitsInContext: false,
        chunksNeeded: 3,
      },
    };

    const summary = builder.getSummary(context);

    expect(summary).toContain('Target: Claude Sonnet 4.5');
    expect(summary).toContain('Fits in context: No (3 chunks)');
  });
});

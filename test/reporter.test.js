import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { Reporter } from '../lib/core/Reporter.js';
import FormatRegistry from '../lib/formatters/format-registry.js';
import ClipboardUtils from '../lib/utils/clipboard-utils.js';
import fs from 'fs';
import _path from 'path';

// Mocks
vi.mock('fs');
vi.mock('../lib/formatters/format-registry.js');
vi.mock('../lib/utils/clipboard-utils.js');
vi.mock('../lib/utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

describe('Reporter', () => {
  let reporter;
  let consoleLogSpy;
  let mockContext;
  let mockStats;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    // Setup mock context and stats
    mockContext = {
      metadata: {
        generatedAt: new Date().toISOString(),
        totalFiles: 10,
        totalTokens: 1000,
        totalSize: 2048,
        useCase: 'test',
        configuration: { methodLevel: false },
      },
      statistics: {},
    };

    mockStats = {
      totalFiles: 10,
      totalTokens: 1000,
      totalSize: 2048,
      byLanguage: {
        JavaScript: { tokens: 600 },
        Python: { tokens: 400 },
      },
      largestFiles: [{ path: 'large.js', tokens: 500 }],
      totalMethods: 5,
      includedMethods: 3,
      analysisTime: 100,
      cacheHits: 8,
      cacheMisses: 2,
    };

    // Mock FormatRegistry behavior
    FormatRegistry.prototype.encode = vi.fn().mockReturnValue('encoded-content');

    reporter = new Reporter();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Initialization', () => {
    test('uses default options', () => {
      expect(reporter.options.format).toBe('toon');
      expect(reporter.options.verbose).toBe(true);
    });

    test('accepts custom options', () => {
      const custom = new Reporter({ format: 'json', verbose: false });
      expect(custom.options.format).toBe('json');
      expect(custom.options.verbose).toBe(false);
    });
  });

  describe('report()', () => {
    test('orchestrates reporting flow', async () => {
      reporter.options.outputPath = 'out.txt';
      reporter.options.clipboard = true;

      vi.spyOn(reporter, 'printConsoleReport');
      vi.spyOn(reporter, 'exportToFile').mockResolvedValue();
      vi.spyOn(reporter, 'exportToClipboard').mockResolvedValue();

      await reporter.report(mockContext, mockStats);

      expect(reporter.printConsoleReport).toHaveBeenCalledWith(mockStats);
      expect(reporter.exportToFile).toHaveBeenCalledWith(mockContext, 'out.txt');
      expect(reporter.exportToClipboard).toHaveBeenCalledWith(mockContext);
    });

    test('skips console report if not verbose', async () => {
      reporter.options.verbose = false;
      vi.spyOn(reporter, 'printConsoleReport');

      await reporter.report(mockContext, mockStats);

      expect(reporter.printConsoleReport).not.toHaveBeenCalled();
    });
  });

  describe('printConsoleReport()', () => {
    test('prints comprehensive stats', () => {
      reporter.printConsoleReport(mockStats);

      // Check for key sections
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('FILES & TOKENS'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('LANGUAGE DISTRIBUTION'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('LARGEST FILES'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('METHOD ANALYSIS'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('PERFORMANCE'));

      // Check specific values
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('1,000')); // Tokens
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('JavaScript'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('large.js'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('80.0%')); // Cache hit rate
    });

    test('handles missing optional stats', () => {
      const minimalStats = {
        totalFiles: 1,
        totalTokens: 10,
        totalSize: 100,
        byLanguage: {},
      };

      reporter.printConsoleReport(minimalStats);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('FILES & TOKENS'));
      expect(consoleLogSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('LANGUAGE DISTRIBUTION')
      );
      expect(consoleLogSpy).not.toHaveBeenCalledWith(expect.stringContaining('LARGEST FILES'));
    });
  });

  describe('exportToFile()', () => {
    test('exports successfully', async () => {
      await reporter.exportToFile(mockContext, 'output.json');

      expect(FormatRegistry.prototype.encode).toHaveBeenCalledWith('json', mockContext);
      expect(fs.writeFileSync).toHaveBeenCalledWith('output.json', 'encoded-content', 'utf-8');
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Report saved'));
    });

    test('handles export errors', async () => {
      fs.writeFileSync.mockImplementation(() => {
        throw new Error('Write failed');
      });

      await expect(reporter.exportToFile(mockContext, 'out.txt')).rejects.toThrow('Write failed');
    });
  });

  describe('exportToClipboard()', () => {
    test('copies successfully', async () => {
      ClipboardUtils.copy.mockReturnValue(true);

      await reporter.exportToClipboard(mockContext);

      expect(ClipboardUtils.copy).toHaveBeenCalledWith('encoded-content');
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Context copied to clipboard')
      );
    });

    test('falls back to file on failure', async () => {
      ClipboardUtils.copy.mockReturnValue(false);
      vi.spyOn(reporter, 'exportToFile').mockResolvedValue();

      await reporter.exportToClipboard(mockContext);

      expect(reporter.exportToFile).toHaveBeenCalled();
    });

    test('handles errors', async () => {
      ClipboardUtils.copy.mockImplementation(() => {
        throw new Error('Clipboard error');
      });

      await expect(reporter.exportToClipboard(mockContext)).rejects.toThrow('Clipboard error');
    });
  });

  describe('detectFormatFromPath()', () => {
    test('detects known extensions', () => {
      expect(reporter.detectFormatFromPath('file.json')).toBe('json');
      expect(reporter.detectFormatFromPath('file.md')).toBe('markdown');
      expect(reporter.detectFormatFromPath('file.txt')).toBe('summary');
    });

    test('defaults to configured format for unknown extensions', () => {
      reporter.options.format = 'xml';
      expect(reporter.detectFormatFromPath('file.unknown')).toBe('xml');
    });
  });

  describe('getAverageTokens()', () => {
    test('calculates average', () => {
      expect(reporter.getAverageTokens({ totalFiles: 10, totalTokens: 1000 })).toBe('100');
    });

    test('handles zero files', () => {
      expect(reporter.getAverageTokens({ totalFiles: 0 })).toBe('N/A');
    });
  });

  describe('generateSummary()', () => {
    test('generates summary text', () => {
      const summary = reporter.generateSummary(mockContext);

      expect(summary).toContain('Ctxman Analysis Summary');
      expect(summary).toContain('Files: 10');
      expect(summary).toContain('Tokens: 1,000');
    });

    test('includes LLM info if present', () => {
      mockContext.metadata.targetLLM = { name: 'GPT-4' };
      mockContext.metadata.fitsInContext = false;
      mockContext.metadata.chunksNeeded = 2;

      const summary = reporter.generateSummary(mockContext);

      expect(summary).toContain('Target LLM: GPT-4');
      expect(summary).toContain('Chunks needed: 2');
    });
  });

  describe('exportMultiple()', () => {
    test('exports multiple formats', async () => {
      vi.spyOn(reporter, 'exportToFile').mockResolvedValue();

      const results = await reporter.exportMultiple(mockContext, ['json', 'md']);

      expect(reporter.exportToFile).toHaveBeenCalledTimes(2);
      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
    });

    test('handles individual failures', async () => {
      vi.spyOn(reporter, 'exportToFile')
        .mockResolvedValueOnce()
        .mockRejectedValueOnce(new Error('Fail'));

      const results = await reporter.exportMultiple(mockContext, ['json', 'md']);

      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
    });
  });
});

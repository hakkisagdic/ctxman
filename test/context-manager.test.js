import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { main, generateDigestFromReport, generateDigestFromContext } from '../ctxman.js';
import TokenCalculator from '../lib/analyzers/token-calculator.js';
import GitIngestFormatter from '../lib/formatters/gitingest-formatter.js';
import fs from 'fs';
import path from 'path';

// Mock dependencies
vi.mock('../lib/analyzers/token-calculator.js');
vi.mock('../lib/formatters/gitingest-formatter.js');
vi.mock('fs');

describe('Ctxman CLI', () => {
  let consoleLogSpy;
  let consoleErrorSpy;
  let processExitSpy;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Spy on console
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Mock process.exit to throw error so we can catch it
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`Process exit: ${code}`);
    });

    // Setup default mock implementations
    TokenCalculator.prototype.run = vi.fn().mockResolvedValue({});
    GitIngestFormatter.prototype.saveToFile = vi.fn().mockReturnValue(1024);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('main()', () => {
    test('shows help with --help flag', async () => {
      await main(['--help']);
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Usage:'));
      expect(TokenCalculator).not.toHaveBeenCalled();
    });

    test('runs standard analysis with default options', async () => {
      await main([]);
      expect(TokenCalculator).toHaveBeenCalledWith(
        process.cwd(),
        expect.objectContaining({
          saveReport: false,
          verbose: false,
          methodLevel: false,
        })
      );
      expect(TokenCalculator.prototype.run).toHaveBeenCalled();
    });

    test('parses flags correctly', async () => {
      await main(['--save-report', '--verbose', '--method-level']);
      expect(TokenCalculator).toHaveBeenCalledWith(
        process.cwd(),
        expect.objectContaining({
          saveReport: true,
          verbose: true,
          methodLevel: true,
        })
      );
    });

    test('parses short flags correctly', async () => {
      await main(['-s', '-v', '-m']);
      expect(TokenCalculator).toHaveBeenCalledWith(
        process.cwd(),
        expect.objectContaining({
          saveReport: true,
          verbose: true,
          methodLevel: true,
        })
      );
    });

    test('handles --gitingest-from-report', async () => {
      // Mock fs for report reading
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(
        JSON.stringify({
          metadata: { projectRoot: '/test' },
          summary: {},
          files: [],
        })
      );

      await main(['--gitingest-from-report', 'report.json']);

      expect(fs.readFileSync).toHaveBeenCalledWith('report.json', 'utf8');
      expect(GitIngestFormatter).toHaveBeenCalled();
    });

    test('handles --gitingest-from-context', async () => {
      // Mock fs for context reading
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(
        JSON.stringify({
          project: { totalFiles: 1, totalTokens: 100 },
          paths: { '/': ['test.js'] },
        })
      );
      // Mock file stats for context file resolution
      fs.statSync.mockReturnValue({ size: 100 });

      await main(['--gitingest-from-context', 'context.json']);

      expect(fs.readFileSync).toHaveBeenCalledWith('context.json', 'utf8');
      expect(GitIngestFormatter).toHaveBeenCalled();
    });
  });

  describe('generateDigestFromReport()', () => {
    test('handles missing report file', () => {
      fs.existsSync.mockReturnValue(false);

      expect(() => generateDigestFromReport('missing.json')).toThrow('Process exit: 1');
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('not found'));
    });

    test('handles invalid report format', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify({})); // Missing fields

      expect(() => generateDigestFromReport('invalid.json')).toThrow('Process exit: 1');
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid report format')
      );
    });

    test('generates digest successfully', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(
        JSON.stringify({
          metadata: { projectRoot: '/test' },
          summary: 'summary',
          files: ['file1'],
        })
      );

      generateDigestFromReport('valid.json');

      expect(GitIngestFormatter).toHaveBeenCalledWith('/test', 'summary', ['file1']);
      expect(GitIngestFormatter.prototype.saveToFile).toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('GitIngest digest saved'));
    });

    test('handles processing errors', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockImplementation(() => {
        throw new Error('Read error');
      });

      expect(() => generateDigestFromReport('error.json')).toThrow('Process exit: 1');
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error processing report')
      );
    });
  });

  describe('generateDigestFromContext()', () => {
    test('handles missing context file', () => {
      fs.existsSync.mockReturnValue(false);

      expect(() => generateDigestFromContext('missing.json')).toThrow('Process exit: 1');
    });

    test('handles invalid context format', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify({}));

      expect(() => generateDigestFromContext('invalid.json')).toThrow('Process exit: 1');
    });

    test('generates digest from context', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(
        JSON.stringify({
          project: { totalFiles: 1, totalTokens: 100 },
          paths: {
            '/': ['root.js'],
            'src/': ['utils.js'],
          },
        })
      );
      fs.statSync.mockReturnValue({ size: 500 });

      generateDigestFromContext('valid.json');

      expect(GitIngestFormatter).toHaveBeenCalled();
      // Verify files construction logic
      const filesArg = GitIngestFormatter.mock.calls[0][2];
      expect(filesArg).toHaveLength(2);
      expect(filesArg[0]).toHaveProperty('relativePath');
    });
  });
});

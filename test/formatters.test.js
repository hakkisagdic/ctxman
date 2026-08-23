import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import GitIngestFormatter from '../lib/formatters/gitingest-formatter.js';

describe('GitIngest Formatter', () => {
  let testDir;

  beforeEach(() => {
    testDir = path.join(process.cwd(), 'test-formatter-temp');
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('Digest Generation from Files', () => {
    test('generates digest from analysis with files', () => {
      // Create test files
      const file1Path = path.join(testDir, 'index.js');
      const file2Path = path.join(testDir, 'utils.js');
      fs.writeFileSync(file1Path, 'console.log("hello");');
      fs.writeFileSync(file2Path, 'export const utils = {};');

      const files = [
        {
          relativePath: 'index.js',
          path: file1Path,
          tokens: 10,
        },
        {
          relativePath: 'utils.js',
          path: file2Path,
          tokens: 5,
        },
      ];

      const formatter = new GitIngestFormatter(testDir, { totalTokens: 15 }, files);
      const digest = formatter.generateDigest();

      expect(digest).toBeDefined();
      expect(typeof digest).toBe('string');
      expect(digest.length).toBeGreaterThan(0);
    });

    test('handles empty file list', () => {
      const formatter = new GitIngestFormatter(testDir, { totalTokens: 0 }, []);
      const digest = formatter.generateDigest();

      expect(digest).toBeDefined();
      expect(typeof digest).toBe('string');
    });

    test('handles single file', () => {
      const filePath = path.join(testDir, 'test.js');
      fs.writeFileSync(filePath, 'const x = 1;');

      const files = [
        {
          relativePath: 'test.js',
          path: filePath,
          tokens: 5,
        },
      ];

      const formatter = new GitIngestFormatter(testDir, { totalTokens: 5 }, files);
      const digest = formatter.generateDigest();
      expect(digest).toContain('test.js');
    });
  });

  describe('Directory Tree Generation', () => {
    test('creates tree structure from file paths', () => {
      const formatter = new GitIngestFormatter(testDir, {}, []);
      const files = [
        path.join(testDir, 'src', 'index.js'),
        path.join(testDir, 'src', 'utils.js'),
        path.join(testDir, 'README.md'),
      ];

      // Create files
      fs.mkdirSync(path.join(testDir, 'src'));
      files.forEach((f) => fs.writeFileSync(f, 'test'));

      const fileInfos = files.map((f) => ({
        relativePath: path.relative(testDir, f),
        path: f,
      }));

      const tree = formatter.buildFileTreeFromFiles(fileInfos);
      expect(tree).toBeDefined();
    });
  });

  describe('Token Formatting', () => {
    test('formats token counts with K suffix', () => {
      const formatter = new GitIngestFormatter(testDir);
      const formatted = formatter.formatTokenCount(15000);
      expect(formatted).toContain('K');
    });

    test('formats large token counts with M suffix', () => {
      const formatter = new GitIngestFormatter(testDir);
      const formatted = formatter.formatTokenCount(1500000);
      expect(formatted).toContain('M');
    });

    test('formats small token counts without suffix', () => {
      const formatter = new GitIngestFormatter(testDir);
      const formatted = formatter.formatTokenCount(500);
      expect(formatted).toBe('500');
    });
  });
});

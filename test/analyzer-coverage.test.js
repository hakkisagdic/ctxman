import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import Analyzer from '../lib/core/Analyzer.js';
import fs from 'fs';
import os from 'os';
import path from 'path';

describe('Analyzer Coverage', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'analyzer-test-'));
  });

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('Error Handling', () => {
    test('handles file read errors gracefully', async () => {
      const badFile = path.join(tempDir, 'bad.js');
      fs.writeFileSync(badFile, 'test content');

      const analyzer = new Analyzer();

      // Mock fs.readFileSync to throw error
      const originalReadFile = fs.readFileSync;
      vi.spyOn(fs, 'readFileSync').mockImplementation((filePath) => {
        if (filePath === badFile) {
          throw new Error('Permission denied');
        }
        return originalReadFile(filePath, 'utf-8');
      });

      const fileInfo = {
        path: badFile,
        relativePath: 'bad.js',
        name: 'bad.js',
        extension: '.js',
        size: 100,
      };

      const result = await analyzer.analyzeFile(fileInfo);

      // Should return null on error
      expect(result).toBeNull();

      fs.readFileSync.mockRestore();
    });

    test('handles non-text file detection', async () => {
      const analyzer = new Analyzer();

      const binaryFile = {
        path: '/fake/binary.exe',
        relativePath: 'binary.exe',
        name: 'binary.exe',
        extension: '.exe',
        size: 1000,
      };

      const result = await analyzer.analyzeFile(binaryFile);
      expect(result).toBeNull();
    });
  });

  describe('Method-Level Analysis', () => {
    test('includes method count when methodLevel is true', async () => {
      const jsFile = path.join(tempDir, 'methods.js');
      fs.writeFileSync(
        jsFile,
        `
function test1() {}
function test2() {}
function test3() {}
            `
      );

      const analyzer = new Analyzer({ methodLevel: true });

      const fileInfo = {
        path: jsFile,
        relativePath: 'methods.js',
        name: 'methods.js',
        extension: '.js',
        size: fs.statSync(jsFile).size,
      };

      const result = await analyzer.analyzeFile(fileInfo);

      expect(result).toBeDefined();
      expect(result.methods).toBeDefined();
      expect(result.methodCount).toBeGreaterThan(0);
    });

    test('tracks total methods in stats', async () => {
      const jsFile = path.join(tempDir, 'test.js');
      fs.writeFileSync(jsFile, 'function foo() {} function bar() {}');

      const analyzer = new Analyzer({ methodLevel: true });

      const files = [
        {
          path: jsFile,
          relativePath: 'test.js',
          name: 'test.js',
          extension: '.js',
          size: fs.statSync(jsFile).size,
        },
      ];

      await analyzer.analyze(files);

      const stats = analyzer.getStats();
      expect(stats.totalMethods).toBeGreaterThan(0);
    });
  });

  describe('Language Distribution', () => {
    test('calculates language distribution with percentages', async () => {
      const jsFile = path.join(tempDir, 'app.js');
      const pyFile = path.join(tempDir, 'script.py');

      fs.writeFileSync(jsFile, 'x'.repeat(100));
      fs.writeFileSync(pyFile, 'y'.repeat(50));

      const analyzer = new Analyzer();

      const files = [
        {
          path: jsFile,
          relativePath: 'app.js',
          name: 'app.js',
          extension: '.js',
          size: 100,
        },
        {
          path: pyFile,
          relativePath: 'script.py',
          name: 'script.py',
          extension: '.py',
          size: 50,
        },
      ];

      await analyzer.analyze(files);

      const distribution = analyzer.getLanguageDistribution();

      expect(Array.isArray(distribution)).toBe(true);
      expect(distribution.length).toBeGreaterThan(0);
      expect(distribution[0]).toHaveProperty('language');
      expect(distribution[0]).toHaveProperty('percentage');
      expect(distribution[0].percentage).toBeGreaterThan(0);

      // Should be sorted by tokens descending
      if (distribution.length > 1) {
        expect(distribution[0].tokens).toBeGreaterThanOrEqual(distribution[1].tokens);
      }
    });

    test('handles single language distribution', async () => {
      const jsFile = path.join(tempDir, 'single.js');
      fs.writeFileSync(jsFile, 'console.log("test")');

      const analyzer = new Analyzer();

      await analyzer.analyze([
        {
          path: jsFile,
          relativePath: 'single.js',
          name: 'single.js',
          extension: '.js',
          size: 20,
        },
      ]);

      const distribution = analyzer.getLanguageDistribution();
      expect(distribution).toHaveLength(1);
      expect(distribution[0].language).toBe('JavaScript');
      expect(distribution[0].percentage).toBe(100);
    });
  });

  describe('Stats Management', () => {
    test('updates largest files correctly', async () => {
      const files = [];
      for (let i = 1; i <= 12; i++) {
        const file = path.join(tempDir, `file${i}.js`);
        const content = 'x'.repeat(i * 100);
        fs.writeFileSync(file, content);
        files.push({
          path: file,
          relativePath: `file${i}.js`,
          name: `file${i}.js`,
          extension: '.js',
          size: content.length,
        });
      }

      const analyzer = new Analyzer();
      await analyzer.analyze(files);

      const stats = analyzer.getStats();

      // Should keep only top 10
      expect(stats.largestFiles.length).toBe(10);

      // Should be sorted by tokens descending
      for (let i = 0; i < stats.largestFiles.length - 1; i++) {
        expect(stats.largestFiles[i].tokens).toBeGreaterThanOrEqual(
          stats.largestFiles[i + 1].tokens
        );
      }
    });

    test('reset clears all stats', async () => {
      const file = path.join(tempDir, 'test.js');
      fs.writeFileSync(file, 'test');

      const analyzer = new Analyzer();
      await analyzer.analyze([
        {
          path: file,
          relativePath: 'test.js',
          name: 'test.js',
          extension: '.js',
          size: 4,
        },
      ]);

      analyzer.reset();
      const stats = analyzer.getStats();

      expect(stats.totalFiles).toBe(0);
      expect(stats.totalTokens).toBe(0);
      expect(stats.totalSize).toBe(0);
      expect(stats.totalMethods).toBe(0);
      expect(Object.keys(stats.byLanguage)).toHaveLength(0);
      expect(stats.largestFiles).toHaveLength(0);
    });
  });

  describe('Language Detection', () => {
    test('detects all supported languages', () => {
      const analyzer = new Analyzer();

      expect(analyzer.detectLanguage('.js')).toBe('JavaScript');
      expect(analyzer.detectLanguage('.ts')).toBe('TypeScript');
      expect(analyzer.detectLanguage('.py')).toBe('Python');
      expect(analyzer.detectLanguage('.go')).toBe('Go');
      expect(analyzer.detectLanguage('.rs')).toBe('Rust');
      expect(analyzer.detectLanguage('.java')).toBe('Java');
    });

    test('returns Other for unknown extensions', () => {
      const analyzer = new Analyzer();
      expect(analyzer.detectLanguage('.xyz')).toBe('Other');
      expect(analyzer.detectLanguage('.unknown')).toBe('Other');
    });
  });
});

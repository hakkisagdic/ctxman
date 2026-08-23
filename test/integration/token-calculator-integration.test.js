import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import TokenCalculator from '../../lib/analyzers/token-calculator.js';

describe('TokenCalculator Integration Tests', () => {
  let testDir;
  let calculator;

  beforeEach(() => {
    testDir = path.join(process.cwd(), 'test-integration-temp');
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('Full Workflow Tests', () => {
    test('scanDirectory finds all files', () => {
      fs.writeFileSync(path.join(testDir, 'file1.js'), 'const x = 1;');
      fs.writeFileSync(path.join(testDir, 'file2.ts'), 'const y: number = 2;');
      const subDir = path.join(testDir, 'src');
      fs.mkdirSync(subDir);
      fs.writeFileSync(path.join(subDir, 'index.js'), 'export default {};');

      calculator = new TokenCalculator(testDir);
      const files = calculator.scanDirectory(testDir);

      expect(files.length).toBeGreaterThanOrEqual(3);
      expect(files.some((f) => f.includes('file1.js'))).toBe(true);
      expect(files.some((f) => f.includes('file2.ts'))).toBe(true);
      expect(files.some((f) => f.includes('index.js'))).toBe(true);
    });

    test('analyzeFile processes file correctly', () => {
      const filePath = path.join(testDir, 'test.js');
      const content = 'function hello() { console.log("Hello World"); }';
      fs.writeFileSync(filePath, content);

      calculator = new TokenCalculator(testDir);
      const result = calculator.analyzeFile(filePath);

      expect(result).toBeDefined();
      expect(result.relativePath).toBeDefined();
      expect(result.tokens).toBeGreaterThan(0);
      expect(result.lines).toBeGreaterThan(0);
      expect(result.sizeBytes).toBeGreaterThan(0);
    });
  });

  describe('Stats Tracking', () => {
    test('updateStats accumulates correctly', () => {
      calculator = new TokenCalculator(testDir);

      calculator.updateStats({
        relativePath: 'file1.js',
        tokens: 100,
        sizeBytes: 500,
        lines: 20,
        extension: '.js',
      });

      calculator.updateStats({
        relativePath: 'file2.js',
        tokens: 50,
        sizeBytes: 250,
        lines: 10,
        extension: '.js',
      });

      expect(calculator.stats.totalFiles).toBe(2);
      expect(calculator.stats.totalTokens).toBe(150);
      expect(calculator.stats.totalBytes).toBe(750);
      expect(calculator.stats.totalLines).toBe(30);
      expect(calculator.stats.byExtension['.js'].count).toBe(2);
    });

    test('tracks largest files correctly', () => {
      calculator = new TokenCalculator(testDir);

      calculator.updateStats({
        relativePath: 'small.js',
        tokens: 10,
        sizeBytes: 50,
        lines: 5,
        extension: '.js',
      });

      calculator.updateStats({
        relativePath: 'large.js',
        tokens: 1000,
        sizeBytes: 5000,
        lines: 200,
        extension: '.js',
      });

      // TokenCalculator sorts in run(), not updateStats(), so we sort manually for the test
      calculator.stats.largestFiles.sort((a, b) => b.tokens - a.tokens);
      expect(calculator.stats.largestFiles[0].relativePath).toBe('large.js');
      expect(calculator.stats.largestFiles[0].tokens).toBe(1000);
    });
  });

  describe('Context Generation', () => {
    test('generateLLMContext creates valid context', () => {
      calculator = new TokenCalculator(testDir);

      const analysisResults = {
        files: [
          {
            relativePath: 'test.js',
            content: 'console.log("test");',
            tokens: 10,
          },
        ],
        stats: calculator.stats,
      };

      const context = calculator.generateLLMContext(analysisResults);
      expect(context).toBeDefined();
      expect(typeof context).toBe('object');
      expect(context.paths['/']).toContain('test.js');
    });

    test('generateCompactPaths creates structured output', () => {
      calculator = new TokenCalculator(testDir);

      const analysisResults = {
        files: [
          { relativePath: 'src/index.js', tokens: 100 },
          { relativePath: 'src/utils.js', tokens: 50 },
          { relativePath: 'README.md', tokens: 20 },
        ],
        stats: {
          totalFiles: 3,
          totalTokens: 170,
        },
      };

      const compact = calculator.generateCompactPaths(analysisResults.files);
      expect(compact).toBeDefined();
      expect(compact['src/']).toBeDefined();
    });
  });

  describe('GitIgnore Integration', () => {
    test('respects .gitignore patterns', () => {
      fs.writeFileSync(path.join(testDir, '.gitignore'), 'node_modules/\n*.log\n');
      fs.writeFileSync(path.join(testDir, 'index.js'), 'test');
      fs.writeFileSync(path.join(testDir, 'debug.log'), 'log content');
      fs.mkdirSync(path.join(testDir, 'node_modules'));
      fs.writeFileSync(path.join(testDir, 'node_modules', 'dep.js'), 'dep');

      calculator = new TokenCalculator(testDir);
      const files = calculator.scanDirectory(testDir);

      expect(files.some((f) => f.includes('node_modules'))).toBe(false);
      expect(files.some((f) => f.includes('debug.log'))).toBe(false);
      expect(files.some((f) => f.includes('index.js'))).toBe(true);
    });

    test('respects .contextignore patterns', () => {
      fs.writeFileSync(path.join(testDir, '.contextignore'), 'test/\n*.test.js\n');
      fs.writeFileSync(path.join(testDir, 'index.js'), 'main');
      fs.writeFileSync(path.join(testDir, 'app.test.js'), 'test');
      fs.mkdirSync(path.join(testDir, 'test'));
      fs.writeFileSync(path.join(testDir, 'test', 'unit.js'), 'unit test');

      calculator = new TokenCalculator(testDir);
      const files = calculator.scanDirectory(testDir);

      expect(files.some((f) => f.includes('test/'))).toBe(false);
      expect(files.some((f) => f.includes('.test.js'))).toBe(false);
      expect(files.some((f) => f.includes('index.js'))).toBe(true);
    });
  });

  describe('File Type Detection', () => {
    test('isTextFile correctly identifies text files', () => {
      calculator = new TokenCalculator(testDir);

      expect(calculator.isTextFile('test.js')).toBe(true);
      expect(calculator.isTextFile('test.ts')).toBe(true);
      expect(calculator.isTextFile('README.md')).toBe(true);
      expect(calculator.isTextFile('package.json')).toBe(true);
      expect(calculator.isTextFile('image.png')).toBe(false);
      expect(calculator.isTextFile('app.exe')).toBe(false);
    });

    test('isCodeFile correctly identifies code files', () => {
      calculator = new TokenCalculator(testDir);

      expect(calculator.isCodeFile('test.js')).toBe(true);
      expect(calculator.isCodeFile('test.py')).toBe(true);
      expect(calculator.isCodeFile('test.go')).toBe(true);
      expect(calculator.isCodeFile('README.md')).toBe(false);
      expect(calculator.isCodeFile('data.json')).toBe(false);
    });
  });

  describe('Export Functions', () => {
    test('saveContextToFile creates file', () => {
      calculator = new TokenCalculator(testDir);
      const context = { test: 'data', tokens: 100 };

      calculator.saveContextToFile(context);

      const filePath = path.join(testDir, 'llm-context.json');
      expect(fs.existsSync(filePath)).toBe(true);

      const saved = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      expect(saved).toEqual(context);
    });
  });
});

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import Scanner from '../lib/core/Scanner.js';
import Analyzer from '../lib/core/Analyzer.js';

describe('V3 Core Modules - Simple Tests', () => {
  describe('Scanner', () => {
    test('initializes with valid directory', () => {
      const scanner = new Scanner(process.cwd());
      expect(scanner).toBeDefined();
      expect(scanner.rootPath).toBe(process.cwd());
    });

    test('can scan directory', () => {
      const scanner = new Scanner(process.cwd());
      const files = scanner.scan();
      expect(Array.isArray(files)).toBe(true);
      expect(files.length).toBeGreaterThan(0);
    });
  });

  describe('Analyzer', () => {
    const fs = require('fs');
    const path = require('path');
    const TEMP_DIR = path.join(process.cwd(), 'test/temp-v3-simple');

    beforeAll(() => {
      if (fs.existsSync(TEMP_DIR)) fs.rmSync(TEMP_DIR, { recursive: true, force: true });
      fs.mkdirSync(TEMP_DIR, { recursive: true });
    });

    afterAll(() => {
      if (fs.existsSync(TEMP_DIR)) fs.rmSync(TEMP_DIR, { recursive: true, force: true });
    });

    test('initializes correctly', () => {
      const analyzer = new Analyzer();
      expect(analyzer).toBeDefined();
    });

    test('can analyze file content', async () => {
      const analyzer = new Analyzer();
      const testFile = path.join(TEMP_DIR, 'test.js');
      fs.writeFileSync(testFile, 'function test() { return 42; }');

      const result = await analyzer.analyze([
        {
          path: testFile,
          relativePath: 'test.js',
          name: 'test.js',
          extension: '.js',
          size: 30,
        },
      ]);

      expect(result).toBeDefined();
      expect(result.files[0].tokens).toBeGreaterThan(0);
    });

    test('handles empty content', async () => {
      const analyzer = new Analyzer();
      const emptyFile = path.join(TEMP_DIR, 'empty.js');
      fs.writeFileSync(emptyFile, '');

      const result = await analyzer.analyze([
        {
          path: emptyFile,
          relativePath: 'empty.js',
          name: 'empty.js',
          extension: '.js',
          size: 0,
        },
      ]);

      expect(result.files[0].tokens).toBe(0);
    });
  });
});

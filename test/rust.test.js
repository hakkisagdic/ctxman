import { describe, test, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import MethodAnalyzer from '../lib/analyzers/method-analyzer.js';
import FileUtils from '../lib/utils/file-utils.js';

const FIXTURES_DIR = path.join(process.cwd(), 'test/fixtures');
const RUST_FILE = path.join(FIXTURES_DIR, 'sample.rs');

describe('Rust Support', () => {
  describe('File Type Detection', () => {
    test('detects Rust file type correctly', () => {
      expect(FileUtils.isCode('test.rs')).toBe(true);
      expect(FileUtils.isText('main.rs')).toBe(true);
      expect(FileUtils.getType('lib.rs')).toBe('code');
    });
  });

  describe('Method Extraction', () => {
    test('extracts Rust methods from sample file', () => {
      if (!fs.existsSync(RUST_FILE)) {
        console.warn('Skipping Rust extraction test: sample.rs not found');
        return;
      }

      const content = fs.readFileSync(RUST_FILE, 'utf8');
      const analyzer = new MethodAnalyzer();
      const methods = analyzer.extractMethods(content, RUST_FILE);

      expect(methods.length).toBeGreaterThanOrEqual(10);

      const expectedMethods = [
        'new',
        'add',
        'get_value',
        'fetch_data',
        'raw_pointer_operation',
        'calculate_sum',
        'process_data',
        'async_operation',
        'const_operation',
        'main',
      ];

      const extractedNames = methods.map((m) => m.name);

      expectedMethods.forEach((name) => {
        expect(extractedNames).toContain(name);
      });

      // Verify line numbers
      methods.forEach((m) => {
        expect(m.line).toBeGreaterThan(0);
      });

      // Verify keywords are not extracted
      const rustKeywords = ['fn', 'pub', 'async', 'unsafe', 'const', 'impl', 'struct'];
      rustKeywords.forEach((keyword) => {
        expect(extractedNames).not.toContain(keyword);
      });
    });
  });

  describe('Edge Cases', () => {
    test('handles empty file', () => {
      const analyzer = new MethodAnalyzer();
      const methods = analyzer.extractMethods('// Empty Rust file\n', 'empty.rs');
      expect(methods.length).toBe(0);
    });

    test('handles comments only', () => {
      const analyzer = new MethodAnalyzer();
      const content = `
// This is a comment
/* Multi-line
   comment */
`;
      const methods = analyzer.extractMethods(content, 'comments.rs');
      expect(methods.length).toBe(0);
    });
  });
});

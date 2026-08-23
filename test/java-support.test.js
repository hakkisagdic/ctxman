import { describe, test, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import MethodAnalyzer from '../lib/analyzers/method-analyzer.js';
import FileUtils from '../lib/utils/file-utils.js';
import TokenUtils from '../lib/utils/token-utils.js';

const FIXTURES_DIR = path.join(process.cwd(), 'test/fixtures');
const JAVA_FILE = path.join(FIXTURES_DIR, 'SampleClass.java');

describe('Java Support', () => {
  test('detects Java file type correctly', () => {
    expect(FileUtils.isText(JAVA_FILE)).toBe(true);
    expect(FileUtils.isCode(JAVA_FILE)).toBe(true);
    expect(FileUtils.getType(JAVA_FILE)).toBe('code');
  });

  test('estimates tokens correctly', () => {
    const content = fs.readFileSync(JAVA_FILE, 'utf8');
    const tokens = TokenUtils.estimate(content, JAVA_FILE);

    expect(tokens).toBeGreaterThan(0);
    expect(content.length / tokens).toBeGreaterThan(1); // Reasonable char/token ratio
  });

  test('extracts Java methods', () => {
    const content = fs.readFileSync(JAVA_FILE, 'utf8');
    const analyzer = new MethodAnalyzer();
    const methods = analyzer.extractMethods(content, JAVA_FILE);

    expect(methods.length).toBeGreaterThan(0);

    const expectedMethods = [
      'SampleClass', // Constructor
      'getName', // Public getter
      'setName', // Public setter
      'calculateSum', // Static method
      'validateAge', // Private method
      'isAdult', // Protected method
      'createList', // Generic method
      'incrementAge', // Synchronized method
      'riskyOperation', // Method with throws
      'getFullInfo', // Final method
    ];

    const extractedNames = methods.map((m) => m.name);

    expectedMethods.forEach((name) => {
      expect(extractedNames).toContain(name);
    });

    // Check details of one method
    const getName = methods.find((m) => m.name === 'getName');
    expect(getName).toBeDefined();
    expect(getName.line).toBeGreaterThan(0);
  });
});

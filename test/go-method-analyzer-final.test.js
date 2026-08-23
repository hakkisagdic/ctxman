import { describe, test, expect } from 'vitest';
import GoMethodAnalyzer from '../lib/analyzers/go-method-analyzer.js';

describe('GoMethodAnalyzer Final Coverage', () => {
  test('extractMethods returns empty array for non-Go files', () => {
    const analyzer = new GoMethodAnalyzer();
    const result = analyzer.extractMethods('const x = 1;', 'test.js');

    expect(result).toEqual([]);
  });

  test('extractMethods processes Go files and finds methods', () => {
    const analyzer = new GoMethodAnalyzer();
    const goCode = `package main

func HelloWorld() string {
    return "Hello"
}

func (s *Server) Start() {
    // server logic
}`;

    const result = analyzer.extractMethods(goCode, 'test.go');

    expect(result.length).toBeGreaterThan(0);
    expect(result[0].name).toBeDefined();
  });
});

import { describe, test, expect } from 'vitest';
import * as API from '../index.js';

describe('API Surface', () => {
  test('exports expected modules', () => {
    // Analyzers
    expect(API.TokenCalculator).toBeDefined();
    expect(API.MethodAnalyzer).toBeDefined();

    // Parsers
    expect(API.GitIgnoreParser).toBeDefined();
    expect(API.MethodFilterParser).toBeDefined();

    // Formatters
    expect(API.GitIngestFormatter).toBeDefined();
    expect(API.ToonFormatter).toBeDefined();
    expect(API.FormatRegistry).toBeDefined();

    // Utils
    expect(API.TokenUtils).toBeDefined();
    expect(API.FileUtils).toBeDefined();
    expect(API.ClipboardUtils).toBeDefined();
    expect(API.ConfigUtils).toBeDefined();
    expect(API.FormatConverter).toBeDefined();
    expect(API.ErrorHandler).toBeDefined();
    expect(API.Logger).toBeDefined();
    expect(API.Updater).toBeDefined();
    expect(API.GitUtils).toBeDefined();

    // Functions
    expect(API.generateDigestFromReport).toBeDefined();
    expect(API.generateDigestFromContext).toBeDefined();
  });

  test('exports backward compatibility aliases', () => {
    expect(API.TokenAnalyzer).toBeDefined();
    expect(API.TokenAnalyzer).toBe(API.TokenCalculator);
  });
});

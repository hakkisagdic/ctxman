import { describe, test, expect, vi, beforeEach } from 'vitest';
import GitIgnoreParser from '../lib/parsers/gitignore-parser.js';
import fs from 'fs';

vi.mock('fs');

describe('GitIgnoreParser Coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Pattern Loading', () => {
    test('loads gitignore patterns when file exists', () => {
      fs.existsSync.mockReturnValue(true);
      fs.statSync.mockReturnValue({ isDirectory: () => false });
      fs.readFileSync.mockReturnValue('node_modules\n*.log');

      const parser = new GitIgnoreParser('/.gitignore', null, null);

      expect(parser.patterns.length).toBe(2);
    });

    test('loads contextignore patterns', () => {
      fs.existsSync.mockImplementation((path) => path && path.includes('.contextignore'));
      fs.statSync.mockReturnValue({ isDirectory: () => false });
      fs.readFileSync.mockReturnValue('test/\n*.test.js');
      vi.spyOn(console, 'log').mockImplementation(() => {});

      const parser = new GitIgnoreParser(null, '/.contextignore', null);

      expect(parser.contextPatterns.length).toBe(2);
      expect(parser.hasIncludeFile).toBe(false);
    });

    test('prioritizes contexti nclude over contextignore', () => {
      fs.existsSync.mockReturnValue(true);
      fs.statSync.mockReturnValue({ isDirectory: () => false });
      fs.readFileSync.mockReturnValue('src/\nlib/');
      vi.spyOn(console, 'log').mockImplementation(() => {});

      const parser = new GitIgnoreParser(null, '/.contextignore', '/.contextinclude');

      expect(parser.hasIncludeFile).toBe(true);
      expect(parser.contextPatterns.length).toBe(2);
    });

    test('handles directory as pattern file', () => {
      fs.existsSync.mockReturnValue(true);
      fs.statSync.mockReturnValue({ isDirectory: () => true });
      vi.spyOn(console, 'warn').mockImplementation(() => {});

      const parser = new GitIgnoreParser('/.gitignore', null, null);

      expect(parser.patterns).toEqual([]);
      expect(console.warn).toHaveBeenCalled();
    });

    test('handles missing pattern file', () => {
      fs.existsSync.mockReturnValue(false);

      const parser = new GitIgnoreParser('/.gitignore', null, null);

      expect(parser.patterns).toEqual([]);
    });

    test('parses pattern file and filters comments', () => {
      fs.existsSync.mockReturnValue(true);
      fs.statSync.mockReturnValue({ isDirectory: () => false });
      fs.readFileSync.mockReturnValue('# Comment\nnode_modules\n\n*.log\n# Another comment');

      const parser = new GitIgnoreParser('/.gitignore', null, null);

      expect(parser.patterns.length).toBe(2);
    });
  });

  describe('Regex Conversion', () => {
    let parser;

    beforeEach(() => {
      fs.existsSync.mockReturnValue(false);
      parser = new GitIgnoreParser(null, null, null);
    });

    test('converts simple pattern', () => {
      const result = parser.convertToRegex('test.js');
      expect(result.regex.test('test.js')).toBe(true);
      expect(result.regex.test('src/test.js')).toBe(true);
      expect(result.isNegation).toBe(false);
    });

    test('converts wildcard pattern', () => {
      const result = parser.convertToRegex('*.log');
      expect(result.regex.test('app.log')).toBe(true);
      expect(result.regex.test('src/app.log')).toBe(true);
      expect(result.regex.test('app.txt')).toBe(false);
    });

    test('converts double-star pattern', () => {
      const result = parser.convertToRegex('**/node_modules');
      // ** at start means can match at any level, including root
      expect(result.regex.test('src/node_modules')).toBe(true);
      expect(result.regex.test('src/lib/node_modules')).toBe(true);
    });

    test('converts directory pattern', () => {
      const result = parser.convertToRegex('build/');
      expect(result.isDirectory).toBe(true);
      expect(result.regex.test('build')).toBe(true);
      expect(result.regex.test('build/output')).toBe(true);
    });

    test('converts negation pattern', () => {
      const result = parser.convertToRegex('!important.js');
      expect(result.isNegation).toBe(true);
      expect(result.regex.test('important.js')).toBe(true);
    });

    test('converts root-anchored pattern', () => {
      const result = parser.convertToRegex('/src');
      expect(result.regex.test('src')).toBe(true);
      expect(result.regex.test('lib/src')).toBe(false);
    });

    test('escapes regex special characters', () => {
      const result = parser.convertToRegex('test.spec.js');
      expect(result.regex.test('test.spec.js')).toBe(true);
      expect(result.regex.test('testXspecXjs')).toBe(false);
    });

    test('handles question mark wildcard', () => {
      const result = parser.convertToRegex('test?.js');
      expect(result.regex.test('test1.js')).toBe(true);
      expect(result.regex.test('testa.js')).toBe(true);
      expect(result.regex.test('test12.js')).toBe(false);
    });
  });

  describe('Pattern Testing', () => {
    let parser;

    beforeEach(() => {
      fs.existsSync.mockReturnValue(true);
      fs.statSync.mockReturnValue({ isDirectory: () => false });
      fs.readFileSync.mockReturnValue('node_modules\n*.log\n!important.log');
      parser = new GitIgnoreParser('/.gitignore', null, null);
    });

    test('testPatterns identifies ignored paths', () => {
      const result = parser.testPatterns(parser.patterns, 'app.log', 'test');
      expect(result).toBe(true);
      expect(parser._lastIgnoreReason).toBe('test');
    });

    test('testPatterns handles negation', () => {
      // First match: *.log -> ignored
      // Second match: !important.log -> not ignored
      const result = parser.testPatterns(parser.patterns, 'important.log', 'test');
      expect(result).toBe(false); // Last pattern wins
    });

    test('testPatternsWithNegation includes by default', () => {
      const patterns = [parser.convertToRegex('*.js')];
      const result = parser.testPatternsWithNegation(patterns, 'test.js');
      expect(result).toBe(true);
    });

    test('testPatternsWithNegation handles negation pattern', () => {
      const patterns = [parser.convertToRegex('*.js'), parser.convertToRegex('!test.js')];
      const result = parser.testPatternsWithNegation(patterns, 'test.js');
      expect(result).toBe(false);
    });

    test('testPatternsWithNegation stops on negation', () => {
      const patterns = [parser.convertToRegex('!exclude.js'), parser.convertToRegex('*.js')];
      const result = parser.testPatternsWithNegation(patterns, 'exclude.js');
      expect(result).toBe(false);
    });
  });

  describe('isIgnored with Include Mode', () => {
    test('include mode: keeps gitignore exclusions', () => {
      fs.existsSync.mockReturnValue(true);
      fs.statSync.mockReturnValue({ isDirectory: () => false });
      fs.readFileSync.mockImplementation((path) => {
        if (path.includes('.gitignore')) return 'node_modules';
        if (path.includes('.contextinclude')) return 'src/';
        return '';
      });
      vi.spyOn(console, 'log').mockImplementation(() => {});

      const parser = new GitIgnoreParser('/.gitignore', null, '/.contextinclude');

      const result = parser.isIgnored('/proj/node_modules', 'node_modules');
      expect(result).toBe(true);
    });

    test('include mode: blocks directories not in include paths', () => {
      fs.existsSync.mockReturnValue(true);
      fs.statSync.mockReturnValue({ isDirectory: () => true });
      fs.readFileSync.mockReturnValue('src/');
      vi.spyOn(console, 'log').mockImplementation(() => {});

      const parser = new GitIgnoreParser(null, null, '/.contextinclude');

      const result = parser.isIgnored('/proj/test', 'test');
      expect(result).toBe(true);
    });

    test('include mode: excludes non-matching files', () => {
      fs.existsSync.mockReturnValue(true);
      fs.statSync.mockReturnValue({ isDirectory: () => false });
      fs.readFileSync.mockReturnValue('*.js');
      vi.spyOn(console, 'log').mockImplementation(() => {});

      const parser = new GitIgnoreParser(null, null, '/.contextinclude');

      // *.js pattern does NOT include .txt files
      const result = parser.isIgnored('/proj/app.txt', 'app.txt');
      expect(result).toBe(true); // not in the include list
    });

    test('include mode: sets correct ignore reason', () => {
      fs.existsSync.mockReturnValue(true);
      fs.statSync.mockReturnValue({ isDirectory: () => false });
      fs.readFileSync.mockReturnValue('src/');
      vi.spyOn(console, 'log').mockImplementation(() => {});

      const parser = new GitIgnoreParser(null, null, '/.contextinclude');

      parser.isIgnored('/proj/test.js', 'test.js');
      expect(parser._lastIgnoreReason).toBe('context-include');
    });
  });

  describe('isIgnored with Exclude Mode', () => {
    test('exclude mode: applies context patterns after gitignore', () => {
      fs.existsSync.mockReturnValue(true);
      fs.statSync.mockReturnValue({ isDirectory: () => false });
      fs.readFileSync.mockImplementation((path) => {
        if (path.includes('.contextignore')) return '*.test.js';
        return '';
      });
      vi.spyOn(console, 'log').mockImplementation(() => {});

      const parser = new GitIgnoreParser(null, '/.contextignore', null);

      const result = parser.isIgnored('/proj/app.test.js', 'app.test.js');
      expect(result).toBe(true);
      expect(parser._lastIgnoreReason).toBe('context');
    });
  });
});

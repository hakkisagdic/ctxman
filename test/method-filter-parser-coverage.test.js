import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import MethodFilterParser from '../lib/parsers/method-filter-parser.js';
import fs from 'fs';
import os from 'os';
import path from 'path';

describe('MethodFilterParser Coverage', () => {
  let tempDir;
  let consoleLogSpy;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'filter-test-'));
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    consoleLogSpy.mockRestore();
  });

  describe('File Loading', () => {
    test('loads method include patterns', () => {
      const includePath = path.join(tempDir, '.methodinclude');
      fs.writeFileSync(includePath, 'handleRequest\nprocessData\n# comment\nvalidate*');

      const parser = new MethodFilterParser(includePath, null);

      expect(parser.hasIncludeFile).toBe(true);
      expect(parser.includePatterns.length).toBe(3);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Method include rules loaded: 3 patterns')
      );
    });

    test('loads method ignore patterns', () => {
      const ignorePath = path.join(tempDir, '.methodignore');
      fs.writeFileSync(ignorePath, 'test*\n_private*\n# ignore comment');

      const parser = new MethodFilterParser(null, ignorePath);

      expect(parser.hasIncludeFile).toBe(false);
      expect(parser.ignorePatterns.length).toBe(2);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Method ignore rules loaded: 2 patterns')
      );
    });

    test('handles missing files gracefully', () => {
      const parser = new MethodFilterParser('/nonexistent/include', '/nonexistent/ignore');

      expect(parser.hasIncludeFile).toBe(false);
      expect(parser.includePatterns).toHaveLength(0);
      expect(parser.ignorePatterns).toHaveLength(0);
    });
  });

  describe('Pattern Matching', () => {
    test('matches wildcard patterns', () => {
      const includePath = path.join(tempDir, '.methodinclude');
      fs.writeFileSync(includePath, 'handle*\nprocess*');

      const parser = new MethodFilterParser(includePath, null);

      expect(parser.shouldIncludeMethod('handleRequest', 'Controller')).toBe(true);
      expect(parser.shouldIncludeMethod('processData', 'Service')).toBe(true);
      expect(parser.shouldIncludeMethod('validateInput', 'Helper')).toBe(false);
    });

    test('matches with filename prefix', () => {
      const includePath = path.join(tempDir, '.methodinclude');
      fs.writeFileSync(includePath, 'UserController.create\nUserService.*');

      const parser = new MethodFilterParser(includePath, null);

      expect(parser.shouldIncludeMethod('create', 'UserController')).toBe(true);
      expect(parser.shouldIncludeMethod('update', 'UserService')).toBe(true);
      expect(parser.shouldIncludeMethod('delete', 'PostController')).toBe(false);
    });

    test('ignore mode excludes matching patterns', () => {
      const ignorePath = path.join(tempDir, '.methodignore');
      fs.writeFileSync(ignorePath, 'test*\n_private*');

      const parser = new MethodFilterParser(null, ignorePath);

      expect(parser.shouldIncludeMethod('testMethod', 'Helper')).toBe(false);
      expect(parser.shouldIncludeMethod('_privateFunc', 'Utils')).toBe(false);
      expect(parser.shouldIncludeMethod('publicMethod', 'Service')).toBe(true);
    });

    test('ignore mode with filename', () => {
      const ignorePath = path.join(tempDir, '.methodignore');
      fs.writeFileSync(ignorePath, 'TestHelper.*');

      const parser = new MethodFilterParser(null, ignorePath);

      expect(parser.shouldIncludeMethod('setup', 'TestHelper')).toBe(false);
      expect(parser.shouldIncludeMethod('setup', 'Helper')).toBe(true);
    });
  });

  describe('Exact Matching', () => {
    test('plain names match whole method names only', () => {
      const includePath = path.join(tempDir, '.methodinclude');
      fs.writeFileSync(includePath, 'startServer\nadd');

      const parser = new MethodFilterParser(includePath, null);

      expect(parser.shouldIncludeMethod('startServer', 'app')).toBe(true);
      expect(parser.shouldIncludeMethod('add', 'math')).toBe(true);
      expect(parser.shouldIncludeMethod('testStartServer', 'app')).toBe(false);
      expect(parser.shouldIncludeMethod('addedLater', 'app')).toBe(false);
      expect(parser.shouldIncludeMethod('padding', 'app')).toBe(false);
    });

    test('a leading or trailing wildcard anchors the other end', () => {
      const includePath = path.join(tempDir, '.methodinclude');
      fs.writeFileSync(includePath, '*Handler\nprocess*');

      const parser = new MethodFilterParser(includePath, null);

      expect(parser.shouldIncludeMethod('requestHandler', 'app')).toBe(true);
      expect(parser.shouldIncludeMethod('HandlerFactory', 'app')).toBe(false);
      expect(parser.shouldIncludeMethod('processData', 'app')).toBe(true);
      expect(parser.shouldIncludeMethod('preprocess', 'app')).toBe(false);
    });

    test('plain names in the ignore file do not drop longer names', () => {
      const ignorePath = path.join(tempDir, '.methodignore');
      fs.writeFileSync(ignorePath, 'it\ndescribe');

      const parser = new MethodFilterParser(null, ignorePath);

      expect(parser.shouldIncludeMethod('it', 'app.test')).toBe(false);
      expect(parser.shouldIncludeMethod('describe', 'app.test')).toBe(false);
      expect(parser.shouldIncludeMethod('init', 'app')).toBe(true);
      expect(parser.shouldIncludeMethod('submit', 'app')).toBe(true);
    });

    test('regex characters in names are matched literally', () => {
      const includePath = path.join(tempDir, '.methodinclude');
      fs.writeFileSync(includePath, 'valid?\n$emit');

      const parser = new MethodFilterParser(includePath, null);

      expect(parser.shouldIncludeMethod('valid?', 'model')).toBe(true);
      expect(parser.shouldIncludeMethod('vali', 'model')).toBe(false);
      expect(parser.shouldIncludeMethod('$emit', 'component')).toBe(true);
    });
  });

  describe('Case Insensitivity', () => {
    test('matches patterns case-insensitively', () => {
      const includePath = path.join(tempDir, '.methodinclude');
      fs.writeFileSync(includePath, 'HandleRequest');

      const parser = new MethodFilterParser(includePath, null);

      expect(parser.shouldIncludeMethod('handlerequest', 'Controller')).toBe(true);
      expect(parser.shouldIncludeMethod('HANDLEREQUEST', 'Controller')).toBe(true);
      expect(parser.shouldIncludeMethod('HandleRequest', 'Controller')).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    test('handles empty pattern files', () => {
      const includePath = path.join(tempDir, '.methodinclude');
      fs.writeFileSync(includePath, '# only comments\n# more comments');

      const parser = new MethodFilterParser(includePath, null);

      expect(parser.includePatterns).toHaveLength(0);
      expect(parser.shouldIncludeMethod('anyMethod', 'AnyClass')).toBe(false);
    });

    test('filters blank lines and comments', () => {
      const ignorePath = path.join(tempDir, '.methodignore');
      fs.writeFileSync(ignorePath, '\ntest*\n\n# comment\n\n_private\n  \n');

      const parser = new MethodFilterParser(null, ignorePath);

      expect(parser.ignorePatterns).toHaveLength(2);
    });

    test('include mode overrides ignore when both present', () => {
      const includePath = path.join(tempDir, '.methodinclude');
      const ignorePath = path.join(tempDir, '.methodignore');

      fs.writeFileSync(includePath, 'important*');
      fs.writeFileSync(ignorePath, 'test*');

      const parser = new MethodFilterParser(includePath, ignorePath);

      // Include mode takes precedence
      expect(parser.hasIncludeFile).toBe(true);
      expect(parser.shouldIncludeMethod('importantMethod', 'Service')).toBe(true);
      expect(parser.shouldIncludeMethod('testMethod', 'Helper')).toBe(false);
    });
  });

  describe('Special Characters in Patterns', () => {
    test('escapes regex special characters correctly', () => {
      const includePath = path.join(tempDir, '.methodinclude');
      fs.writeFileSync(includePath, 'get.*Data');

      const parser = new MethodFilterParser(includePath, null);

      expect(parser.shouldIncludeMethod('getUserData', 'API')).toBe(true);
      expect(parser.shouldIncludeMethod('getProductData', 'Service')).toBe(true);
    });
  });
});

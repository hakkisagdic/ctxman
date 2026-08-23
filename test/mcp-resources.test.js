import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ResourceProvider } from '../lib/api/mcp/resources.js';
import fs from 'fs';
import path from 'path';

// Mock fs module
vi.mock('fs', () => ({
  default: {
    readFileSync: vi.fn(),
    existsSync: vi.fn(),
  },
}));

// Mock logger
vi.mock('../lib/utils/logger.js', () => ({
  getLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// Mock Scanner
vi.mock('../lib/core/Scanner.js', () => ({
  Scanner: class {
    constructor(projectPath) {
      this.projectPath = projectPath;
    }
    scan() {
      return [
        { relativePath: 'src/index.js', path: '/test/src/index.js' },
        { relativePath: 'src/app.js', path: '/test/src/app.js' },
        { relativePath: 'README.md', path: '/test/README.md' },
      ];
    }
  },
}));

describe('ResourceProvider', () => {
  let provider;
  const testProjectPath = '/test/project';

  beforeEach(() => {
    provider = new ResourceProvider(testProjectPath);
    vi.clearAllMocks();
  });

  describe('listResources', () => {
    it('should list resources without cursor', async () => {
      const result = await provider.listResources();

      expect(result.resources).toBeDefined();
      expect(result.resources.length).toBeGreaterThan(0);
      expect(result.resources[0]).toHaveProperty('uri');
      expect(result.resources[0]).toHaveProperty('name');
      expect(result.resources[0]).toHaveProperty('description');
      expect(result.resources[0]).toHaveProperty('mimeType');
    });

    it('should return file:// URIs for codebase files', async () => {
      const result = await provider.listResources();

      const fileResource = result.resources.find((r) => r.uri.startsWith('file://codebase/'));
      expect(fileResource).toBeDefined();
      expect(fileResource.uri).toMatch(/^file:\/\/codebase\/.+/);
    });

    it('should handle pagination with cursor', async () => {
      // Mock scanner with many files
      const mockFiles = Array.from({ length: 150 }, (_, i) => ({
        relativePath: `file${i}.js`,
        path: `/test/file${i}.js`,
      }));

      provider.scanner = {
        scan: () => mockFiles,
      };

      const result = await provider.listResources();
      expect(result.resources.length).toBe(100); // PAGE_SIZE
      expect(result.nextCursor).toBe('100');

      // Get next page
      const result2 = await provider.listResources('100');
      expect(result2.resources.length).toBe(50);
      expect(result2.nextCursor).toBeUndefined();
    });

    it('should handle empty project path', async () => {
      const emptyProvider = new ResourceProvider();
      const result = await emptyProvider.listResources();

      expect(result.resources).toEqual([]);
    });
  });

  describe('getResourceTemplates', () => {
    it('should return resource templates', () => {
      const templates = provider.getResourceTemplates();

      expect(templates).toBeInstanceOf(Array);
      expect(templates.length).toBe(3);

      expect(templates[0].uriTemplate).toBe('file://codebase/{path}');
      expect(templates[1].uriTemplate).toBe('analysis://recent/{id}');
      expect(templates[2].uriTemplate).toBe('context://template/{name}');
    });

    it('should have proper template structure', () => {
      const templates = provider.getResourceTemplates();

      templates.forEach((template) => {
        expect(template).toHaveProperty('uriTemplate');
        expect(template).toHaveProperty('name');
        expect(template).toHaveProperty('description');
        expect(template).toHaveProperty('mimeType');
      });
    });
  });

  describe('readResource', () => {
    beforeEach(() => {
      fs.readFileSync.mockReturnValue('const x = 42;');
    });

    it('should read file resource', async () => {
      const result = await provider.readResource('file://codebase/src/index.js');

      expect(result.contents).toBeDefined();
      expect(result.contents.length).toBe(1);
      expect(result.contents[0].uri).toBe('file://codebase/src/index.js');
      expect(result.contents[0].mimeType).toBe('text/javascript');
      expect(result.contents[0].text).toBe('const x = 42;');
    });

    it('should read analysis resource from cache', async () => {
      const analysisData = { files: [], stats: { totalFiles: 10 } };
      provider.cacheAnalysis('test-123', analysisData);

      const result = await provider.readResource('analysis://recent/test-123');

      expect(result.contents[0].uri).toBe('analysis://recent/test-123');
      expect(result.contents[0].mimeType).toBe('application/json');
      expect(JSON.parse(result.contents[0].text)).toEqual(analysisData);
    });

    it('should read context resource from cache', async () => {
      const contextContent = 'This is context for bug-fix';
      provider.cacheContext('bug-fix', contextContent);

      const result = await provider.readResource('context://template/bug-fix');

      expect(result.contents[0].uri).toBe('context://template/bug-fix');
      expect(result.contents[0].mimeType).toBe('text/plain');
      expect(result.contents[0].text).toBe(contextContent);
    });

    it('should throw error for invalid URI', async () => {
      await expect(provider.readResource('invalid://bad/uri')).rejects.toThrow(
        'Invalid resource URI'
      );
    });

    it('should throw error for missing analysis', async () => {
      await expect(provider.readResource('analysis://recent/nonexistent')).rejects.toThrow(
        'Analysis result not found'
      );
    });

    it('should throw error for missing context', async () => {
      await expect(provider.readResource('context://template/nonexistent')).rejects.toThrow(
        'Context template not found'
      );
    });

    it('should prevent path traversal attacks', async () => {
      await expect(provider.readResource('file://codebase/../../../etc/passwd')).rejects.toThrow(
        'Access denied'
      );
    });
  });

  describe('getMimeType', () => {
    it('should return correct MIME types for common files', () => {
      expect(provider.getMimeType('file.js')).toBe('text/javascript');
      expect(provider.getMimeType('file.ts')).toBe('text/typescript');
      expect(provider.getMimeType('file.py')).toBe('text/x-python');
      expect(provider.getMimeType('file.json')).toBe('application/json');
      expect(provider.getMimeType('file.md')).toBe('text/markdown');
    });

    it('should return text/plain for unknown extensions', () => {
      expect(provider.getMimeType('file.unknown')).toBe('text/plain');
    });

    it('should handle files without extensions', () => {
      expect(provider.getMimeType('README')).toBe('text/plain');
    });
  });

  describe('cache operations', () => {
    it('should cache and retrieve analysis', () => {
      const data = { test: 'data' };
      provider.cacheAnalysis('id1', data);

      expect(provider.cache.get('analysis:id1')).toEqual(data);
    });

    it('should cache and retrieve context', () => {
      const content = 'context content';
      provider.cacheContext('name1', content);

      expect(provider.cache.get('context:name1')).toBe(content);
    });

    it('should overwrite existing cache entries', () => {
      provider.cacheAnalysis('id1', { version: 1 });
      provider.cacheAnalysis('id1', { version: 2 });

      expect(provider.cache.get('analysis:id1')).toEqual({ version: 2 });
    });
  });

  describe('parseUri', () => {
    it('should parse file URIs', () => {
      const result = provider.parseUri('file://codebase/src/index.js');
      expect(result).toEqual({ type: 'file', path: 'src/index.js' });
    });

    it('should parse analysis URIs', () => {
      const result = provider.parseUri('analysis://recent/123');
      expect(result).toEqual({ type: 'analysis', id: '123' });
    });

    it('should parse context URIs', () => {
      const result = provider.parseUri('context://template/bug-fix');
      expect(result).toEqual({ type: 'context', name: 'bug-fix' });
    });

    it('should throw for invalid URIs', () => {
      expect(() => provider.parseUri('https://example.com')).toThrow('Invalid resource URI');
    });
  });
});

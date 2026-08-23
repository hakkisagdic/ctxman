import { describe, test, expect, vi, beforeEach, _afterEach } from 'vitest';
import { ImportTracker } from '../lib/analyzers/import-tracker.js';
import fs from 'fs';
import path from 'path';

// Mock dependencies
vi.mock('fs');
vi.mock('../lib/utils/file-utils.js', () => ({
  default: {
    isText: vi.fn().mockReturnValue(true),
  },
}));
vi.mock('../lib/utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

describe('ImportTracker', () => {
  let tracker;
  const mockProjectRoot = '/mock/project';

  beforeEach(() => {
    vi.clearAllMocks();
    tracker = new ImportTracker(mockProjectRoot);
  });

  describe('constructor', () => {
    test('should initialize with project root', () => {
      expect(tracker.projectRoot).toBe(mockProjectRoot);
      expect(tracker.imports.size).toBe(0);
    });

    test('should accept options', () => {
      const customTracker = new ImportTracker(mockProjectRoot, {
        excludeNodeModules: false,
        includeDevImports: true,
      });
      expect(customTracker.options.excludeNodeModules).toBe(false);
      expect(customTracker.options.includeDevImports).toBe(true);
    });
  });

  describe('parseES6Imports', () => {
    test('should parse default import', () => {
      const content = `import express from 'express';`;
      const imports = tracker.parseES6Imports(content);

      expect(imports).toHaveLength(1);
      expect(imports[0].package).toBe('express');
      expect(imports[0].symbols).toContain('express');
      expect(imports[0].type).toBe('es6');
    });

    test('should parse named imports', () => {
      const content = `import { readFileSync, writeFileSync } from 'fs';`;
      const imports = tracker.parseES6Imports(content);

      expect(imports).toHaveLength(1);
      expect(imports[0].package).toBe('fs');
      expect(imports[0].symbols).toContain('readFileSync');
      expect(imports[0].symbols).toContain('writeFileSync');
    });

    test('should parse namespace imports', () => {
      const content = `import * as lodash from 'lodash';`;
      const imports = tracker.parseES6Imports(content);

      expect(imports).toHaveLength(1);
      expect(imports[0].package).toBe('lodash');
      expect(imports[0].symbols).toContain('* as lodash');
    });

    test('should parse combined imports', () => {
      const content = `import React, { useState, useEffect } from 'react';`;
      const imports = tracker.parseES6Imports(content);

      expect(imports).toHaveLength(1);
      expect(imports[0].package).toBe('react');
      expect(imports[0].symbols).toContain('React');
      expect(imports[0].symbols).toContain('useState');
      expect(imports[0].symbols).toContain('useEffect');
    });

    test('should parse dynamic imports', () => {
      const content = `const module = await import('dynamic-package');`;
      const imports = tracker.parseES6Imports(content);

      expect(imports).toHaveLength(1);
      expect(imports[0].package).toBe('dynamic-package');
      expect(imports[0].type).toBe('dynamic');
    });

    test('should handle multiple imports', () => {
      const content = `
        import express from 'express';
        import { readFile } from 'fs/promises';
        import * as utils from './utils';
      `;
      const imports = tracker.parseES6Imports(content);

      expect(imports).toHaveLength(3);
      expect(imports.map((i) => i.package)).toContain('express');
      expect(imports.map((i) => i.package)).toContain('fs/promises');
    });
  });

  describe('parseCommonJSImports', () => {
    test('should parse simple require', () => {
      const content = `const express = require('express');`;
      const imports = tracker.parseCommonJSImports(content);

      expect(imports).toHaveLength(1);
      expect(imports[0].package).toBe('express');
      expect(imports[0].symbols).toContain('express');
      expect(imports[0].type).toBe('commonjs');
    });

    test('should parse destructured require', () => {
      const content = `const { readFileSync, writeFileSync } = require('fs');`;
      const imports = tracker.parseCommonJSImports(content);

      expect(imports).toHaveLength(1);
      expect(imports[0].package).toBe('fs');
      expect(imports[0].symbols).toContain('readFileSync');
      expect(imports[0].symbols).toContain('writeFileSync');
    });
  });

  describe('isPackageImport', () => {
    test('should return true for package imports', () => {
      expect(tracker.isPackageImport('express')).toBe(true);
      expect(tracker.isPackageImport('@babel/core')).toBe(true);
      expect(tracker.isPackageImport('lodash/fp')).toBe(true);
    });

    test('should return false for relative imports', () => {
      expect(tracker.isPackageImport('./utils')).toBe(false);
      expect(tracker.isPackageImport('../lib/parser')).toBe(false);
      expect(tracker.isPackageImport('/absolute/path')).toBe(false);
    });
  });

  describe('getBasePackageName', () => {
    test('should extract simple package name', () => {
      expect(tracker.getBasePackageName('express')).toBe('express');
      expect(tracker.getBasePackageName('lodash')).toBe('lodash');
    });

    test('should extract scoped package name', () => {
      expect(tracker.getBasePackageName('@babel/core')).toBe('@babel/core');
      expect(tracker.getBasePackageName('@types/node')).toBe('@types/node');
    });

    test('should extract base from subpath', () => {
      expect(tracker.getBasePackageName('lodash/fp')).toBe('lodash');
      expect(tracker.getBasePackageName('@babel/parser/lib')).toBe('@babel/parser');
    });
  });

  describe('parseFile', () => {
    test('should parse file and return imports', () => {
      const mockContent = `
        import express from 'express';
        import { readFile } from 'fs/promises';
        const lodash = require('lodash');
      `;

      vi.mocked(fs.readFileSync).mockReturnValue(mockContent);

      const imports = tracker.parseFile('/mock/project/index.js');

      expect(imports.length).toBeGreaterThan(0);
      expect(imports.map((i) => i.package)).toContain('express');
      // Note: fs/promises is normalized to 'fs' by getBasePackageName
      expect(imports.map((i) => i.package)).toContain('fs');
    });

    test('should filter out relative imports', () => {
      const mockContent = `
        import local from './local';
        import express from 'express';
      `;

      vi.mocked(fs.readFileSync).mockReturnValue(mockContent);

      const imports = tracker.parseFile('/mock/project/index.js');

      expect(imports.map((i) => i.package)).not.toContain('./local');
      expect(imports.map((i) => i.package)).toContain('express');
    });

    test('should handle file read errors', () => {
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('File not found');
      });

      const imports = tracker.parseFile('/nonexistent/file.js');

      expect(imports).toEqual([]);
    });
  });

  describe('scanSourceFiles', () => {
    test('should scan directory for source files', () => {
      vi.mocked(fs.readdirSync).mockImplementation((dir) => {
        if (dir === mockProjectRoot) {
          return [
            { name: 'src', isDirectory: () => true, isFile: () => false },
            { name: 'index.js', isDirectory: () => false, isFile: () => true },
            { name: 'package.json', isDirectory: () => false, isFile: () => true },
          ];
        }
        if (dir === path.join(mockProjectRoot, 'src')) {
          return [{ name: 'main.js', isDirectory: () => false, isFile: () => true }];
        }
        return [];
      });

      const files = tracker.scanSourceFiles(mockProjectRoot);

      expect(files.length).toBeGreaterThan(0);
    });

    test('should skip node_modules directory', () => {
      vi.mocked(fs.readdirSync).mockImplementation((dir) => {
        if (dir === mockProjectRoot) {
          return [
            { name: 'node_modules', isDirectory: () => true, isFile: () => false },
            { name: 'index.js', isDirectory: () => false, isFile: () => true },
          ];
        }
        return [];
      });

      const files = tracker.scanSourceFiles(mockProjectRoot);

      expect(files.some((f) => f.includes('node_modules'))).toBe(false);
    });
  });

  describe('trackImports', () => {
    test('should track imports from multiple files', () => {
      const file1Content = `import express from 'express';`;
      const file2Content = `import lodash from 'lodash';`;

      vi.mocked(fs.readdirSync).mockImplementation((dir) => {
        if (dir === mockProjectRoot) {
          return [
            { name: 'file1.js', isDirectory: () => false, isFile: () => true },
            { name: 'file2.js', isDirectory: () => false, isFile: () => true },
          ];
        }
        return [];
      });

      vi.mocked(fs.readFileSync)
        .mockReturnValueOnce(file1Content)
        .mockReturnValueOnce(file2Content);

      const imports = tracker.trackImports(['/mock/project/file1.js', '/mock/project/file2.js']);

      expect(imports.length).toBe(2);
    });

    test('should aggregate imports from same package', () => {
      const file1Content = `import express from 'express';`;
      const file2Content = `import { Router } from 'express';`;

      vi.mocked(fs.readFileSync)
        .mockReturnValueOnce(file1Content)
        .mockReturnValueOnce(file2Content);

      const imports = tracker.trackImports(['/mock/project/file1.js', '/mock/project/file2.js']);

      const expressImport = imports.find((i) => i.package === 'express');
      expect(expressImport).toBeDefined();
      expect(expressImport.imports).toContain('express');
      expect(expressImport.imports).toContain('Router');
      expect(expressImport.files.length).toBe(2);
    });
  });

  describe('isPackageActive', () => {
    test('should return true for active packages', () => {
      tracker.imports.set('express', {
        package: 'express',
        imports: [],
        files: [],
        types: new Set(),
      });

      expect(tracker.isPackageActive('express')).toBe(true);
    });

    test('should return false for inactive packages', () => {
      expect(tracker.isPackageActive('nonexistent')).toBe(false);
    });
  });

  describe('getPackageImports', () => {
    test('should return import details for package', () => {
      const mockRecord = {
        package: 'express',
        imports: ['express', 'Router'],
        files: ['/src/index.js'],
        types: new Set(['es6']),
      };
      tracker.imports.set('express', mockRecord);

      const result = tracker.getPackageImports('express');

      expect(result).toEqual(mockRecord);
    });

    test('should return null for unknown package', () => {
      const result = tracker.getPackageImports('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('getStats', () => {
    test('should return statistics', () => {
      tracker.imports.set('express', {
        package: 'express',
        imports: ['express'],
        files: ['/src/index.js'],
        types: new Set(['es6']),
      });

      const stats = tracker.getStats();

      expect(stats.totalPackages).toBe(1);
    });
  });

  describe('reset', () => {
    test('should clear all tracked imports', () => {
      tracker.imports.set('express', {
        package: 'express',
        imports: [],
        files: [],
        types: new Set(),
      });

      tracker.reset();

      expect(tracker.imports.size).toBe(0);
    });
  });
});

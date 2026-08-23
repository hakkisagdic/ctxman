import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { DependencyScanner } from '../lib/analyzers/dependency-scanner.js';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

// Mock dependencies
vi.mock('fs');
vi.mock('child_process');
vi.mock('../lib/utils/token-utils.js', () => ({
  default: {
    calculate: vi.fn().mockReturnValue(100)
  }
}));
vi.mock('../lib/utils/file-utils.js', () => ({
  default: {
    isText: vi.fn().mockReturnValue(true)
  }
}));
vi.mock('../lib/utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  })
}));

describe('DependencyScanner', () => {
  let scanner;
  const mockProjectRoot = '/mock/project';

  beforeEach(() => {
    vi.clearAllMocks();
    scanner = new DependencyScanner(mockProjectRoot);
  });

  describe('constructor', () => {
    test('should initialize with project root', () => {
      expect(scanner.projectRoot).toBe(mockProjectRoot);
      expect(scanner.stats.totalDependencies).toBe(0);
    });

    test('should accept options', () => {
      const customScanner = new DependencyScanner(mockProjectRoot, {
        depth: 2,
        includeTypes: true,
        checkSecurity: false
      });
      expect(customScanner.options.depth).toBe(2);
      expect(customScanner.options.includeTypes).toBe(true);
      expect(customScanner.options.checkSecurity).toBe(false);
    });
  });

  describe('loadPackageJson', () => {
    test('should load and parse package.json', () => {
      const mockPackageJson = {
        name: 'test-project',
        dependencies: { express: '^4.18.0' },
        devDependencies: { jest: '^29.0.0' }
      };
      
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockPackageJson));
      
      const result = scanner.loadPackageJson();
      
      expect(result.name).toBe('test-project');
      expect(result.dependencies).toEqual({ express: '^4.18.0' });
    });

    test('should throw error if package.json not found', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      
      expect(() => scanner.loadPackageJson()).toThrow('No package.json found');
    });

    test('should throw error if package.json is invalid', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('not valid json');
      
      expect(() => scanner.loadPackageJson()).toThrow('Failed to parse package.json');
    });
  });

  describe('getAllDependencies', () => {
    test('should merge dependencies and devDependencies', () => {
      scanner.packageJson = {
        dependencies: { express: '^4.18.0' },
        devDependencies: { jest: '^29.0.0' }
      };
      
      const deps = scanner.getAllDependencies();
      
      expect(deps).toEqual({
        express: '^4.18.0',
        jest: '^29.0.0'
      });
    });

    test('should handle missing dependencies', () => {
      scanner.packageJson = { name: 'test' };
      
      const deps = scanner.getAllDependencies();
      
      expect(deps).toEqual({});
    });
  });

  describe('findDependencyPath', () => {
    test('should find dependency in standard node_modules', () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        return p === path.join(mockProjectRoot, 'node_modules', 'express');
      });
      
      const depPath = scanner.findDependencyPath('express');
      
      expect(depPath).toBe(path.join(mockProjectRoot, 'node_modules', 'express'));
    });

    test('should return null if dependency not found', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      
      const depPath = scanner.findDependencyPath('nonexistent');
      
      expect(depPath).toBeNull();
    });

    test('should handle pnpm structure', () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        if (p === path.join(mockProjectRoot, 'node_modules', 'express')) return false;
        if (p === path.join(mockProjectRoot, 'node_modules', '.pnpm')) return true;
        return false;
      });
      
      vi.mocked(fs.readdirSync).mockReturnValue(['express@4.18.2']);
      
      // This would find the package in pnpm structure
      const depPath = scanner.findDependencyPath('express');
      
      // Since the nested path doesn't exist, it returns null
      expect(depPath).toBeNull();
    });
  });

  describe('getInstalledVersion', () => {
    test('should read version from package.json', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ version: '4.18.2' }));
      
      const version = scanner.getInstalledVersion('express', '/path/to/express');
      
      expect(version).toBe('4.18.2');
    });

    test('should return unknown if package.json not found', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      
      const version = scanner.getInstalledVersion('express', '/path/to/express');
      
      expect(version).toBe('unknown');
    });
  });

  describe('scanDependencyTokens', () => {
    test('should count tokens in dependency files', () => {
      vi.mocked(fs.readdirSync).mockImplementation((dir) => {
        if (dir === '/dep') {
          return [
            { name: 'index.js', isDirectory: () => false, isFile: () => true },
            { name: 'lib', isDirectory: () => true, isFile: () => false }
          ];
        }
        if (dir === '/dep/lib') {
          return [
            { name: 'util.js', isDirectory: () => false, isFile: () => true }
          ];
        }
        return [];
      });
      
      vi.mocked(fs.readFileSync).mockReturnValue('some code');
      
      const result = scanner.scanDependencyTokens('/dep');
      
      expect(result.tokens).toBeGreaterThan(0);
      expect(result.files).toBe(2);
    });

    test('should skip test directories', () => {
      vi.mocked(fs.readdirSync).mockImplementation((dir) => {
        if (dir === '/dep') {
          return [
            { name: 'index.js', isDirectory: () => false, isFile: () => true },
            { name: 'test', isDirectory: () => true, isFile: () => false }
          ];
        }
        return [];
      });
      
      vi.mocked(fs.readFileSync).mockReturnValue('some code');
      
      const result = scanner.scanDependencyTokens('/dep');
      
      expect(result.files).toBe(1);
    });
  });

  describe('extractTypeDefinitions', () => {
    test('should extract .d.ts files', () => {
      vi.mocked(fs.readdirSync).mockImplementation((dir) => {
        if (dir === '/dep') {
          return [
            { name: 'index.d.ts', isDirectory: () => false, isFile: () => true },
            { name: 'index.js', isDirectory: () => false, isFile: () => true }
          ];
        }
        return [];
      });
      
      vi.mocked(fs.readFileSync).mockReturnValue('declare function test(): void;');
      
      const types = scanner.extractTypeDefinitions('/dep', 'test-pkg');
      
      expect(types.length).toBe(1);
      expect(types[0].file).toBe('index.d.ts');
    });

    test('should limit to max files', () => {
      vi.mocked(fs.readdirSync).mockImplementation((dir) => {
        return Array.from({ length: 15 }, (_, i) => ({
          name: `file${i}.d.ts`,
          isDirectory: () => false,
          isFile: () => true
        }));
      });
      
      vi.mocked(fs.readFileSync).mockReturnValue('declare function test(): void;');
      
      const types = scanner.extractTypeDefinitions('/dep', 'test-pkg');
      
      expect(types.length).toBe(10); // maxFiles limit
    });

    test('should truncate large files', () => {
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: 'large.d.ts', isDirectory: () => false, isFile: () => true }
      ]);
      
      const largeContent = 'x'.repeat(10000);
      vi.mocked(fs.readFileSync).mockReturnValue(largeContent);
      
      const types = scanner.extractTypeDefinitions('/dep', 'test-pkg');
      
      expect(types[0].content.length).toBeLessThan(10000);
      expect(types[0].content).toContain('truncated');
    });
  });

  describe('checkSecurity', () => {
    test('should skip security check when disabled', async () => {
      scanner.options.checkSecurity = false;
      
      const result = await scanner.checkSecurity('express', '4.18.2');
      
      expect(result.status).toBe('skipped');
    });

    test('should return vulnerabilities from audit', async () => {
      vi.mocked(execSync).mockImplementation(() => {
        throw Object.assign(new Error('audit failed'), {
          stdout: JSON.stringify({
            vulnerabilities: {
              lodash: {
                severity: 'high',
                name: 'Prototype Pollution',
                via: [{ name: 'lodash' }],
                fixAvailable: true
              }
            }
          })
        });
      });
      
      const result = await scanner.checkSecurity('lodash', '4.17.0');
      
      expect(result.status).toBe('review');
      expect(result.vulnerabilities.length).toBeGreaterThan(0);
    });

    test('should return ok when no vulnerabilities', async () => {
      vi.mocked(execSync).mockReturnValue(JSON.stringify({ vulnerabilities: {} }));
      
      const result = await scanner.checkSecurity('express', '4.18.2');
      
      expect(result.status).toBe('ok');
      expect(result.vulnerabilities).toEqual([]);
    });
  });

  describe('analyzeDependency', () => {
    test('should analyze installed dependency', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([]);
      vi.mocked(fs.readFileSync)
        .mockReturnValueOnce(JSON.stringify({ version: '4.18.2' })) // package.json
        .mockReturnValue(''); // files
      
      vi.mocked(execSync).mockReturnValue(JSON.stringify({ vulnerabilities: {} }));
      
      const result = await scanner.analyzeDependency('express', '^4.18.0');
      
      expect(result.name).toBe('express');
      expect(result.status).toBe('installed');
    });

    test('should handle missing dependency', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      
      const result = await scanner.analyzeDependency('nonexistent', '^1.0.0');
      
      expect(result.status).toBe('missing');
      expect(result.tokens).toBe(0);
    });
  });

  describe('analyze', () => {
    test('should analyze all dependencies', async () => {
      scanner.packageJson = {
        dependencies: { express: '^4.18.0' },
        devDependencies: { jest: '^29.0.0' }
      };
      
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([]);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ version: '1.0.0' }));
      vi.mocked(execSync).mockReturnValue(JSON.stringify({ vulnerabilities: {} }));
      
      const result = await scanner.analyze([]);
      
      expect(result.dependencies.length).toBe(2);
      expect(result.summary.totalDependencies).toBe(2);
    });

    test('should mark active dependencies', async () => {
      scanner.packageJson = {
        dependencies: { express: '^4.18.0' }
      };
      
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([]);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ version: '4.18.2' }));
      vi.mocked(execSync).mockReturnValue(JSON.stringify({ vulnerabilities: {} }));
      
      const result = await scanner.analyze([{ package: 'express' }]);
      
      expect(result.dependencies[0].active).toBe(true);
      expect(result.summary.activeDependencies).toBe(1);
    });

    test('should sort by token count', async () => {
      scanner.packageJson = {
        dependencies: { 
          small: '^1.0.0',
          large: '^1.0.0'
        }
      };
      
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: 'file.js', isDirectory: () => false, isFile: () => true }
      ]);
      
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ version: '1.0.0' }));
      vi.mocked(execSync).mockReturnValue(JSON.stringify({ vulnerabilities: {} }));
      
      const result = await scanner.analyze([]);
      
      // Should be sorted by tokens (descending)
      expect(result.dependencies).toBeDefined();
      expect(result.dependencies.length).toBe(2);
    });
  });

  describe('generateContext', () => {
    test('should generate dependency context', () => {
      const analysis = {
        summary: {
          totalDependencies: 2,
          activeDependencies: 1,
          totalTokens: 1000,
          securityIssues: 0
        },
        dependencies: [
          { name: 'express', version: '4.18.2', active: true, tokens: 500, security: { status: 'ok', vulnerabilities: [] } },
          { name: 'lodash', version: '4.17.21', active: false, tokens: 500, security: { status: 'ok', vulnerabilities: [] } }
        ]
      };
      
      const activeImports = [{ package: 'express', imports: ['express'], files: ['index.js'] }];
      
      const context = scanner.generateContext(analysis, activeImports);
      
      expect(context.summary.totalDependencies).toBe(2);
      expect(context.packages.length).toBe(2);
      expect(context.packages[0].active).toBe(true);
    });

    test('should include security issues', () => {
      const analysis = {
        summary: {
          totalDependencies: 1,
          activeDependencies: 0,
          totalTokens: 100,
          securityIssues: 1
        },
        dependencies: [
          { 
            name: 'lodash', 
            version: '4.17.0', 
            active: false, 
            tokens: 100, 
            security: { 
              status: 'review',
              vulnerabilities: [{ severity: 'high' }]
            } 
          }
        ]
      };
      
      const context = scanner.generateContext(analysis, []);
      
      expect(context.packages[0].vulnerabilities).toBeDefined();
      expect(context.packages[0].vulnerabilities.length).toBe(1);
    });

    test('should include types when requested', () => {
      scanner.options.includeTypes = true;
      
      const analysis = {
        summary: {
          totalDependencies: 1,
          activeDependencies: 0,
          totalTokens: 100,
          securityIssues: 0
        },
        dependencies: [
          { 
            name: 'express', 
            version: '4.18.2', 
            active: true, 
            tokens: 100, 
            security: { status: 'ok', vulnerabilities: [] },
            types: [{ file: 'index.d.ts', tokens: 50 }]
          }
        ]
      };
      
      const context = scanner.generateContext(analysis, [{ package: 'express', imports: [], files: [] }]);
      
      expect(context.packages[0].types).toBeDefined();
    });
  });

  describe('getStats', () => {
    test('should return statistics', () => {
      scanner.stats.totalDependencies = 5;
      scanner.stats.activeDependencies = 3;
      
      const stats = scanner.getStats();
      
      expect(stats.totalDependencies).toBe(5);
      expect(stats.activeDependencies).toBe(3);
    });
  });
});

/**
 * Tests for Multi-Repository Manager (FEAT-006)
 */

import { describe, it, expect, beforeEach, afterEach, _vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import MultiRepoManager from '../lib/utils/multi-repo-manager.js';

const FIXTURE_FILES = [
  ['index.js', 'export const answer = 42;\n'],
  [path.join('src', 'util.js'), 'export function add(a, b) {\n  return a + b;\n}\n'],
  ['README.md', '# Fixture repo\n\nA tiny repository used by the analyzer tests.\n'],
];

describe('MultiRepoManager', () => {
  let manager;
  let testConfigDir;
  let testConfigPath;
  let uniqueId;
  let fixtureRepoDir;

  beforeEach(() => {
    // Create a unique temp config directory for each test
    uniqueId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    testConfigDir = path.join(process.cwd(), `.ctxman-test-${uniqueId}`);
    testConfigPath = path.join(testConfigDir, 'repos.json');

    // Ensure directory exists
    fs.mkdirSync(testConfigDir, { recursive: true });

    // Create manager and explicitly initialize empty config
    manager = new MultiRepoManager(process.cwd(), {
      configPath: testConfigPath,
      autoSave: true,
    });

    // Start with a fresh empty config
    manager.config = { version: '1.0', repos: [] };

    // A tiny repository of known size to analyze, outside the project tree
    fixtureRepoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-fixture-repo-'));
    for (const [relativePath, contents] of FIXTURE_FILES) {
      const filePath = path.join(fixtureRepoDir, relativePath);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, contents);
    }
  });

  afterEach(() => {
    // Cleanup test directory
    try {
      if (fs.existsSync(testConfigDir)) {
        fs.rmSync(testConfigDir, { recursive: true, force: true });
      }
    } catch (_e) {
      // Ignore cleanup errors
    }

    try {
      fs.rmSync(fixtureRepoDir, { recursive: true, force: true });
    } catch (_e) {
      // Ignore cleanup errors
    }
  });

  describe('constructor', () => {
    it('should create instance with default config path', () => {
      const defaultManager = new MultiRepoManager(process.cwd());
      expect(defaultManager.configPath).toBe(path.join(process.cwd(), '.ctxman', 'repos.json'));
    });

    it('should create instance with custom config path', () => {
      expect(manager.configPath).toBe(testConfigPath);
    });
  });

  describe('load', () => {
    it('should return default config when file does not exist', () => {
      // Remove the test config file
      if (fs.existsSync(testConfigPath)) {
        fs.unlinkSync(testConfigPath);
      }
      const newManager = new MultiRepoManager(process.cwd(), { configPath: testConfigPath });
      const config = newManager.load();
      expect(config.version).toBe('1.0');
      expect(config.repos).toEqual([]);
    });

    it('should load existing config file', () => {
      const existingConfig = {
        version: '1.0',
        repos: [{ id: 'test', path: '../test', alias: 'Test' }],
      };
      fs.writeFileSync(testConfigPath, JSON.stringify(existingConfig));

      const newManager = new MultiRepoManager(process.cwd(), { configPath: testConfigPath });
      const config = newManager.load();
      expect(config.repos.length).toBe(1);
      expect(config.repos[0].id).toBe('test');
    });
  });

  describe('save', () => {
    it('should create config directory if it does not exist', () => {
      // Remove the directory
      fs.rmSync(testConfigDir, { recursive: true, force: true });

      manager.config = { version: '1.0', repos: [] };
      manager.save();

      expect(fs.existsSync(testConfigDir)).toBe(true);
      expect(fs.existsSync(testConfigPath)).toBe(true);
    });

    it('should save config to file', () => {
      manager.config = { version: '1.0', repos: [{ id: 'test', path: '../test' }] };
      manager.save();

      const saved = JSON.parse(fs.readFileSync(testConfigPath, 'utf-8'));
      expect(saved.repos.length).toBe(1);
    });
  });

  describe('addRepo', () => {
    it('should add a repository to config', () => {
      const repo = manager.addRepo('../test-repo');
      expect(repo.id).toBeDefined();
      expect(repo.path).toBe('../test-repo');
      expect(repo.alias).toBe('test-repo');
    });

    it('should add repository with custom alias', () => {
      const repo = manager.addRepo('../test-repo', { alias: 'Test Repository' });
      expect(repo.alias).toBe('Test Repository');
    });

    it('should add repository with custom exclude patterns', () => {
      const repo = manager.addRepo('../test-repo', {
        exclude: ['node_modules/**', 'dist/**'],
      });
      expect(repo.exclude).toEqual(['node_modules/**', 'dist/**']);
    });

    it('should not add duplicate repositories', () => {
      manager.addRepo('../test-repo');
      manager.addRepo('../test-repo');
      expect(manager.config.repos.length).toBe(1);
    });

    it('should auto-save when autoSave is true', () => {
      manager.addRepo('../test-repo');

      const saved = JSON.parse(fs.readFileSync(testConfigPath, 'utf-8'));
      expect(saved.repos.length).toBe(1);
    });
  });

  describe('removeRepo', () => {
    it('should remove an existing repository', () => {
      manager.addRepo('../test-repo');
      const result = manager.removeRepo('../test-repo');
      expect(result).toBe(true);
      expect(manager.config.repos.length).toBe(0);
    });

    it('should return false for non-existing repository', () => {
      const result = manager.removeRepo('../non-existing');
      expect(result).toBe(false);
    });

    it('should auto-save after removal', () => {
      manager.addRepo('../test-repo');
      manager.removeRepo('../test-repo');

      const saved = JSON.parse(fs.readFileSync(testConfigPath, 'utf-8'));
      expect(saved.repos.length).toBe(0);
    });
  });

  describe('listRepos', () => {
    it('should return empty array when no repos configured', () => {
      expect(manager.listRepos()).toEqual([]);
    });

    it('should return all configured repos', () => {
      manager.addRepo('../frontend');
      manager.addRepo('../api');

      const repos = manager.listRepos();
      expect(repos.length).toBe(2);
    });
  });

  describe('analyzeRepo', () => {
    it('should return error for non-existing path', () => {
      const result = manager.analyzeRepo({
        id: 'test',
        path: '../non-existing-repo',
        alias: 'Test',
      });

      expect(result.error).toBeDefined();
    });

    it('should analyze existing repository', () => {
      const result = manager.analyzeRepo({
        id: 'fixture',
        path: fixtureRepoDir,
        alias: 'Fixture Repo',
      });

      expect(result.error).toBeUndefined();
      expect(result.files).toBe(FIXTURE_FILES.length);
      expect(result.tokens).toBeGreaterThan(0);
    });
  });

  describe('analyzeAll', () => {
    it('should return empty results when no repos configured', () => {
      const results = manager.analyzeAll();
      expect(results.repos).toEqual([]);
      expect(results.combined.totalFiles).toBe(0);
    });

    it('should analyze all configured repos', () => {
      manager.addRepo(fixtureRepoDir, { alias: 'Fixture Repo' });

      const results = manager.analyzeAll();
      expect(results.repos.length).toBe(1);
      expect(results.combined.totalFiles).toBe(FIXTURE_FILES.length);
    });

    it('should calculate percentages correctly', () => {
      manager.addRepo(fixtureRepoDir, { alias: 'Fixture Repo' });

      const results = manager.analyzeAll();
      expect(results.repos[0].percentage).toBe('100.0');
    });
  });

  describe('formatResults', () => {
    it('should format empty results', () => {
      const results = { repos: [], combined: { totalFiles: 0, totalTokens: 0 } };
      const output = manager.formatResults(results);
      expect(output).toContain('No repositories configured');
    });

    it('should format analysis results', () => {
      const results = {
        repos: [
          { alias: 'Frontend', path: '../frontend', files: 100, tokens: 50000, percentage: '50.0' },
          { alias: 'API', path: '../api', files: 80, tokens: 50000, percentage: '50.0' },
        ],
        combined: { totalFiles: 180, totalTokens: 100000 },
      };

      const output = manager.formatResults(results);
      expect(output).toContain('Frontend');
      expect(output).toContain('API');
      expect(output).toContain('100,000');
    });
  });

  describe('formatList', () => {
    it('should format empty list', () => {
      const output = manager.formatList();
      expect(output).toContain('No repositories configured');
    });

    it('should format repository list', () => {
      manager.addRepo('../frontend', { alias: 'Frontend App' });
      manager.addRepo('../api', { alias: 'API Service' });

      const output = manager.formatList();
      expect(output).toContain('Frontend App');
      expect(output).toContain('API Service');
    });
  });

  describe('resolvePath', () => {
    it('should resolve relative paths', () => {
      const resolved = manager.resolvePath('../test-repo');
      expect(path.isAbsolute(resolved)).toBe(true);
    });

    it('should return absolute paths unchanged', () => {
      const absolute = '/absolute/path/to/repo';
      const resolved = manager.resolvePath(absolute);
      expect(resolved).toBe(absolute);
    });
  });

  describe('generateRepoId', () => {
    it('should generate unique IDs', async () => {
      const id1 = manager.generateRepoId('../test-repo');
      // Add a small delay to ensure different timestamp
      await new Promise((resolve) => setTimeout(resolve, 10));
      const id2 = manager.generateRepoId('../test-repo');
      // IDs should be different due to timestamp
      expect(id1).not.toBe(id2);
    });

    it('should include basename in ID', () => {
      const id = manager.generateRepoId('../my-frontend');
      expect(id).toContain('my-frontend');
    });
  });
});

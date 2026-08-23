import { describe, test, expect, vi, beforeEach } from 'vitest';
import GitUtils from '../lib/utils/git-utils.js';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import https from 'https';
import { EventEmitter } from 'events';

vi.mock('child_process');
vi.mock('fs');
vi.mock('https');
vi.mock('../lib/analyzers/token-calculator.js', () => ({
  default: class {
    constructor() {
      this.stats = { totalFiles: 5, totalTokens: 1000, totalLines: 500 };
    }
    analyze() {
      return [];
    }
  },
}));
vi.mock('../lib/formatters/gitingest-formatter.js', () => ({
  default: class {
    constructor() {}
    generateDigest() {
      return 'digest content';
    }
  },
}));

describe('GitUtils Advanced Coverage', () => {
  let gitUtils;
  const mockTempDir = '/mock/temp';

  beforeEach(() => {
    vi.clearAllMocks();
    gitUtils = new GitUtils({ tempDir: mockTempDir, verbose: true });

    // Default fs mocks
    fs.existsSync.mockReturnValue(false);
    fs.mkdirSync.mockImplementation(() => {});
    fs.rmSync.mockImplementation(() => {});
    fs.writeFileSync.mockImplementation(() => {});
    fs.readdirSync.mockReturnValue([]);
    fs.statSync.mockReturnValue({ isDirectory: () => false, size: 100 });
  });

  describe('URL Parsing Edge Cases', () => {
    test('parseGitHubURL handles invalid URLs', () => {
      expect(() => gitUtils.parseGitHubURL('invalid-url')).toThrow('Failed to parse GitHub URL');
      expect(() => gitUtils.parseGitHubURL('https://github.com/owner')).toThrow(
        'must include owner and repo'
      );
    });

    test('parseGitHubURL handles git@ format', () => {
      const info = gitUtils.parseGitHubURL('git@github.com:owner/repo.git');
      expect(info.owner).toBe('owner');
      expect(info.repo).toBe('repo');
    });

    test('parseGitHubURL handles short format', () => {
      const info = gitUtils.parseGitHubURL('owner/repo');
      expect(info.owner).toBe('owner');
      expect(info.repo).toBe('repo');
    });
  });

  describe('Cloning Edge Cases', () => {
    test('cloneRepository throws if git not installed', () => {
      execSync.mockImplementation((cmd) => {
        if (cmd.includes('--version')) throw new Error('Command not found');
        return '';
      });

      expect(() => gitUtils.cloneRepository({ fullName: 'test/repo' })).toThrow(
        'Git is not installed'
      );
    });

    test('cloneRepository handles existing directory', () => {
      fs.existsSync.mockReturnValue(true);
      execSync.mockReturnValue(''); // Git check passes

      gitUtils.cloneRepository({ fullName: 'test/repo', cloneUrl: 'url', branch: 'main' });

      expect(fs.rmSync).toHaveBeenCalledWith(
        expect.stringContaining('test-repo'),
        expect.objectContaining({ recursive: true })
      );
    });

    test('cloneRepository handles clone failure', () => {
      execSync.mockImplementation((cmd) => {
        if (cmd.includes('clone')) throw new Error('Clone failed');
        return '';
      });

      expect(() =>
        gitUtils.cloneRepository({ fullName: 'test/repo', cloneUrl: 'url', branch: 'main' })
      ).toThrow('Failed to clone repository');
    });
  });

  describe('GitHub API & Fetching', () => {
    test('fetchFileFromGitHub handles errors', async () => {
      const mockReq = new EventEmitter();
      https.get.mockImplementation((url, callback) => {
        return mockReq;
      });

      const promise = gitUtils.fetchFileFromGitHub('url');
      mockReq.emit('error', new Error('Network error'));

      await expect(promise).rejects.toThrow('Network error');
    });

    test('fetchFileFromGitHub handles non-200 status', async () => {
      const mockReq = new EventEmitter();
      const mockRes = new EventEmitter();
      mockRes.statusCode = 404;

      https.get.mockImplementation((url, callback) => {
        callback(mockRes);
        return mockReq;
      });

      const promise = gitUtils.fetchFileFromGitHub('url');
      mockRes.emit('data', 'Not Found');
      mockRes.emit('end');

      await expect(promise).rejects.toThrow('HTTP 404');
    });

    test('getRepositoryInfo handles JSON parse error', async () => {
      const mockReq = new EventEmitter();
      const mockRes = new EventEmitter();

      https.get.mockImplementation((url, options, callback) => {
        callback(mockRes);
        return mockReq;
      });

      const promise = gitUtils.getRepositoryInfo({ apiUrl: 'url' });
      mockRes.emit('data', 'invalid json');
      mockRes.emit('end');

      await expect(promise).rejects.toThrow('Failed to parse GitHub API response');
    });
  });

  describe('Utility Methods', () => {
    test('listCachedRepos handles empty temp dir', () => {
      fs.existsSync.mockReturnValue(false);
      expect(gitUtils.listCachedRepos()).toEqual([]);
    });

    test('getDirectorySize calculates recursive size', () => {
      // Mock structure:
      // root
      //  - file1 (100)
      //  - subdir
      //     - file2 (200)

      fs.readdirSync.mockImplementation((dir) => {
        if (dir === '/mock/root') return ['file1', 'subdir'];
        if (dir === '/mock/root/subdir') return ['file2'];
        return [];
      });

      fs.statSync.mockImplementation((p) => {
        if (p.endsWith('subdir')) return { isDirectory: () => true, size: 0 };
        if (p.endsWith('file1')) return { isDirectory: () => false, size: 100 };
        if (p.endsWith('file2')) return { isDirectory: () => false, size: 200 };
        return { isDirectory: () => false, size: 0 };
      });

      const size = gitUtils.getDirectorySize('/mock/root');
      expect(size).toBe(300);
    });
  });
});

import { describe, test, expect, vi, beforeEach, _afterEach } from 'vitest';
import GitUtils from '../lib/utils/git-utils.js';
import { execSync, execFileSync } from 'child_process';
import fs from 'fs';
import https from 'https';
import TokenCalculator from '../lib/analyzers/token-calculator.js';
import GitIngestFormatter from '../lib/formatters/gitingest-formatter.js';

vi.mock('child_process');
vi.mock('fs');
vi.mock('https');
vi.mock('../lib/analyzers/token-calculator.js');
vi.mock('../lib/formatters/gitingest-formatter.js');

describe('GitUtils', () => {
  let gitUtils;

  beforeEach(() => {
    vi.clearAllMocks();
    gitUtils = new GitUtils();

    // Default mocks
    fs.existsSync.mockReturnValue(false);
    fs.mkdirSync.mockImplementation(() => {});
    fs.rmSync.mockImplementation(() => {});
    execSync.mockReturnValue('git version 2.30.0');
  });

  describe('parseGitHubURL', () => {
    test('parses standard HTTPS URL', () => {
      const info = gitUtils.parseGitHubURL('https://github.com/owner/repo');
      expect(info).toEqual(
        expect.objectContaining({
          owner: 'owner',
          repo: 'repo',
          fullName: 'owner/repo',
          branch: 'main',
        })
      );
    });

    test('parses URL with .git suffix', () => {
      const info = gitUtils.parseGitHubURL('https://github.com/owner/repo.git');
      expect(info.repo).toBe('repo');
    });

    test('parses SSH URL', () => {
      const info = gitUtils.parseGitHubURL('git@github.com:owner/repo.git');
      expect(info.owner).toBe('owner');
      expect(info.repo).toBe('repo');
    });

    test('parses short format', () => {
      const info = gitUtils.parseGitHubURL('owner/repo');
      expect(info.fullName).toBe('owner/repo');
    });

    test('throws on invalid URL', () => {
      expect(() => gitUtils.parseGitHubURL('invalid')).toThrow('Failed to parse GitHub URL');
    });
  });

  describe('isGitInstalled', () => {
    test('returns true when git is found', () => {
      execSync.mockReturnValue('git version');
      expect(gitUtils.isGitInstalled()).toBe(true);
    });

    test('returns false when git is missing', () => {
      execSync.mockImplementation(() => {
        throw new Error('Command not found');
      });
      expect(gitUtils.isGitInstalled()).toBe(false);
    });
  });

  describe('cloneRepository', () => {
    const repoInfo = {
      fullName: 'owner/repo',
      cloneUrl: 'https://github.com/owner/repo.git',
      branch: 'main',
    };

    test('clones successfully', () => {
      fs.existsSync.mockReturnValue(false); // Temp dir doesn't exist

      const path = gitUtils.cloneRepository(repoInfo);

      expect(fs.mkdirSync).toHaveBeenCalled();
      expect(execFileSync).toHaveBeenCalledWith(
        'git',
        [
          'clone',
          '--depth=1',
          '--single-branch',
          '--branch=main',
          '--',
          'https://github.com/owner/repo.git',
          expect.stringContaining('owner-repo'),
        ],
        expect.any(Object)
      );
      expect(path).toContain('owner-repo');
    });

    test('rejects an unsafe branch name without running git', () => {
      expect(() => gitUtils.cloneRepository({ ...repoInfo, branch: 'main;touch x' })).toThrow(
        'Invalid branch name'
      );
      expect(() => gitUtils.cloneRepository({ ...repoInfo, branch: '--upload-pack=x' })).toThrow(
        'Invalid branch name'
      );
      expect(execFileSync).not.toHaveBeenCalled();
    });

    test('removes existing clone', () => {
      fs.existsSync.mockReturnValue(true); // Repo exists

      gitUtils.cloneRepository(repoInfo);

      expect(fs.rmSync).toHaveBeenCalledWith(
        expect.stringContaining('owner-repo'),
        expect.objectContaining({ recursive: true })
      );
    });

    test('throws if git not installed', () => {
      vi.spyOn(gitUtils, 'isGitInstalled').mockReturnValue(false);
      expect(() => gitUtils.cloneRepository(repoInfo)).toThrow('Git is not installed');
    });

    test('handles clone failure', () => {
      execFileSync.mockImplementationOnce(() => {
        throw new Error('Clone failed');
      });

      expect(() => gitUtils.cloneRepository(repoInfo)).toThrow('Failed to clone repository');
    });
  });

  describe('generateFromGitHub', () => {
    test('orchestrates generation flow', async () => {
      // Setup mocks
      vi.spyOn(gitUtils, 'cloneRepository').mockReturnValue('/tmp/repo');
      TokenCalculator.prototype.analyze = vi.fn().mockReturnValue([]);
      TokenCalculator.prototype.stats = { totalFiles: 10, totalTokens: 100, totalLines: 50 };
      GitIngestFormatter.prototype.generateDigest = vi.fn().mockReturnValue('digest content');

      const result = await gitUtils.generateFromGitHub('owner/repo', { outputFile: 'out.txt' });

      expect(gitUtils.cloneRepository).toHaveBeenCalled();
      expect(TokenCalculator).toHaveBeenCalled();
      expect(GitIngestFormatter).toHaveBeenCalled();
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('out.txt'),
        'digest content',
        'utf8'
      );
      expect(result.tokens).toBe(100);
    });
  });

  describe('fetchFileFromGitHub', () => {
    test('fetches content successfully', async () => {
      const mockReq = { on: vi.fn() };
      https.get.mockImplementation((url, cb) => {
        const res = {
          statusCode: 200,
          on: (event, handler) => {
            if (event === 'data') handler('content');
            if (event === 'end') handler();
            return res;
          },
        };
        cb(res);
        return mockReq;
      });

      const content = await gitUtils.fetchFileFromGitHub('url');
      expect(content).toBe('content');
    });

    test('handles HTTP errors', async () => {
      https.get.mockImplementation((url, cb) => {
        const res = {
          statusCode: 404,
          on: (event, handler) => {
            if (event === 'end') handler();
            return res;
          },
        };
        cb(res);
        return { on: vi.fn() };
      });

      await expect(gitUtils.fetchFileFromGitHub('url')).rejects.toThrow('HTTP 404');
    });
  });

  describe('Cache Management', () => {
    test('cleanupTemp removes directory', () => {
      fs.existsSync.mockReturnValue(true);
      gitUtils.cleanupTemp();
      expect(fs.rmSync).toHaveBeenCalled();
    });

    test('listCachedRepos returns repos', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readdirSync.mockReturnValue(['repo1']);
      fs.statSync.mockReturnValue({
        isDirectory: () => true,
        size: 100,
      });

      // Mock recursive size calculation
      vi.spyOn(gitUtils, 'getDirectorySize').mockReturnValue(1024);

      const repos = gitUtils.listCachedRepos();
      expect(repos).toHaveLength(1);
      expect(repos[0].name).toBe('repo1');
      expect(repos[0].size).toBe(1024);
    });
  });
});

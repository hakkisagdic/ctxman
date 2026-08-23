import { describe, test, expect, vi, beforeEach, _afterEach } from 'vitest';
import GitUtils from '../lib/utils/git-utils.js';
import { execSync } from 'child_process';
import https from 'https';
import EventEmitter from 'events';

// Mock dependencies
vi.mock('child_process');
vi.mock('https');

describe('Git Integration Utilities', () => {
  let gitUtils;

  beforeEach(() => {
    gitUtils = new GitUtils({ verbose: false });
    vi.clearAllMocks();
  });

  describe('URL Parsing', () => {
    test('parses standard HTTPS URL', () => {
      const url = 'https://github.com/facebook/react';
      const result = gitUtils.parseGitHubURL(url);

      expect(result.owner).toBe('facebook');
      expect(result.repo).toBe('react');
      expect(result.fullName).toBe('facebook/react');
      expect(result.branch).toBe('main');
    });

    test('parses URL with .git suffix', () => {
      const url = 'https://github.com/angular/angular.git';
      const result = gitUtils.parseGitHubURL(url);

      expect(result.owner).toBe('angular');
      expect(result.repo).toBe('angular');
    });

    test('parses SSH URL', () => {
      const url = 'git@github.com:vercel/next.js.git';
      const result = gitUtils.parseGitHubURL(url);

      expect(result.owner).toBe('vercel');
      expect(result.repo).toBe('next.js');
    });

    test('parses short format (owner/repo)', () => {
      const url = 'facebook/react';
      const result = gitUtils.parseGitHubURL(url);

      expect(result.owner).toBe('facebook');
      expect(result.repo).toBe('react');
    });

    test('throws on invalid URL', () => {
      expect(() => gitUtils.parseGitHubURL('invalid-url')).toThrow();
    });
  });

  describe('Git Installation', () => {
    test('returns true when git is installed', () => {
      execSync.mockReturnValue('git version 2.30.0');
      expect(gitUtils.isGitInstalled()).toBe(true);
    });

    test('returns false when git command fails', () => {
      execSync.mockImplementation(() => {
        throw new Error('Command failed');
      });
      expect(gitUtils.isGitInstalled()).toBe(false);
    });
  });

  describe('GitHub API', () => {
    test('fetches repository info successfully', async () => {
      const mockRepoInfo = {
        name: 'react',
        full_name: 'facebook/react',
        description:
          'A declarative, efficient, and flexible JavaScript library for building user interfaces.',
        stargazers_count: 200000,
        forks_count: 40000,
        default_branch: 'main',
        size: 5000,
        language: 'JavaScript',
        updated_at: '2023-01-01T00:00:00Z',
      };

      // Mock https.get
      https.get.mockImplementation((_url, _options, callback) => {
        const response = new EventEmitter();
        response.statusCode = 200;

        // Execute callback with response object
        callback(response);

        // Emit data and end events
        response.emit('data', JSON.stringify(mockRepoInfo));
        response.emit('end');

        return { on: vi.fn() };
      });

      const repoInfo = gitUtils.parseGitHubURL('facebook/react');
      const info = await gitUtils.getRepositoryInfo(repoInfo);

      expect(info.fullName).toBe('facebook/react');
      expect(info.stars).toBe(200000);
      expect(info.language).toBe('JavaScript');
    });

    test('handles API errors', async () => {
      // Mock https.get failure
      https.get.mockImplementation((_url, _options, _callback) => {
        const req = { on: vi.fn() };
        // Simulate error event on request
        const errorCallback = req.on.mock.calls.find((call) => call[0] === 'error')?.[1];
        if (errorCallback) {
          errorCallback(new Error('Network error'));
        }
        // Or trigger error on returned object if implementation expects it
        return {
          on: (event, cb) => {
            if (event === 'error') cb(new Error('Network error'));
            return req;
          },
        };
      });

      const repoInfo = gitUtils.parseGitHubURL('facebook/react');
      await expect(gitUtils.getRepositoryInfo(repoInfo)).rejects.toThrow('Network error');
    });
  });
});

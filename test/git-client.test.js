import { describe, test, expect, vi, beforeEach, _afterEach } from 'vitest';
import GitClient from '../lib/integrations/git/GitClient.js';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

// Mock dependencies
vi.mock('child_process');
vi.mock('fs');
vi.mock('../lib/utils/logger.js', () => ({
  getLogger: () => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  }),
}));

describe('GitClient', () => {
  let gitClient;
  const mockRepoPath = '/mock/repo/path';

  beforeEach(() => {
    vi.clearAllMocks();
    // Default to being a git repo
    fs.existsSync.mockReturnValue(true);
    gitClient = new GitClient(mockRepoPath);
  });

  describe('Initialization', () => {
    test('should correctly identify git repository', () => {
      fs.existsSync.mockReturnValue(true);
      const client = new GitClient(mockRepoPath);
      expect(client.isGitRepo).toBe(true);
      expect(fs.existsSync).toHaveBeenCalledWith(path.join(mockRepoPath, '.git'));
    });

    test('should correctly identify non-git repository', () => {
      fs.existsSync.mockReturnValue(false);
      const client = new GitClient(mockRepoPath);
      expect(client.isGitRepo).toBe(false);
    });
  });

  describe('Command Execution', () => {
    test('should execute git command successfully', () => {
      execSync.mockReturnValue('mock output\n');
      const result = gitClient.exec('status');
      expect(result).toBe('mock output');
      expect(execSync).toHaveBeenCalledWith(
        'git status',
        expect.objectContaining({
          cwd: mockRepoPath,
        })
      );
    });

    test('should throw error if not a git repository', () => {
      gitClient.isGitRepo = false;
      expect(() => gitClient.exec('status')).toThrow('Not a git repository');
    });

    test('should handle command failure', () => {
      execSync.mockImplementation(() => {
        throw new Error('Command failed');
      });
      expect(() => gitClient.exec('status')).toThrow('Git command failed: Command failed');
    });
  });

  describe('Branch Operations', () => {
    test('should get current branch', () => {
      execSync.mockReturnValue('feature/test\n');
      expect(gitClient.getCurrentBranch()).toBe('feature/test');
      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('rev-parse --abbrev-ref HEAD'),
        expect.any(Object)
      );
    });

    test('should get default branch', () => {
      execSync.mockReturnValue('refs/remotes/origin/main\n');
      expect(gitClient.getDefaultBranch()).toBe('main');
    });

    test('should fallback to main if default branch check fails', () => {
      execSync.mockImplementation(() => {
        throw new Error('Failed');
      });
      expect(gitClient.getDefaultBranch()).toBe('main');
    });
  });

  describe('File Status Operations', () => {
    test('should get changed files with since param', () => {
      execSync.mockReturnValue('file1.js\nfile2.js\n');
      const files = gitClient.getChangedFiles('HEAD~1');
      expect(files).toEqual(['file1.js', 'file2.js']);
      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('diff --name-only HEAD~1'),
        expect.any(Object)
      );
    });

    test('should get changed files without since param', () => {
      execSync.mockReturnValue('file1.js\n');
      const files = gitClient.getChangedFiles();
      expect(files).toEqual(['file1.js']);
      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('diff --name-only'),
        expect.any(Object)
      );
    });

    test('should handle empty output for changed files', () => {
      execSync.mockReturnValue('');
      expect(gitClient.getChangedFiles()).toEqual([]);
    });

    test('should get staged files', () => {
      execSync.mockReturnValue('staged.js\n');
      expect(gitClient.getStagedFiles()).toEqual(['staged.js']);
      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('diff --cached --name-only'),
        expect.any(Object)
      );
    });

    test('should get unstaged files', () => {
      execSync.mockReturnValue('unstaged.js\n');
      expect(gitClient.getUnstagedFiles()).toEqual(['unstaged.js']);
      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('diff --name-only'),
        expect.any(Object)
      );
    });

    test('should get untracked files', () => {
      execSync.mockReturnValue('untracked.js\n');
      expect(gitClient.getUntrackedFiles()).toEqual(['untracked.js']);
      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('ls-files --others'),
        expect.any(Object)
      );
    });

    test('should get all modified files uniquely', () => {
      // Mock responses for staged, unstaged, untracked
      execSync.mockImplementation((cmd) => {
        if (cmd.includes('--cached')) return 'file1.js\n';
        if (cmd.includes('ls-files')) return 'file3.js\n';
        if (cmd.includes('diff --name-only')) return 'file1.js\nfile2.js\n'; // file1 is in both
        return '';
      });

      const files = gitClient.getAllModifiedFiles();
      expect(files).toEqual(expect.arrayContaining(['file1.js', 'file2.js', 'file3.js']));
      expect(files.length).toBe(3);
    });
  });

  describe('History and Blame', () => {
    test('should get file history', () => {
      const mockLog =
        'hash1|Author One|a@b.com|1600000000|Subject 1\n' +
        'hash2|Author Two|c@d.com|1600000001|Subject 2';
      execSync.mockReturnValue(mockLog);

      const history = gitClient.getFileHistory('test.js');
      expect(history).toHaveLength(2);
      expect(history[0]).toEqual({
        hash: 'hash1',
        author: 'Author One',
        email: 'a@b.com',
        timestamp: 1600000000,
        date: new Date(1600000000 * 1000),
        subject: 'Subject 1',
      });
    });

    test('should handle empty file history', () => {
      execSync.mockReturnValue('');
      expect(gitClient.getFileHistory('test.js')).toEqual([]);
    });

    test('should get blame info', () => {
      const mockBlame =
        'hash1 1 1 1\n' +
        'author Author One\n' +
        'author-time 1600000000\n' +
        '\tconst x = 1;\n' +
        'hash2 2 2 1\n' +
        'author Author Two\n' +
        'author-time 1600000001\n' +
        '\tconst y = 2;';

      execSync.mockReturnValue(mockBlame);

      const blame = gitClient.getBlame('test.js');
      expect(blame).toHaveLength(2);
      expect(blame[0].author).toBe('Author One');
      expect(blame[0].code).toBe('const x = 1;');
      expect(blame[1].author).toBe('Author Two');
    });

    test('should handle blame failure', () => {
      execSync.mockImplementation(() => {
        throw new Error('Blame failed');
      });
      expect(gitClient.getBlame('test.js')).toEqual([]);
    });
  });

  describe('Stats and Metadata', () => {
    test('should get commit count', () => {
      execSync.mockReturnValue('line1\nline2\nline3');
      expect(gitClient.getCommitCount('test.js')).toBe(3);
    });

    test('should return 0 commit count on error', () => {
      execSync.mockImplementation(() => {
        throw new Error('Failed');
      });
      expect(gitClient.getCommitCount('test.js')).toBe(0);
    });

    test('should get file authors', () => {
      const mockOutput = 'Author One|a@b.com\nAuthor One|a@b.com\nAuthor Two|c@d.com';
      execSync.mockReturnValue(mockOutput);

      const authors = gitClient.getFileAuthors('test.js');
      expect(authors).toHaveLength(2);
      expect(authors[0].email).toBe('a@b.com');
      expect(authors[0].commits).toBe(2);
      expect(authors[1].email).toBe('c@d.com');
      expect(authors[1].commits).toBe(1);
    });

    test('should get repo stats', () => {
      execSync.mockImplementation((cmd) => {
        if (cmd.includes('rev-list')) return '100\n';
        if (cmd.includes('ls-files')) return 'file1\nfile2\n';
        if (cmd.includes('shortlog')) return 'user1\nuser2\nuser3\n';
        if (cmd.includes('rev-parse')) return 'main\n';
        return '';
      });

      const stats = gitClient.getRepoStats();
      expect(stats).toEqual({
        totalCommits: 100,
        totalFiles: 2,
        contributors: 3,
        currentBranch: 'main',
      });
    });

    test('should return null repo stats if not git repo', () => {
      gitClient.isGitRepo = false;
      expect(gitClient.getRepoStats()).toBeNull();
    });

    test('should return null repo stats on error', () => {
      execSync.mockImplementation(() => {
        throw new Error('Failed');
      });
      expect(gitClient.getRepoStats()).toBeNull();
    });

    test('should get last commit', () => {
      const mockOutput = 'hash1|Author One|a@b.com|1600000000|Subject 1';
      execSync.mockReturnValue(mockOutput);

      const commit = gitClient.getLastCommit('test.js');
      expect(commit).toEqual({
        hash: 'hash1',
        author: 'Author One',
        email: 'a@b.com',
        timestamp: 1600000000,
        date: new Date(1600000000 * 1000),
        subject: 'Subject 1',
      });
    });

    test('should return null last commit on error', () => {
      execSync.mockImplementation(() => {
        throw new Error('Failed');
      });
      expect(gitClient.getLastCommit('test.js')).toBeNull();
    });
  });
});

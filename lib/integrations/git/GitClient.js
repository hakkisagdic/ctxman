/**
 * GitClient - Git Operations Module
 * v3.0.0 - Complete Git integration
 *
 * Responsibilities:
 * - Execute git commands
 * - Parse git output
 * - Provide high-level git operations
 * - Cache git metadata
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { getLogger } from '../../utils/logger.js';

const logger = getLogger('GitClient');

export class GitClient {
  constructor(repositoryPath) {
    this.repoPath = repositoryPath;
    this.isGitRepo = this.checkIsGitRepository();
  }

  /**
   * Check if directory is a git repository
   * @returns {boolean}
   */
  checkIsGitRepository() {
    try {
      const gitDir = path.join(this.repoPath, '.git');
      return fs.existsSync(gitDir);
    } catch (error) {
      return false;
    }
  }

  /**
   * Validate git reference to prevent command injection
   * @param {string} ref
   * @returns {boolean}
   */
  validateGitRef(ref) {
    if (!ref) return true; // null/undefined is safe (handled logic elsewhere)
    // Allow alphanumeric, /, -, _, ., @, ^, ~
    // Disallow ; | & $ > < ` \ !
    return /^[a-zA-Z0-9/\-_.\@\^\~]+$/.test(ref);
  }

  /**
   * Execute git command
   * @param {string} command - Git command (without 'git' prefix)
   * @returns {string} Command output
   */
  exec(command) {
    if (!this.isGitRepo) {
      throw new Error('Not a git repository');
    }

    // Basic sanity check against shell injection if the command string was constructed with user input
    // This is a last line of defense; specific methods should validate their inputs.
    if (command.includes(';') || command.includes('&')) {
      logger.warn(`Potential injection detected in command: ${command}`);
      throw new Error('Invalid characters in git command');
    }

    try {
      const fullCommand = `git ${command}`;
      const output = execSync(fullCommand, {
        cwd: this.repoPath,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      return output.trim();
    } catch (error) {
      logger.error(`Git command failed: ${command}`);
      throw new Error(`Git command failed: ${error.message}`);
    }
  }

  /**
   * Get current branch name
   * @returns {string}
   */
  getCurrentBranch() {
    return this.exec('rev-parse --abbrev-ref HEAD');
  }

  /**
   * Get default branch name
   * @returns {string}
   */
  getDefaultBranch() {
    try {
      return this.exec('symbolic-ref refs/remotes/origin/HEAD --short').split('/').pop();
    } catch (error) {
      return 'main'; // Fallback
    }
  }

  /**
   * Get changed files
   * @param {string} since - Commit/branch reference (e.g., 'main', 'HEAD~5')
   * @returns {Array<string>}
   */
  getChangedFiles(since = null) {
    let command;

    if (since) {
      // Files changed between commits/branches
      command = `diff --name-only ${since}`;
    } else {
      // Files with uncommitted changes
      command = 'diff --name-only';
    }

    const output = this.exec(command);
    return output ? output.split('\n').filter(Boolean) : [];
  }

  /**
   * Get staged files
   * @returns {Array<string>}
   */
  getStagedFiles() {
    const output = this.exec('diff --cached --name-only');
    return output ? output.split('\n').filter(Boolean) : [];
  }

  /**
   * Get unstaged files
   * @returns {Array<string>}
   */
  getUnstagedFiles() {
    const output = this.exec('diff --name-only');
    return output ? output.split('\n').filter(Boolean) : [];
  }

  /**
   * Get untracked files
   * @returns {Array<string>}
   */
  getUntrackedFiles() {
    const output = this.exec('ls-files --others --exclude-standard');
    return output ? output.split('\n').filter(Boolean) : [];
  }

  /**
   * Get all modified files (staged + unstaged + untracked)
   * @returns {Array<string>}
   */
  getAllModifiedFiles() {
    const staged = this.getStagedFiles();
    const unstaged = this.getUnstagedFiles();
    const untracked = this.getUntrackedFiles();

    // Deduplicate
    return [...new Set([...staged, ...unstaged, ...untracked])];
  }

  /**
   * Get file history
   * @param {string} filePath - File path
   * @param {number} limit - Number of commits
   * @returns {Array<Commit>}
   */
  getFileHistory(filePath, limit = 10) {
    const command = `log --follow --pretty=format:"%H|%an|%ae|%at|%s" -n ${limit} -- "${filePath}"`;
    const output = this.exec(command);

    if (!output) return [];

    return output.split('\n').map((line) => {
      const [hash, author, email, timestamp, subject] = line.split('|');
      return {
        hash,
        author,
        email,
        timestamp: parseInt(timestamp, 10),
        date: new Date(parseInt(timestamp, 10) * 1000),
        subject,
      };
    });
  }

  /**
   * Get blame information for file
   * @param {string} filePath - File path
   * @returns {Array<BlameLine>}
   */
  getBlame(filePath) {
    try {
      const command = `blame --line-porcelain "${filePath}"`;
      const output = this.exec(command);

      return this.parseBlameOutput(output);
    } catch (error) {
      logger.warn(`Blame failed for ${filePath}: ${error.message}`);
      return [];
    }
  }

  /**
   * Parse git blame porcelain output
   * @param {string} output
   * @returns {Array<BlameLine>}
   */
  parseBlameOutput(output) {
    const lines = output.split('\n');
    const blameInfo = [];
    let currentCommit = null;
    let currentAuthor = null;
    let currentTimestamp = null;

    for (const line of lines) {
      if (line.match(/^[0-9a-f]{40}/)) {
        // Commit hash line
        currentCommit = line.split(' ')[0];
      } else if (line.startsWith('author ')) {
        currentAuthor = line.substring(7);
      } else if (line.startsWith('author-time ')) {
        currentTimestamp = parseInt(line.substring(12), 10);
      } else if (line.startsWith('\t')) {
        // Code line
        blameInfo.push({
          commit: currentCommit,
          author: currentAuthor,
          timestamp: currentTimestamp,
          date: new Date(currentTimestamp * 1000),
          code: line.substring(1),
        });
      }
    }

    return blameInfo;
  }

  /**
   * Get commit count for file
   * @param {string} filePath
   * @returns {number}
   */
  getCommitCount(filePath) {
    try {
      const output = this.exec(`log --follow --oneline "${filePath}"`);
      return output ? output.split('\n').length : 0;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Get file authors
   * @param {string} filePath
   * @returns {Array<Author>}
   */
  getFileAuthors(filePath) {
    try {
      const command = `log --follow --pretty=format:"%an|%ae" -- "${filePath}"`;
      const output = this.exec(command);

      if (!output) return [];

      const authorsMap = new Map();

      output.split('\n').forEach((line) => {
        const [name, email] = line.split('|');
        if (!authorsMap.has(email)) {
          authorsMap.set(email, { name, email, commits: 0 });
        }
        authorsMap.get(email).commits++;
      });

      return Array.from(authorsMap.values()).sort((a, b) => b.commits - a.commits);
    } catch (error) {
      return [];
    }
  }

  /**
   * Get repository statistics
   * @returns {object}
   */
  getRepoStats() {
    if (!this.isGitRepo) {
      return null;
    }

    try {
      const totalCommits = this.exec('rev-list --count HEAD');
      const totalFiles = this.exec('ls-files').split('\n').length;
      const contributors = this.exec('shortlog -sn --all').split('\n').length;

      return {
        totalCommits: parseInt(totalCommits, 10),
        totalFiles,
        contributors,
        currentBranch: this.getCurrentBranch(),
      };
    } catch (error) {
      logger.warn(`Failed to get repo stats: ${error.message}`);
      return null;
    }
  }

  /**
   * Get last commit info for file
   * @param {string} filePath
   * @returns {Commit|null}
   */
  getLastCommit(filePath) {
    try {
      const command = `log -1 --pretty=format:"%H|%an|%ae|%at|%s" -- "${filePath}"`;
      const output = this.exec(command);

      if (!output) return null;

      const [hash, author, email, timestamp, subject] = output.split('|');
      return {
        hash,
        author,
        email,
        timestamp: parseInt(timestamp, 10),
        date: new Date(parseInt(timestamp, 10) * 1000),
        subject,
      };
    } catch (error) {
      return null;
    }
  }
}

export default GitClient;

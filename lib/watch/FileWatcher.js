/**
 * FileWatcher - Real-Time File Watching Module
 * v3.0.0 - Watch mode (with Cross-Repo Multi-Root Workspace support)
 *
 * Responsibilities:
 * - Watch file system for changes across one or more repositories
 * - Debounce rapid changes
 * - Emit change events (namespaced as <alias>/<relativePath> in multi-repo mode)
 * - Support per-repository ignore patterns (.gitignore, .contextignore, .contextinclude)
 */

import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';
import GitIgnoreParser from '../parsers/gitignore-parser.js';
import FileUtils from '../utils/file-utils.js';
import { resolveWorkspaceRepos } from '../workspace/index.js';
import { getLogger } from '../utils/logger.js';

const logger = getLogger('FileWatcher');

export class FileWatcher extends EventEmitter {
  constructor(rootPath, options = {}) {
    super();

    this.rootPath = path.resolve(rootPath);
    this.options = {
      debounce: 1000, // 1 second debounce
      recursive: true,
      ignorePatterns: [],
      repos: [],
      ...options,
    };

    const extraRepos = Array.isArray(this.options.repos) ? this.options.repos.filter(Boolean) : [];
    this.isMultiRepo = extraRepos.length > 0;
    this.repos = this.isMultiRepo
      ? resolveWorkspaceRepos([this.rootPath, ...extraRepos])
      : [{ root: this.rootPath, alias: null }];

    // Initialize GitIgnoreParser for primary root and per-repo parsers
    this.gitIgnoreByRoot = new Map();
    for (const repo of this.repos) {
      this.gitIgnoreByRoot.set(repo.root, this._createGitIgnoreParser(repo.root));
    }
    this.gitIgnore =
      this.gitIgnoreByRoot.get(this.rootPath) || this._createGitIgnoreParser(this.rootPath);

    this.watchers = [];
    this.debounceTimers = new Map();
    this.isWatching = false;

    this.stats = {
      totalChanges: 0,
      ignoredChanges: 0,
      errors: 0,
    };
  }

  /**
   * Create a GitIgnoreParser for a repository root
   * @param {string} repoRoot
   * @returns {GitIgnoreParser}
   */
  _createGitIgnoreParser(repoRoot) {
    const gitignorePath = path.join(repoRoot, '.gitignore');
    const contextIgnorePath = path.join(repoRoot, '.contextignore');
    const contextIncludePath = path.join(repoRoot, '.contextinclude');
    return new GitIgnoreParser(gitignorePath, contextIgnorePath, contextIncludePath);
  }

  /**
   * Start watching all configured repositories
   */
  start() {
    if (this.isWatching) {
      logger.warn('Already watching');
      return;
    }

    logger.info(
      this.isMultiRepo
        ? `Starting multi-repo file watch (${this.repos.map((r) => r.alias).join(', ')})`
        : `Starting file watch: ${this.rootPath}`
    );

    try {
      for (const repo of this.repos) {
        const watcher = fs.watch(
          repo.root,
          { recursive: this.options.recursive },
          (eventType, filename) => {
            this.handleFileChange(eventType, filename, repo);
          }
        );
        this.watchers.push(watcher);
      }

      this.isWatching = true;

      this.emit('watch:started', {
        path: this.rootPath,
        repos: this.repos.map((r) => ({ root: r.root, alias: r.alias })),
      });
      logger.info('Watch mode started');
    } catch (error) {
      for (const watcher of this.watchers) {
        try {
          watcher.close();
        } catch {
          // ignore cleanup errors
        }
      }
      this.watchers = [];
      logger.error(`Failed to start watch: ${error.message}`);
      this.emit('watch:error', { error });
      throw error;
    }
  }

  /**
   * Stop watching
   */
  stop() {
    if (!this.isWatching) {
      return;
    }

    logger.info('Stopping file watch...');

    // Close all watchers
    for (const watcher of this.watchers) {
      watcher.close();
    }

    // Clear debounce timers
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }

    this.watchers = [];
    this.debounceTimers.clear();
    this.isWatching = false;

    this.emit('watch:stopped');
    logger.info('Watch mode stopped');
  }

  /**
   * Handle file change event
   * @param {string} eventType - 'rename' or 'change'
   * @param {string} filename - Changed file name
   * @param {Object} [repo] - Resolved repository entry { root, alias }
   */
  handleFileChange(eventType, filename, repo = null) {
    if (!filename) return;

    const targetRepo = repo || this.repos[0] || { root: this.rootPath, alias: null };
    const filePath = path.join(targetRepo.root, filename);
    const repoRelativePath = path.relative(targetRepo.root, filePath);

    // Check ignore patterns against the owning repository
    if (this.shouldIgnore(repoRelativePath, targetRepo.root)) {
      this.stats.ignoredChanges++;
      return;
    }

    const relativePath =
      this.isMultiRepo && targetRepo.alias
        ? `${targetRepo.alias}/${repoRelativePath.split(path.sep).join('/')}`
        : repoRelativePath;

    this.stats.totalChanges++;

    // Debounce rapid changes
    if (this.debounceTimers.has(filePath)) {
      clearTimeout(this.debounceTimers.get(filePath));
    }

    const timer = setTimeout(() => {
      this.debounceTimers.delete(filePath);
      this.emitFileChange(eventType, filePath, relativePath, targetRepo, repoRelativePath);
    }, this.options.debounce);

    this.debounceTimers.set(filePath, timer);
  }

  /**
   * Emit file change event
   * @param {string} eventType
   * @param {string} filePath
   * @param {string} relativePath
   * @param {Object} [repo]
   * @param {string} [repoRelativePath]
   */
  emitFileChange(eventType, filePath, relativePath, repo = null, repoRelativePath = null) {
    logger.debug(`File ${eventType}: ${relativePath}`);

    const event = {
      type: eventType,
      path: filePath,
      relativePath: relativePath,
      timestamp: Date.now(),
      exists: fs.existsSync(filePath),
    };

    if (this.isMultiRepo && repo?.alias) {
      event.repo = repo.alias;
      event.repoRoot = repo.root;
      event.repoRelativePath = repoRelativePath || relativePath;
    }

    // Add file stats if exists
    if (event.exists) {
      try {
        const stats = fs.statSync(filePath);
        event.size = stats.size;
        event.modified = stats.mtime;
      } catch (_error) {
        // Stats not available
      }
    }

    this.emit('file:changed', event);
  }

  /**
   * Check if file should be ignored
   * @param {string} relativePath
   * @param {string} [repoRoot]
   * @returns {boolean}
   */
  shouldIgnore(relativePath, repoRoot = this.rootPath) {
    const parts = relativePath.split(/[/\\]/);
    const normalized = parts.join('/');

    // node_modules, .git and build output are skipped like in the scanners, .gitignore or not
    if (parts.some((part) => FileUtils.isSkippedDirectory(part))) {
      return true;
    }

    // Ignore .ctxman internal state (e.g. .ctxman/self-knowledge/index.sqlite) and SQLite journals
    // so watch-mode RAG/graph writes never trigger a recursive watch feedback loop
    if (
      parts.includes('.ctxman') ||
      normalized.endsWith('.sqlite') ||
      normalized.endsWith('.sqlite-wal') ||
      normalized.endsWith('.sqlite-shm') ||
      normalized.endsWith('.sqlite-journal')
    ) {
      return true;
    }

    // Check custom ignorePatterns if configured
    if (Array.isArray(this.options.ignorePatterns) && this.options.ignorePatterns.length > 0) {
      for (const pattern of this.options.ignorePatterns) {
        if (
          typeof pattern === 'string' &&
          (normalized === pattern || normalized.startsWith(`${pattern}/`))
        ) {
          return true;
        }
        if (pattern instanceof RegExp && pattern.test(normalized)) {
          return true;
        }
      }
    }

    const resolvedRoot = repoRoot ? path.resolve(repoRoot) : this.rootPath;
    const parser = this.gitIgnoreByRoot.get(resolvedRoot) || this.gitIgnore;

    // Use GitIgnoreParser for ignore rules
    return parser.isIgnored(path.join(resolvedRoot, relativePath), relativePath);
  }

  /**
   * Get watch statistics
   * @returns {object}
   */
  getStats() {
    return {
      ...this.stats,
      isWatching: this.isWatching,
      activeWatchers: this.watchers.length,
      pendingDebounce: this.debounceTimers.size,
      repos: this.repos.map((r) => ({ root: r.root, alias: r.alias })),
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      totalChanges: 0,
      ignoredChanges: 0,
      errors: 0,
    };
  }
}

export default FileWatcher;

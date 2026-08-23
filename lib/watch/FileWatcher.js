/**
 * FileWatcher - Real-Time File Watching Module
 * v3.0.0 - Watch mode
 *
 * Responsibilities:
 * - Watch file system for changes
 * - Debounce rapid changes
 * - Emit change events
 * - Support ignore patterns
 */

import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';
import GitIgnoreParser from '../parsers/gitignore-parser.js';
import { getLogger } from '../utils/logger.js';

const logger = getLogger('FileWatcher');

export class FileWatcher extends EventEmitter {
  constructor(rootPath, options = {}) {
    super();

    this.rootPath = rootPath;
    this.options = {
      debounce: 1000, // 1 second debounce
      recursive: true,
      ignorePatterns: [],
      ...options,
    };

    // Initialize GitIgnoreParser with correct file paths
    const gitignorePath = path.join(rootPath, '.gitignore');
    const contextIgnorePath = path.join(rootPath, '.contextignore');
    const contextIncludePath = path.join(rootPath, '.contextinclude');

    this.gitIgnore = new GitIgnoreParser(gitignorePath, contextIgnorePath, contextIncludePath);
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
   * Start watching
   */
  start() {
    if (this.isWatching) {
      logger.warn('Already watching');
      return;
    }

    logger.info(`Starting file watch: ${this.rootPath}`);

    try {
      const watcher = fs.watch(
        this.rootPath,
        { recursive: this.options.recursive },
        (eventType, filename) => {
          this.handleFileChange(eventType, filename);
        }
      );

      this.watchers.push(watcher);
      this.isWatching = true;

      this.emit('watch:started', { path: this.rootPath });
      logger.info('Watch mode started');
    } catch (error) {
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
   */
  handleFileChange(eventType, filename) {
    if (!filename) return;

    const filePath = path.join(this.rootPath, filename);
    const relativePath = path.relative(this.rootPath, filePath);

    // Check ignore patterns
    if (this.shouldIgnore(relativePath)) {
      this.stats.ignoredChanges++;
      return;
    }

    this.stats.totalChanges++;

    // Debounce rapid changes
    if (this.debounceTimers.has(filePath)) {
      clearTimeout(this.debounceTimers.get(filePath));
    }

    const timer = setTimeout(() => {
      this.debounceTimers.delete(filePath);
      this.emitFileChange(eventType, filePath, relativePath);
    }, this.options.debounce);

    this.debounceTimers.set(filePath, timer);
  }

  /**
   * Emit file change event
   * @param {string} eventType
   * @param {string} filePath
   * @param {string} relativePath
   */
  emitFileChange(eventType, filePath, relativePath) {
    logger.debug(`File ${eventType}: ${relativePath}`);

    const event = {
      type: eventType,
      path: filePath,
      relativePath: relativePath,
      timestamp: Date.now(),
      exists: fs.existsSync(filePath),
    };

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
   * @returns {boolean}
   */
  shouldIgnore(relativePath) {
    // Use GitIgnoreParser for ignore rules
    return !this.gitIgnore.shouldIncludeFile(relativePath);
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

/**
 * IncrementalAnalyzer - Incremental Analysis Module
 * v3.0.0 - Watch mode
 *
 * Responsibilities:
 * - Perform incremental analysis on file changes
 * - Update aggregate statistics
 * - Emit analysis events
 * - Optimize for performance
 */

import { EventEmitter } from 'events';
import { Analyzer } from '../core/Analyzer.js';
import { getLogger } from '../utils/logger.js';

const logger = getLogger('IncrementalAnalyzer');

export class IncrementalAnalyzer extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      autoAnalyze: true,
      ...options,
    };

    this.analyzer = new Analyzer(options);
    this.fileCache = new Map(); // Cache of file analyses
    this.aggregateStats = null;
  }

  /**
   * Analyze changed file and update stats
   * @param {FileChangeEvent} changeEvent
   */
  async analyzeChange(changeEvent) {
    logger.debug(`Analyzing change: ${changeEvent.relativePath}`);

    const startTime = Date.now();

    try {
      // If file deleted, remove from cache
      if (!changeEvent.exists) {
        this.handleFileDeleted(changeEvent);
        return;
      }

      // Analyze file
      const fileInfo = {
        path: changeEvent.path,
        relativePath: changeEvent.relativePath,
        name: path.basename(changeEvent.path),
        extension: path.extname(changeEvent.path),
        size: changeEvent.size,
        modified: changeEvent.modified,
      };

      const analysis = await this.analyzer.analyzeFile(fileInfo);

      if (analysis) {
        // Update cache
        const oldAnalysis = this.fileCache.get(changeEvent.path);
        this.fileCache.set(changeEvent.path, analysis);

        // Update aggregate stats
        this.updateAggregateStats(oldAnalysis, analysis);

        const elapsed = Date.now() - startTime;

        this.emit('analysis:complete', {
          file: changeEvent.relativePath,
          analysis,
          elapsed,
          cached: false,
        });

        logger.debug(`Analysis complete: ${changeEvent.relativePath} (${elapsed}ms)`);
      }
    } catch (error) {
      logger.error(`Analysis failed for ${changeEvent.relativePath}: ${error.message}`);
      this.emit('analysis:error', {
        file: changeEvent.relativePath,
        error,
      });
    }
  }

  /**
   * Handle file deletion
   * @param {FileChangeEvent} changeEvent
   */
  handleFileDeleted(changeEvent) {
    const oldAnalysis = this.fileCache.get(changeEvent.path);

    if (oldAnalysis) {
      // Remove from cache
      this.fileCache.delete(changeEvent.path);

      // Update stats (subtract)
      if (this.aggregateStats) {
        this.aggregateStats.totalFiles--;
        this.aggregateStats.totalTokens -= oldAnalysis.tokens;
        this.aggregateStats.totalSize -= oldAnalysis.size;

        // Update language stats
        const lang = oldAnalysis.language;
        if (this.aggregateStats.byLanguage[lang]) {
          this.aggregateStats.byLanguage[lang].files--;
          this.aggregateStats.byLanguage[lang].tokens -= oldAnalysis.tokens;
          this.aggregateStats.byLanguage[lang].size -= oldAnalysis.size;
        }
      }

      this.emit('file:deleted', {
        file: changeEvent.relativePath,
        oldTokens: oldAnalysis.tokens,
      });

      logger.debug(`File deleted from cache: ${changeEvent.relativePath}`);
    }
  }

  /**
   * Update aggregate statistics
   * @param {FileAnalysis|null} oldAnalysis
   * @param {FileAnalysis} newAnalysis
   */
  updateAggregateStats(oldAnalysis, newAnalysis) {
    if (!this.aggregateStats) {
      this.aggregateStats = this.analyzer.getStats();
    }

    // Subtract old values if exists
    if (oldAnalysis) {
      this.aggregateStats.totalTokens -= oldAnalysis.tokens;
      this.aggregateStats.totalSize -= oldAnalysis.size;

      const oldLang = oldAnalysis.language;
      if (this.aggregateStats.byLanguage[oldLang]) {
        this.aggregateStats.byLanguage[oldLang].tokens -= oldAnalysis.tokens;
        this.aggregateStats.byLanguage[oldLang].size -= oldAnalysis.size;
      }
    } else {
      // New file
      this.aggregateStats.totalFiles++;
    }

    // Add new values
    this.aggregateStats.totalTokens += newAnalysis.tokens;
    this.aggregateStats.totalSize += newAnalysis.size;

    const lang = newAnalysis.language;
    if (!this.aggregateStats.byLanguage[lang]) {
      this.aggregateStats.byLanguage[lang] = { files: 0, tokens: 0, size: 0 };
    }

    if (!oldAnalysis) {
      this.aggregateStats.byLanguage[lang].files++;
    }

    this.aggregateStats.byLanguage[lang].tokens += newAnalysis.tokens;
    this.aggregateStats.byLanguage[lang].size += newAnalysis.size;

    // Emit stats update
    this.emit('stats:updated', this.aggregateStats);
  }

  /**
   * Get current aggregate statistics
   * @returns {object}
   */
  getStats() {
    return this.aggregateStats || this.analyzer.getStats();
  }

  /**
   * Get cached file analysis
   * @param {string} filePath
   * @returns {FileAnalysis|null}
   */
  getCachedAnalysis(filePath) {
    return this.fileCache.get(filePath) || null;
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.fileCache.clear();
    logger.info('Analysis cache cleared');
  }

  /**
   * Get cache statistics
   * @returns {object}
   */
  getCacheStats() {
    return {
      cachedFiles: this.fileCache.size,
      cacheSize: this.fileCache.size * 1024, // Rough estimate
    };
  }
}

export default IncrementalAnalyzer;

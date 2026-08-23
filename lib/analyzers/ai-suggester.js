/**
 * AI Context Suggester
 * Provides smart context optimization suggestions without external AI APIs
 * Part of FEAT-005: AI-Powered Context Suggestions
 */

import path from 'path';
import fs from 'fs';
import { getLogger } from '../utils/logger.js';
import FileUtils from '../utils/file-utils.js';
import { DuplicateDetector } from './duplicate-detector.js';
import { UnusedExportsDetector } from './unused-exports-detector.js';

const logger = getLogger('AISuggester');

// Token thresholds for suggestions
const TOKEN_THRESHOLDS = {
  CRITICAL_LARGE_FILE: 50000, // 50K tokens
  WARNING_LARGE_FILE: 20000, // 20K tokens
  SUGGESTION_LARGE_FILE: 10000, // 10K tokens
  HIGH_TEST_RATIO: 0.4, // 40% test files
  HIGH_CONFIG_RATIO: 0.1, // 10% config files
};

// Category icons
const ICONS = {
  critical: '🔴',
  warning: '🟡',
  suggestion: '🟢',
  info: 'ℹ️',
};

export class AISuggester {
  constructor(options = {}) {
    this.options = {
      projectRoot: options.projectRoot || process.cwd(),
      json: options.json || false,
      verbose: options.verbose || false,
      ...options,
    };

    this.duplicateDetector = new DuplicateDetector(options);
    this.unusedExportsDetector = new UnusedExportsDetector(options);

    this.suggestions = {
      critical: [],
      warning: [],
      suggestion: [],
    };

    this.metrics = {
      totalFiles: 0,
      totalTokens: 0,
      testFiles: 0,
      testTokens: 0,
      configFiles: 0,
      configTokens: 0,
      largeFiles: [],
      files: [],
    };
  }

  /**
   * Analyze project and generate suggestions
   * @param {Object} stats - Token analysis stats from TokenCalculator
   * @param {Array} files - Array of analyzed file info
   * @returns {Object} Suggestions and efficiency score
   */
  async analyze(stats, files = []) {
    logger.info('Starting AI context analysis');

    this.metrics.totalFiles = stats.totalFiles || 0;
    this.metrics.totalTokens = stats.totalTokens || 0;
    this.metrics.files = files;

    // Run all analyses
    this.analyzeLargeFiles(files);
    this.analyzeTestFiles(files);
    this.analyzeConfigFiles(files);

    // Run code quality analyses
    await this.analyzeDuplicates(files);
    await this.analyzeUnusedExports(files);

    // Calculate efficiency score
    const efficiencyScore = this.calculateEfficiencyScore();

    // Generate output
    const result = {
      score: efficiencyScore,
      suggestions: this.suggestions,
      metrics: {
        totalFiles: this.metrics.totalFiles,
        totalTokens: this.metrics.totalTokens,
        testFiles: this.metrics.testFiles,
        testTokens: this.metrics.testTokens,
        configFiles: this.metrics.configFiles,
        configTokens: this.metrics.configTokens,
        largeFiles: this.metrics.largeFiles.length,
      },
    };

    logger.info(`Analysis complete. Efficiency score: ${efficiencyScore}/100`);

    return result;
  }

  /**
   * Analyze large files for exclusion suggestions
   */
  analyzeLargeFiles(files) {
    logger.debug('Analyzing large files');

    const largeFiles = files
      .filter((f) => f.tokens >= TOKEN_THRESHOLDS.SUGGESTION_LARGE_FILE)
      .sort((a, b) => b.tokens - a.tokens);

    this.metrics.largeFiles = largeFiles;

    for (const file of largeFiles) {
      const percentage = ((file.tokens / this.metrics.totalTokens) * 100).toFixed(1);
      const tokens = file.tokens.toLocaleString();

      if (file.tokens >= TOKEN_THRESHOLDS.CRITICAL_LARGE_FILE) {
        this.suggestions.critical.push({
          type: 'large_file',
          message: `Exclude large file: ${file.relativePath} (${tokens} tokens, ${percentage}%)`,
          file: file.relativePath,
          tokens: file.tokens,
          percentage: parseFloat(percentage),
          action: `Add ${file.relativePath} to .contextignore`,
        });
      } else if (file.tokens >= TOKEN_THRESHOLDS.WARNING_LARGE_FILE) {
        this.suggestions.warning.push({
          type: 'large_file',
          message: `Consider splitting or excluding: ${file.relativePath} (${tokens} tokens, ${percentage}%)`,
          file: file.relativePath,
          tokens: file.tokens,
          percentage: parseFloat(percentage),
          action: `Add ${file.relativePath} to .contextignore or refactor into smaller modules`,
        });
      } else {
        this.suggestions.suggestion.push({
          type: 'large_file',
          message: `Large file detected: ${file.relativePath} (${tokens} tokens)`,
          file: file.relativePath,
          tokens: file.tokens,
          percentage: parseFloat(percentage),
        });
      }
    }
  }

  /**
   * Analyze test files for exclusion suggestions
   */
  analyzeTestFiles(files) {
    logger.debug('Analyzing test files');

    const testPatterns = [
      '.test.',
      '.spec.',
      '_test.',
      '_spec.',
      '/test/',
      '/tests/',
      '/__tests__/',
    ];
    const testFiles = files.filter((f) => {
      // Normalize path with leading slash for pattern matching
      const normalizedPath = '/' + f.relativePath;
      return testPatterns.some((p) => f.relativePath.includes(p) || normalizedPath.includes(p));
    });

    this.metrics.testFiles = testFiles.length;
    this.metrics.testTokens = testFiles.reduce((sum, f) => sum + f.tokens, 0);

    const testRatio =
      this.metrics.totalTokens > 0 ? this.metrics.testTokens / this.metrics.totalTokens : 0;

    if (testFiles.length > 0 && testRatio > TOKEN_THRESHOLDS.HIGH_TEST_RATIO) {
      const tokens = this.metrics.testTokens.toLocaleString();

      this.suggestions.warning.push({
        type: 'test_files',
        message: `${testFiles.length} test files included (${tokens} tokens)`,
        count: testFiles.length,
        tokens: this.metrics.testTokens,
        percentage: (testRatio * 100).toFixed(1),
        action: 'Add **/*.test.js, **/*.spec.js to .contextignore',
      });
    } else if (testFiles.length > 5) {
      this.suggestions.suggestion.push({
        type: 'test_files',
        message: `${testFiles.length} test files included`,
        count: testFiles.length,
        tokens: this.metrics.testTokens,
        percentage: (testRatio * 100).toFixed(1),
        action: 'Consider excluding test files for smaller context',
      });
    }
  }

  /**
   * Analyze configuration files for exclusion suggestions
   */
  analyzeConfigFiles(files) {
    logger.debug('Analyzing config files');

    const configPatterns = ['.json', '.yaml', '.yml', '.toml', '.ini', '.conf'];
    const excludePatterns = ['package.json', 'package-lock.json', 'tsconfig.json'];

    const configFiles = files.filter((f) => {
      const ext = path.extname(f.relativePath).toLowerCase();
      const basename = path.basename(f.relativePath);
      return configPatterns.includes(ext) && !excludePatterns.includes(basename);
    });

    this.metrics.configFiles = configFiles.length;
    this.metrics.configTokens = configFiles.reduce((sum, f) => sum + f.tokens, 0);

    const configRatio =
      this.metrics.totalTokens > 0 ? this.metrics.configTokens / this.metrics.totalTokens : 0;

    if (configFiles.length > 0 && configRatio > TOKEN_THRESHOLDS.HIGH_CONFIG_RATIO) {
      const tokens = this.metrics.configTokens.toLocaleString();

      this.suggestions.warning.push({
        type: 'config_files',
        message: `${configFiles.length} configuration files included (${tokens} tokens)`,
        count: configFiles.length,
        tokens: this.metrics.configTokens,
        percentage: (configRatio * 100).toFixed(1),
        action: 'Add **/*.json, **/*.yaml to .contextignore',
      });
    }
  }

  /**
   * Analyze for duplicate code
   */
  async analyzeDuplicates(files) {
    logger.debug('Analyzing duplicate code');

    // Get file contents for analysis
    const filesWithContent = this.getFilesWithContent(files);

    const duplicates = this.duplicateDetector.detect(filesWithContent);

    if (duplicates.length > 0) {
      const stats = this.duplicateDetector.getStats();

      this.suggestions.suggestion.push({
        type: 'duplicate_code',
        message: `${duplicates.length} potential duplicate code blocks detected`,
        count: duplicates.length,
        wastedTokens: stats.wastedTokens,
        locations: duplicates.slice(0, 3).map((d) => ({
          preview: d.preview,
          files: d.files.slice(0, 3),
        })),
      });
    }
  }

  /**
   * Analyze for unused exports
   */
  async analyzeUnusedExports(files) {
    logger.debug('Analyzing unused exports');

    // Get file contents for analysis
    const filesWithContent = this.getFilesWithContent(files);

    const unused = this.unusedExportsDetector.detect(filesWithContent);

    if (unused.length > 0) {
      const stats = this.unusedExportsDetector.getStats();

      // Group by file
      const byFile = {};
      for (const exp of unused) {
        if (!byFile[exp.file]) {
          byFile[exp.file] = [];
        }
        byFile[exp.file].push(exp.name);
      }

      this.suggestions.suggestion.push({
        type: 'unused_exports',
        message: `${unused.length} unused exports in ${stats.filesAffected} files`,
        count: unused.length,
        filesAffected: stats.filesAffected,
        examples: Object.entries(byFile)
          .slice(0, 3)
          .map(([file, names]) => ({
            file,
            exports: names.slice(0, 5),
          })),
      });
    }
  }

  /**
   * Read file contents for analysis
   */
  getFilesWithContent(files) {
    const filesWithContent = [];

    for (const file of files) {
      try {
        // Only read code files
        if (!FileUtils.isCode(file.path)) {
          continue;
        }

        const content = fs.readFileSync(file.path, 'utf8');
        filesWithContent.push({
          path: file.path,
          relativePath: file.relativePath,
          content,
        });
      } catch (_error) {
        // Skip files that can't be read
        logger.debug(`Could not read file: ${file.relativePath}`);
      }
    }

    return filesWithContent;
  }

  /**
   * Calculate context efficiency score (0-100)
   */
  calculateEfficiencyScore() {
    let score = 100;

    // Penalize for large files
    for (const file of this.metrics.largeFiles) {
      if (file.tokens >= TOKEN_THRESHOLDS.CRITICAL_LARGE_FILE) {
        score -= 15;
      } else if (file.tokens >= TOKEN_THRESHOLDS.WARNING_LARGE_FILE) {
        score -= 8;
      } else if (file.tokens >= TOKEN_THRESHOLDS.SUGGESTION_LARGE_FILE) {
        score -= 3;
      }
    }

    // Penalize for test files included
    const testRatio =
      this.metrics.totalTokens > 0 ? this.metrics.testTokens / this.metrics.totalTokens : 0;
    if (testRatio > 0.3) {
      score -= 10;
    } else if (testRatio > 0.2) {
      score -= 5;
    }

    // Penalize for config files
    const configRatio =
      this.metrics.totalTokens > 0 ? this.metrics.configTokens / this.metrics.totalTokens : 0;
    if (configRatio > 0.05) {
      score -= 5;
    }

    // Penalize for duplicate code
    const duplicateStats = this.duplicateDetector.getStats();
    if (duplicateStats.totalGroups > 5) {
      score -= 5;
    } else if (duplicateStats.totalGroups > 2) {
      score -= 2;
    }

    // Penalize for unused exports
    const unusedStats = this.unusedExportsDetector.getStats();
    if (unusedStats.totalUnused > 10) {
      score -= 5;
    } else if (unusedStats.totalUnused > 5) {
      score -= 2;
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Format suggestions for display
   */
  formatOutput(result) {
    if (this.options.json) {
      return JSON.stringify(result, null, 2);
    }

    const lines = [];

    lines.push('');
    lines.push('🤖 AI Context Suggestions:');
    lines.push('═'.repeat(50));
    lines.push(`📊 Context Efficiency Score: ${result.score}/100`);
    lines.push('');

    // Critical suggestions
    if (result.suggestions.critical.length > 0) {
      lines.push(`${ICONS.critical} Critical Suggestions:`);
      for (const s of result.suggestions.critical) {
        lines.push(`  • ${s.message}`);
        if (s.action && this.options.verbose) {
          lines.push(`    → ${s.action}`);
        }
      }
      lines.push('');
    }

    // Warnings
    if (result.suggestions.warning.length > 0) {
      lines.push(`${ICONS.warning} Warnings:`);
      for (const s of result.suggestions.warning) {
        lines.push(`  • ${s.message}`);
        if (s.action) {
          lines.push(`    → ${s.action}`);
        }
      }
      lines.push('');
    }

    // Suggestions
    if (result.suggestions.suggestion.length > 0) {
      lines.push(`${ICONS.suggestion} Suggestions:`);
      for (const s of result.suggestions.suggestion) {
        lines.push(`  • ${s.message}`);
        if (s.action && this.options.verbose) {
          lines.push(`    → ${s.action}`);
        }
      }
      lines.push('');
    }

    // If no suggestions
    if (
      result.suggestions.critical.length === 0 &&
      result.suggestions.warning.length === 0 &&
      result.suggestions.suggestion.length === 0
    ) {
      lines.push(`${ICONS.info} No optimization suggestions found.`);
      lines.push('Your context appears to be well-optimized!');
      lines.push('');
    }

    return lines.join('\n');
  }
}

export default AISuggester;

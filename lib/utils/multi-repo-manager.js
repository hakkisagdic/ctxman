/**
 * Multi-Repository Manager
 * FEAT-006: Multi-Repository Context
 * 
 * Manages multiple repositories for monorepo or microservices context analysis
 */

import fs from 'fs';
import path from 'path';
import TokenCalculator from '../analyzers/token-calculator.js';
import { getLogger } from './logger.js';

const logger = getLogger('MultiRepoManager');

/**
 * Default configuration structure for repos.json
 */
const DEFAULT_CONFIG = {
  version: '1.0',
  repos: []
};

/**
 * MultiRepoManager - Handles multi-repository context analysis
 * 
 * Features:
 * - Add/remove repositories
 * - Per-repo token analysis
 * - Combined context generation
 * - Repository configuration persistence
 */
export class MultiRepoManager {
  /**
   * @param {string} projectRoot - Root directory for configuration
   * @param {object} options - Configuration options
   */
  constructor(projectRoot, options = {}) {
    this.projectRoot = projectRoot;
    this.configPath = options.configPath || path.join(projectRoot, '.ctxman', 'repos.json');
    this.config = null;
    this.options = {
      autoSave: true,
      ...options
    };
  }

  /**
   * Load repository configuration from file
   * @returns {object} Configuration object
   */
  load() {
    try {
      if (fs.existsSync(this.configPath)) {
        const content = fs.readFileSync(this.configPath, 'utf-8');
        const parsed = JSON.parse(content);
        // Deep clone to avoid reference issues
        this.config = {
          version: parsed.version || '1.0',
          repos: Array.isArray(parsed.repos) ? [...parsed.repos] : []
        };
        logger.info(`Loaded ${this.config.repos.length} repositories from config`);
        return this.config;
      }
    } catch (error) {
      logger.warn(`Failed to load config: ${error.message}`);
    }

    // Return default config if file doesn't exist
    this.config = { ...DEFAULT_CONFIG, repos: [] };
    return this.config;
  }

  /**
   * Save repository configuration to file
   */
  save() {
    // Ensure directory exists
    const configDir = path.dirname(this.configPath);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
    logger.info(`Saved configuration to ${this.configPath}`);
  }

  /**
   * Add a repository to configuration
   * @param {string} repoPath - Path to repository (relative or absolute)
   * @param {object} options - Repository options
   * @returns {object} Added repository configuration
   */
  addRepo(repoPath, options = {}) {
    if (!this.config) {
      this.load();
    }

    // Resolve path
    const resolvedPath = this.resolvePath(repoPath);

    // Check if repo already exists
    const existingIndex = this.config.repos.findIndex(r => 
      this.resolvePath(r.path) === resolvedPath
    );

    if (existingIndex !== -1) {
      logger.warn(`Repository already exists: ${repoPath}`);
      return this.config.repos[existingIndex];
    }

    // Create repo entry
    const repoId = options.id || this.generateRepoId(repoPath);
    const repo = {
      id: repoId,
      path: repoPath,
      alias: options.alias || path.basename(resolvedPath),
      exclude: options.exclude || ['node_modules/**', 'dist/**', 'build/**', 'coverage/**'],
      weight: options.weight || 1.0
    };

    this.config.repos.push(repo);

    if (this.options.autoSave) {
      this.save();
    }

    logger.info(`Added repository: ${repo.alias} (${repoPath})`);
    return repo;
  }

  /**
   * Remove a repository from configuration
   * @param {string} repoPath - Path to repository
   * @returns {boolean} True if removed, false if not found
   */
  removeRepo(repoPath) {
    if (!this.config) {
      this.load();
    }

    const resolvedPath = this.resolvePath(repoPath);
    const initialLength = this.config.repos.length;

    this.config.repos = this.config.repos.filter(r => 
      this.resolvePath(r.path) !== resolvedPath
    );

    if (this.config.repos.length < initialLength) {
      if (this.options.autoSave) {
        this.save();
      }
      logger.info(`Removed repository: ${repoPath}`);
      return true;
    }

    logger.warn(`Repository not found: ${repoPath}`);
    return false;
  }

  /**
   * List all configured repositories
   * @returns {Array} List of repository configurations
   */
  listRepos() {
    if (!this.config) {
      this.load();
    }

    return this.config.repos || [];
  }

  /**
   * Analyze all repositories and return combined stats
   * @param {object} options - Analysis options
   * @returns {object} Combined analysis results
   */
  analyzeAll(options = {}) {
    if (!this.config) {
      this.load();
    }

    const results = {
      repos: [],
      combined: {
        totalFiles: 0,
        totalTokens: 0,
        totalLines: 0,
        totalBytes: 0
      }
    };

    for (const repo of this.config.repos) {
      const repoResult = this.analyzeRepo(repo, options);
      results.repos.push(repoResult);

      results.combined.totalFiles += repoResult.files;
      results.combined.totalTokens += repoResult.tokens;
      results.combined.totalLines += repoResult.lines;
      results.combined.totalBytes += repoResult.bytes;
    }

    // Calculate percentages
    for (const repo of results.repos) {
      repo.percentage = results.combined.totalTokens > 0 
        ? ((repo.tokens / results.combined.totalTokens) * 100).toFixed(1)
        : 0;
    }

    logger.info(`Analyzed ${results.repos.length} repositories`);
    return results;
  }

  /**
   * Analyze a single repository
   * @param {object} repo - Repository configuration
   * @param {object} options - Analysis options
   * @returns {object} Repository analysis result
   */
  analyzeRepo(repo, options = {}) {
    const resolvedPath = this.resolvePath(repo.path);
    const repoResult = {
      id: repo.id,
      alias: repo.alias,
      path: repo.path,
      resolvedPath,
      files: 0,
      tokens: 0,
      lines: 0,
      bytes: 0,
      byExtension: {}
    };

    try {
      if (!fs.existsSync(resolvedPath)) {
        logger.warn(`Repository path does not exist: ${resolvedPath}`);
        repoResult.error = 'Path does not exist';
        return repoResult;
      }

      // Create analyzer with repo-specific excludes
      const analyzer = new TokenCalculator(resolvedPath, {
        verbose: false,
        simple: true,
        ...options
      });

      // Run analysis
      const stats = analyzer.run();

      if (stats) {
        repoResult.files = stats.totalFiles || 0;
        repoResult.tokens = stats.totalTokens || 0;
        repoResult.lines = stats.totalLines || 0;
        repoResult.bytes = stats.totalBytes || 0;
        repoResult.byExtension = stats.byExtension || {};
        repoResult.largestFiles = stats.largestFiles || [];
      }

    } catch (error) {
      logger.error(`Failed to analyze repo ${repo.alias}: ${error.message}`);
      repoResult.error = error.message;
    }

    return repoResult;
  }

  /**
   * Resolve repository path (relative or absolute)
   * @param {string} repoPath - Repository path
   * @returns {string} Resolved absolute path
   */
  resolvePath(repoPath) {
    if (path.isAbsolute(repoPath)) {
      return repoPath;
    }
    return path.resolve(this.projectRoot, repoPath);
  }

  /**
   * Generate a unique repository ID from path
   * @param {string} repoPath - Repository path
   * @returns {string} Generated ID
   */
  generateRepoId(repoPath) {
    const basename = path.basename(repoPath);
    const timestamp = Date.now().toString(36);
    return `${basename}-${timestamp}`;
  }

  /**
   * Format analysis results for display
   * @param {object} results - Analysis results
   * @returns {string} Formatted output
   */
  formatResults(results) {
    const lines = [];

    lines.push('🔀 Multi-Repository Context Analysis:');
    lines.push('═'.repeat(50));

    if (results.repos.length === 0) {
      lines.push('   No repositories configured.');
      lines.push('   Use --add-repo <path> to add repositories.');
      return lines.join('\n');
    }

    lines.push(`   Repositories: ${results.repos.length}`);
    lines.push('');

    results.repos.forEach((repo, index) => {
      const num = `${index + 1}.`;
      lines.push(`   ${num} ${repo.alias} (${repo.path})`);

      if (repo.error) {
        lines.push(`      ⚠️  Error: ${repo.error}`);
      } else {
        lines.push(`      Files: ${repo.files.toLocaleString()}`);
        lines.push(`      Tokens: ${repo.tokens.toLocaleString()} (${repo.percentage}%)`);
      }
      lines.push('');
    });

    lines.push('   ' + '─'.repeat(46));
    lines.push(`   Combined Total: ${results.combined.totalFiles.toLocaleString()} files, ${results.combined.totalTokens.toLocaleString()} tokens`);

    return lines.join('\n');
  }

  /**
   * Format repository list for display
   * @returns {string} Formatted output
   */
  formatList() {
    const repos = this.listRepos();

    if (repos.length === 0) {
      return 'No repositories configured.\nUse --add-repo <path> to add a repository.';
    }

    const lines = [];
    lines.push('📋 Configured Repositories:');
    lines.push('═'.repeat(50));

    repos.forEach((repo, index) => {
      const resolvedPath = this.resolvePath(repo.path);
      const exists = fs.existsSync(resolvedPath);
      const status = exists ? '✓' : '⚠';

      lines.push(`${status} ${index + 1}. ${repo.alias}`);
      lines.push(`   Path: ${repo.path}`);
      lines.push(`   ID: ${repo.id}`);

      if (!exists) {
        lines.push(`   ⚠️  Path does not exist`);
      }
      lines.push('');
    });

    lines.push(`Total: ${repos.length} repositories`);
    return lines.join('\n');
  }
}

export default MultiRepoManager;

/**
 * Scanner - File System Scanning Module
 * v3.0.0 - Modular architecture
 */

import fs from 'fs';
import path from 'path';
import GitIgnoreParser from '../parsers/gitignore-parser.js';
import FileUtils from '../utils/file-utils.js';
import { getLogger } from '../utils/logger.js';
import { loadPolicy } from '../policy/policy.js';
import { loadIgnoreFileRules, resolveIgnoreFileNames } from '../policy/ignore-files.js';

const logger = getLogger('Scanner');

export class Scanner {
  /**
   * @param {string} rootPath - Project root
   * @param {object} [options]
   * @param {import('../policy/policy.js').Policy|false|null} [options.policy] - Export policy
   *   whose deny rules drop files; loaded from the project (.ctxman/policy.json and
   *   CTXMAN_POLICY) when not given, and turned off with false
   * @param {string|string[]} [options.respectIgnoreFiles] - AI-tool ignore files to honour
   *   ("all", ".cursorignore,.aiexclude" or an array), in addition to the policy's list
   * @param {object} [options.env=process.env] - Environment for loading the policy
   */
  constructor(rootPath, options = {}) {
    this.rootPath = rootPath;
    this.options = {
      respectGitignore: true,
      followSymlinks: false,
      maxDepth: Infinity,
      ...options,
    };

    // Initialize GitIgnoreParser with correct file paths
    const gitignorePath = path.join(rootPath, '.gitignore');
    const contextIgnorePath = path.join(rootPath, '.contextignore');
    const contextIncludePath = path.join(rootPath, '.contextinclude');

    this.gitIgnore = new GitIgnoreParser(gitignorePath, contextIgnorePath, contextIncludePath);
    this.stats = {
      filesScanned: 0,
      directoriesTraversed: 0,
      filesIgnored: 0,
      filesDenied: 0,
      errors: 0,
    };
    // Loaded on first use, so constructing a Scanner reads no policy files
    this._policy = undefined;
    this._ignoreFileRules = undefined;
  }

  scan() {
    logger.info(`Starting scan: ${this.rootPath}`);
    const startTime = Date.now();

    // Load here, outside scanDirectory's error handling: an invalid policy must fail the
    // scan instead of yielding an empty file list
    this.getPolicy();
    this.getIgnoreFileRules();

    const files = this.scanDirectory(this.rootPath, 0);

    const elapsed = Date.now() - startTime;
    logger.info(`Scan complete: ${this.stats.filesScanned} files in ${elapsed}ms`);

    return files;
  }

  scanDirectory(dirPath, depth = 0) {
    if (depth > this.options.maxDepth) {
      return [];
    }

    const files = [];

    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      this.stats.directoriesTraversed++;

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        const relativePath = path.relative(this.rootPath, fullPath);

        if (this.shouldIgnore(relativePath, fullPath)) {
          this.stats.filesIgnored++;
          continue;
        }

        if (entry.isDirectory()) {
          if (FileUtils.isSkippedDirectory(entry.name)) continue;
          const subFiles = this.scanDirectory(fullPath, depth + 1);
          files.push(...subFiles);
        } else if (entry.isFile()) {
          // Check if it's a text file (not binary)
          try {
            if (this.getPolicy()?.isAuditLog(relativePath)) {
              this.stats.filesIgnored++;
            } else if (FileUtils.isText(fullPath)) {
              if (this.getPolicy()?.isDenied(relativePath)) {
                this.stats.filesDenied++;
              } else {
                const fileInfo = this.getFileInfo(fullPath, relativePath);
                files.push(fileInfo);
                this.stats.filesScanned++;
              }
            } else {
              this.stats.filesIgnored++;
            }
          } catch (_error) {
            // Skip files that can't be processed
            this.stats.filesIgnored++;
          }
        }
      }
    } catch (error) {
      logger.error(`Error scanning directory ${dirPath}: ${error.message}`);
      this.stats.errors++;
    }

    return files;
  }

  getFileInfo(fullPath, relativePath) {
    const stats = fs.statSync(fullPath);

    return {
      path: fullPath,
      relativePath: relativePath,
      name: path.basename(fullPath),
      extension: path.extname(fullPath),
      size: stats.size,
      modified: stats.mtime,
      created: stats.birthtime,
    };
  }

  /**
   * Whether the export policy denies a project-relative path
   * @param {string} relativePath
   * @returns {boolean}
   */
  isDenied(relativePath) {
    return Boolean(this.getPolicy()?.isDenied(relativePath));
  }

  shouldIgnore(relativePath, fullPath = path.join(this.rootPath, relativePath)) {
    if (this.gitIgnore.isIgnored(fullPath, relativePath)) return true;
    return Boolean(this.getIgnoreFileRules()?.isIgnored(relativePath));
  }

  /**
   * Effective export policy, or null when none applies
   * @returns {import('../policy/policy.js').Policy|null}
   */
  getPolicy() {
    if (this._policy === undefined) {
      const { policy, env } = this.options;
      const loaded = policy === undefined ? loadPolicy(this.rootPath, { env }) : policy;
      this._policy = loaded?.active ? loaded : null;
    }
    return this._policy;
  }

  /**
   * AI-tool ignore files from options.respectIgnoreFiles and the policy's ignoreFiles
   * @returns {import('../policy/ignore-files.js').IgnoreFileRules|null}
   */
  getIgnoreFileRules() {
    if (this._ignoreFileRules === undefined) {
      const names = [
        ...new Set([
          ...resolveIgnoreFileNames(this.options.respectIgnoreFiles),
          ...(this.getPolicy()?.ignoreFiles ?? []),
        ]),
      ];
      this._ignoreFileRules = names.length > 0 ? loadIgnoreFileRules(this.rootPath, names) : null;
    }
    return this._ignoreFileRules;
  }

  getStats() {
    return { ...this.stats };
  }

  reset() {
    this.stats = {
      filesScanned: 0,
      directoriesTraversed: 0,
      filesIgnored: 0,
      filesDenied: 0,
      errors: 0,
    };
  }
}

export default Scanner;

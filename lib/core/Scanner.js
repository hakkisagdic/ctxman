/**
 * Scanner - File System Scanning Module
 * v3.0.0 - Modular architecture
 */

import fs from 'fs';
import path from 'path';
import GitIgnoreParser from '../parsers/gitignore-parser.js';
import FileUtils from '../utils/file-utils.js';
import { getLogger } from '../utils/logger.js';

const logger = getLogger('Scanner');

export class Scanner {
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
      errors: 0,
    };
  }

  scan() {
    logger.info(`Starting scan: ${this.rootPath}`);
    const startTime = Date.now();

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
            if (FileUtils.isText(fullPath)) {
              const fileInfo = this.getFileInfo(fullPath, relativePath);
              files.push(fileInfo);
              this.stats.filesScanned++;
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

  shouldIgnore(relativePath, fullPath = path.join(this.rootPath, relativePath)) {
    return this.gitIgnore.isIgnored(fullPath, relativePath);
  }

  getStats() {
    return { ...this.stats };
  }

  reset() {
    this.stats = {
      filesScanned: 0,
      directoriesTraversed: 0,
      filesIgnored: 0,
      errors: 0,
    };
  }
}

export default Scanner;

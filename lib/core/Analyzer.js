/**
 * Analyzer - Token & Method Analysis Module
 * v3.0.0 - Modular architecture
 */

import fs from 'fs';
import TokenUtils from '../utils/token-utils.js';
import FileUtils from '../utils/file-utils.js';
import MethodAnalyzer from '../analyzers/method-analyzer.js';
import { resolveCacheManager } from '../cache/CacheManager.js';
import { getLogger } from '../utils/logger.js';

const logger = getLogger('Analyzer');

export class Analyzer {
  constructor(options = {}) {
    this.options = {
      methodLevel: false,
      parallel: false,
      maxWorkers: 4,
      targetModel: null,
      cache: false,
      ...options,
    };

    this.encoding = options.encoding || TokenUtils.encodingFor(this.options.targetModel);
    this.cache = resolveCacheManager(this.options.cache, {
      ...(this.options.cachePath ? { path: this.options.cachePath } : {}),
    });
    this.methodAnalyzer = new MethodAnalyzer();
    this.stats = this.initStats();
  }

  initStats() {
    const base = {
      totalFiles: 0,
      totalTokens: 0,
      totalSize: 0,
      totalMethods: 0,
      totalLines: 0,
      byLanguage: {},
      largestFiles: [],
      analysisTime: 0,
    };
    if (this.cache) {
      base.cacheHits = 0;
      base.cacheMisses = 0;
    }
    return base;
  }

  async analyze(files) {
    logger.info(`Analyzing ${files.length} files...`);
    const startTime = Date.now();

    this.reset();

    const results = await this.analyzeSequential(files);

    this.stats.analysisTime = Date.now() - startTime;
    logger.info(`Analysis complete in ${this.stats.analysisTime}ms`);

    return {
      files: results,
      stats: this.getStats(),
    };
  }

  async analyzeSequential(files) {
    const results = [];

    for (const file of files) {
      const analysis = await this.analyzeFile(file);
      if (analysis) {
        results.push(analysis);
        this.updateStats(analysis);
      }
    }

    return results;
  }

  async analyzeFile(fileInfo) {
    try {
      // Skip if not a text file
      if (!FileUtils.isText(fileInfo.path)) {
        return null;
      }

      let size = fileInfo.size;
      let modified = fileInfo.modified;
      let mtimeMs =
        modified instanceof Date
          ? modified.getTime()
          : typeof modified === 'number'
            ? modified
            : null;

      if (this.cache && (mtimeMs === null || typeof size !== 'number')) {
        const stat = fs.statSync(fileInfo.path);
        mtimeMs = stat.mtimeMs;
        size = stat.size;
        if (modified === undefined) modified = stat.mtime;
      }

      const cacheMeta = {
        namespace: 'analyzer',
        size,
        encoding: this.encoding,
        methodLevel: Boolean(this.options.methodLevel),
      };

      if (this.cache) {
        const cached = this.cache.get(fileInfo.path, mtimeMs, cacheMeta);
        if (cached) {
          this.stats.cacheHits++;
          return {
            ...cached,
            path: fileInfo.path,
            relativePath: fileInfo.relativePath,
            name: fileInfo.name ?? cached.name,
            extension: fileInfo.extension ?? cached.extension,
            size: size ?? cached.size,
            modified: modified ?? cached.modified,
          };
        }
        this.stats.cacheMisses++;
      }

      const content = fs.readFileSync(fileInfo.path, 'utf-8');
      const tokens = TokenUtils.calculate(content, fileInfo.path, this.encoding);

      const analysis = {
        path: fileInfo.path,
        relativePath: fileInfo.relativePath,
        name: fileInfo.name,
        extension: fileInfo.extension,
        size: size,
        modified: modified,
        tokens: tokens,
        lines: content.split('\n').length,
        language: this.detectLanguage(fileInfo.extension),
      };

      if (this.options.methodLevel) {
        const methods = this.methodAnalyzer.extractMethods(content, fileInfo.path);
        const sources = this.methodAnalyzer.extractMethodSources(content, methods, fileInfo.path);
        analysis.methods = methods.map((method, i) => ({
          ...method,
          tokens: TokenUtils.calculate(sources[i], fileInfo.path, this.encoding),
        }));
        analysis.methodCount = methods.length;
      }

      if (this.cache) {
        this.cache.set(fileInfo.path, analysis, mtimeMs, cacheMeta);
      }

      return analysis;
    } catch (error) {
      logger.error(`Error analyzing file ${fileInfo.relativePath}: ${error.message}`);
      return null;
    }
  }

  updateStats(analysis) {
    this.stats.totalFiles++;
    this.stats.totalTokens += analysis.tokens;
    this.stats.totalSize += analysis.size;
    this.stats.totalLines += analysis.lines || 0;

    if (!this.stats.byLanguage[analysis.language]) {
      this.stats.byLanguage[analysis.language] = {
        files: 0,
        tokens: 0,
        size: 0,
      };
    }

    this.stats.byLanguage[analysis.language].files++;
    this.stats.byLanguage[analysis.language].tokens += analysis.tokens;
    this.stats.byLanguage[analysis.language].size += analysis.size;

    this.stats.largestFiles.push({
      path: analysis.relativePath,
      tokens: analysis.tokens,
      size: analysis.size,
    });

    this.stats.largestFiles.sort((a, b) => b.tokens - a.tokens);
    this.stats.largestFiles = this.stats.largestFiles.slice(0, 10);

    if (analysis.methods) {
      this.stats.totalMethods += analysis.methodCount || 0;
    }
  }

  detectLanguage(extension) {
    const languageMap = {
      '.js': 'JavaScript',
      '.jsx': 'JavaScript',
      '.ts': 'TypeScript',
      '.tsx': 'TypeScript',
      '.py': 'Python',
      '.rb': 'Ruby',
      '.php': 'PHP',
      '.java': 'Java',
      '.kt': 'Kotlin',
      '.cs': 'C#',
      '.go': 'Go',
      '.rs': 'Rust',
      '.swift': 'Swift',
      '.c': 'C',
      '.cpp': 'C++',
      '.h': 'C/C++',
      '.hpp': 'C++',
      '.scala': 'Scala',
    };

    return languageMap[extension] || 'Other';
  }

  getStats() {
    return { ...this.stats };
  }

  reset() {
    this.stats = this.initStats();
  }

  getLanguageDistribution() {
    return Object.entries(this.stats.byLanguage)
      .map(([language, stats]) => ({
        language,
        ...stats,
        percentage: (stats.tokens / this.stats.totalTokens) * 100,
      }))
      .sort((a, b) => b.tokens - a.tokens);
  }
}

export default Analyzer;

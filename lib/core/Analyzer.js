/**
 * Analyzer - Token & Method Analysis Module
 * v3.0.0 - Modular architecture
 */

import fs from 'fs';
import TokenUtils from '../utils/token-utils.js';
import FileUtils from '../utils/file-utils.js';
import MethodAnalyzer from '../analyzers/method-analyzer.js';
import { getLogger } from '../utils/logger.js';

const logger = getLogger('Analyzer');

export class Analyzer {
  constructor(options = {}) {
    this.options = {
      methodLevel: false,
      parallel: false,
      maxWorkers: 4,
      ...options,
    };

    this.methodAnalyzer = new MethodAnalyzer();
    this.stats = this.initStats();
  }

  initStats() {
    return {
      totalFiles: 0,
      totalTokens: 0,
      totalSize: 0,
      totalMethods: 0,
      totalLines: 0,
      byLanguage: {},
      largestFiles: [],
      analysisTime: 0,
    };
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

      const content = fs.readFileSync(fileInfo.path, 'utf-8');
      const tokens = TokenUtils.calculate(content, fileInfo.path);

      const analysis = {
        path: fileInfo.path,
        relativePath: fileInfo.relativePath,
        name: fileInfo.name,
        extension: fileInfo.extension,
        size: fileInfo.size,
        tokens: tokens,
        lines: content.split('\n').length,
        language: this.detectLanguage(fileInfo.extension),
      };

      if (this.options.methodLevel) {
        const methods = this.methodAnalyzer.extractMethods(content, fileInfo.path);
        analysis.methods = methods;
        analysis.methodCount = methods.length;
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

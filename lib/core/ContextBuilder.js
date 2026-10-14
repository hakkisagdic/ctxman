/**
 * ContextBuilder - Smart Context Generation Module
 * v3.0.0 - Modular architecture
 *
 * Responsibilities:
 * - Build optimized context for LLMs
 * - Apply smart filtering strategies
 * - Generate context in multiple formats
 * - Support use-case templates
 * - Optimize for target LLM models
 */

import { LLMDetector } from '../utils/llm-detector.js';
import { getLogger } from '../utils/logger.js';

const logger = getLogger('ContextBuilder');

export class ContextBuilder {
  constructor(options = {}) {
    this.options = {
      targetModel: null,
      targetTokens: null,
      useCase: 'custom',
      includeTests: true,
      includeDocumentation: true,
      priorityStrategy: 'balanced', // balanced, changed-first, core-first
      ...options,
    };
  }

  /**
   * Build context from analysis results
   * @param {AnalysisResult} analysisResult
   * @returns {Context}
   */
  build(analysisResult) {
    logger.info('Building context...');

    const { files, stats } = analysisResult;

    // Apply smart filtering if target tokens specified
    let filteredFiles = files;
    if (this.options.targetTokens) {
      filteredFiles = this.applySmartFiltering(files, this.options.targetTokens);
    }

    // Build context structure
    const context = {
      metadata: this.buildMetadata(stats),
      files: this.buildFileList(filteredFiles),
      methods: this.options.methodLevel ? this.buildMethodList(filteredFiles) : null,
      statistics: stats,
    };

    // Optimize for target LLM if specified
    if (this.options.targetModel) {
      return this.optimizeForLLM(context);
    }

    return context;
  }

  /**
   * Build context metadata
   * @param {object} stats
   * @returns {object}
   */
  buildMetadata(stats) {
    return {
      generatedAt: new Date().toISOString(),
      totalFiles: stats.totalFiles,
      totalTokens: stats.totalTokens,
      totalSize: stats.totalSize,
      targetModel: this.options.targetModel,
      useCase: this.options.useCase,
      configuration: {
        includeTests: this.options.includeTests,
        includeDocumentation: this.options.includeDocumentation,
        methodLevel: this.options.methodLevel,
      },
    };
  }

  /**
   * Build file list structure
   * @param {Array<FileAnalysis>} files
   * @returns {object}
   */
  buildFileList(files) {
    const filesByDirectory = {};

    for (const file of files) {
      const dirPath = file.relativePath.includes('/')
        ? file.relativePath.substring(0, file.relativePath.lastIndexOf('/'))
        : '/';

      if (!filesByDirectory[dirPath]) {
        filesByDirectory[dirPath] = [];
      }

      filesByDirectory[dirPath].push({
        name: file.name,
        path: file.relativePath,
        tokens: file.tokens,
        size: file.size,
        language: file.language,
      });
    }

    return filesByDirectory;
  }

  /**
   * Build method list structure
   * @param {Array<FileAnalysis>} files
   * @returns {object}
   */
  buildMethodList(files) {
    const methods = {};

    for (const file of files) {
      if (file.methods && file.methods.length > 0) {
        methods[file.relativePath] = file.methods.map((method) => ({
          name: method.name,
          line: method.line,
          tokens: method.tokens || 0,
          type: method.type || 'function',
        }));
      }
    }

    return methods;
  }

  /**
   * Apply smart filtering to fit target token budget
   * @param {Array<FileAnalysis>} files
   * @param {number} targetTokens
   * @returns {Array<FileAnalysis>}
   */
  applySmartFiltering(files, targetTokens) {
    logger.info(`Applying smart filtering: target ${targetTokens} tokens`);

    // Calculate current total
    const currentTotal = files.reduce((sum, f) => sum + f.tokens, 0);

    if (currentTotal <= targetTokens) {
      logger.info('All files fit within target');
      return files;
    }

    // Pack by priority. A file that does not fit is skipped whole (nothing truncates file
    // content), and smaller files after it can still use the remaining budget.
    const selected = [];
    let runningTotal = 0;

    for (const file of this.prioritizeFiles(files)) {
      if (runningTotal + file.tokens <= targetTokens) {
        selected.push(file);
        runningTotal += file.tokens;
      }
    }

    logger.info(`Filtered ${files.length} → ${selected.length} files (${runningTotal} tokens)`);
    return selected;
  }

  /**
   * Prioritize files based on strategy
   * @param {Array<FileAnalysis>} files
   * @returns {Array<FileAnalysis>}
   */
  prioritizeFiles(files) {
    const strategy = this.options.priorityStrategy;
    // Sort a copy: the caller's analysis result keeps its order
    const sorted = [...files];

    switch (strategy) {
      case 'changed-first':
        // Most recently modified files first (mtime from the scanner)
        return sorted.sort((a, b) => {
          const aModified = a.modified || 0;
          const bModified = b.modified || 0;
          return bModified - aModified;
        });

      case 'core-first':
        // Prioritize core application files (heuristic-based)
        return sorted.sort((a, b) => {
          const aCoreScore = this.calculateCoreScore(a);
          const bCoreScore = this.calculateCoreScore(b);
          return bCoreScore - aCoreScore;
        });

      case 'balanced':
      default:
        // Balance between size and importance
        return sorted.sort((a, b) => {
          const aScore = this.calculateBalancedScore(a);
          const bScore = this.calculateBalancedScore(b);
          return bScore - aScore;
        });
    }
  }

  /**
   * Calculate core importance score (heuristic)
   * @param {FileAnalysis} file
   * @returns {number}
   */
  calculateCoreScore(file) {
    let score = 0;

    const path = file.relativePath.toLowerCase();

    // High priority paths
    if (path.includes('src/') || path.includes('lib/')) score += 10;
    if (path.includes('core/') || path.includes('main')) score += 8;
    if (path.includes('index.') || path.includes('app.')) score += 7;

    // Medium priority
    if (path.includes('utils/') || path.includes('helpers/')) score += 5;
    if (path.includes('components/')) score += 4;

    // Lower priority
    if (path.includes('test')) score -= 5;
    if (path.includes('docs/') || path.includes('examples/')) score -= 3;

    return score;
  }

  /**
   * Calculate balanced score
   * @param {FileAnalysis} file
   * @returns {number}
   */
  calculateBalancedScore(file) {
    const coreScore = this.calculateCoreScore(file);
    const sizeScore = Math.log(file.tokens + 1); // Logarithmic to avoid dominating
    return coreScore + sizeScore;
  }

  /**
   * Optimize context for target LLM
   * @param {Context} context
   * @returns {Context}
   */
  optimizeForLLM(context) {
    const profile = LLMDetector.getProfile(this.options.targetModel);

    logger.info(`Optimizing for ${profile.name} (${profile.contextWindow} tokens)`);

    // Apply LLM-specific optimizations
    const optimized = { ...context };

    // Recommend format
    optimized.metadata.recommendedFormat = profile.preferredFormat;

    // Check if chunking needed
    const totalTokens = context.statistics.totalTokens;
    optimized.metadata.fitsInContext = totalTokens <= profile.maxRecommendedInput;
    optimized.metadata.chunksNeeded = optimized.metadata.fitsInContext
      ? 1
      : Math.ceil(totalTokens / profile.maxRecommendedInput);

    // Add LLM-specific metadata
    optimized.metadata.targetLLM = {
      name: profile.name,
      vendor: profile.vendor,
      contextWindow: profile.contextWindow,
      recommendedInput: profile.maxRecommendedInput,
    };

    return optimized;
  }

  /**
   * Generate compact file paths (for TOON format)
   * @param {Context} context
   * @returns {object}
   */
  generateCompactPaths(context) {
    const compact = {};

    for (const [dir, files] of Object.entries(context.files)) {
      const fileNames = files.map((f) => f.name);
      compact[dir] = fileNames;
    }

    return compact;
  }

  /**
   * Get context summary
   * @param {Context} context
   * @returns {string}
   */
  getSummary(context) {
    const meta = context.metadata;
    const _stats = context.statistics;

    let summary = `Context Summary:\n`;
    summary += `  Files: ${meta.totalFiles}\n`;
    summary += `  Tokens: ${meta.totalTokens.toLocaleString()}\n`;
    summary += `  Size: ${(meta.totalSize / 1024).toFixed(1)} KB\n`;

    if (meta.targetLLM) {
      summary += `  Target: ${meta.targetLLM.name}\n`;
      summary += `  Fits in context: ${meta.fitsInContext ? 'Yes' : `No (${meta.chunksNeeded} chunks)`}\n`;
    }

    return summary;
  }
}

export default ContextBuilder;

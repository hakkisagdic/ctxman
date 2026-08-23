/**
 * Reporter - Report Generation Module
 * v3.0.0 - Modular architecture
 *
 * Responsibilities:
 * - Generate reports in multiple formats
 * - Display statistics and summaries
 * - Export to files or clipboard
 * - Support custom report templates
 */

import fs from 'fs';
import path from 'path';
import FormatRegistry from '../formatters/format-registry.js';
import ClipboardUtils from '../utils/clipboard-utils.js';
import { getLogger } from '../utils/logger.js';

const logger = getLogger('Reporter');

export class Reporter {
  constructor(options = {}) {
    this.options = {
      format: 'toon',
      outputPath: null,
      clipboard: false,
      verbose: true,
      ...options,
    };

    this.formatRegistry = new FormatRegistry();
  }

  /**
   * Generate and output report
   * @param {Context} context
   * @param {object} stats
   */
  async report(context, stats) {
    logger.info('Generating report...');

    // Console output
    if (this.options.verbose) {
      this.printConsoleReport(stats);
    }

    // File export
    if (this.options.outputPath) {
      await this.exportToFile(context, this.options.outputPath);
    }

    // Clipboard
    if (this.options.clipboard) {
      await this.exportToClipboard(context);
    }
  }

  /**
   * Print console report
   * @param {object} stats
   */
  printConsoleReport(stats) {
    console.log('\n📊 ANALYSIS RESULTS');
    console.log('═'.repeat(60));
    console.log();

    // Summary
    console.log('📁 FILES & TOKENS:');
    console.log(`   Total Files: ${stats.totalFiles}`);
    console.log(`   Total Tokens: ${stats.totalTokens.toLocaleString()}`);
    console.log(`   Total Size: ${(stats.totalSize / 1024).toFixed(1)} KB`);
    console.log(`   Avg Tokens/File: ${this.getAverageTokens(stats)}`);
    console.log();

    // Language distribution
    if (Object.keys(stats.byLanguage).length > 0) {
      console.log('🌍 LANGUAGE DISTRIBUTION:');
      const languages = Object.entries(stats.byLanguage)
        .sort((a, b) => b[1].tokens - a[1].tokens)
        .slice(0, 5);

      for (const [lang, langStats] of languages) {
        const percentage = ((langStats.tokens / stats.totalTokens) * 100).toFixed(1);
        const bar = '▓'.repeat(Math.round(percentage / 2));
        console.log(`   ${lang.padEnd(15)} ${percentage.padStart(5)}%  ${bar}`);
      }
      console.log();
    }

    // Largest files
    if (stats.largestFiles && stats.largestFiles.length > 0) {
      console.log('🏆 LARGEST FILES (by tokens):');
      for (let i = 0; i < Math.min(5, stats.largestFiles.length); i++) {
        const file = stats.largestFiles[i];
        const percentage = ((file.tokens / stats.totalTokens) * 100).toFixed(1);
        console.log(
          `   ${i + 1}. ${file.path.padEnd(40)} ${file.tokens.toLocaleString().padStart(8)} tokens (${percentage}%)`
        );
      }
      console.log();
    }

    // Method stats
    if (stats.totalMethods > 0) {
      console.log('🔧 METHOD ANALYSIS:');
      console.log(`   Total Methods: ${stats.totalMethods}`);
      if (stats.includedMethods !== undefined) {
        console.log(`   Included Methods: ${stats.includedMethods}`);
        console.log(`   Filtered: ${stats.totalMethods - stats.includedMethods}`);
      }
      console.log();
    }

    // Performance stats
    if (stats.analysisTime) {
      console.log('⚡ PERFORMANCE:');
      console.log(`   Analysis Time: ${stats.analysisTime}ms`);
      if (stats.cacheHits !== undefined) {
        const totalCache = stats.cacheHits + stats.cacheMisses;
        const hitRate = totalCache > 0 ? ((stats.cacheHits / totalCache) * 100).toFixed(1) : 0;
        console.log(`   Cache Hit Rate: ${hitRate}% (${stats.cacheHits}/${totalCache})`);
      }
      console.log();
    }
  }

  /**
   * Export context to file
   * @param {Context} context
   * @param {string} outputPath
   */
  async exportToFile(context, outputPath) {
    try {
      const format = this.detectFormatFromPath(outputPath);
      const content = this.formatRegistry.encode(format, context);

      fs.writeFileSync(outputPath, content, 'utf-8');

      const size = (Buffer.byteLength(content, 'utf-8') / 1024).toFixed(1);
      logger.info(`Exported to ${outputPath} (${size} KB, ${format} format)`);

      console.log(`💾 Report saved: ${outputPath}`);
      console.log(`   Format: ${format.toUpperCase()}`);
      console.log(`   Size: ${size} KB`);
    } catch (error) {
      logger.error(`Failed to export to file: ${error.message}`);
      throw error;
    }
  }

  /**
   * Export context to clipboard
   * @param {Context} context
   */
  async exportToClipboard(context) {
    try {
      const format = this.options.format || 'toon';
      const content = this.formatRegistry.encode(format, context);

      const success = ClipboardUtils.copy(content);

      if (success) {
        const size = (Buffer.byteLength(content, 'utf-8') / 1024).toFixed(1);
        logger.info(`Copied to clipboard (${size} KB, ${format} format)`);

        console.log(`📋 Context copied to clipboard!`);
        console.log(`   Format: ${format.toUpperCase()}`);
        console.log(`   Size: ${size} KB`);
      } else {
        logger.warn('Clipboard copy failed, falling back to file export');
        const fallbackPath = path.join(process.cwd(), `context-${Date.now()}.${format}`);
        await this.exportToFile(context, fallbackPath);
      }
    } catch (error) {
      logger.error(`Failed to export to clipboard: ${error.message}`);
      throw error;
    }
  }

  /**
   * Detect output format from file path
   * @param {string} outputPath
   * @returns {string}
   */
  detectFormatFromPath(outputPath) {
    const ext = path.extname(outputPath).toLowerCase();

    const formatMap = {
      '.toon': 'toon',
      '.json': 'json',
      '.yaml': 'yaml',
      '.yml': 'yaml',
      '.md': 'markdown',
      '.csv': 'csv',
      '.xml': 'xml',
      '.txt': 'gitingest',
    };

    return formatMap[ext] || this.options.format || 'toon';
  }

  /**
   * Get average tokens per file
   * @param {object} stats
   * @returns {string}
   */
  getAverageTokens(stats) {
    if (stats.totalFiles === 0) return 'N/A';
    const avg = Math.round(stats.totalTokens / stats.totalFiles);
    return avg.toLocaleString();
  }

  /**
   * Generate summary text
   * @param {Context} context
   * @returns {string}
   */
  generateSummary(context) {
    const meta = context.metadata;
    const _stats = context.statistics;

    let summary = 'Ctxman Analysis Summary\n';
    summary += '='.repeat(50) + '\n\n';

    summary += `Generated: ${new Date(meta.generatedAt).toLocaleString()}\n`;
    summary += `Files: ${meta.totalFiles}\n`;
    summary += `Tokens: ${meta.totalTokens.toLocaleString()}\n`;
    summary += `Size: ${(meta.totalSize / 1024).toFixed(1)} KB\n\n`;

    if (meta.targetLLM) {
      summary += `Target LLM: ${meta.targetLLM.name}\n`;
      summary += `Fits in context: ${meta.fitsInContext ? 'Yes' : 'No'}\n`;
      if (!meta.fitsInContext) {
        summary += `Chunks needed: ${meta.chunksNeeded}\n`;
      }
      summary += '\n';
    }

    summary += `Use Case: ${meta.useCase}\n`;
    summary += `Method Analysis: ${meta.configuration.methodLevel ? 'Enabled' : 'Disabled'}\n`;

    return summary;
  }

  /**
   * Export in multiple formats
   * @param {Context} context
   * @param {Array<string>} formats
   */
  async exportMultiple(context, formats) {
    const results = [];

    for (const format of formats) {
      const outputPath = path.join(process.cwd(), `context-${Date.now()}.${format}`);

      try {
        await this.exportToFile(context, outputPath);
        results.push({ format, path: outputPath, success: true });
      } catch (error) {
        results.push({ format, error: error.message, success: false });
      }
    }

    return results;
  }
}

export default Reporter;

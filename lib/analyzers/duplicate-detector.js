/**
 * Duplicate Code Detector
 * Detects duplicate and near-duplicate code blocks
 * Part of FEAT-005: AI-Powered Context Suggestions
 */

import { getLogger } from '../utils/logger.js';

const logger = getLogger('DuplicateDetector');

export class DuplicateDetector {
  constructor(options = {}) {
    this.options = {
      minLines: options.minLines || 5,
      similarityThreshold: options.similarityThreshold || 0.8,
      maxBlocks: options.maxBlocks || 100,
      ...options,
    };
    this.duplicates = [];
  }

  /**
   * Detect duplicate code blocks in files
   * @param {Array} files - Array of file objects with content
   * @returns {Array} Array of duplicate block groups
   */
  detect(files) {
    logger.debug(`Analyzing ${files.length} files for duplicates`);

    const blocks = this.extractBlocks(files);
    const duplicateGroups = this.findDuplicates(blocks);

    this.duplicates = duplicateGroups;
    logger.info(`Found ${duplicateGroups.length} duplicate code groups`);

    return duplicateGroups;
  }

  /**
   * Extract code blocks from files
   * @param {Array} files - Array of file objects
   * @returns {Array} Array of code blocks
   */
  extractBlocks(files) {
    const blocks = [];

    for (const file of files) {
      if (!file.content || !this.isCodeFile(file.path)) {
        continue;
      }

      const lines = file.content.split('\n');
      const minLines = this.options.minLines;

      // Extract sliding windows of code blocks
      for (let i = 0; i <= lines.length - minLines; i++) {
        const blockLines = lines.slice(i, i + minLines);
        const content = blockLines.join('\n');

        // Skip empty or comment-only blocks
        if (this.isSignificantBlock(content)) {
          blocks.push({
            file: file.path,
            relativePath: file.relativePath || file.path,
            startLine: i + 1,
            endLine: i + minLines,
            content,
            hash: this.hashBlock(content),
            normalizedHash: this.hashBlock(this.normalizeBlock(content)),
          });
        }
      }
    }

    return blocks;
  }

  /**
   * Find duplicate blocks by comparing hashes
   * @param {Array} blocks - Array of code blocks
   * @returns {Array} Array of duplicate groups
   */
  findDuplicates(blocks) {
    const hashMap = new Map();
    const normalizedHashMap = new Map();

    // Group by exact hash
    for (const block of blocks) {
      // Exact duplicates
      if (!hashMap.has(block.hash)) {
        hashMap.set(block.hash, []);
      }
      hashMap.get(block.hash).push(block);

      // Near duplicates (normalized)
      if (!normalizedHashMap.has(block.normalizedHash)) {
        normalizedHashMap.set(block.normalizedHash, []);
      }
      normalizedHashMap.get(block.normalizedHash).push(block);
    }

    // Find groups with more than one occurrence
    const duplicateGroups = [];
    const seen = new Set();

    // Process exact duplicates
    for (const [hash, group] of hashMap) {
      if (group.length > 1) {
        const key = `exact:${hash}`;
        if (!seen.has(key)) {
          seen.add(key);
          duplicateGroups.push({
            type: 'exact',
            count: group.length,
            files: [...new Set(group.map((b) => b.relativePath))],
            locations: group.map((b) => ({
              file: b.relativePath,
              line: b.startLine,
            })),
            tokens: this.estimateTokens(group[0].content),
            preview: this.getPreview(group[0].content),
          });
        }
      }
    }

    // Process near duplicates (normalized)
    for (const [hash, group] of normalizedHashMap) {
      if (group.length > 2) {
        // Higher threshold for normalized
        const key = `normalized:${hash}`;
        if (!seen.has(key)) {
          seen.add(key);

          // Calculate similarity within group
          const uniqueFiles = [...new Set(group.map((b) => b.relativePath))];
          if (uniqueFiles.length > 1) {
            duplicateGroups.push({
              type: 'similar',
              count: group.length,
              files: uniqueFiles,
              locations: group.slice(0, 5).map((b) => ({
                file: b.relativePath,
                line: b.startLine,
              })),
              tokens: this.estimateTokens(group[0].content),
              preview: this.getPreview(group[0].content),
            });
          }
        }
      }
    }

    // Sort by impact (count * tokens)
    duplicateGroups.sort((a, b) => b.count * b.tokens - a.count * a.tokens);

    return duplicateGroups.slice(0, this.options.maxBlocks);
  }

  /**
   * Check if file is a code file
   */
  isCodeFile(filePath) {
    const codeExtensions = [
      '.js',
      '.ts',
      '.jsx',
      '.tsx',
      '.py',
      '.java',
      '.go',
      '.rs',
      '.cs',
      '.php',
      '.rb',
    ];
    const ext = filePath.substring(filePath.lastIndexOf('.')).toLowerCase();
    return codeExtensions.includes(ext);
  }

  /**
   * Check if block has significant code (not just comments/whitespace)
   */
  isSignificantBlock(content) {
    const lines = content.split('\n');
    let significantLines = 0;

    for (const line of lines) {
      const trimmed = line.trim();
      // Skip empty lines and single-line comments
      if (
        trimmed &&
        !trimmed.startsWith('//') &&
        !trimmed.startsWith('#') &&
        !trimmed.startsWith('/*')
      ) {
        significantLines++;
      }
    }

    return significantLines >= 3;
  }

  /**
   * Create a hash of a code block
   */
  hashBlock(content) {
    let hash = 0;
    const str = content;

    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }

    return hash.toString(16);
  }

  /**
   * Normalize block for near-duplicate detection
   */
  normalizeBlock(content) {
    return content
      .replace(/\s+/g, ' ') // Normalize whitespace
      .replace(/[a-zA-Z_][a-zA-Z0-9_]*/g, 'VAR') // Replace identifiers
      .replace(/"[^"]*"/g, 'STR') // Replace strings
      .replace(/'[^']*'/g, 'STR')
      .replace(/\d+/g, 'NUM') // Replace numbers
      .trim();
  }

  /**
   * Estimate tokens for content
   */
  estimateTokens(content) {
    return Math.ceil(content.length / 3.5);
  }

  /**
   * Get preview of code block
   */
  getPreview(content, maxLength = 60) {
    const firstLine = content.split('\n')[0].trim();
    if (firstLine.length <= maxLength) {
      return firstLine;
    }
    return firstLine.substring(0, maxLength - 3) + '...';
  }

  /**
   * Get statistics about duplicates
   */
  getStats() {
    return {
      totalGroups: this.duplicates.length,
      exactDuplicates: this.duplicates.filter((d) => d.type === 'exact').length,
      similarCode: this.duplicates.filter((d) => d.type === 'similar').length,
      wastedTokens: this.duplicates.reduce((sum, d) => sum + d.tokens * (d.count - 1), 0),
    };
  }
}

export default DuplicateDetector;

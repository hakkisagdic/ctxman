/**
 * Token Counting and Formatting Utilities
 * Supports multiple tokenizers: OpenAI (tiktoken), Anthropic, Gemini
 */

import path from 'path';
import {
  getTokenizerManager,
  TiktokenAdapter,
  encodingForModel,
  isExactEncoding,
} from './tokenizer-adapter.js';

// Load tiktoken for backward compatibility (dynamic import for optional dep)
let tiktoken = null;
try {
  const tiktokenModule = await import('tiktoken');
  tiktoken = tiktokenModule.default || tiktokenModule;
} catch (_err) {
  // tiktoken is optional
}

// Tokenizer manager singleton
let tokenizerManager = null;

// get_encoding() parses the whole BPE table (~150 ms), so build each encoder once
// and reuse it; encoding itself takes a few ms per file
const encoders = new Map();

function getEncoder(encodingName) {
  if (!encoders.has(encodingName)) {
    encoders.set(encodingName, tiktoken.get_encoding(encodingName));
  }
  return encoders.get(encodingName);
}

export default class TokenUtils {
  /**
   * Calculate tokens using model-specific tokenizer
   * @param {string} content - File content
   * @param {string} modelName - Model name (e.g., 'gpt-5', 'claude-sonnet-5-5', 'gemini-2.5-pro')
   * @returns {Promise<number>} Token count
   */
  static async calculateForModel(content, modelName) {
    if (!tokenizerManager) {
      tokenizerManager = await getTokenizerManager();
    }

    try {
      return tokenizerManager.countWithTelemetry(content, modelName);
    } catch (_error) {
      // Fallback to estimation
      return this.estimate(content, 'default.txt');
    }
  }

  /**
   * Calculate exact or estimated tokens for content (backward compatible)
   * Uses tiktoken if available, otherwise estimation
   * @param {string} content - File content
   * @param {string} filePath - File path for extension-based estimation
   * @param {string} [encodingName='cl100k_base'] - tiktoken encoding (see encodingFor)
   * @returns {number} Token count
   */
  static calculate(content, filePath, encodingName = 'cl100k_base') {
    if (tiktoken) {
      try {
        return getEncoder(encodingName).encode(content).length;
      } catch (_error) {
        return this.estimate(content, filePath);
      }
    }
    return this.estimate(content, filePath);
  }

  /**
   * tiktoken encoding to count with for a target model: o200k_base for OpenAI models
   * since GPT-4o, cl100k_base for everything else (exact for GPT-4/3.5, an
   * approximation for other vendors' tokenizers)
   * @param {string} [modelName] - Target model
   * @returns {'o200k_base'|'cl100k_base'}
   */
  static encodingFor(modelName) {
    return modelName ? encodingForModel(modelName) : 'cl100k_base';
  }

  /**
   * Estimate tokens based on file type and content length
   * @param {string} content - File content
   * @param {string} filePath - File path for extension detection
   * @returns {number} Estimated token count
   */
  static estimate(content, filePath) {
    const ext = path.extname(filePath).toLowerCase();

    const charsPerToken = {
      '.json': 2.5,
      '.js': 3.2,
      '.ts': 3.2,
      '.jsx': 3.2,
      '.tsx': 3.2,
      '.py': 3.0,
      '.java': 3.5,
      '.go': 3.3,
      '.rs': 3.4,
      '.php': 3.1,
      '.rb': 3.0,
      '.swift': 3.3,
      '.kt': 3.5,
      '.cs': 3.5,
      '.cpp': 3.6,
      '.c': 3.6,
      '.h': 3.6,
      '.hpp': 3.6,
      '.scala': 3.5,
      '.md': 3.5,
      '.txt': 4.0,
      default: 3.5,
    };

    const ratio = charsPerToken[ext] || charsPerToken['default'];
    return Math.round(content.length / ratio);
  }

  /**
   * Format token count with K/M suffixes
   * @param {number} tokens - Token count
   * @returns {string} Formatted string
   */
  static format(tokens) {
    if (tokens >= 1000000) {
      return `${(tokens / 1000000).toFixed(1)}M`;
    } else if (tokens >= 1000) {
      return `${(tokens / 1000).toFixed(1)}K`;
    }
    return tokens.toString();
  }

  /**
   * Get token counting method description for a specific model
   * @param {string} modelName - Model name
   * @returns {Promise<string>} Description
   */
  static async getMethodForModel(modelName) {
    if (!tokenizerManager) {
      tokenizerManager = await getTokenizerManager();
    }

    try {
      const tokenizer = tokenizerManager.getTokenizerForModel(modelName);
      if (tokenizer instanceof TiktokenAdapter) {
        const label = isExactEncoding(modelName) ? '✅ Exact' : '≈ Approximate';
        return `${label} (using ${tokenizer.getName()}, ${encodingForModel(modelName)})`;
      }
      return tokenizer.exact
        ? `✅ Exact (using ${tokenizer.getName()})`
        : `≈ Approximate (using ${tokenizer.getName()})`;
    } catch (_error) {
      return '⚠️  Estimated (~95% accurate)';
    }
  }

  /**
   * Get token counting method description (backward compatible)
   * @returns {string} Description
   */
  static getMethod() {
    return tiktoken ? '✅ Exact (using tiktoken)' : '⚠️  Estimated (~95% accurate)';
  }

  /**
   * Check if exact token counting is available
   * @returns {boolean} True if tiktoken is available
   */
  static isExact() {
    return tiktoken !== null;
  }

  /**
   * Alias for isExact() for backward compatibility
   * @returns {boolean} True if tiktoken is available
   */
  static hasExactCounting() {
    return this.isExact();
  }

  /**
   * Get list of available tokenizers
   * @returns {Promise<Array>} List of available tokenizers
   */
  static async getAvailableTokenizers() {
    if (!tokenizerManager) {
      tokenizerManager = await getTokenizerManager();
    }
    return tokenizerManager.getAvailableTokenizers();
  }

  /**
   * Detect which tokenizer would be used for a model
   * @param {string} modelName - Model name
   * @returns {Promise<string>} Tokenizer name
   */
  static async detectTokenizer(modelName) {
    if (!tokenizerManager) {
      tokenizerManager = await getTokenizerManager();
    }
    const tokenizer = tokenizerManager.getTokenizerForModel(modelName);
    return tokenizer.getName();
  }

  /**
   * Get telemetry statistics
   * @returns {Promise<Object>} Telemetry data
   */
  static async getTelemetry() {
    if (!tokenizerManager) {
      tokenizerManager = await getTokenizerManager();
    }
    return tokenizerManager.getTelemetry();
  }

  /**
   * Reset telemetry statistics
   */
  static async resetTelemetry() {
    if (!tokenizerManager) {
      tokenizerManager = await getTokenizerManager();
    }
    tokenizerManager.resetTelemetry();
  }
}

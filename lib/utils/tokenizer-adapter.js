/**
 * Tokenizer Adapter System
 * Provides unified interface for different LLM tokenizers
 */

/**
 * Base adapter interface for all tokenizers
 */
export class TokenizerAdapter {
  constructor() {
    this.available = false;
    this.name = 'Base';
  }

  /**
   * Initialize the tokenizer (load libraries, etc.)
   * @returns {Promise<boolean>} True if initialized successfully
   */
  async initialize() {
    return false;
  }

  /**
   * Count tokens in content
   * @param {string} content - Text to count tokens for
   * @returns {number} Token count
   */
  count(content) {
    throw new Error('count() must be implemented by subclass');
  }

  /**
   * Check if tokenizer is available
   * @returns {boolean}
   */
  isAvailable() {
    return this.available;
  }

  /**
   * Get tokenizer name
   * @returns {string}
   */
  getName() {
    return this.name;
  }
}

/**
 * OpenAI Tokenizer (tiktoken)
 * For GPT-4, GPT-5, o1 models
 */
export class TiktokenAdapter extends TokenizerAdapter {
  constructor() {
    super();
    this.name = 'Tiktoken (OpenAI)';
    this.tiktoken = null;
    this.encoding = null;
  }

  async initialize() {
    try {
      const tiktokenModule = await import('tiktoken');
      this.tiktoken = tiktokenModule.default || tiktokenModule;
      this.available = true;
      return true;
    } catch (err) {
      this.available = false;
      return false;
    }
  }

  count(content) {
    if (!this.available || !this.tiktoken) {
      throw new Error('Tiktoken not available');
    }

    try {
      // Use cl100k_base for GPT-4, GPT-4o, GPT-5
      // Use o200k_base for newer models if needed
      const encoding = this.tiktoken.get_encoding('cl100k_base');
      const tokens = encoding.encode(content);
      encoding.free();
      return tokens.length;
    } catch (error) {
      throw new Error(`Tiktoken encoding failed: ${error.message}`);
    }
  }
}

/**
 * Anthropic Tokenizer
 * For Claude models (Claude 3, Claude Sonnet, etc.)
 */
export class AnthropicAdapter extends TokenizerAdapter {
  constructor() {
    super();
    this.name = 'Anthropic (Claude)';
    this.tokenizer = null;
  }

  async initialize() {
    try {
      const anthropicModule = await import('@anthropic-ai/tokenizer');
      this.tokenizer = anthropicModule.default || anthropicModule;
      this.available = true;
      return true;
    } catch (err) {
      this.available = false;
      return false;
    }
  }

  count(content) {
    if (!this.available || !this.tokenizer) {
      throw new Error('Anthropic tokenizer not available');
    }

    try {
      // Anthropic tokenizer API
      return this.tokenizer.countTokens(content);
    } catch (error) {
      throw new Error(`Anthropic tokenizer failed: ${error.message}`);
    }
  }
}

/**
 * Google Gemini Tokenizer
 * Currently uses estimation (no official tokenizer package)
 */
export class GeminiAdapter extends TokenizerAdapter {
  constructor() {
    super();
    this.name = 'Gemini (Estimation)';
    this.available = true; // Always available (estimation)
  }

  async initialize() {
    this.available = true;
    return true;
  }

  count(content) {
    // Gemini uses similar tokenization to GPT models
    // Estimation: ~3.5 chars per token for English text
    return Math.round(content.length / 3.5);
  }
}

/**
 * DeepSeek Tokenizer
 * Uses tiktoken-compatible encoding (OpenAI-compatible API)
 */
export class DeepSeekAdapter extends TokenizerAdapter {
  constructor() {
    super();
    this.name = 'DeepSeek (tiktoken)';
    this.tiktokenAdapter = null;
  }

  async initialize() {
    try {
      this.tiktokenAdapter = new TiktokenAdapter();
      await this.tiktokenAdapter.initialize();
      this.available = this.tiktokenAdapter.isAvailable();
      return this.available;
    } catch (err) {
      this.available = false;
      return false;
    }
  }

  count(content) {
    if (!this.available || !this.tiktokenAdapter) {
      // Fallback to estimation
      return Math.round(content.length / 3.5);
    }
    return this.tiktokenAdapter.count(content);
  }
}

/**
 * Llama Tokenizer
 * For Llama 3.x models
 */
export class LlamaAdapter extends TokenizerAdapter {
  constructor() {
    super();
    this.name = 'Llama 3 (llama3-tokenizer-js)';
    this.tokenizer = null;
  }

  async initialize() {
    try {
      const llamaModule = await import('llama3-tokenizer-js');
      this.tokenizer = llamaModule.default || llamaModule;
      this.available = true;
      return true;
    } catch (err) {
      this.available = false;
      return false;
    }
  }

  count(content) {
    if (!this.available || !this.tokenizer) {
      throw new Error('Llama tokenizer not available');
    }

    try {
      // llama3-tokenizer-js API
      const tokens = this.tokenizer.encode(content);
      return tokens.length;
    } catch (error) {
      throw new Error(`Llama tokenizer failed: ${error.message}`);
    }
  }
}

/**
 * Estimation-based tokenizer (fallback)
 * Uses character count heuristics
 */
export class EstimationAdapter extends TokenizerAdapter {
  constructor() {
    super();
    this.name = 'Estimation (Fallback)';
    this.available = true; // Always available
  }

  async initialize() {
    this.available = true;
    return true;
  }

  count(content) {
    // Conservative estimation: ~3.5 chars per token
    // Works reasonably well for most languages
    return Math.round(content.length / 3.5);
  }
}

/**
 * Telemetry tracker for tokenizer usage
 */
class TokenizerTelemetry {
  constructor() {
    this.stats = {
      totalCalls: 0,
      byTokenizer: {},
      byModel: {},
      totalTokens: 0,
      errors: 0,
    };
  }

  track(tokenizerName, modelName, tokens, error = null) {
    this.stats.totalCalls++;

    if (error) {
      this.stats.errors++;
    } else {
      // Track by tokenizer
      if (!this.stats.byTokenizer[tokenizerName]) {
        this.stats.byTokenizer[tokenizerName] = {
          calls: 0,
          tokens: 0,
        };
      }
      this.stats.byTokenizer[tokenizerName].calls++;
      this.stats.byTokenizer[tokenizerName].tokens += tokens;

      // Track by model
      if (!this.stats.byModel[modelName]) {
        this.stats.byModel[modelName] = {
          calls: 0,
          tokens: 0,
        };
      }
      this.stats.byModel[modelName].calls++;
      this.stats.byModel[modelName].tokens += tokens;

      this.stats.totalTokens += tokens;
    }
  }

  getStats() {
    return { ...this.stats };
  }

  reset() {
    this.stats = {
      totalCalls: 0,
      byTokenizer: {},
      byModel: {},
      totalTokens: 0,
      errors: 0,
    };
  }
}

/**
 * Tokenizer factory and manager with telemetry
 */
export class TokenizerManager {
  constructor(options = {}) {
    this.adapters = new Map();
    this.initialized = false;
    this.telemetry = new TokenizerTelemetry();
    this.enableTelemetry = options.enableTelemetry !== false; // Default: enabled
  }

  /**
   * Initialize all available tokenizers
   */
  async initialize() {
    if (this.initialized) return;

    const adapters = [
      { key: 'tiktoken', adapter: new TiktokenAdapter() },
      { key: 'anthropic', adapter: new AnthropicAdapter() },
      { key: 'gemini', adapter: new GeminiAdapter() },
      { key: 'deepseek', adapter: new DeepSeekAdapter() },
      { key: 'llama', adapter: new LlamaAdapter() },
      { key: 'estimation', adapter: new EstimationAdapter() },
    ];

    for (const { key, adapter } of adapters) {
      await adapter.initialize();
      this.adapters.set(key, adapter);
    }

    this.initialized = true;
  }

  /**
   * Get tokenizer for specific model with telemetry
   * @param {string} modelName - Model name
   * @returns {TokenizerAdapter}
   */
  getTokenizerForModel(modelName) {
    if (!this.initialized) {
      throw new Error('TokenizerManager not initialized. Call initialize() first.');
    }

    const lowerModel = modelName.toLowerCase();

    // OpenAI models
    if (lowerModel.includes('gpt') || lowerModel.includes('o1') || lowerModel.includes('o3')) {
      const tiktoken = this.adapters.get('tiktoken');
      if (tiktoken.isAvailable()) return tiktoken;
    }

    // Anthropic models
    if (lowerModel.includes('claude')) {
      const anthropic = this.adapters.get('anthropic');
      if (anthropic.isAvailable()) return anthropic;
    }

    // Google models
    if (lowerModel.includes('gemini')) {
      return this.adapters.get('gemini');
    }

    // DeepSeek models
    if (lowerModel.includes('deepseek')) {
      const deepseek = this.adapters.get('deepseek');
      if (deepseek.isAvailable()) return deepseek;
    }

    // Llama models
    if (lowerModel.includes('llama')) {
      const llama = this.adapters.get('llama');
      if (llama.isAvailable()) return llama;
    }

    // Fallback to estimation
    return this.adapters.get('estimation');
  }

  /**
   * Count tokens with telemetry tracking
   * @param {string} content - Content to tokenize
   * @param {string} modelName - Model name
   * @returns {number} Token count
   */
  countWithTelemetry(content, modelName) {
    const tokenizer = this.getTokenizerForModel(modelName);
    let tokens = 0;
    let error = null;

    try {
      tokens = tokenizer.count(content);
      if (this.enableTelemetry) {
        this.telemetry.track(tokenizer.getName(), modelName, tokens);
      }
    } catch (err) {
      error = err;
      if (this.enableTelemetry) {
        this.telemetry.track(tokenizer.getName(), modelName, 0, err);
      }
      throw err;
    }

    return tokens;
  }

  /**
   * Get telemetry stats
   * @returns {Object} Telemetry statistics
   */
  getTelemetry() {
    return this.telemetry.getStats();
  }

  /**
   * Reset telemetry
   */
  resetTelemetry() {
    this.telemetry.reset();
  }

  /**
   * Get all available tokenizers
   * @returns {Array<{key: string, name: string, available: boolean}>}
   */
  getAvailableTokenizers() {
    const result = [];
    for (const [key, adapter] of this.adapters.entries()) {
      result.push({
        key,
        name: adapter.getName(),
        available: adapter.isAvailable(),
      });
    }
    return result;
  }
}

// Singleton instance
let managerInstance = null;

/**
 * Get singleton tokenizer manager instance
 * @returns {Promise<TokenizerManager>}
 */
export async function getTokenizerManager() {
  if (!managerInstance) {
    managerInstance = new TokenizerManager();
    await managerInstance.initialize();
  }
  return managerInstance;
}

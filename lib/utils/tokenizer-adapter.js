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
    // Whether counts match the model's own tokenizer, or only approximate it
    this.exact = false;
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
  count(_content) {
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
 * OpenAI models since GPT-4o use o200k_base; GPT-4, GPT-3.5 and embeddings use cl100k_base.
 * OpenAI has not published GPT-6's encoding, so o200k_base only approximates it.
 */
const O200K_MODEL = /^(gpt-4o|gpt-4\.1|gpt-4\.5|gpt-5|gpt-6|gpt-oss|o\d|chatgpt|codex)/;
const UNPUBLISHED_ENCODING = /^gpt-6/;

/**
 * tiktoken encoding for an OpenAI model name
 * @param {string} modelName - Model name, e.g. `gpt-5`, `gpt-4o-mini`, `gpt-4`
 * @returns {'o200k_base'|'cl100k_base'}
 */
export function encodingForModel(modelName = '') {
  return O200K_MODEL.test(String(modelName).toLowerCase()) ? 'o200k_base' : 'cl100k_base';
}

/**
 * Whether tiktoken's count is the model's own count
 * @param {string} modelName - OpenAI model name
 * @returns {boolean}
 */
export function isExactEncoding(modelName = '') {
  return !UNPUBLISHED_ENCODING.test(String(modelName).toLowerCase());
}

/** OpenAI model names: gpt-*, o-series reasoning models, codex */
function isOpenAIModel(lowerModel) {
  return /^(gpt|chatgpt|codex|o\d)/.test(lowerModel);
}

/**
 * OpenAI Tokenizer (tiktoken)
 * For GPT and o-series models; picks o200k_base or cl100k_base per model
 */
export class TiktokenAdapter extends TokenizerAdapter {
  constructor() {
    super();
    this.name = 'Tiktoken (OpenAI)';
    this.exact = true;
    this.tiktoken = null;
    this.encodings = new Map();
  }

  async initialize() {
    try {
      const tiktokenModule = await import('tiktoken');
      this.tiktoken = tiktokenModule.default || tiktokenModule;
      this.available = true;
      return true;
    } catch (_err) {
      this.available = false;
      return false;
    }
  }

  /**
   * @param {string} content - Text to count
   * @param {string} [encodingName='cl100k_base'] - tiktoken encoding
   * @returns {number} Token count
   */
  count(content, encodingName = 'cl100k_base') {
    if (!this.available || !this.tiktoken) {
      throw new Error('Tiktoken not available');
    }

    try {
      // Built once per encoding: get_encoding() costs ~150 ms, encode() a few ms
      if (!this.encodings.has(encodingName)) {
        this.encodings.set(encodingName, this.tiktoken.get_encoding(encodingName));
      }
      return this.encodings.get(encodingName).encode(content).length;
    } catch (error) {
      throw new Error(`Tiktoken encoding failed: ${error.message}`);
    }
  }
}

/**
 * Anthropic's legacy tokenizer package (@anthropic-ai/tokenizer)
 * It implements the Claude 2 tokenizer; Anthropic documents that it is not accurate
 * for Claude 3 and later, whose exact counts come only from the count_tokens API.
 * Used as an approximation for Claude models when installed.
 */
export class AnthropicAdapter extends TokenizerAdapter {
  constructor() {
    super();
    this.name = 'Anthropic legacy tokenizer (approximate)';
    this.tokenizer = null;
  }

  async initialize() {
    try {
      const anthropicModule = await import('@anthropic-ai/tokenizer');
      this.tokenizer = anthropicModule.default || anthropicModule;
      this.available = true;
      return true;
    } catch (_err) {
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
    // DeepSeek has its own tokenizer; cl100k_base only approximates it
    this.name = 'DeepSeek (tiktoken approximation)';
    this.tiktokenAdapter = null;
  }

  async initialize() {
    try {
      this.tiktokenAdapter = new TiktokenAdapter();
      await this.tiktokenAdapter.initialize();
      this.available = this.tiktokenAdapter.isAvailable();
      return this.available;
    } catch (_err) {
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
    this.exact = true;
    this.tokenizer = null;
  }

  async initialize() {
    try {
      const llamaModule = await import('llama3-tokenizer-js');
      this.tokenizer = llamaModule.default || llamaModule;
      this.available = true;
      return true;
    } catch (_err) {
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
    if (isOpenAIModel(lowerModel)) {
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
    let _error = null;

    try {
      tokens =
        tokenizer instanceof TiktokenAdapter
          ? tokenizer.count(content, encodingForModel(modelName))
          : tokenizer.count(content);
      if (this.enableTelemetry) {
        this.telemetry.track(tokenizer.getName(), modelName, tokens);
      }
    } catch (err) {
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
        exact: adapter.exact,
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

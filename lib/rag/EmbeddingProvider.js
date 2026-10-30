/**
 * Abstract base class for embedding providers
 */
export class EmbeddingProvider {
  /**
   * Generates an embedding for the given text.
   * @param {string} text
   * @returns {Promise<number[]>}\n   */
  async embed(_text) {
    throw new Error('Not implemented');
  }
}

/**
 * Deterministic, zero-dependency local embedding provider (256 dimensions).
 * Uses feature-hashing over identifier tokens and character trigrams with L2 normalization.
 * Requires zero external packages and works 100% offline.
 */
export class LocalHashEmbeddingProvider extends EmbeddingProvider {
  constructor(dimension = 256) {
    super();
    this.dimension = dimension;
  }

  /**
   * 32-bit FNV-1a hash function with optional seed.
   * @private
   */
  _hash(str, seed = 0x811c9dc5) {
    let h = seed >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
  }

  /**
   * Generates a deterministic 256-dim L2-normalized embedding for the given text.
   * @param {string} text
   * @returns {Promise<number[]>}
   */
  async embed(text) {
    const raw = String(text ?? '');
    const vector = new Float64Array(this.dimension);

    // 1. Extract identifier tokens
    const tokens = raw.match(/[a-zA-Z0-9_$]+/g) || [];
    for (const token of tokens) {
      const lower = token.toLowerCase();
      // Hash whole token
      const h1 = this._hash(lower, 0x12345678);
      const idx1 = h1 % this.dimension;
      const sign1 = (this._hash(lower, 0x87654321) & 1) === 0 ? 1 : -1;
      vector[idx1] += sign1 * 1.5;

      // Split camelCase/snake_case sub-tokens if composite
      const subTokens = token.replace(/([a-z])([A-Z])/g, '$1 $2').split(/[_\s]+/);
      if (subTokens.length > 1) {
        for (const sub of subTokens) {
          if (sub.length > 1) {
            const subLower = sub.toLowerCase();
            const hSub = this._hash(subLower, 0x2468ace0);
            const idxSub = hSub % this.dimension;
            const signSub = (this._hash(subLower, 0x0eca8642) & 1) === 0 ? 1 : -1;
            vector[idxSub] += signSub * 1.0;
          }
        }
      }
    }

    // 2. Extract character trigrams
    const normalized = raw.toLowerCase().replace(/\s+/g, ' ');
    if (normalized.length >= 3) {
      for (let i = 0; i <= normalized.length - 3; i++) {
        const trigram = normalized.slice(i, i + 3);
        const hTri = this._hash(trigram, 0x13579bdf);
        const idxTri = hTri % this.dimension;
        const signTri = (this._hash(trigram, 0xfdb97531) & 1) === 0 ? 1 : -1;
        vector[idxTri] += signTri * 1.0;
      }
    } else if (normalized.length > 0) {
      const hShort = this._hash(normalized, 0x99887766);
      const idxShort = hShort % this.dimension;
      const signShort = (this._hash(normalized, 0x66778899) & 1) === 0 ? 1 : -1;
      vector[idxShort] += signShort * 1.0;
    }

    // 3. L2 normalize
    let sumSq = 0;
    for (let i = 0; i < this.dimension; i++) {
      sumSq += vector[i] * vector[i];
    }
    const norm = Math.sqrt(sumSq);
    if (norm > 0) {
      for (let i = 0; i < this.dimension; i++) {
        vector[i] /= norm;
      }
    }

    return Array.from(vector);
  }
}

/**
 * Uses @xenova/transformers to generate embeddings locally using ONNX models.
 * Default model: Xenova/all-MiniLM-L6-v2 (384 dimensions)
 */
export class TransformersEmbeddingProvider extends EmbeddingProvider {
  constructor(modelName = 'Xenova/all-MiniLM-L6-v2') {
    super();
    this.modelName = modelName;
    this.pipe = null;
  }

  async init() {
    if (!this.pipe) {
      // Optional dependency: only `ctxman ask` needs it, so load it on first use
      let transformers;
      try {
        transformers = await import('@xenova/transformers');
      } catch (error) {
        if (error.code === 'ERR_MODULE_NOT_FOUND') {
          throw new Error(
            'Please install @xenova/transformers to use TransformersEmbeddingProvider (ctxman ask): npm install @xenova/transformers'
          );
        }
        throw error;
      }

      // Load the pipeline. This will download the model if not present.
      this.pipe = await transformers.pipeline('feature-extraction', this.modelName);
    }
  }

  async embed(text) {
    if (!this.pipe) {
      await this.init();
    }
    // pooling: 'mean' and normalize: true are standard for sentence embeddings
    const result = await this.pipe(text, { pooling: 'mean', normalize: true });
    return Array.from(result.data);
  }
}

/**
 * Tries TransformersEmbeddingProvider if @xenova/transformers is installed
 * and CTXMAN_EMBEDDER !== 'local'; otherwise seamlessly falls back to
 * LocalHashEmbeddingProvider without network or model loading failure.
 */
export class AutoEmbeddingProvider extends EmbeddingProvider {
  /**
   * @param {object} [options]
   * @param {string} [options.modelName]
   */
  constructor(options = {}) {
    super();
    this.modelName = options.modelName;
    this.activeProvider = null;
  }

  async init() {
    if (this.activeProvider) return;

    if (process.env.CTXMAN_EMBEDDER === 'local') {
      this.activeProvider = new LocalHashEmbeddingProvider();
      return;
    }

    try {
      await import('@xenova/transformers');
    } catch (err) {
      if (err.code === 'ERR_MODULE_NOT_FOUND') {
        this.activeProvider = new LocalHashEmbeddingProvider();
        return;
      }
      throw err;
    }

    const provider = new TransformersEmbeddingProvider(this.modelName);
    await provider.init();
    this.activeProvider = provider;
  }

  async embed(text) {
    if (!this.activeProvider) {
      await this.init();
    }
    return this.activeProvider.embed(text);
  }
}

/**
 * Mock provider for testing without loading heavy models.
 */
export class MockEmbeddingProvider extends EmbeddingProvider {
  constructor(dimension = 384) {
    super();
    this.dimension = dimension;
  }

  async embed(text) {
    // Generate a deterministic-ish vector based on text length for consistent testing
    // or just random if text is ignored.
    // Let's make it pseudo-random based on text hash to be stable.
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = (hash << 5) - hash + text.charCodeAt(i);
      hash |= 0;
    }

    const vector = [];
    for (let i = 0; i < this.dimension; i++) {
      // Simple pseudo-random generator
      const val = Math.sin(hash + i);
      vector.push(val);
    }

    // Normalize
    const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    return vector.map((val) => val / norm);
  }
}

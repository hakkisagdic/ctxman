import { pipeline } from '@xenova/transformers';

/**
 * Abstract base class for embedding providers
 */
export class EmbeddingProvider {
  /**
   * Generates an embedding for the given text.
   * @param {string} text
   * @returns {Promise<number[]>}
   */
  async embed(_text) {
    throw new Error('Not implemented');
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
      // Load the pipeline. This will download the model if not present.
      this.pipe = await pipeline('feature-extraction', this.modelName);
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

import { LanceDBStore } from './stores/LanceDBStore.js';
import { ChromaDBStore } from './stores/ChromaDBStore.js';
import { PineconeStore } from './stores/PineconeStore.js';

export class VectorStoreFactory {
  /**
   * @param {string} type
   * @param {import('./EmbeddingProvider').EmbeddingProvider} embeddingProvider
   * @param {Object} config
   */
  static create(type, embeddingProvider, config = {}) {
    switch (type.toLowerCase()) {
      case 'lancedb':
        return new LanceDBStore(embeddingProvider, config.path);
      case 'chroma':
      case 'chromadb':
        return new ChromaDBStore(embeddingProvider, config);
      case 'pinecone':
        return new PineconeStore(embeddingProvider, config);
      default:
        throw new Error(`Unknown VectorStore type: ${type}`);
    }
  }
}

import { SqliteVectorStore } from './stores/SqliteVectorStore.js';
import { LanceDBStore } from './stores/LanceDBStore.js';
import { ChromaDBStore } from './stores/ChromaDBStore.js';
import { PineconeStore } from './stores/PineconeStore.js';

export class VectorStoreFactory {
  /**
   * @param {string} [type='sqlite']
   * @param {import('./EmbeddingProvider').EmbeddingProvider} embeddingProvider
   * @param {Object} [config={}]
   */
  static create(type = 'sqlite', embeddingProvider, config = {}) {
    const storeType = (type || 'sqlite').toLowerCase();
    switch (storeType) {
      case 'sqlite':
        return new SqliteVectorStore(embeddingProvider, config.path || config.storagePath);
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

export default VectorStoreFactory;

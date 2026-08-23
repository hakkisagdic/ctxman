import { BaseVectorStore } from './BaseVectorStore.js';

export class PineconeStore extends BaseVectorStore {
  /**
   * @param {import('../EmbeddingProvider').EmbeddingProvider} embeddingProvider
   * @param {Object} config
   * @param {string} config.apiKey
   * @param {string} config.indexName
   */
  constructor(embeddingProvider, config = {}) {
    super(embeddingProvider);
    this.apiKey = config.apiKey;
    this.indexName = config.indexName;
    this.client = null;
    this.index = null;
  }

  async init() {
    if (this.client) return;
    if (!this.apiKey) throw new Error('Pinecone API key required');

    try {
      const { Pinecone } = await import('@pinecone-database/pinecone');
      this.client = new Pinecone({ apiKey: this.apiKey });
      this.index = this.client.index(this.indexName);
    } catch (error) {
      if (error.code === 'ERR_MODULE_NOT_FOUND') {
        throw new Error(
          'Please install @pinecone-database/pinecone to use PineconeStore: npm install @pinecone-database/pinecone'
        );
      }
      throw error;
    }
  }

  async addDocuments(docs) {
    if (!this.index) await this.init();
    if (docs.length === 0) return;

    const vectors = [];
    for (const doc of docs) {
      const values = await this.embeddingProvider.embed(doc.text);
      vectors.push({
        id: doc.id || crypto.randomUUID(),
        values,
        metadata: {
          ...doc.metadata,
          text: doc.text, // Pinecone metadata is limited, but storing text is useful
        },
      });
    }

    // Pinecone likes batches
    const batchSize = 100;
    for (let i = 0; i < vectors.length; i += batchSize) {
      await this.index.upsert(vectors.slice(i, i + batchSize));
    }
  }

  async search(queryText, limit = 5) {
    if (!this.index) await this.init();

    const vector = await this.embeddingProvider.embed(queryText);
    const results = await this.index.query({
      vector,
      topK: limit,
      includeMetadata: true,
    });

    return results.matches.map((match) => ({
      text: match.metadata.text || '', // Assuming text is stored in metadata
      score: match.score,
      metadata: match.metadata,
    }));
  }
}

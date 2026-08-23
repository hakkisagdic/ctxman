import { BaseVectorStore } from './BaseVectorStore.js';

export class ChromaDBStore extends BaseVectorStore {
  /**
   * @param {import('../EmbeddingProvider').EmbeddingProvider} embeddingProvider
   * @param {Object} config
   * @param {string} [config.collectionName]
   * @param {string} [config.url]
   */
  constructor(embeddingProvider, config = {}) {
    super(embeddingProvider);
    this.collectionName = config.collectionName || 'ctxman-docs';
    this.url = config.url || 'http://localhost:8000';
    this.client = null;
    this.collection = null;
  }

  async init() {
    if (this.client) return;

    try {
      const { ChromaClient } = await import('chromadb');
      this.client = new ChromaClient({ path: this.url });

      this.collection = await this.client.getOrCreateCollection({
        name: this.collectionName,
      });
    } catch (error) {
      if (error.code === 'ERR_MODULE_NOT_FOUND') {
        throw new Error('Please install chromadb to use ChromaDBStore: npm install chromadb');
      }
      throw error;
    }
  }

  async addDocuments(docs) {
    if (!this.collection) await this.init();
    if (docs.length === 0) return;

    const ids = docs.map((d) => d.id || crypto.randomUUID());
    const metadatas = docs.map((d) => d.metadata || {});
    const documents = docs.map((d) => d.text);

    // Chroma can handle embeddings, but we have a provider.
    // If we want to use our provider:
    const embeddings = [];
    for (const doc of docs) {
      embeddings.push(await this.embeddingProvider.embed(doc.text));
    }

    await this.collection.add({
      ids,
      embeddings,
      metadatas,
      documents,
    });
  }

  async search(queryText, limit = 5) {
    if (!this.collection) await this.init();

    const queryEmbedding = await this.embeddingProvider.embed(queryText);

    const results = await this.collection.query({
      queryEmbeddings: [queryEmbedding],
      nResults: limit,
    });

    // Chroma returns arrays of arrays
    if (!results.ids || results.ids.length === 0) return [];

    const hits = [];
    const count = results.ids[0].length;

    for (let i = 0; i < count; i++) {
      hits.push({
        text: results.documents[0][i],
        score: results.distances ? results.distances[0][i] : 0,
        metadata: results.metadatas[0][i],
      });
    }

    return hits;
  }
}

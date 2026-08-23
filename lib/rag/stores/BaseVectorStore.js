/**
 * @typedef {Object} VectorDocument
 * @property {string} text
 * @property {Array<number>} vector
 * @property {string} id
 * @property {Object} metadata
 */

/**
 * @typedef {Object} SearchResult
 * @property {string} text
 * @property {number} score
 * @property {Object} metadata
 */

export class BaseVectorStore {
  /**
   * @param {import('../EmbeddingProvider').EmbeddingProvider} embeddingProvider
   */
  constructor(embeddingProvider) {
    this.embeddingProvider = embeddingProvider;
  }

  async init() {
    throw new Error('Method not implemented');
  }

  /**
   * @param {Array<{text: string, metadata: Object}>} docs
   */
  async addDocuments(docs) {
    throw new Error('Method not implemented');
  }

  /**
   * @param {string} queryText
   * @param {number} limit
   * @returns {Promise<Array<SearchResult>>}
   */
  async search(queryText, limit = 5) {
    throw new Error('Method not implemented');
  }
}

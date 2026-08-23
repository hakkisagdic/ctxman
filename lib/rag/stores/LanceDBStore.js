import * as lancedb from '@lancedb/lancedb';
import fs from 'fs/promises';
import { BaseVectorStore } from './BaseVectorStore.js';

export class LanceDBStore extends BaseVectorStore {
  /**
   * @param {import('../EmbeddingProvider').EmbeddingProvider} embeddingProvider
   * @param {string} storagePath - Path to store the LanceDB data
   */
  constructor(embeddingProvider, storagePath = '.ctxman/rag-store') {
    super(embeddingProvider);
    this.storagePath = storagePath;
    this.db = null;
    this.table = null;
    this.tableName = 'documents';
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return;

    // Ensure directory exists
    await fs.mkdir(this.storagePath, { recursive: true });

    this.db = await lancedb.connect(this.storagePath);

    const tableNames = await this.db.tableNames();
    if (tableNames.includes(this.tableName)) {
      this.table = await this.db.openTable(this.tableName);
    }

    this.initialized = true;
  }

  /**
   * Adds a single document to the store.
   * @param {string} text
   * @param {Object} metadata
   */
  async addDocument(text, metadata = {}) {
    return this.addDocuments([{ text, metadata }]);
  }

  /**
   * Adds multiple documents to the store.
   * @param {Array<{text: string, metadata: Object}>} docs
   */
  async addDocuments(docs) {
    if (docs.length === 0) return;
    if (!this.initialized) await this.init();

    const data = [];
    for (const doc of docs) {
      const vector = await this.embeddingProvider.embed(doc.text);
      data.push({
        vector,
        text: doc.text,
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        ...doc.metadata,
      });
    }

    if (!this.table) {
      // Create table with the first batch
      this.table = await this.db.createTable(this.tableName, data);
    } else {
      await this.table.add(data);
    }
  }

  /**
   * Semantic search for documents.
   * @param {string} queryText
   * @param {number} limit
   * @returns {Promise<Array<{text: string, score: number, metadata: Object}>>}
   */
  async search(queryText, limit = 5) {
    if (!this.initialized) await this.init();
    if (!this.table) return [];

    const queryVector = await this.embeddingProvider.embed(queryText);

    // LanceDB returns _distance by default (L2 distance usually).
    // Lower is better.
    const results = await this.table.search(queryVector).limit(limit).toArray();

    return results.map((row) => {
      const { vector, text, _distance, ...metadata } = row;
      return {
        text,
        score: _distance,
        metadata,
      };
    });
  }

  async deleteTable() {
    if (!this.initialized) await this.init();
    try {
      await this.db.dropTable(this.tableName);
      this.table = null;
    } catch (e) {
      // Ignore if not exists
    }
  }
}

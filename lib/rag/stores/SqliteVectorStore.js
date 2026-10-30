import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { DatabaseSync } from 'node:sqlite';
import { BaseVectorStore } from './BaseVectorStore.js';

/**
 * Zero-native-binary vector store using Node 22+ built-in node:sqlite (`DatabaseSync`).
 * Stores document chunks, content SHA-256 hashes, metadata, and float32 embedding vectors
 * in `<storePath>/index.sqlite`. Supports incremental upserts (skipping unchanged content)
 * and exact cosine similarity vector search.
 */
export class SqliteVectorStore extends BaseVectorStore {
  /**
   * @param {import('../EmbeddingProvider').EmbeddingProvider} embeddingProvider
   * @param {string} [storagePath='.ctxman/self-knowledge'] - Directory or .sqlite file path
   */
  constructor(embeddingProvider, storagePath = '.ctxman/self-knowledge') {
    super(embeddingProvider);
    this.storagePath = storagePath;
    this.dbPath = storagePath.endsWith('.sqlite')
      ? storagePath
      : path.join(storagePath, 'index.sqlite');
    this.db = null;
    this.initialized = false;
  }

  /**
   * Initialize directory, SQLite database and documents table.
   */
  async init() {
    if (this.initialized) return;

    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new DatabaseSync(this.dbPath);

    // Create table for documents and vector embeddings
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        file_path TEXT,
        content_hash TEXT NOT NULL,
        text TEXT NOT NULL,
        metadata TEXT,
        vector BLOB,
        updated_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_documents_file_path ON documents(file_path);
      CREATE INDEX IF NOT EXISTS idx_documents_content_hash ON documents(content_hash);
    `);

    this.stmtGetById = this.db.prepare('SELECT id, content_hash FROM documents WHERE id = ?');
    this.stmtGetByPath = this.db.prepare(
      'SELECT id, content_hash FROM documents WHERE file_path = ?'
    );
    this.stmtUpsert = this.db.prepare(`
      INSERT INTO documents (id, file_path, content_hash, text, metadata, vector, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        file_path = excluded.file_path,
        content_hash = excluded.content_hash,
        text = excluded.text,
        metadata = excluded.metadata,
        vector = excluded.vector,
        updated_at = excluded.updated_at
    `);
    this.stmtAllVectors = this.db.prepare(
      'SELECT id, file_path, text, metadata, vector FROM documents'
    );
    this.stmtCount = this.db.prepare('SELECT COUNT(*) AS count FROM documents');

    this.initialized = true;
  }

  /**
   * Add a single document to the store.
   * @param {string} text
   * @param {Object} [metadata={}]
   */
  async addDocument(text, metadata = {}) {
    return this.addDocuments([{ text, metadata }]);
  }

  /**
   * Incremental upsert of documents.
   * Skips re-embedding and rewriting if content SHA-256 is unchanged.
   * @param {Array<{text: string, id?: string, metadata?: Object}>} docs
   */
  async addDocuments(docs) {
    if (!docs || docs.length === 0) return;
    if (!this.initialized) await this.init();

    for (const doc of docs) {
      const text = String(doc.text ?? '');
      const contentHash = crypto.createHash('sha256').update(text).digest('hex');

      const meta = doc.metadata ?? {};
      const filePath =
        meta.path ?? (typeof doc.id === 'string' && !doc.id.includes(':') ? doc.id : null);
      const id = doc.id ?? meta.sourceId ?? (filePath ? filePath : crypto.randomUUID());

      // Check if unchanged by id or filePath
      const existing =
        this.stmtGetById.get(id) ?? (filePath ? this.stmtGetByPath.get(filePath) : null);
      if (existing && existing.content_hash === contentHash) {
        // Content hash matches; skip re-embedding
        continue;
      }

      // Compute vector embedding
      const vector = await this.embeddingProvider.embed(text);
      const float32 = new Float32Array(vector);
      const blob = Buffer.from(float32.buffer, float32.byteOffset, float32.byteLength);

      this.stmtUpsert.run(id, filePath, contentHash, text, JSON.stringify(meta), blob, Date.now());
    }
  }

  /**
   * Exact cosine similarity search over stored documents.
   * @param {string} queryText
   * @param {number} [limit=5]
   * @returns {Promise<Array<{id?: string, text: string, score: number, metadata: Object}>>}
   */
  async search(queryText, limit = 5) {
    if (!this.initialized) await this.init();

    const countRow = this.stmtCount.get();
    if (!countRow || Number(countRow.count) === 0) return [];

    const queryVector = await this.embeddingProvider.embed(queryText);
    const qLen = queryVector.length;

    let queryNormSq = 0;
    for (let i = 0; i < qLen; i++) {
      queryNormSq += queryVector[i] * queryVector[i];
    }
    const queryNorm = Math.sqrt(queryNormSq);
    if (queryNorm === 0) return [];

    const rows = this.stmtAllVectors.all();
    const scored = [];

    for (const row of rows) {
      if (!row.vector) continue;
      const buf = row.vector;
      const docVector = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);

      let dot = 0;
      let docNormSq = 0;
      const dim = Math.min(qLen, docVector.length);

      for (let i = 0; i < dim; i++) {
        const qVal = queryVector[i];
        const dVal = docVector[i];
        dot += qVal * dVal;
        docNormSq += dVal * dVal;
      }

      const docNorm = Math.sqrt(docNormSq);
      const similarity = docNorm === 0 ? 0 : dot / (queryNorm * docNorm);

      let parsedMeta = {};
      if (row.metadata) {
        try {
          parsedMeta = JSON.parse(row.metadata);
        } catch {
          parsedMeta = {};
        }
      }

      scored.push({
        id: row.id,
        text: row.text,
        score: similarity,
        metadata: parsedMeta,
      });
    }

    // Sort descending by similarity score
    scored.sort((a, b) => b.score - a.score);

    return scored.slice(0, limit);
  }

  /**
   * Delete documents table and clear data.
   */
  async deleteTable() {
    if (!this.initialized) await this.init();
    try {
      this.db.exec('DROP TABLE IF EXISTS documents;');
      this.initialized = false;
      await this.init();
    } catch (_e) {
      // Ignore if table does not exist
    }
  }

  /**
   * Total number of indexed documents.
   * @returns {number}
   */
  count() {
    if (!this.initialized || !this.db) return 0;
    const row = this.stmtCount.get();
    return row ? Number(row.count) : 0;
  }

  /**
   * Close the database connection.
   */
  close() {
    if (this.db) {
      try {
        this.db.close();
      } catch (_e) {
        // ignore
      }
      this.db = null;
      this.initialized = false;
    }
  }
}

export default SqliteVectorStore;

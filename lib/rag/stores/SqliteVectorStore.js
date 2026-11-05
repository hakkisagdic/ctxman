import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { DatabaseSync } from 'node:sqlite';
import { BaseVectorStore } from './BaseVectorStore.js';

const toPosix = (p) =>
  String(p ?? '')
    .split(path.sep)
    .join('/');

/** Byte-order comparison, identical across platforms and locales */
function comparePaths(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Zero-native-binary vector & knowledge-graph store using Node 22+ built-in node:sqlite (`DatabaseSync`).
 * Stores document chunks, content SHA-256 hashes, metadata, float32 embedding vectors,
 * and incremental repository knowledge-graph nodes & edges in `<storePath>/index.sqlite`.
 * Supports incremental upserts (skipping unchanged content), document removal,
 * graph delta synchronization, and exact cosine similarity vector search.
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
   * Initialize directory, SQLite database, documents table, and knowledge-graph tables.
   */
  async init() {
    if (this.initialized) return;

    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new DatabaseSync(this.dbPath);

    // Create tables for documents (vectors) and knowledge graph (nodes + edges)
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

      CREATE TABLE IF NOT EXISTS graph_nodes (
        path TEXT PRIMARY KEY,
        language TEXT NOT NULL,
        bytes INTEGER NOT NULL DEFAULT 0,
        content_hash TEXT,
        methods TEXT NOT NULL DEFAULT '[]',
        declarations TEXT NOT NULL DEFAULT '[]',
        imports TEXT NOT NULL DEFAULT '[]',
        symbol_refs REAL NOT NULL DEFAULT 0,
        unresolved_imports INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS graph_edges (
        from_path TEXT NOT NULL,
        to_path TEXT NOT NULL,
        weight REAL NOT NULL DEFAULT 1,
        updated_at INTEGER,
        PRIMARY KEY (from_path, to_path)
      );
      CREATE INDEX IF NOT EXISTS idx_graph_edges_from ON graph_edges(from_path);
      CREATE INDEX IF NOT EXISTS idx_graph_edges_to ON graph_edges(to_path);
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
    this.stmtDeleteById = this.db.prepare('DELETE FROM documents WHERE id = ?');
    this.stmtAllMeta = this.db.prepare('SELECT id, file_path, metadata FROM documents');
    this.stmtAllVectors = this.db.prepare(
      'SELECT id, file_path, text, metadata, vector FROM documents'
    );
    this.stmtCount = this.db.prepare('SELECT COUNT(*) AS count FROM documents');

    // Graph prepared statements
    this.stmtUpsertNode = this.db.prepare(`
      INSERT INTO graph_nodes (
        path, language, bytes, content_hash, methods, declarations, imports,
        symbol_refs, unresolved_imports, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(path) DO UPDATE SET
        language = excluded.language,
        bytes = excluded.bytes,
        content_hash = excluded.content_hash,
        methods = excluded.methods,
        declarations = excluded.declarations,
        imports = excluded.imports,
        symbol_refs = excluded.symbol_refs,
        unresolved_imports = excluded.unresolved_imports,
        updated_at = excluded.updated_at
    `);
    this.stmtDeleteNode = this.db.prepare('DELETE FROM graph_nodes WHERE path = ?');
    this.stmtDeleteOutEdges = this.db.prepare('DELETE FROM graph_edges WHERE from_path = ?');
    this.stmtDeleteIncidentEdges = this.db.prepare(
      'DELETE FROM graph_edges WHERE from_path = ? OR to_path = ?'
    );
    this.stmtUpsertEdge = this.db.prepare(`
      INSERT INTO graph_edges (from_path, to_path, weight, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(from_path, to_path) DO UPDATE SET
        weight = excluded.weight,
        updated_at = excluded.updated_at
    `);
    this.stmtAllNodes = this.db.prepare(`
      SELECT path, language, bytes, content_hash, methods, declarations, imports,
             symbol_refs, unresolved_imports, updated_at
      FROM graph_nodes
      ORDER BY path ASC
    `);
    this.stmtAllEdges = this.db.prepare(`
      SELECT from_path, to_path, weight
      FROM graph_edges
      ORDER BY from_path ASC, to_path ASC
    `);
    this.stmtNodeCount = this.db.prepare('SELECT COUNT(*) AS count FROM graph_nodes');
    this.stmtEdgeCount = this.db.prepare('SELECT COUNT(*) AS count FROM graph_edges');

    this.initialized = true;
  }

  /**
   * Add a single document to the store.
   * @param {string} text
   * @param {Object} [metadata={}]
   * @returns {Promise<{upserted: number, skipped: number}>}
   */
  async addDocument(text, metadata = {}) {
    return this.addDocuments([{ text, metadata }]);
  }

  /**
   * Incremental upsert of documents.
   * Skips re-embedding and rewriting if content SHA-256 is unchanged.
   * @param {Array<{text: string, id?: string, metadata?: Object}>} docs
   * @returns {Promise<{upserted: number, skipped: number}>}
   */
  async addDocuments(docs) {
    if (!docs || docs.length === 0) return { upserted: 0, skipped: 0 };
    if (!this.initialized) await this.init();

    let upserted = 0;
    let skipped = 0;

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
        skipped++;
        continue;
      }

      const targetId = existing ? existing.id : id;

      // Compute vector embedding
      const vector = await this.embeddingProvider.embed(text);
      const float32 = new Float32Array(vector);
      const blob = Buffer.from(float32.buffer, float32.byteOffset, float32.byteLength);

      this.stmtUpsert.run(
        targetId,
        filePath,
        contentHash,
        text,
        JSON.stringify(meta),
        blob,
        Date.now()
      );
      upserted++;
    }

    return { upserted, skipped };
  }

  /**
   * Remove document(s) matching a document ID, relative path, or absolute file path.
   * @param {string} idOrFilePath
   * @returns {Promise<number>} Number of removed documents
   */
  async removeDocument(idOrFilePath) {
    if (!idOrFilePath) return 0;
    if (!this.initialized) await this.init();

    const target = String(idOrFilePath);
    const posixTarget = toPosix(target);
    const suffixTarget = posixTarget.startsWith('/') ? posixTarget : `/${posixTarget}`;

    const rows = this.stmtAllMeta.all();
    const idsToDelete = new Set();

    for (const row of rows) {
      if (row.id === target || row.id === posixTarget) {
        idsToDelete.add(row.id);
        continue;
      }
      if (row.file_path) {
        const posixFilePath = toPosix(row.file_path);
        if (
          row.file_path === target ||
          posixFilePath === posixTarget ||
          posixFilePath.endsWith(suffixTarget)
        ) {
          idsToDelete.add(row.id);
          continue;
        }
      }
      if (row.metadata) {
        try {
          const meta = JSON.parse(row.metadata);
          const metaPath = meta.path ? toPosix(meta.path) : null;
          const metaRel = meta.relativePath ? toPosix(meta.relativePath) : null;
          if (
            metaPath === posixTarget ||
            (metaPath && metaPath.endsWith(suffixTarget)) ||
            metaRel === posixTarget
          ) {
            idsToDelete.add(row.id);
          }
        } catch {
          // ignore malformed metadata
        }
      }
    }

    let removed = 0;
    for (const id of idsToDelete) {
      const res = this.stmtDeleteById.run(id);
      removed += Number(res?.changes ?? 1);
    }
    return removed;
  }

  /**
   * Upsert a single repository knowledge-graph node.
   * @param {Object} node
   */
  async upsertGraphNode(node) {
    if (!node || !node.path) return;
    if (!this.initialized) await this.init();

    const relPath = toPosix(node.path);
    this.stmtUpsertNode.run(
      relPath,
      String(node.language ?? 'unknown'),
      Number(node.bytes ?? 0),
      node.contentHash ?? null,
      JSON.stringify(node.methods ?? []),
      JSON.stringify(node.declarations ?? []),
      JSON.stringify(node.imports ?? []),
      Number(node.symbolRefs ?? 0),
      Number(node.unresolvedImports ?? 0),
      Date.now()
    );
  }

  /**
   * Replace all outgoing import edges for a single file node.
   * @param {string} fromPath
   * @param {Array<{to: string, weight?: number}>} edges
   */
  async replaceGraphEdges(fromPath, edges = []) {
    if (!fromPath) return;
    if (!this.initialized) await this.init();

    const posixFrom = toPosix(fromPath);
    const now = Date.now();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.stmtDeleteOutEdges.run(posixFrom);
      for (const edge of edges) {
        if (!edge || !edge.to) continue;
        this.stmtUpsertEdge.run(posixFrom, toPosix(edge.to), Number(edge.weight ?? 1), now);
      }
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  /**
   * Remove a node and all incident (incoming + outgoing) edges from the knowledge graph.
   * @param {string} filePath - Project-relative path
   * @returns {Promise<{removedNode: number, removedEdges: number}>}
   */
  async removeGraphNode(filePath) {
    if (!filePath) return { removedNode: 0, removedEdges: 0 };
    if (!this.initialized) await this.init();

    const posixPath = toPosix(filePath);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const edgeRes = this.stmtDeleteIncidentEdges.run(posixPath, posixPath);
      const nodeRes = this.stmtDeleteNode.run(posixPath);
      this.db.exec('COMMIT');
      return {
        removedNode: Number(nodeRes?.changes ?? 0),
        removedEdges: Number(edgeRes?.changes ?? 0),
      };
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  /**
   * Synchronize a full or incremental set of nodes and edges in a single SQLite transaction.
   * @param {{nodes: Array<Object>, edges: Array<{from: string, to: string, weight?: number}>, replaceAll?: boolean}} graph
   */
  async syncGraph(graph) {
    if (!graph) return;
    if (!this.initialized) await this.init();

    const now = Date.now();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      if (graph.replaceAll) {
        this.db.exec('DELETE FROM graph_nodes; DELETE FROM graph_edges;');
      }
      for (const node of graph.nodes ?? []) {
        const relPath = toPosix(node.path);
        this.stmtUpsertNode.run(
          relPath,
          String(node.language ?? 'unknown'),
          Number(node.bytes ?? 0),
          node.contentHash ?? null,
          JSON.stringify(node.methods ?? []),
          JSON.stringify(node.declarations ?? []),
          JSON.stringify(node.imports ?? []),
          Number(node.symbolRefs ?? 0),
          Number(node.unresolvedImports ?? 0),
          now
        );
      }
      if (Array.isArray(graph.edges)) {
        this.db.exec('DELETE FROM graph_edges;');
        for (const edge of graph.edges) {
          if (!edge || !edge.from || !edge.to) continue;
          this.stmtUpsertEdge.run(
            toPosix(edge.from),
            toPosix(edge.to),
            Number(edge.weight ?? 1),
            now
          );
        }
      }
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  /**
   * Read the persisted knowledge graph (`nodes` and `edges`) from SQLite.
   * @returns {Promise<{nodes: Array<Object>, edges: Array<{from: string, to: string, weight: number}>}>}
   */
  async getGraph() {
    if (!this.initialized) await this.init();

    const rawNodes = this.stmtAllNodes.all();
    const rawEdges = this.stmtAllEdges.all();

    const parseJson = (str, fallback) => {
      if (!str) return fallback;
      try {
        return JSON.parse(str);
      } catch {
        return fallback;
      }
    };

    const nodes = rawNodes
      .map((row) => ({
        path: row.path,
        language: row.language,
        bytes: Number(row.bytes ?? 0),
        contentHash: row.content_hash ?? null,
        methods: parseJson(row.methods, []),
        declarations: parseJson(row.declarations, []),
        imports: parseJson(row.imports, []),
        symbolRefs: Number(row.symbol_refs ?? 0),
        unresolvedImports: Number(row.unresolved_imports ?? 0),
        updatedAt: row.updated_at ? Number(row.updated_at) : null,
      }))
      .sort((a, b) => comparePaths(a.path, b.path));

    const edges = rawEdges
      .map((row) => ({
        from: row.from_path,
        to: row.to_path,
        weight: Number(row.weight ?? 1),
      }))
      .sort((a, b) => comparePaths(a.from, b.from) || comparePaths(a.to, b.to));

    return { nodes, edges };
  }

  /**
   * Return node and edge counts in the persisted knowledge graph.
   * @returns {{nodes: number, edges: number}}
   */
  graphCounts() {
    if (!this.initialized || !this.db) return { nodes: 0, edges: 0 };
    const nRow = this.stmtNodeCount.get();
    const eRow = this.stmtEdgeCount.get();
    return {
      nodes: nRow ? Number(nRow.count) : 0,
      edges: eRow ? Number(eRow.count) : 0,
    };
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
   * Delete documents and graph tables and reinitialize.
   */
  async deleteTable() {
    if (!this.initialized) await this.init();
    try {
      this.db.exec(`
        DROP TABLE IF EXISTS documents;
        DROP TABLE IF EXISTS graph_nodes;
        DROP TABLE IF EXISTS graph_edges;
      `);
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

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  IncrementalAnalyzer,
  FileWatcher,
  SqliteVectorStore,
  LocalHashEmbeddingProvider,
  askCodebase,
} from '../index.js';
import MCPServer from '../lib/api/mcp/server.js';

describe('Watch Mode Incremental SqliteVectorStore & Knowledge Graph Synchronization', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-watch-sync-')));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('SqliteVectorStore document removal & knowledge graph tables', () => {
    it('removes documents by id, relative path, or absolute path', async () => {
      const storeDir = path.join(tmpDir, '.ctxman', 'self-knowledge');
      const store = new SqliteVectorStore(new LocalHashEmbeddingProvider(), storeDir);
      await store.init();

      const absAuth = path.join(tmpDir, 'src', 'auth.js');
      const absCart = path.join(tmpDir, 'src', 'cart.js');

      await store.addDocuments([
        {
          id: 'src/auth.js',
          text: 'export function verifyToken(token) { return true; }',
          metadata: { path: absAuth, relativePath: 'src/auth.js' },
        },
        {
          id: absCart,
          text: 'export function checkoutCart(items) { return items.length; }',
          metadata: { path: absCart, relativePath: 'src/cart.js' },
        },
      ]);

      expect(store.count()).toBe(2);

      // Remove by relative path even when stored with absolute path id
      const removedCart = await store.removeDocument('src/cart.js');
      expect(removedCart).toBe(1);
      expect(store.count()).toBe(1);

      // Remove remaining document by absolute path
      const removedAuth = await store.removeDocument(absAuth);
      expect(removedAuth).toBe(1);
      expect(store.count()).toBe(0);

      store.close();
    });

    it('persists, updates, and removes knowledge graph nodes and edges in SQLite', async () => {
      const storeDir = path.join(tmpDir, '.ctxman', 'self-knowledge');
      const store = new SqliteVectorStore(new LocalHashEmbeddingProvider(), storeDir);
      await store.init();

      await store.upsertGraphNode({
        path: 'src/math.js',
        language: 'javascript',
        bytes: 120,
        contentHash: 'hash-math-1',
        methods: [{ name: 'sumValues', line: 1, signature: 'export function sumValues(a, b)' }],
        declarations: ['sumValues'],
        imports: [],
        symbolRefs: 1,
        unresolvedImports: 0,
      });

      await store.upsertGraphNode({
        path: 'src/app.js',
        language: 'javascript',
        bytes: 200,
        contentHash: 'hash-app-1',
        methods: [{ name: 'runApp', line: 3, signature: 'export function runApp()' }],
        declarations: ['runApp'],
        imports: [{ spec: './math.js' }],
        symbolRefs: 0,
        unresolvedImports: 0,
      });

      await store.replaceGraphEdges('src/app.js', [{ to: 'src/math.js', weight: 1 }]);

      expect(store.graphCounts()).toEqual({ nodes: 2, edges: 1 });

      const graph1 = await store.getGraph();
      expect(graph1.nodes.map((n) => n.path)).toEqual(['src/app.js', 'src/math.js']);
      expect(graph1.edges).toEqual([{ from: 'src/app.js', to: 'src/math.js', weight: 1 }]);

      // Removing target node also removes incoming edges to it
      const removal = await store.removeGraphNode('src/math.js');
      expect(removal).toEqual({ removedNode: 1, removedEdges: 1 });
      expect(store.graphCounts()).toEqual({ nodes: 1, edges: 0 });

      store.close();
    });
  });

  describe('IncrementalAnalyzer live RAG & Knowledge Graph sync', () => {
    it('bootstraps and incrementally syncs file creation, modification, SHA-256 skip, and deletion', async () => {
      const srcDir = path.join(tmpDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });

      const mathPath = path.join(srcDir, 'math.js');
      const appPath = path.join(srcDir, 'app.js');

      fs.writeFileSync(
        mathPath,
        'export function calculateTax(amount) {\n  return amount * 0.2;\n}\n'
      );
      fs.writeFileSync(
        appPath,
        "import { calculateTax } from './math.js';\nexport function checkoutOrder(total) {\n  return total + calculateTax(total);\n}\n"
      );

      let embedCalls = 0;
      const baseEmbedder = new LocalHashEmbeddingProvider();
      const trackingEmbedder = {
        async embed(text) {
          embedCalls++;
          return baseEmbedder.embed(text);
        },
      };

      const analyzer = new IncrementalAnalyzer({
        projectRoot: tmpDir,
        sync: true,
        embeddingProvider: trackingEmbedder,
      });

      // 1. Bootstrap sync
      const boot = await analyzer.bootstrapSync(tmpDir);
      expect(boot.ragUpserted).toBe(2);
      expect(boot.graphNodes).toBe(2);
      expect(boot.graphEdges).toBe(1);
      expect(embedCalls).toBe(2);

      let graph = await analyzer.getGraph();
      expect(graph.edges).toEqual([{ from: 'src/app.js', to: 'src/math.js', weight: 1 }]);
      const mathNode = graph.nodes.find((n) => n.path === 'src/math.js');
      expect(mathNode.methods.map((m) => m.name)).toContain('calculateTax');
      expect(mathNode.symbolRefs).toBeGreaterThan(0);

      // 2. Analyze unchanged file -> SHA-256 deduplication skips re-embedding
      const mathStat = fs.statSync(mathPath);
      const completeEvents = [];
      analyzer.on('analysis:complete', (ev) => completeEvents.push(ev));

      await analyzer.analyzeChange({
        type: 'change',
        path: mathPath,
        relativePath: 'src/math.js',
        exists: true,
        size: mathStat.size,
        modified: mathStat.mtime,
      });

      expect(completeEvents).toHaveLength(1);
      expect(completeEvents[0].sync.rag.action).toBe('unchanged');
      expect(completeEvents[0].sync.rag.upserted).toBe(0);
      expect(completeEvents[0].sync.rag.skipped).toBe(1);
      expect(embedCalls).toBe(2); // No new embed call!

      // 3. Create a new file `src/invoice.js` importing `./math.js`
      const invoicePath = path.join(srcDir, 'invoice.js');
      fs.writeFileSync(
        invoicePath,
        "import { calculateTax } from './math.js';\nexport function generateInvoicePdf(order) {\n  return calculateTax(order.subtotal);\n}\n"
      );
      const invoiceStat = fs.statSync(invoicePath);

      await analyzer.analyzeChange({
        type: 'rename',
        path: invoicePath,
        relativePath: 'src/invoice.js',
        exists: true,
        size: invoiceStat.size,
        modified: invoiceStat.mtime,
      });

      expect(embedCalls).toBe(3);
      expect(analyzer.vectorStore.count()).toBe(3);

      graph = await analyzer.getGraph();
      expect(graph.nodes.map((n) => n.path)).toEqual([
        'src/app.js',
        'src/invoice.js',
        'src/math.js',
      ]);
      expect(graph.edges).toEqual([
        { from: 'src/app.js', to: 'src/math.js', weight: 1 },
        { from: 'src/invoice.js', to: 'src/math.js', weight: 1 },
      ]);

      // Verify live semantic search via askCodebase on the synced store
      const askRes = await askCodebase(tmpDir, 'generateInvoicePdf subtotal', {
        createStore: (storePath) => new SqliteVectorStore(baseEmbedder, storePath),
      });
      expect(askRes.indexed).toBe(false); // Used existing watch-synced SQLite index!
      expect(askRes.results[0].file).toBe('src/invoice.js');

      // 4. Delete `src/math.js` -> removes vector document and updates graph edges & unresolvedImports
      fs.unlinkSync(mathPath);
      const deletedEvents = [];
      analyzer.on('file:deleted', (ev) => deletedEvents.push(ev));

      await analyzer.analyzeChange({
        type: 'rename',
        path: mathPath,
        relativePath: 'src/math.js',
        exists: false,
      });

      expect(deletedEvents).toHaveLength(1);
      expect(deletedEvents[0].sync.rag.action).toBe('deleted');
      expect(analyzer.vectorStore.count()).toBe(2);

      graph = await analyzer.getGraph();
      expect(graph.nodes.map((n) => n.path)).toEqual(['src/app.js', 'src/invoice.js']);
      expect(graph.edges).toEqual([]); // Incident edges to src/math.js removed!
      // Both remaining files now have 1 unresolved import (./math.js)
      expect(graph.nodes.find((n) => n.path === 'src/app.js').unresolvedImports).toBe(1);
      expect(graph.nodes.find((n) => n.path === 'src/invoice.js').unresolvedImports).toBe(1);

      analyzer.close();
    });

    it('enforces .ctxman/policy.json deny rules and redacts secrets before writing to SQLite', async () => {
      const srcDir = path.join(tmpDir, 'src');
      const secretDir = path.join(tmpDir, 'secrets');
      fs.mkdirSync(srcDir, { recursive: true });
      fs.mkdirSync(secretDir, { recursive: true });

      const configPath = path.join(srcDir, 'config.js');
      const deniedPath = path.join(secretDir, 'keys.js');

      // Create a file with an embedded secret token
      const fakeGithubToken = `ghp_${'A1b2C3d4E5f6'.repeat(3)}`;
      fs.writeFileSync(
        configPath,
        `export function connectApi(token = "${fakeGithubToken}") {\n  return token;\n}\n`
      );
      fs.writeFileSync(deniedPath, 'export function getPrivateVaultKey() { return "vault"; }\n');

      // Write policy denying secrets/**
      fs.mkdirSync(path.join(tmpDir, '.ctxman'), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, '.ctxman', 'policy.json'),
        JSON.stringify({ version: 1, deny: ['secrets/**'] })
      );

      const analyzer = new IncrementalAnalyzer({
        projectRoot: tmpDir,
        sync: true,
        hydrateGraphOnStart: false,
      });

      // Attempt to sync denied file -> should be rejected and never stored
      const skippedEvents = [];
      analyzer.on('sync:skipped', (ev) => skippedEvents.push(ev));

      const deniedStat = fs.statSync(deniedPath);
      await analyzer.analyzeChange({
        type: 'change',
        path: deniedPath,
        relativePath: 'secrets/keys.js',
        exists: true,
        size: deniedStat.size,
        modified: deniedStat.mtime,
      });

      expect(skippedEvents).toHaveLength(1);
      expect(skippedEvents[0].reason).toBe('denied');
      expect(analyzer.vectorStore.count()).toBe(0);

      // Sync allowed file containing a secret -> secret must be redacted in SQLite vector store & graph
      const configStat = fs.statSync(configPath);
      await analyzer.analyzeChange({
        type: 'change',
        path: configPath,
        relativePath: 'src/config.js',
        exists: true,
        size: configStat.size,
        modified: configStat.mtime,
      });

      expect(analyzer.vectorStore.count()).toBe(1);
      const hits = await analyzer.vectorStore.search('connectApi', 5);
      expect(hits).toHaveLength(1);
      expect(hits[0].text).not.toContain(fakeGithubToken);
      expect(hits[0].text).toContain('[REDACTED:');

      const graph = await analyzer.getGraph();
      expect(graph.nodes).toHaveLength(1);
      expect(graph.nodes[0].methods[0].signature).not.toContain(fakeGithubToken);
      expect(graph.nodes[0].methods[0].signature).toContain('[REDACTED:');

      // Now update policy to also deny src/config.js and trigger change -> purged from store & graph
      fs.writeFileSync(
        path.join(tmpDir, '.ctxman', 'policy.json'),
        JSON.stringify({ version: 1, deny: ['secrets/**', 'src/config.js'] })
      );

      await analyzer.analyzeChange({
        type: 'change',
        path: configPath,
        relativePath: 'src/config.js',
        exists: true,
        size: configStat.size,
        modified: configStat.mtime,
      });

      expect(analyzer.vectorStore.count()).toBe(0);
      const updatedGraph = await analyzer.getGraph();
      expect(updatedGraph.nodes).toHaveLength(0);

      analyzer.close();
    });
  });

  describe('FileWatcher ignore protection for SQLite & .ctxman state', () => {
    it('ignores .ctxman directory and .sqlite* files to prevent watch feedback loops', () => {
      const watcher = new FileWatcher(tmpDir, {
        ignorePatterns: ['custom-cache', /\.tmp$/],
      });

      expect(watcher.shouldIgnore('.ctxman/self-knowledge/index.sqlite')).toBe(true);
      expect(watcher.shouldIgnore('.ctxman/self-knowledge/index.sqlite-wal')).toBe(true);
      expect(watcher.shouldIgnore('.ctxman/self-knowledge/index.sqlite-shm')).toBe(true);
      expect(watcher.shouldIgnore('data/local.sqlite')).toBe(true);
      expect(watcher.shouldIgnore('custom-cache/state.json')).toBe(true);
      expect(watcher.shouldIgnore('src/scratch.tmp')).toBe(true);
      expect(watcher.shouldIgnore('src/index.js')).toBe(false);
    });
  });

  describe('MCP query_knowledge_graph tool', () => {
    it('bootstraps via IncrementalAnalyzer when empty, then queries cached/persisted SQLite graph with file/query filters and policy enforcement', async () => {
      const srcDir = path.join(tmpDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });

      fs.writeFileSync(
        path.join(srcDir, 'db.js'),
        'export function queryDatabase(sql) {\n  return [];\n}\n'
      );
      fs.writeFileSync(
        path.join(srcDir, 'service.js'),
        "import { queryDatabase } from './db.js';\nexport function fetchUsers() {\n  return queryDatabase('SELECT * FROM users');\n}\n"
      );
      fs.writeFileSync(
        path.join(srcDir, 'secret.js'),
        'export function internalKey() { return "secret"; }\n'
      );

      fs.mkdirSync(path.join(tmpDir, '.ctxman'), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, '.ctxman', 'policy.json'),
        JSON.stringify({ version: 1, deny: ['src/secret.js'] })
      );

      const mcp = new MCPServer({ root: tmpDir });
      const callHandler = mcp.server._requestHandlers.get('tools/call');

      // 1. First call auto-bootstraps the SQLite knowledge graph and excludes denied files
      const firstCall = await callHandler({
        method: 'tools/call',
        params: {
          name: 'query_knowledge_graph',
          arguments: { path: tmpDir },
        },
      });
      expect(firstCall.isError).toBeFalsy();
      const firstPayload = JSON.parse(firstCall.content[0].text);
      expect(firstPayload.bootstrapped).toBe(true);
      expect(firstPayload.stats.totalNodes).toBe(2);
      expect(firstPayload.stats.totalEdges).toBe(1);
      expect(firstPayload.nodes.map((n) => n.path)).toEqual(['src/db.js', 'src/service.js']);
      expect(firstPayload.edges).toEqual([{ from: 'src/service.js', to: 'src/db.js', weight: 1 }]);

      // 2. Second call uses the cached IncrementalAnalyzer & persisted SQLite graph without re-bootstrapping
      const secondCall = await callHandler({
        method: 'tools/call',
        params: {
          name: 'query_knowledge_graph',
          arguments: { path: tmpDir, query: 'fetchUsers' },
        },
      });
      const secondPayload = JSON.parse(secondCall.content[0].text);
      expect(secondPayload.bootstrapped).toBe(false);
      expect(secondPayload.cached).toBe(true);
      expect(secondPayload.nodes.map((n) => n.path)).toEqual(['src/service.js']);
      expect(secondPayload.edges).toEqual([{ from: 'src/service.js', to: 'src/db.js', weight: 1 }]);

      // 3. File neighborhood filter
      const fileCall = await callHandler({
        method: 'tools/call',
        params: {
          name: 'query_knowledge_graph',
          arguments: { path: tmpDir, file: 'src/db.js', depth: 1 },
        },
      });
      const filePayload = JSON.parse(fileCall.content[0].text);
      expect(filePayload.bootstrapped).toBe(false);
      expect(filePayload.nodes.map((n) => n.path)).toEqual(['src/db.js', 'src/service.js']);

      for (const inc of mcp.incrementalAnalyzers.values()) {
        inc.close();
      }
    });
  });
});

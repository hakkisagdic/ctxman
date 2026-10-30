import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { LocalHashEmbeddingProvider, AutoEmbeddingProvider } from '../lib/rag/EmbeddingProvider.js';
import { SqliteVectorStore } from '../lib/rag/stores/SqliteVectorStore.js';
import { VectorStoreFactory } from '../lib/rag/VectorStoreFactory.js';
import { askCodebase } from '../lib/rag/ask.js';

describe('SqliteVectorStore & LocalHashEmbeddingProvider', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-sqlite-')));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('LocalHashEmbeddingProvider', () => {
    it('generates a deterministic 256-dimensional unit vector', async () => {
      const provider = new LocalHashEmbeddingProvider();
      const text = 'function calculateTotal(items) { return items.reduce((a, b) => a + b, 0); }';

      const vec1 = await provider.embed(text);
      const vec2 = await provider.embed(text);

      expect(vec1).toHaveLength(256);
      expect(vec2).toHaveLength(256);
      expect(vec1).toEqual(vec2);

      // Verify L2 norm is ~1.0
      const norm = Math.sqrt(vec1.reduce((sum, v) => sum + v * v, 0));
      expect(norm).toBeCloseTo(1.0, 4);
    });

    it('produces higher similarity for semantically/lexically related texts', async () => {
      const provider = new LocalHashEmbeddingProvider();
      const vecAuth1 = await provider.embed('authenticate user with jwt bearer token');
      const vecAuth2 = await provider.embed('user authentication token verification');
      const vecCooking = await provider.embed('bake chocolate cake in hot oven at 350 degrees');

      const dot = (a, b) => a.reduce((sum, val, i) => sum + val * b[i], 0);

      const simRelated = dot(vecAuth1, vecAuth2);
      const simUnrelated = dot(vecAuth1, vecCooking);

      expect(simRelated).toBeGreaterThan(simUnrelated);
    });
  });

  describe('AutoEmbeddingProvider', () => {
    it('falls back seamlessly to LocalHashEmbeddingProvider when CTXMAN_EMBEDDER=local', async () => {
      const original = process.env.CTXMAN_EMBEDDER;
      try {
        process.env.CTXMAN_EMBEDDER = 'local';
        const auto = new AutoEmbeddingProvider();
        const vec = await auto.embed('test content for auto provider');
        expect(vec).toHaveLength(256);
      } finally {
        if (original === undefined) delete process.env.CTXMAN_EMBEDDER;
        else process.env.CTXMAN_EMBEDDER = original;
      }
    });

    it('initializes and embeds text without throwing', async () => {
      const auto = new AutoEmbeddingProvider();
      await auto.init();
      const vec = await auto.embed('hello world query');
      expect(Array.isArray(vec)).toBe(true);
      expect(vec.length).toBeGreaterThan(0);
    });
  });

  describe('SqliteVectorStore', () => {
    it('creates database file in parent dir and stores documents', async () => {
      const storeDir = path.join(tmpDir, 'rag-storage');
      const provider = new LocalHashEmbeddingProvider();
      const store = new SqliteVectorStore(provider, storeDir);

      await store.init();
      const dbFile = path.join(storeDir, 'index.sqlite');
      expect(fs.existsSync(dbFile)).toBe(true);

      await store.addDocuments([
        {
          id: 'doc-1',
          text: 'export function login(username, password) { return authService.verify(username, password); }',
          metadata: { path: 'src/auth.js' },
        },
        {
          id: 'doc-2',
          text: 'export function renderWidget(canvas, data) { canvas.draw(data); }',
          metadata: { path: 'src/widget.js' },
        },
      ]);

      expect(store.count()).toBe(2);

      const results = await store.search('login credentials', 5);
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].metadata.path).toBe('src/auth.js');
      expect(results[0].score).toBeGreaterThan(0);

      store.close();
    });

    it('skips re-embedding when content SHA-256 is unchanged', async () => {
      const storeDir = path.join(tmpDir, 'rag-storage');
      let embedCount = 0;
      const baseProvider = new LocalHashEmbeddingProvider();
      const trackingProvider = {
        async embed(text) {
          embedCount++;
          return baseProvider.embed(text);
        },
      };

      const store = new SqliteVectorStore(trackingProvider, storeDir);
      await store.init();

      const doc = {
        id: 'file-1',
        text: 'unchanging content',
        metadata: { path: 'file1.js' },
      };

      await store.addDocuments([doc]);
      expect(embedCount).toBe(1);

      // Second upsert with identical content
      await store.addDocuments([doc]);
      // Should NOT re-embed
      expect(embedCount).toBe(1);

      // Third upsert with changed content
      await store.addDocuments([{ ...doc, text: 'modified content' }]);
      // Should re-embed
      expect(embedCount).toBe(2);

      store.close();
    });

    it('is registered in VectorStoreFactory as the default store', () => {
      const provider = new LocalHashEmbeddingProvider();
      const defaultStore = VectorStoreFactory.create(undefined, provider, {
        path: path.join(tmpDir, 'store'),
      });
      expect(defaultStore).toBeInstanceOf(SqliteVectorStore);

      const explicitStore = VectorStoreFactory.create('sqlite', provider, {
        path: path.join(tmpDir, 'store2'),
      });
      expect(explicitStore).toBeInstanceOf(SqliteVectorStore);
    });

    it('integrates with askCodebase end-to-end completely offline', async () => {
      fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, 'src', 'payment.js'),
        'export function processPayment(card, amount) { return gateway.charge(card, amount); }'
      );
      fs.writeFileSync(
        path.join(tmpDir, 'README.md'),
        '# Payment Service Documentation\nExplains gateway transactions.'
      );

      const result = await askCodebase(tmpDir, 'how to charge a card');
      expect(result.query).toBe('how to charge a card');
      expect(result.indexed).toBe(true);
      expect(result.results.length).toBeGreaterThan(0);
      expect(result.results.some((r) => r.file.includes('payment.js'))).toBe(true);
    });
  });
});

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LanceDBStore as VectorStore } from '../lib/rag/stores/LanceDBStore.js';
import { MockEmbeddingProvider } from '../lib/rag/EmbeddingProvider.js';
import { Indexer } from '../lib/rag/Indexer.js';
import { DataSourcePlugin } from '../lib/rag/DataSourcePlugin.js';
import fs from 'fs/promises';
import _path from 'path';

const TEST_DB_PATH = '.ctxman/test-rag-store';

class MockSource extends DataSourcePlugin {
  constructor() {
    super('mock-source');
  }

  async *collect() {
    yield { id: '1', text: 'Doc 1', metadata: { type: 'test' } };
    yield { id: '2', text: 'Doc 2', metadata: { type: 'test' } };
    yield { id: '3', text: 'Doc 3', metadata: { type: 'test' } };
  }
}

describe('RAG System', () => {
  let store;
  let provider;

  beforeEach(async () => {
    provider = new MockEmbeddingProvider();
    store = new VectorStore(provider, TEST_DB_PATH);
    await store.init();
  });

  afterEach(async () => {
    // Cleanup LanceDB files
    try {
      await fs.rm(TEST_DB_PATH, { recursive: true, force: true });
    } catch (_e) {}
  });

  it('should store and retrieve documents', async () => {
    await store.addDocument('hello world', { type: 'greeting' });
    const results = await store.search('hello');

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].text).toBe('hello world');
    expect(results[0].metadata.type).toBe('greeting');
  });

  it('should batch insert documents', async () => {
    const docs = [
      { text: 'alpha', metadata: { id: 1 } },
      { text: 'beta', metadata: { id: 2 } },
    ];
    await store.addDocuments(docs);

    const results = await store.search('alpha');
    expect(results[0].text).toBe('alpha');
  });

  it('should index data from sources via Indexer', async () => {
    const indexer = new Indexer(store);
    const source = new MockSource();
    indexer.registerSource(source);

    await indexer.index('mock-source');

    const results = await store.search('Doc 1');
    expect(results.length).toBeGreaterThan(0);
    // Depending on vector math, "Doc 1" should be closest to "Doc 1"
    const match = results.find((r) => r.text === 'Doc 1');
    expect(match).toBeDefined();
    expect(match.metadata.source).toBe('mock-source');
  });
});

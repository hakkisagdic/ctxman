import { Indexer } from '../lib/rag/Indexer.js';
import { VectorStoreFactory } from '../lib/rag/VectorStoreFactory.js';
import { EmbeddingProvider } from '../lib/rag/EmbeddingProvider.js';
import { FileDataSource } from '../lib/rag/sources/FileDataSource.js';
import path from 'path';

async function main() {
  console.log('🚀 Starting Self-Reflection (Indexing Ctxman)...');

  // 1. Setup RAG components
  // Use MockEmbeddingProvider for now since we don't have an API key for real embeddings in this script context yet
  // Ideally, this should be OpenAI or similar.
  // For demo, we'll use a dummy provider that just generates random vectors or simple hashes.
  // Wait, let's look at EmbeddingProvider.js to see if it supports local models or mocks.

  // Checking EmbeddingProvider first...
  // (Assuming we use the existing one or a mock for safety if no key)

  // Real implementation plan:
  // - EmbeddingProvider: Transformer.js (local) or Mock
  // - VectorStore: LanceDB (local)

  // Let's use a MockProvider for the "Unblocked Engine" demonstration if transformers aren't ready,
  // but "Kendini Bil" implies intelligence.
  // Let's try to use the real EmbeddingProvider if it has local support.

  const { TransformersEmbeddingProvider, MockEmbeddingProvider } =
    await import('../lib/rag/EmbeddingProvider.js');

  let provider;
  try {
    console.log('🔌 Initializing Local Transformer (Xenova/all-MiniLM-L6-v2)...');
    provider = new TransformersEmbeddingProvider();
    // Trigger init explicitly to catch errors early
    await provider.init();
    console.log('✅ Model loaded.');
  } catch (e) {
    console.log(`⚠️ Local embedding failed: ${e.message}`);
    console.log('⚠️ Falling back to MockEmbeddingProvider for structure test.');
    provider = new MockEmbeddingProvider();
  }

  const store = VectorStoreFactory.create('lancedb', provider, {
    path: '.ctxman/self-knowledge',
  });

  const indexer = new Indexer(store);
  const fileSource = new FileDataSource();

  // 2. Register Sources
  indexer.registerSource(fileSource);

  // 3. Index Ourselves
  console.log('📚 Reading own source code...');
  await indexer.index('local-files', {
    targetDir: process.cwd(),
    include: ['.js', '.md', '.json'],
    exclude: ['node_modules', '.git', 'dist', 'coverage', '.ctxman'],
  });

  console.log('✅ Indexing complete!');

  // 4. Test Query
  console.log('\n🧠 Testing Recall: "What is a DataSourcePlugin?"');
  const results = await store.search('DataSourcePlugin definition class', 3);

  results.forEach((r, i) => {
    console.log(`\n[${i + 1}] Score: ${r.score?.toFixed(4)} | Path: ${r.metadata?.path}`);
    console.log(`Snippet: ${r.text.substring(0, 150)}...`);
  });
}

main().catch(console.error);

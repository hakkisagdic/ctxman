#!/usr/bin/env node
import { VectorStoreFactory } from '../lib/rag/VectorStoreFactory.js';
import { TransformersEmbeddingProvider } from '../lib/rag/EmbeddingProvider.js';
import { Indexer } from '../lib/rag/Indexer.js';
import { FileDataSource } from '../lib/rag/sources/FileDataSource.js';
import path from 'path';
import fs from 'fs/promises';

async function main() {
  const args = process.argv.slice(2);
  const query = args.join(' ');

  if (!query) {
    console.error('Usage: ctxman ask "Your query here"');
    process.exit(1);
  }

  // 1. Initialize RAG Components
  let provider;
  try {
    // Try to load local transformers
    provider = new TransformersEmbeddingProvider();
    // Lazy init will handle model download on first use
  } catch (e) {
    console.error('⚠️ Failed to initialize embedding provider:', e.message);
    process.exit(1);
  }

  // Use LanceDB in .ctxman/self-knowledge
  const storePath = path.join(process.cwd(), '.ctxman', 'self-knowledge');
  const store = VectorStoreFactory.create('lancedb', provider, { path: storePath });

  // 2. Check if indexed
  const isIndexed = await checkIndexExists(storePath);

  if (!isIndexed) {
    console.log('📚 Index not found. Auto-indexing current project...');
    await indexProject(store);
  }

  // 3. Search
  console.log(`🔍 Searching for: "${query}"...`);
  const results = await store.search(query, 5); // Get top 5

  if (results.length === 0) {
    console.log('❌ No relevant context found.');
    return;
  }

  // 4. Display Results (or feed to LLM if we had one configured)
  console.log(`\nFound ${results.length} relevant snippets:\n`);

  results.forEach((r, i) => {
    console.log(`[${i + 1}] ${r.metadata.filename} (Score: ${r.score?.toFixed(4)})`);
    console.log('─'.repeat(40));
    // Show a small snippet around the match if possible, but we stored full text.
    // Let's just show the first 200 chars or so.
    console.log(r.text.substring(0, 300).replace(/\n/g, ' ') + '...');
    console.log('\n');
  });

  // Future: Pass `results` to an LLM API to generate a real answer.
  // For now, this validates the retrieval pipeline works from CLI.
}

async function checkIndexExists(storePath) {
  try {
    await fs.access(storePath);
    // Also check if it has tables (LanceDB creates folders)
    const files = await fs.readdir(storePath);
    return files.length > 0;
  } catch {
    return false;
  }
}

async function indexProject(store) {
  const indexer = new Indexer(store);
  const fileSource = new FileDataSource();
  indexer.registerSource(fileSource);

  console.log('⏳ Indexing files (this may take a moment)...');
  await indexer.index('local-files', {
    targetDir: process.cwd(),
    include: ['.js', '.md', '.ts', '.json'], // Configurable?
    exclude: ['node_modules', '.git', 'dist', 'coverage', '.ctxman'],
  });
  console.log('✅ Indexing complete.');
}

main().catch((err) => {
  console.error('❌ Error:', err);
  process.exit(1);
});

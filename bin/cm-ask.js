#!/usr/bin/env node
import { askCodebase } from '../lib/rag/ask.js';

async function main() {
  const args = process.argv.slice(2);
  const query = args.join(' ');

  if (!query) {
    console.error('Usage: ctxman ask "Your query here"');
    process.exit(1);
  }

  console.log(`🔍 Searching for: "${query}"...`);
  const { results, removedByPolicy } = await askCodebase(process.cwd(), query, {
    onProgress: (event) => {
      if (event === 'indexing') {
        console.log('📚 Index not found. Auto-indexing current project...');
        console.log('⏳ Indexing files (this may take a moment)...');
      } else if (event === 'indexed') {
        console.log('✅ Indexing complete.');
      }
    },
  });

  if (removedByPolicy > 0) {
    console.log(`🛡️  Removed ${removedByPolicy} results denied by the export policy`);
  }
  if (results.length === 0) {
    console.log('❌ No relevant context found.');
    return;
  }

  console.log(`\nFound ${results.length} relevant snippets:\n`);
  results.forEach((r, i) => {
    console.log(`[${i + 1}] ${r.file} (Score: ${r.score?.toFixed(4)})`);
    console.log('─'.repeat(40));
    console.log(r.text.substring(0, 300).replace(/\n/g, ' ') + '...');
    console.log('\n');
  });
}

main().catch((err) => {
  // Message only: missing optional dependencies and indexing failures surface here
  console.error('❌ Error:', err.message);
  process.exit(1);
});

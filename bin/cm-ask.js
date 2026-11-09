#!/usr/bin/env node
import { parseArgs } from 'node:util';
import path from 'node:path';
import { askCodebase, DEFAULT_ASK_LIMIT } from '../lib/rag/ask.js';

const HELP = `Usage: ctxman ask "<question>" [options]

Semantic search over the codebase (single-repo or multi-repo workspace) using the
local SQLite embedding index (.ctxman/self-knowledge/index.sqlite).

Options:
      --root <dir>      Primary project root (default: cwd)
      --repo <dir>      Additional repository root for multi-repo workspace (repeatable)
  -n, --limit <n>       Maximum snippets to return (default: ${DEFAULT_ASK_LIMIT})
      --json            Output result as JSON
  -h, --help            Show this help
`;

const OPTIONS = {
  root: { type: 'string' },
  repo: { type: 'string', multiple: true },
  limit: { type: 'string', short: 'n' },
  json: { type: 'boolean' },
  help: { type: 'boolean', short: 'h' },
};

async function main() {
  const rawArgs = process.argv.slice(2);
  let values = {};
  let positionals = rawArgs;

  try {
    const parsed = parseArgs({ args: rawArgs, options: OPTIONS, allowPositionals: true });
    values = parsed.values;
    positionals = parsed.positionals;
  } catch {
    // Allow unquoted queries that might contain dashes if parseArgs fails
    positionals = rawArgs;
  }

  if (values.help) {
    process.stdout.write(HELP);
    return;
  }

  const query = positionals.join(' ').trim();

  if (!query) {
    console.error('Usage: ctxman ask "Your query here" [--repo <dir>] [--limit <n>] [--json]');
    process.exit(1);
  }

  const rootDir = values.root ? path.resolve(process.cwd(), values.root) : process.cwd();
  const extraRepos = Array.isArray(values.repo)
    ? values.repo.map((r) => path.resolve(process.cwd(), r))
    : undefined;
  const limit = values.limit ? Number.parseInt(values.limit, 10) : undefined;

  if (!values.json) {
    console.log(`🔍 Searching for: "${query}"...`);
  }

  const result = await askCodebase(rootDir, query, {
    repos: extraRepos,
    limit,
    onProgress: (event) => {
      if (values.json) return;
      if (event === 'indexing') {
        console.log('📚 Index not found. Auto-indexing current project...');
        console.log('⏳ Indexing files (this may take a moment)...');
      } else if (event === 'indexed') {
        console.log('✅ Indexing complete.');
      }
    },
  });

  if (values.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  const { results, removedByPolicy } = result;
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

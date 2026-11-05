# `ctxman task` — task-driven automatic context

`ctxman task` builds a complete, token-budgeted LLM context bundle from a natural-language task
or issue description in one command:

1. **Seed discovery** — runs `hybridSearch` (BM25 + local SQLite vector embeddings fused via
   Reciprocal Rank Fusion) to locate the top matching files and symbols (`hop 0`).
2. **AST symbol call graph & import neighborhood** — traverses the repository cross-file AST
   symbol call graph (`graph.callEdges`, including intra-file helper closures of matched seed
   symbols and barrel re-export targets) together with the import graph (`buildRepoGraph`) to
   gather 1-hop full source files (`hop 1`, prioritizing direct symbol callers and callees) and
   2-hop compressed function/class signatures (`hop 2`).
3. **Architectural overview** — generates a focused `renderRepoMap` summary (`~15%` of budget,
   capped at 2,500 tokens) anchored on the seed files.
4. **Strict token budget & Data Shield** — fits the entire bundle within `--budget` (default
   `32000` tokens), compressing or trimming lower-priority files when needed, enforcing
   `.ctxman/policy.json` deny rules, and masking secrets via `redactSecrets`.

```bash
ctxman task "add OAuth token refresh retry logic"
ctxman task "fix rate limiter race condition" --budget 24k --format xml
ctxman task "migrate vector store to sqlite" --limit 8 --output task-context.md
ctxman task "refactor token verifier" --no-calls   # import edges only
```

## Options

| Option                   | Default    | Description                                                           |
| ------------------------ | ---------- | --------------------------------------------------------------------- |
| `--budget TOKENS`        | `32000`    | Maximum token budget (`32000`, `32k`, `40k`)                          |
| `--format FORMAT`        | `markdown` | Output format: `markdown`, `json`, or `xml` (`--json`, `--xml`)       |
| `--limit N`              | `5`        | Number of seed files discovered via hybrid search                     |
| `--mode MODE`            | `hybrid`   | Seed search mode: `hybrid`, `bm25`, or `semantic`                     |
| `--calls` / `--no-calls` | `true`     | Enable or disable cross-file AST symbol call graph neighbor expansion |
| `--no-redact`            | `false`    | Disable automatic secret redaction                                    |
| `-o, --output FILE`      | stdout     | Write the rendered bundle to `FILE`                                   |
| `-h, --help`             |            | Show command help                                                     |

## Library and MCP

```js
import { buildTaskContext } from 'ctxman';

const bundle = await buildTaskContext('/path/to/repo', 'add OAuth token refresh retry logic', {
  budget: 32000,
  format: 'markdown', // 'markdown' | 'json' | 'xml'
  limit: 5,
  callGraph: true,
});

console.log(bundle.totalTokens, bundle.seeds, bundle.callEdges);
console.log(bundle.text);
```

The MCP server exposes `task_context` with `path`, `task`, `budget`, `format`, and `model`.

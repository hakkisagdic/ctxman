# ctxman search

Ranked code search over a project: the methods, functions and code windows that best match
words, identifiers, or natural-language queries, best first, with their code. Supports instant
lexical BM25 ranking (default), pure local semantic vector search (`--mode semantic`), and
Reciprocal Rank Fusion combining both (`--hybrid` / `--mode hybrid`). The same engine serves
the MCP tool `search_code` with `type: "ranked"`, `"hybrid"`, or `"semantic"` (see
[mcp.md](mcp.md)).

```bash
ctxman search "parse config file"
ctxman search "how authentication sessions expire" --hybrid
ctxman search getUserName ./services/api --limit 5
```

## Usage

```text
ctxman search "<query>" [path] [options]
```

| Option               | Default | Meaning                                                        |
| -------------------- | ------- | -------------------------------------------------------------- |
| `-n`, `--limit <n>`  | 10      | Number of results                                              |
| `--max-tokens <n>`   | 4000    | Token budget for the returned code (all results together)      |
| `--hybrid`           | off     | Fuse BM25 lexical ranking with local vector embeddings via RRF |
| `--mode <mode>`      | `bm25`  | `bm25` (default), `hybrid`, or `semantic`                      |
| `--full`             | off     | Print whole chunks instead of their first 8 lines              |
| `--json`             | off     | Print the results as JSON                                      |
| `--no-redact`        | off     | Do not redact secrets in the returned code                     |
| `-o`, `--output <f>` |         | Write the output to a file instead of stdout                   |
| `--copy`             | off     | Copy the output to the clipboard                               |
| `-h`, `--help`       |         | Show the help                                                  |

Exit codes: 0 (also when nothing matches), 1 on errors, 2 on usage errors.

## How it ranks

- **Files**: found with the Scanner, so `.gitignore`, `.contextignore`, `.contextinclude`, and
  `.ctxman/policy.json` apply. Files over 1 MiB are skipped.
- **Chunks**: every method/function the method analyzers find (14 languages) is one chunk. The
  code outside them and whole files of other types are cut into windows of up to 40 lines.
- **BM25 (`--mode bm25`, default)**: splits identifiers at camelCase, snake_case and
  kebab-case boundaries, folds simple English plurals, and scores with Okapi BM25 (`k1 = 1.2`,
  `b = 0.75`) over chunk text, symbol name (3x weight), and file path.
- **Hybrid RRF (`--hybrid` / `--mode hybrid`)**: combines BM25 chunk rankings and local vector
  embeddings (`.ctxman/self-knowledge`, powered by optional `@xenova/transformers` and
  `@lancedb/lancedb`) via Reciprocal Rank Fusion (`1 / (60 + rank_bm25) + 1 / (60 + rank_sem)`).
  Chunks matching both exact identifiers and semantic intent rise to the top; conceptual
  queries without keyword overlap still surface matching chunks. When the optional RAG packages
  are not installed, `--hybrid` gracefully falls back to BM25 with a warning on stderr.
- **Secrets**: chunks are indexed and returned after secret redaction unless `--no-redact` is
  passed (subject to export policy).

## Library

```js
import { searchProject, hybridSearch, getSymbol } from 'ctxman';

const lexical = searchProject('/work/app', 'retry backoff', { limit: 5, maxTokens: 2000 });
const hybrid = await hybridSearch('/work/app', 'exponential retry policy', {
  mode: 'hybrid',
  limit: 5,
  maxTokens: 2000,
});
const { symbols } = getSymbol('/work/app', 'HttpClient.request');
```

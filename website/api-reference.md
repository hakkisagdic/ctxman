# API Reference

Complete reference for Ctxman v3.2 CLI commands, 19-tool MCP server, REST API, and programmatic library exports.

## CLI Reference

### Global & Analysis Options

| Option                   | Alias | Description                                             | Default             |
| ------------------------ | ----- | ------------------------------------------------------- | ------------------- |
| `--cli`                  | `-c`  | Run in CLI mode (skip wizard)                           | `false`             |
| `--help`                 | `-h`  | Show help                                               | -                   |
| `--version`              | `-v`  | Show version                                            | -                   |
| `--method-level`         | `-m`  | Enable method-level token analysis                      | `false`             |
| `--target-model`         | `-t`  | Target LLM profile ID (e.g. `claude-sonnet-5-5`)        | `claude-sonnet-5-5` |
| `--list-llms`            |       | List 44+ LLM profiles (`--all` includes retired models) | -                   |
| `--output`               | `-o`  | Output format (`toon`, `json`, `markdown`, `yaml`, ...) | `json`              |
| `--gitingest`            | `-g`  | Generate GitIngest digest (`digest.txt`)                | `false`             |
| `--changed-only`         |       | Analyze only working-tree modified files                | `false`             |
| `--changed-since`        |       | Analyze files changed since a git ref                   | -                   |
| `--with-authors`         |       | Include git blame author attribution                    | `false`             |
| `--cache` / `--no-cache` |       | Enable or bypass SHA-256 disk/memory analysis cache     | `true`              |
| `--no-redact`            |       | Disable automatic secret redaction                      | `false`             |

## CLI Subcommands (v3.2)

### `ctxman map [dir]`

Generate a PageRank-ranked repository map with function/class signatures and optional cross-file AST symbol call annotations (`-c, --call-graph`) within a token budget:

```bash
ctxman map --tokens 2048 --focus lib/why/index.js
ctxman map --call-graph --focus lib/why/index.js:explainHistory
ctxman map --repo ../plansmith --repo ../plansmith-desktop --tokens 4096
```

### `ctxman focus <file>[:symbol]`

Pack a target file or symbol (`<file>:<symbol>` / `-s, --symbol`) together with its `N`-hop import and cross-file AST symbol call neighborhood (`--calls-only`, `--callers-only`, `--no-calls`):

```bash
ctxman focus lib/api/mcp/server.js --depth 2 --direction both --budget 20k
ctxman focus lib/why/index.js:explainHistory --calls-only --budget 12k
```

### `ctxman pack [dir]`

Pack repository files into one LLM-ready document (`xml`, `markdown`, `plain`, `json`):

```bash
ctxman pack --budget 32k --compress --style xml
ctxman pack --include "lib/**/*.js" --max-tokens 50000
```

### `ctxman pr [dir]`

Assemble pull-request review context (summary, commit log, changed methods, diff, and related tests):

```bash
ctxman pr --base main --head HEAD --budget 24k
```

### `ctxman why <target>`

Explain why a file, symbol (`file:symbol`), or line range (`file#L10-L40`) looks the way it does:

```bash
ctxman why lib/why/index.js:explainHistory
ctxman why lib/why/index.js:explainHistory --discussions --analyzer
ctxman why lib/why/index.js#L1-L80 --patches --budget 12k
```

### `ctxman who <target-or-topic>`

Rank code and domain experts using surviving `git blame -w` share (`0.45`), recency-decayed commits (`0.35`, 90-day half-life), total commits (`0.20`), and `CODEOWNERS` (`+0.15`):

```bash
ctxman who lib/why/index.js:explainHistory
ctxman who lib/rag
ctxman who "hybrid search RRF" --limit 5 --style json
```

### `ctxman task "<goal>"`

Build a task-driven context bundle (hybrid search seeds + 1-hop AST symbol call & import full code + 2-hop compressed signatures + architectural repo map; `--no-calls` disables call-graph expansion):

```bash
ctxman task "add OAuth token refresh retry logic" --budget 32k --format markdown
```

### `ctxman diagnose [trace]`

Parse multi-language stack traces and failure logs into a root-cause bundle (implicated frames, enclosing methods, 1-hop AST symbol call & import neighbors with `caller -> callee` annotations, and recent git commits; `--no-calls` disables call-graph expansion):

```bash
npm test 2>&1 | ctxman diagnose --budget 24k
ctxman diagnose --file ci-failure.log --format json
```

### `ctxman search "<query>"`

Search methods and code chunks with BM25, local SQLite vector embeddings, or Reciprocal Rank Fusion (`--hybrid`):

```bash
ctxman search "expire session" --limit 10
ctxman search "sqlite vector cosine similarity" --hybrid
```

### `ctxman ask "<question>"`

Query the local SQLite semantic index (`.ctxman/self-knowledge/index.sqlite`):

```bash
ctxman ask "how does export policy redaction work?"
```

### `ctxman count [path|-]`

Count tokens for a specific LLM model (or verify exact Claude counts via Anthropic's `count_tokens` API):

```bash
ctxman count . --model gpt-5.5
ctxman count . --model claude-opus-5-5 --api --json
```

### `ctxman policy` & `ctxman audit`

Validate `.ctxman/policy.json` Data Shield rules and inspect the SHA-256 export audit trail:

```bash
ctxman policy init
ctxman policy check
ctxman audit --since 7d --limit 20
```

### `ctxman mcp`

Run the 19-tool MCP server (`stdio` or `sse`) or install client configurations:

```bash
ctxman mcp install --client claude-desktop
ctxman mcp install --client claude-code --npx
ctxman mcp --root /path/to/project
```

### `ctxman watch` & `ctxman serve`

Start live file watching or the local REST API server:

```bash
ctxman watch --debounce 1000
ctxman serve --port 3000
```

## MCP Server Tools (19 Tools)

| Tool                    | Key Arguments                                                                                     | Description                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `analyze_codebase`      | `path`                                                                                            | Repository token statistics and file breakdown                                 |
| `generate_context`      | `path`, `template?`, `maxTokens?`                                                                 | Template-driven LLM context                                                    |
| `git_diff`              | `path`, `branch?`                                                                                 | Validated `git diff <branch>`                                                  |
| `search_code`           | `path`, `query`, `type?` (`regex`, `substring`, `ranked`, `semantic`, `hybrid`), `repos?`         | Line search or BM25 / hybrid RRF code-chunk search                             |
| `list_methods`          | `path`, `file?`                                                                                   | Extracted methods per file                                                     |
| `get_symbol`            | `path`, `name`, `file?`, `redact?`                                                                | Full source of a named function, method, or class                              |
| `repo_map`              | `path`, `tokens?`, `focus?`, `repos?`                                                             | PageRank repository map (`ctxman map`)                                         |
| `pr_context`            | `path`, `base?`, `head?`, `budget?`, `style?`                                                     | Pull-request review bundle (`ctxman pr`)                                       |
| `count_tokens`          | `path` or `text`, `model?`, `top?`                                                                | Model-aware token count and context window fit (`ctxman count`)                |
| `explain_history`       | `path`, `target`, `limit?`, `budget?`, `patches?`, `discussions?`, `analyzer?`, `analyzerDb?`     | Git archaeology & institutional citations (`ctxman why`)                       |
| `pack_context`          | `path`, `include?`, `exclude?`, `files?`, `style?`, `compress?`, `budget?`, `repos?`              | Packed codebase document (`ctxman pack`)                                       |
| `focus_context`         | `path`, `file`, `symbol?`, `depth?`, `direction?`, `callGraph?`, `style?`, `compress?`, `budget?` | Directional `N`-hop import & AST symbol call neighborhood (`ctxman focus`)     |
| `check_policy`          | `path`                                                                                            | Effective `.ctxman/policy.json` validation (`ctxman policy`)                   |
| `audit_log`             | `path`, `since?`, `limit?`                                                                        | SHA-256 export audit trail (`ctxman audit`)                                    |
| `ask_codebase`          | `path`, `query`, `limit?`                                                                         | Offline SQLite semantic search (`ctxman ask`)                                  |
| `task_context`          | `path`, `task`, `budget?`, `format?`, `model?`                                                    | Automatic task context bundle with AST call & import neighbors (`ctxman task`) |
| `diagnose_failure`      | `path`, `trace`, `budget?`, `format?`                                                             | Stack-trace root-cause diagnosis with AST call neighbors (`ctxman diagnose`)   |
| `find_experts`          | `path`, `target`, `limit?`, `halfLifeDays?`, `style?`                                             | Blame + recency + CODEOWNERS expert ranking (`ctxman who`)                     |
| `query_knowledge_graph` | `path`, `query?`, `file?`, `depth?`, `limit?`, `refresh?`                                         | Query persistent SQLite knowledge graph and `IncrementalAnalyzer` cache        |

### `query_knowledge_graph` Example Usage

Query file nodes, method declarations, and import/dependency edges directly from `.ctxman/self-knowledge/index.sqlite` and the cached `IncrementalAnalyzer` state:

```json
{
  "name": "query_knowledge_graph",
  "arguments": {
    "path": "/path/to/repo",
    "file": "lib/watch/IncrementalAnalyzer.js",
    "depth": 1,
    "query": "bootstrapSync",
    "limit": 20,
    "refresh": false
  }
}
```

Example response payload:

```json
{
  "path": "/path/to/repo",
  "bootstrapped": false,
  "cached": true,
  "stats": {
    "totalNodes": 42,
    "totalEdges": 68,
    "vectorDocuments": 42,
    "cachedFiles": 5
  },
  "nodes": [
    {
      "path": "lib/watch/IncrementalAnalyzer.js",
      "language": "javascript",
      "bytes": 14820,
      "methods": [
        {
          "name": "bootstrapSync",
          "line": 175,
          "signature": "async bootstrapSync(root = this.projectRoot)"
        }
      ],
      "symbolRefs": 3,
      "unresolvedImports": 0
    }
  ],
  "edges": [
    {
      "from": "lib/watch/IncrementalAnalyzer.js",
      "to": "lib/rag/stores/SqliteVectorStore.js",
      "weight": 1
    }
  ]
}
```

## Programmatic API (`index.js`)

### Installation & Import

```bash
npm install ctxman
```

```javascript
import {
  // Code Intelligence & Agents
  buildRepoGraph,
  buildCallGraph,
  rankFiles,
  renderRepoMap,
  focusContext,
  packContext,
  buildPrContext,
  explainHistory,
  queryAnalyzerCitations,
  findExperts,
  buildTaskContext,
  diagnoseFailure,

  // Search, Symbols, Counting & Offline SQLite RAG
  searchProject,
  hybridSearch,
  getSymbol,
  countForModel,
  askCodebase,
  SqliteVectorStore,
  AutoEmbeddingProvider,
  LocalHashEmbeddingProvider,

  // Multi-Repo Workspace & Governance Policy
  resolveWorkspaceRepos,
  mapWorkspace,
  searchWorkspace,
  packWorkspace,
  loadPolicy,
  Policy,

  // Core v3 Pipeline
  Scanner,
  Analyzer,
  ContextBuilder,
  Reporter,
  CacheManager,
  TokenCalculator,
} from 'ctxman';
```

### Code Intelligence Examples

```javascript
// 1. Ranked Repository Map (with Cross-File AST Symbol Call Graph)
const map = renderRepoMap('/path/to/repo', {
  tokens: 2048,
  focus: ['lib/why/index.js:explainHistory'],
  callGraph: true,
});
console.log(map.output);

// 2. Explain History with Institutional Citations
const why = await explainHistory('/path/to/repo', 'lib/why/index.js:explainHistory', {
  analyzer: true,
  budget: 12000,
});
console.log(why.text);

// 3. Find Domain Experts
const who = await findExperts('/path/to/repo', 'hybrid search RRF', { limit: 5 });
console.log(who.experts);

// 4. Task-Driven Context & Failure Diagnosis
const taskBundle = await buildTaskContext('/path/to/repo', 'add retry backoff', { budget: 32000 });
const diagReport = await diagnoseFailure('/path/to/repo', errorStackText, { budget: 24000 });
```

## REST API (`ctxman serve`)

### Base URL

```text
http://127.0.0.1:3000/api/v1
```

### Endpoints

- `GET /api/v1/docs` — OpenAPI endpoint listing
- `POST /api/v1/analyze` — Analyze repository files and token counts
- `GET /api/v1/methods?file=<path>` — Extract methods for a file or project
- `GET /api/v1/stats` — Cached repository statistics
- `GET /api/v1/diff?since=<ref>` — Git diff analysis (`isValidGitRef` validated)
- `POST /api/v1/context` — Build policy-checked LLM context

## Exit Codes

| Code | Description                                              |
| ---- | -------------------------------------------------------- |
| `0`  | Success                                                  |
| `1`  | General or runtime error                                 |
| `2`  | Invalid CLI arguments or `--max-tokens` budget exceeded  |
| `3`  | Export policy violation (`.ctxman/policy.json` deny/cap) |

---

Need help? Check the [ADR Catalog](/adr), [Knowledge Graph](/knowledge-graph), or open an [issue on GitHub](https://github.com/hakkisagdic/ctxman/issues).

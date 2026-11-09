# Features

Ctxman is a local-first AI Code Intelligence & Context Engineering Platform designed for modern developer and agent workflows.

## 🧠 Code Intelligence & Archaeology (v3.2)

### Repository Map & Neighborhood Focus (`map` & `focus`)

- **PageRank Repository Map & AST Call Graph (`ctxman map`)**: Ranks files across 14+ languages using PageRank over the import graph blended with git change frequency, symbol references, and cross-file AST symbol call edges (`--call-graph`, `--focus file:symbol`), fitting function signatures into any token budget
- **Directional Import & Symbol Call Focus (`ctxman focus`)**: Packs a target file or symbol (`<file>:<symbol>`) together with its `N`-hop outgoing imports/callees and incoming importers/callers (`--direction both|imports|importers`, `--calls-only`, `--callers-only`, including intra-file helper closures and barrel re-exports) without shared-hub explosion
- **Multi-Repo Workspaces (`--repo <dir>`)**: Merge multiple repositories under `<alias>/<path>` namespaces within a single shared token budget across `map`, `search`, `pack`, `focus`, `task`, `diagnose`, and `watch` with cross-repo import and AST symbol call-graph traversal (`buildWorkspaceGraph`)

```bash
# Ranked repository map with cross-file AST symbol call annotations
ctxman map --tokens 2000 --call-graph

# 1-hop AST symbol call & import neighborhood around a function
ctxman focus lib/why/index.js:explainHistory --depth 1 --budget 16k
```

### Code Archaeology (`why`) & Expert Finder (`who`)

- **Why Is the Code Like This? (`ctxman why`)**: Explains any file, symbol (`file:symbol`), or line range (`file#L10-L40`) using git history, PR/issue references, remote GitHub/GitLab discussions (`--discussions`), `@plansmithai/analyzer` SQLite institutional citations (`--analyzer-db`), blame ownership, co-change coupling, ADRs, TODOs, and tests
- **Who Knows About This? (`ctxman who`)**: Ranks domain experts by fusing surviving `git blame -w` line ownership (`0.45`), exponentially decayed commit history (`0.35`, 90-day half-life), total commit share (`0.20`), and `CODEOWNERS` stewardship (`+0.15`), with automatic BM25 topic-to-file resolution

```bash
# Explain a function with institutional memory citations
ctxman why lib/why/index.js:explainHistory --analyzer

# Find top experts for a file, symbol, directory, or topic
ctxman who "hybrid search RRF"
```

### Task Context (`task`), Failure Diagnosis (`diagnose`) & PR Review (`pr`)

- **Task-Driven Auto Context (`ctxman task`)**: Discovers seed files and symbols via hybrid BM25 + vector search, prioritizes 1-hop cross-file AST symbol callers/callees (plus import neighbors) as full code and 2-hop compressed signatures, and prepends an architectural repo map within `--budget` (default `32000`)
- **Stack-Trace Root-Cause Bundle (`ctxman diagnose`)**: Parses Node/TS/JS, Python, Go, Rust, Java, C#, and Vitest stack traces, extracting enclosing methods, 1-hop AST symbol call & import neighbors (`caller -> callee`), and recent git commits (`explainHistory`) within `--budget` (default `24000`)
- **Pull Request Context (`ctxman pr`)**: Assembles branch summary, commit log, changed methods, unified diff, and related tests for code review

```bash
ctxman task "add OAuth token refresh retry logic" --budget 32k
ctxman task "fix invoice checkout webhook" --repo ../billing-api --repo ../checkout-web
npm test 2>&1 | ctxman diagnose --budget 20k
ctxman diagnose "Error at billing-api/src/invoice.js:3:10" --repo ../checkout-web
ctxman pr --base main --budget 24k
```

### Offline SQLite RAG & Hybrid Search (`search` & `ask`)

- **Zero-Native-Binary `SqliteVectorStore`**: Built on Node.js 22/24 `node:sqlite` (`DatabaseSync`) with SHA-256 incremental indexing in `.ctxman/self-knowledge/index.sqlite`
- **Offline `AutoEmbeddingProvider`**: Uses `@xenova/transformers` when installed and falls back automatically to deterministic 256-dim `LocalHashEmbeddingProvider`
- **Reciprocal Rank Fusion (`ctxman search --hybrid`)**: Fuses BM25 code-chunk ranking (`k1 = 1.5, b = 0.75`) with semantic vector similarity (`1 / (k + rank)`)

### 19-Tool MCP Server (`ctxman mcp`)

- **One-Command Client Setup**: `ctxman mcp install --client claude-desktop|claude-code|cursor|vscode|windsurf`
- **19 Specialized Tools**: `analyze_codebase`, `generate_context`, `git_diff`, `search_code`, `list_methods`, `get_symbol`, `repo_map`, `pr_context`, `count_tokens`, `explain_history`, `pack_context`, `focus_context`, `check_policy`, `audit_log`, `ask_codebase`, `task_context`, `diagnose_failure`, `find_experts`, and `query_knowledge_graph`
- **Root Sandbox (`--root <dir>`)**: Confines every tool, resource, prompt, multi-repo path, and analyzer DB path to the sandbox directory

## 🚀 Platform Features

### Plugin Architecture

Ctxman features a modular plugin system that makes it easy to extend and customize:

- **Language Plugins**: Add support for new programming languages
- **Exporter Plugins**: Create custom output formats
- **Analyzer Plugins**: Extend analysis capabilities
- **Easy Integration**: Simple API for creating plugins

```javascript
// Example plugin structure
export default {
  name: 'my-plugin',
  type: 'language',
  extensions: ['.xyz'],
  analyze: async (content, filePath) => {
    // Custom analysis logic
  },
};
```

### Git Integration

Seamlessly integrate with your Git workflow:

- **Changed Files Analysis**: Analyze only modified files
- **Diff Analysis**: Compare changes between commits
- **Author Tracking**: Track code contributions
- **Branch Comparison**: Compare branches

```bash
# Analyze changed files since a ref
ctxman --changed-since HEAD~1

# Build full PR review context against main
ctxman pr --base main
```

### Watch Mode

Real-time file monitoring for instant feedback:

- **Auto-Analysis**: Automatically re-analyze on file changes
- **Live Updates**: See results instantly
- **Configurable Intervals**: Set custom debounce timing
- **Selective Watching**: Watch specific directories

```bash
# Start watch mode
ctxman watch

# Watch with specific options
ctxman watch --debounce 1000

# Cross-repo live watch with SQLite RAG & knowledge graph sync
ctxman watch --repo ../shared-lib --repo ../api-service --bootstrap
```

### REST API

HTTP server for programmatic access:

- **6 Endpoints**: Full API coverage
- **JSON Responses**: Standard REST format
- **DNS Rebinding Protection**: Loopback Host validation by default (`--cors` when needed)
- **Health Check**: Monitor server status

```bash
# Start API server
ctxman serve --port 3000
```

## 🎨 User Interface

### Interactive Wizard Mode

User-friendly guided setup for beginners:

- **Step-by-Step Process**: Clear guidance through options
- **6 Built-In Profiles**: Code Review, Security Audit, LLM Explain, Documentation, Minimal, Full
- **Input Validation**: Catch errors early
- **Help Text**: Contextual help at every step

### CLI Mode

Traditional command-line interface for power users:

- **Direct Commands**: Skip the wizard
- **Shell Integration**: Perfect for scripts and CI pipelines
- **Exit Codes**: Proper error handling (including policy exit code `3` and budget guard exit code `2`)
- **Piping Support**: Clean `EPIPE` handling when piped to `head` or other tools

## 🔢 Token Analysis

### Exact Token Counting

Accurate token counting for LLM planning:

- **Per model**: `--target-model` picks the encoding (`o200k_base` for current OpenAI models,
  `cl100k_base` otherwise); counts for models with their own tokenizer are marked approximate
- **Exact for Claude**: `ctxman count --model claude-opus-5-5 --api` asks Anthropic's
  count_tokens API (free; secrets are redacted first)
- **Current models**: `ctxman --list-llms` lists windows, output limits and prices of 44+ models
- **Per-File & Per-Method Analysis**: Detailed breakdown

### Multi-Language Support

Analyze code in 14+ programming languages:

| Language   | Extensions      | Features                     |
| ---------- | --------------- | ---------------------------- |
| JavaScript | .js, .jsx, .mjs | Full AST & method analysis   |
| TypeScript | .ts, .tsx       | Type-aware analysis          |
| Python     | .py             | Method-level analysis        |
| PHP        | .php            | Class and function analysis  |
| Ruby       | .rb             | Module and method analysis   |
| Java       | .java           | Class and method analysis    |
| Kotlin     | .kt             | Function analysis            |
| C#         | .cs             | Class and method analysis    |
| Go         | .go             | Function & receiver analysis |
| Rust       | .rs             | Function and struct analysis |
| Swift      | .swift          | Function analysis            |
| C/C++      | .c, .cpp, .h    | Function analysis            |
| Scala      | .scala          | Class and function analysis  |

## 🎯 Filtering, Policy & Governance

### Dual Ignore System & AI Tool Ignore Files

- **.gitignore Support**: Respect Git ignore rules
- **.contextignore / .contextinclude**: Custom exclude or include-only patterns
- **.methodinclude / .methodignore**: Granular method-level filtering
- **--respect-ignore-files**: Honor `.cursorignore`, `.aiexclude`, `.aiderignore`, and more

### Export Policy & Data Shield (`.ctxman/policy.json`)

- **Path Deny Rules**: Prevent sensitive files from ever entering exports, RAG indexes, or MCP responses
- **Automatic Secret Redaction**: Masks cloud keys, tokens, and PEM private keys as `[REDACTED:<type>]`
- **Token Caps & Model Allowlists**: Enforce organization-wide export limits (`CTXMAN_POLICY`)
- **Append-Only Audit Trail (`ctxman audit`)**: Records every export with timestamp, command, file count, token count, and SHA-256 digest

## 📊 Output Formats

- **Anthropic `<documents>` XML (`ctxman pack`)**: Structured LLM-ready context with `--compress` signature extraction
- **TOON Format**: 40-50% token reduction with official `@toon-format/toon` encoding
- **GitIngest Format**: Single-file or smart-chunked Markdown digest
- **JSON, Markdown, YAML, CSV, XML**: Ready for automation and CI pipelines

---

Ready to get started? Check out our [Getting Started Guide](/getting-started), browse the [ADR Catalog](/adr) and [Knowledge Graph](/knowledge-graph), or try the [Interactive Demo](/demo).

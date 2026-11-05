# Changelog

All notable changes to Ctxman are documented on this page.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

For the complete changelog, see [CHANGELOG.md](https://github.com/hakkisagdic/ctxman/blob/main/CHANGELOG.md) on GitHub.

## [3.2.0] - 2026-10-30

### Added

- **Zero-Native-Binary `SqliteVectorStore` & `AutoEmbeddingProvider`**:
  - `SqliteVectorStore` using Node.js 22/24 built-in `node:sqlite` (`DatabaseSync`), storing chunks, metadata, float32 vector embeddings, and knowledge graph nodes/edges in `<storePath>/index.sqlite` with SHA-256 incremental upsert and exact cosine similarity search
  - `LocalHashEmbeddingProvider`: deterministic 256-dimensional L2-normalized feature-hashing over identifier tokens and character trigrams (zero dependencies, 100% offline)
  - `AutoEmbeddingProvider`: uses `@xenova/transformers` when installed and falls back automatically to `LocalHashEmbeddingProvider`
- **Incremental Watch RAG & Knowledge Graph Sync (`ctxman watch`)**:
  - `IncrementalAnalyzer` synchronizes modified and deleted files into `SqliteVectorStore` in real time during watch mode: re-chunks and upserts vectors for changed files, updates `graph_nodes` and `graph_edges` import relationships, and prunes removed files while enforcing `.ctxman/policy.json` deny rules and secret redaction
- **Knowledge Graph MCP Tool (`query_knowledge_graph` — 19-Tool MCP Server)**:
  - Queries the live in-memory `IncrementalAnalyzer` graph cache when active and automatically falls back to persisted `SqliteVectorStore` `graph_nodes` and `graph_edges` tables in `.ctxman/rag-index/index.sqlite` for directional `N`-hop neighborhood traversal (`direction: "both" | "imports" | "importers"`, `depth: 1..5`), symbol filtering, and top-degree hub ranking
- **Task-Driven Auto Context (`ctxman task` + `buildTaskContext` + MCP `task_context`)**:
  - Discovers seed files and symbols via `hybridSearch`, gathers 1-hop full code and 2-hop compressed signatures, and renders a ranked `renderRepoMap` architectural overview within `--budget` (default `32000`)
- **Failure / Stack-Trace Root-Cause Bundle (`ctxman diagnose` + `diagnoseFailure` + MCP `diagnose_failure`)**:
  - Parses stack trace frames across Node/TS/JS, Python, Go, Rust, Java, C#, and Vitest, extracting enclosing methods, 1-hop graph neighbors, and recent git history (`explainHistory`) within `--budget` (default `24000`)
- **Expert Finder (`ctxman who` + `findExperts` + MCP `find_experts`)**:
  - Ranks code and domain experts across files, symbols (`file:symbol`), line ranges (`file#L10-L40`), directories, and natural-language topics by fusing surviving `git blame -w` line share (`0.45`), recency-decayed commits (`0.35`, 90-day half-life), total commits (`0.20`), and `CODEOWNERS` stewardship (`+0.15`)
- **Institutional Memory Bridge (`ctxman why --analyzer-db` / `--analyzer` + MCP `explain_history`)**:
  - Queries `@plansmithai/analyzer`'s SQLite `documents` table (`.plansmith/analyzer.sqlite`) for commits, PRs, issues, Slack, Linear, and Jira citations with automatic secret redaction and MCP `--root` sandbox enforcement
- **Focused Import Neighborhood (`ctxman focus` + `focusContext` + MCP `focus_context`)**:
  - Directional `N`-hop import/importer traversal (`--direction both|imports|importers`) avoiding shared-hub explosion
- **Multi-Repository Workspace (`--repo <dir>`) & Hybrid Search (`ctxman search --hybrid`)**:
  - Cross-repo `map`, `search`, and `pack` under `<alias>/<path>` namespaces and Reciprocal Rank Fusion (`BM25 + semantic`)
- **Architecture Decision Records & Cross-Repo Knowledge Graph**:
  - Published [ADR Catalog](/adr) (`ADR-001`, `ADR-002`, `ADR-003`) and [Knowledge Graph](/knowledge-graph) (3,881 nodes, 3,566 vectors, 7 cross-repo edges) with `query_knowledge_graph` Mermaid architecture flowcharts

## [3.1.1] - 2026-10-15

### Added

- **MCP Governance & RAG Tools**: Added `check_policy`, `audit_log`, and `ask_codebase` to `ctxman mcp`
- **Node 24 CI & GitHub Actions**: Upgraded GitHub Actions workflows to Node 24 majors

### Fixed

- Enforced `.gitignore`, `.contextignore`, and `.ctxman/policy.json` deny rules and secret redaction across `ctxman ask` indexing and retrieval

## [3.1.0] - 2026-10-14

### Added

- **Code Intelligence Commands**:
  - `ctxman map` (`renderRepoMap`, MCP `repo_map`): PageRank over the 14-language import graph blended with git change frequency and symbol references
  - `ctxman pack` (`packContext`, MCP `pack_context`): single LLM-ready document (`xml`, `markdown`, `plain`, `json`) with `--compress` and `--budget`
  - `ctxman pr` (`buildPrContext`, MCP `pr_context`): branch/staged/worktree PR review bundle with changed methods, unified diff, and related tests
  - `ctxman why` (`explainHistory`, MCP `explain_history`): git archaeology across commits, PR/issue references, `--discussions`, blame ownership, co-change coupling, ADRs/docs, TODOs, and tests
  - `ctxman search` (`searchProject`, MCP `search_code` / `get_symbol`): BM25 ranked search over methods and code chunks with identifier splitting
  - `ctxman count` (`countForModel`, MCP `count_tokens`): exact OpenAI (`o200k_base`) and Anthropic (`--api`) token counting across 44+ LLM profiles
  - `ctxman mcp`: 1-command installer (`ctxman mcp install --client claude-desktop|claude-code|cursor|vscode|windsurf`) and `--root` sandbox
  - `ctxman policy` & `ctxman audit`: `.ctxman/policy.json` Data Shield (path deny rules, required secret redaction, token caps, model allowlists, and SHA-256 export audit log)

## [3.0.0] - 2025-11-05

### Added

- **Plugin Architecture**: Modular, extensible system for languages and exporters
- **Git Integration**: Analyze changed files, diff analysis, author tracking
- **Watch Mode**: Real-time file monitoring and auto-analysis
- **REST API**: HTTP server with 6 endpoints for programmatic access
- **Caching System**: Intelligent cache for 5-10x faster repeated analyses
- **Parallel Processing**: Multi-core utilization for large codebases
- **TOON Format**: 40-50% token reduction for LLM optimization
- **Interactive Wizard**: User-friendly guided setup (default mode)
- **TypeScript Definitions**: Full type support for programmatic API

## [2.3.7] - 2025-11-05

### Added

- LLM optimization features and automatic model detection
- Token budgeting tools and context window fit analysis

## [2.3.0] - 2025-11-02

### Added

- Method-level token analysis
- GitIngest format support and smart chunking
- Multiple output formats (TOON, JSON, YAML, Markdown, CSV, XML, GitIngest)

## [2.0.0] - 2025-10-13

### Added

- Multi-language support (14+ languages)
- AST-based and regex method analysis
- Tiktoken integration for exact token counting

---

## Version History

| Version | Date       | Highlights                                                                                                                                     |
| ------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 3.2.0   | 2026-10-30 | `SqliteVectorStore`, `ctxman task`, `ctxman diagnose`, `ctxman who`, `ctxman focus`, `watch` graph sync, 19-tool MCP (`query_knowledge_graph`) |
| 3.1.1   | 2026-10-15 | MCP `check_policy`, `audit_log`, `ask_codebase`, RAG policy enforcement                                                                        |
| 3.1.0   | 2026-10-14 | `map`, `pack`, `pr`, `why`, `search`, `count`, `policy`, `audit`, `mcp install`, 44+ LLM profiles                                              |
| 3.0.0   | 2025-11-05 | Plugin architecture, Git integration, REST API, Watch mode                                                                                     |
| 2.3.7   | 2025-11-05 | LLM auto-detection, token budgeting                                                                                                            |
| 2.3.0   | 2025-11-02 | TOON format, smart GitIngest chunking, Ink UI                                                                                                  |
| 2.0.0   | 2025-10-13 | Modular architecture refactoring, 14+ language support                                                                                         |

## Roadmap

### Delivered in v3.1 – v3.2

- **19-Tool MCP Server & Client Installer**: Native integration for Claude Desktop, Claude Code, Cursor, VS Code, and Windsurf (`ctxman mcp`), including `query_knowledge_graph`
- **Offline SQLite RAG, Hybrid Search & Live Watch Graph Sync**: Zero-native-binary `node:sqlite` vector & knowledge-graph index + Reciprocal Rank Fusion (`ctxman search --hybrid`, `ctxman ask`, `ctxman watch`)
- **Code Archaeology & Expert Finder**: `ctxman why` (with GitHub/GitLab discussions and `@plansmithai/analyzer` citations) and `ctxman who`
- **Task & Failure Agents**: `ctxman task` and `ctxman diagnose`
- **3-Pillar Ecosystem Integration**: Cross-repository knowledge graph with `plansmith` and `plansmith-desktop` ([ADR Catalog](/adr), [Knowledge Graph](/knowledge-graph))

### Next Up

- **Cross-Repo Live Watch Daemon**: Multi-repository file watcher synchronizing `<alias>/<path>` graph edges across sibling repositories
- **Fine-Grained AST Symbol Call Graph**: Cross-file function-to-function call edges alongside module import edges in `ctxman map` and `ctxman focus`

### Contributing

We welcome contributions! See the [Contributing Guide](https://github.com/hakkisagdic/ctxman/blob/main/CONTRIBUTING.md) to get started.

### Support

- **Documentation**: [Getting Started](/getting-started)
- **Architecture & ADRs**: [ADR Catalog](/adr) · [Knowledge Graph](/knowledge-graph)
- **Issues**: [GitHub Issues](https://github.com/hakkisagdic/ctxman/issues)
- **Discussions**: [GitHub Discussions](https://github.com/hakkisagdic/ctxman/discussions)

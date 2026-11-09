# Changelog

All notable changes to Ctxman are documented on this page.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

For the complete changelog, see [CHANGELOG.md](https://github.com/hakkisagdic/ctxman/blob/main/CHANGELOG.md) on GitHub.

## [3.2.6] - 2026-11-09

### Added

- **Multi-Repo Code Archaeology, PR Review, Policy Validation & Audit Logs (`why --repo`, `pr --repo`, `policy check --repo`, `audit --repo`)**:
  - `ctxman why --repo <dir>` (`explainHistory` `options.repos` & MCP `explain_history` `repos`): resolves `<alias>/<path>[:symbol|#Lstart-Lend]` targets across workspace repositories (including from a non-git parent directory), runs git history, blame ownership, and co-change coupling in the target file's owning repository, discovers cross-repository ADRs, changelogs, docs, code comments, and tests under `<alias>/<path>`, and enforces per-repo `.ctxman/policy.json` deny rules
  - `ctxman pr --repo <dir>` (`buildPrContext` `options.repos` & MCP `pr_context` `repos`): merges commits (tagged with `[<alias>]` / `repo`), `<alias>/<path>`-namespaced changed files, changed/deleted methods, unified diffs, and related tests across repositories under one shared token budget, skipping sibling repositories missing a branch/ref with a warning while enforcing per-repo policies
  - `ctxman policy check --repo <dir>` (`checkWorkspacePolicies` & MCP `check_policy` `repos`): validates `.ctxman/policy.json` and `CTXMAN_POLICY` across all workspace repositories without early abort, reporting per-repo status/errors and computing effective workspace-wide limits (`requireRedaction`, minimum `maxExportTokens`, intersected `allowedTargetModels`)
  - `ctxman audit --repo <dir>` (`readWorkspaceAuditLogs` & MCP `audit_log` `repos`): merges and deduplicates export audit logs across workspace repositories in chronological order with a `REPO` table column and `repo` JSON field (rejecting `--file` + `--repo` with exit code `2`), exported from `ctxman` with TypeScript definitions in `index.d.ts`

## [3.2.5] - 2026-11-09

### Added

- **Multi-Repo Expert Finder, Semantic Ask & Symbol Lookup (`who --repo`, `ask --repo`, `get_symbol`)**:
  - `ctxman who --repo <dir>` (`findExperts` `options.repos` & MCP `find_experts` `repos`): resolves `<alias>/<path>[:symbol|#Lstart-Lend]`, directory, and BM25 topic targets across multiple repositories, aggregates surviving `git blame -w` share, recency-decayed commits, and `CODEOWNERS` stewardship per author, and enforces per-repo `.ctxman/policy.json` deny rules
  - `ctxman ask --repo <dir>` (`askCodebase` `options.repos` & MCP `ask_codebase` `repos`): indexes and queries chunks across multiple workspace repositories in the local SQLite semantic vector store (`.ctxman/self-knowledge/index.sqlite`) under `<alias>/<path>` namespaces with per-repo policy enforcement and secret redaction
  - `getSymbol` `options.repos` & MCP `get_symbol` `repos`: resolves functions, methods, and classes across multiple repositories under `<alias>/<path>` (and optional `file: "<alias>/<path>"` filtering) with fuzzy cross-repo suggestions

### Fixed

- Hardened subprocess and workspace tests under heavy CPU load (`MultiRepoManager.generateRepoId` monotonic ID generation, direct subcommand spawning in `test/workspace-multi-repo.test.js`, and 60s Vitest timeouts)

## [3.2.4] - 2026-11-09

### Added

- **Multi-Repo Neighborhood Focus, Task Context & Failure Diagnosis (`buildWorkspaceGraph`, `focus --repo`, `task --repo`, `diagnose --repo`)**:
  - Added and exported `buildWorkspaceGraph` in `lib/workspace/index.js`, uniting intra-repo imports, cross-repo package/alias/relative imports (`<alias>/...`, `@<alias>/...`, `@<scope>/<alias>/...`, `<pkgName>/...`, and sibling relative paths), and cross-repository AST symbol call graph edges (`<aliasA>/<path>:caller -> <aliasB>/<path>:callee` via `buildCallGraph`)
  - `ctxman focus --repo <dir>` (`focusContext` `options.repos` & MCP `focus_context` `repos`): resolves `<alias>/<path>[:symbol]` targets across workspace repositories, traverses cross-repo import and symbol call-graph neighborhoods, and packs results via `packWorkspace` with per-repo `enforceWorkspacePolicies`
  - `ctxman task --repo <dir>` (`buildTaskContext` `options.repos` & MCP `task_context` `repos`): combines `searchWorkspace` seed discovery, `buildWorkspaceGraph` 1-hop and 2-hop cross-repo call/import expansion, and `mapWorkspace` architectural overview under a shared token budget
  - `ctxman diagnose --repo <dir>` (`diagnoseFailure` `options.repos` & MCP `diagnose_failure` `repos`): resolves stack trace frames across multiple repositories, collects 1-hop cross-repo call/import neighbors, and queries `explainHistory` git history in each implicated file's owning repository

## [3.2.3] - 2026-11-09

### Added

- **Cross-Repo Live Watch & Knowledge Graph Synchronization (`ctxman watch --repo`, `FileWatcher`, `IncrementalAnalyzer`, MCP `query_knowledge_graph`)**:
  - Added multi-repository workspace support (`options.repos`) to `FileWatcher` and `IncrementalAnalyzer`, namespacing watched files, SQLite RAG embeddings, and knowledge graph nodes under `<alias>/<path>`
  - Resolved cross-repository import edges (`<aliasA>/<file> -> <aliasB>/<file>`) across `@<alias>/...`, `<alias>/...`, `@<scope>/<alias>/...`, and relative sibling paths alongside cross-repo symbol reference scoring (`symbolRefs`)
  - Enforced per-repository `.ctxman/policy.json` deny rules (`isPathDenied`) and gitignore rules across all watched repositories, and added repeatable `--repo <dir>` to `ctxman watch` and `repos` to MCP `query_knowledge_graph`

### Fixed

- Stabilized macOS `FSEvents` debounce settle handling in watch integration tests (`test/ignore-rules-integration.test.js`)

## [3.2.2] - 2026-11-05

### Added

- **Cross-File AST Symbol Call Graph (`buildCallGraph`, `map`, `focus`, `task`, `diagnose`)**:
  - Added `lib/map/call-graph.js` (`buildCallGraph`, `extractFileCallSites`, `extractCallsFromSource`, `stripCommentsAndStrings`) to extract comment/string-stripped symbol call sites per method and resolve cross-file `caller -> callee` edges across direct imports, 1-hop barrel re-exports (`index.js` / `index.ts`), and unique repository-wide symbols
  - `ctxman map`: added `-c, --call-graph` and `--focus <file:symbol>` support, annotating mapped methods with `-> path:callee`, rendering `file:caller -> file:callee` in `--graph --call-graph` and dashed call edges in `--style dot --call-graph`, and personalizing PageRank toward direct symbol call neighbors (weight `0.85`)
  - `ctxman focus`: added `<file>:<symbol>`, `-s, --symbol`, `--calls-only`, `--callers-only`, and `--calls` / `--no-calls` (plus MCP `focus_context` `symbol` and `callGraph` parameters), traversing intra-file helper closures and cross-file symbol call edges while prioritizing direct symbol call neighbors under token budgets
  - `ctxman task` & `ctxman diagnose`: prioritized 1-hop and 2-hop cross-file AST symbol call edges (including intra-file helper closures and barrel re-exports) in `buildTaskContext` and `diagnoseFailure`, added `--calls` / `--no-calls` CLI flags, and annotated `## Related 1-Hop Neighborhood` in diagnosis reports with `caller -> callee` relationships

### Fixed

- Added `buildCallGraph` TypeScript declaration to `index.d.ts`

## [3.2.1] - 2026-11-05

### Added

- **Incremental Watch RAG & Knowledge Graph Sync (`ctxman watch`)**:
  - `IncrementalAnalyzer` synchronizes modified and deleted files into `SqliteVectorStore` in real time during watch mode: re-chunks and upserts vectors for changed files, updates `graph_nodes` and `graph_edges` import relationships, and prunes removed files while enforcing `.ctxman/policy.json` deny rules and secret redaction
- **Knowledge Graph MCP Tool (`query_knowledge_graph` — 19-Tool MCP Server)**:
  - Queries the live in-memory `IncrementalAnalyzer` graph cache when active and automatically falls back to persisted `SqliteVectorStore` `graph_nodes` and `graph_edges` tables in `.ctxman/rag-index/index.sqlite` for directional `N`-hop neighborhood traversal (`direction: "both" | "imports" | "importers"`, `depth: 1..5`), symbol filtering, and top-degree hub ranking
- **MCP `explain_history` Institutional Memory Parity**:
  - Added `analyzer` and `analyzerDb` options to the `explain_history` MCP tool with `--root` sandbox enforcement
- **Architecture Decision Records & Cross-Repo Knowledge Graph Documentation**:
  - Published [ADR Catalog](/adr) (`ADR-001`, `ADR-002`, `ADR-003`) and [Knowledge Graph](/knowledge-graph) (3,881 nodes, 3,566 vectors, 7 cross-repo edges) with `query_knowledge_graph` Mermaid architecture flowcharts and API reference examples

### Fixed

- Isolated LLM auto-detection environment variables in tests and stabilized broken-pipe timeout handling

## [3.2.0] - 2026-10-30

### Added

- **Zero-Native-Binary `SqliteVectorStore` & `AutoEmbeddingProvider`**:
  - `SqliteVectorStore` using Node.js 22/24 built-in `node:sqlite` (`DatabaseSync`), storing chunks, metadata, and float32 vector embeddings in `<storePath>/index.sqlite` with SHA-256 incremental upsert and exact cosine similarity search
  - `LocalHashEmbeddingProvider`: deterministic 256-dimensional L2-normalized feature-hashing over identifier tokens and character trigrams (zero dependencies, 100% offline)
  - `AutoEmbeddingProvider`: uses `@xenova/transformers` when installed and falls back automatically to `LocalHashEmbeddingProvider`
- **Task-Driven Auto Context (`ctxman task` + `buildTaskContext` + MCP `task_context`)**:
  - Discovers seed files and symbols via `hybridSearch`, gathers 1-hop full code and 2-hop compressed signatures, and renders a ranked `renderRepoMap` architectural overview within `--budget` (default `32000`)
- **Failure / Stack-Trace Root-Cause Bundle (`ctxman diagnose` + `diagnoseFailure` + MCP `diagnose_failure`)**:
  - Parses stack trace frames across Node/TS/JS, Python, Go, Rust, Java, C#, and Vitest, extracting enclosing methods, 1-hop graph neighbors, and recent git history (`explainHistory`) within `--budget` (default `24000`)
- **Expert Finder (`ctxman who` + `findExperts` + MCP `find_experts`)**:
  - Ranks code and domain experts across files, symbols (`file:symbol`), line ranges (`file#L10-L40`), directories, and natural-language topics by fusing surviving `git blame -w` line share (`0.45`), recency-decayed commits (`0.35`, 90-day half-life), total commits (`0.20`), and `CODEOWNERS` stewardship (`+0.15`)
- **Institutional Memory Bridge (`ctxman why --analyzer-db` / `--analyzer`)**:
  - Queries `@plansmithai/analyzer`'s SQLite `documents` table (`.plansmith/analyzer.sqlite`) for commits, PRs, issues, Slack, Linear, and Jira citations with automatic secret redaction
- **Focused Import Neighborhood (`ctxman focus` + `focusContext` + MCP `focus_context`)**:
  - Directional `N`-hop import/importer traversal (`--direction both|imports|importers`) avoiding shared-hub explosion
- **Multi-Repository Workspace (`--repo <dir>`) & Hybrid Search (`ctxman search --hybrid`)**:
  - Cross-repo `map`, `search`, and `pack` under `<alias>/<path>` namespaces and Reciprocal Rank Fusion (`BM25 + semantic`)

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

| Version | Date       | Highlights                                                                                                                                 |
| ------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 3.2.6   | 2026-11-09 | Multi-repo `why`, `pr`, `policy check`, and `audit` (`--repo` / MCP `repos`, `checkWorkspacePolicies`, `readWorkspaceAuditLogs`)           |
| 3.2.5   | 2026-11-09 | Multi-repo `who`, `ask`, and `get_symbol` (`--repo` / MCP `repos`) plus load-hardened subprocess test suite                                |
| 3.2.4   | 2026-11-09 | Multi-repo `focus`, `task`, and `diagnose` (`--repo` / MCP `repos`) with cross-repo AST symbol call & import graph (`buildWorkspaceGraph`) |
| 3.2.3   | 2026-11-09 | Cross-repo live watch (`ctxman watch --repo`) and multi-root SQLite knowledge graph & RAG sync (`query_knowledge_graph` `repos`)           |
| 3.2.2   | 2026-11-05 | Cross-file AST symbol call graph (`buildCallGraph`, `map --call-graph`, `focus file:symbol`, `task` & `diagnose` call edges)               |
| 3.2.1   | 2026-11-05 | `watch` incremental RAG & knowledge graph sync, 19-tool MCP (`query_knowledge_graph`), ADR Catalog & Knowledge Graph pages                 |
| 3.2.0   | 2026-10-30 | `SqliteVectorStore`, `ctxman task`, `ctxman diagnose`, `ctxman who`, `ctxman focus`, 18-tool MCP                                           |
| 3.1.1   | 2026-10-15 | MCP `check_policy`, `audit_log`, `ask_codebase`, RAG policy enforcement                                                                    |
| 3.1.0   | 2026-10-14 | `map`, `pack`, `pr`, `why`, `search`, `count`, `policy`, `audit`, `mcp install`, 44+ LLM profiles                                          |
| 3.0.0   | 2025-11-05 | Plugin architecture, Git integration, REST API, Watch mode                                                                                 |
| 2.3.7   | 2025-11-05 | LLM auto-detection, token budgeting                                                                                                        |
| 2.3.0   | 2025-11-02 | TOON format, smart GitIngest chunking, Ink UI                                                                                              |
| 2.0.0   | 2025-10-13 | Modular architecture refactoring, 14+ language support                                                                                     |

## Roadmap

### Delivered in v3.1 – v3.2.6

- **Multi-Repo Code Archaeology, PR Review, Policy & Audit**: Cross-repository `ctxman why --repo`, `ctxman pr --repo`, `ctxman policy check --repo`, and `ctxman audit --repo` (plus `checkWorkspacePolicies`, `readWorkspaceAuditLogs`, and MCP `explain_history` / `pr_context` / `check_policy` / `audit_log` `repos` support)

- **Multi-Repo Expert Finder, Semantic Ask & Symbol Lookup**: Cross-repository `ctxman who --repo`, `ctxman ask --repo`, and MCP `find_experts` / `ask_codebase` / `get_symbol` `repos` support

- **Multi-Repo Focus, Task & Diagnose Agents**: Cross-repository import and AST symbol call-graph traversal (`buildWorkspaceGraph`) across `ctxman focus --repo`, `ctxman task --repo`, and `ctxman diagnose --repo` (and MCP `repos`)

- **Cross-Repo Live Watch & Knowledge Graph Sync**: Multi-repository file watcher (`ctxman watch --repo <dir>`) and `IncrementalAnalyzer` synchronizing `<alias>/<path>` nodes, cross-repo import edges, and SQLite RAG embeddings

- **Cross-File AST Symbol Call Graph**: Function-to-function call site extraction and cross-file resolution across `ctxman map --call-graph`, `ctxman focus <file>:<symbol>`, `ctxman task`, and `ctxman diagnose`
- **19-Tool MCP Server & Client Installer**: Native integration for Claude Desktop, Claude Code, Cursor, VS Code, and Windsurf (`ctxman mcp`), including `query_knowledge_graph`
- **Offline SQLite RAG, Hybrid Search & Live Watch Graph Sync**: Zero-native-binary `node:sqlite` vector & knowledge-graph index + Reciprocal Rank Fusion (`ctxman search --hybrid`, `ctxman ask`, `ctxman watch`)
- **Code Archaeology & Expert Finder**: `ctxman why` (with GitHub/GitLab discussions and `@plansmithai/analyzer` citations) and `ctxman who`
- **Task & Failure Agents**: `ctxman task` and `ctxman diagnose`
- **3-Pillar Ecosystem Integration**: Cross-repository knowledge graph with `plansmith` and `plansmith-desktop` ([ADR Catalog](/adr), [Knowledge Graph](/knowledge-graph))

### Contributing

We welcome contributions! See the [Contributing Guide](https://github.com/hakkisagdic/ctxman/blob/main/CONTRIBUTING.md) to get started.

### Support

- **Documentation**: [Getting Started](/getting-started)
- **Architecture & ADRs**: [ADR Catalog](/adr) · [Knowledge Graph](/knowledge-graph)
- **Issues**: [GitHub Issues](https://github.com/hakkisagdic/ctxman/issues)
- **Discussions**: [GitHub Discussions](https://github.com/hakkisagdic/ctxman/discussions)

# Unblocked Analysis & Feature Parity Matrix

## 🎯 Overview

Unblocked connects source code with git history and external institutional knowledge sources (GitHub/GitLab PRs & review threads, Linear, Jira, Slack, docs) to answer **why** code looks the way it does, **who** owns a subsystem, and **what** context is needed for a task or failure.

In our unified 3-pillar ecosystem (`ctxman` + `@plansmithai/analyzer` in `plansmith` + `plansmith-desktop`), every core Unblocked capability is now implemented locally and offline-first (zero mandatory cloud lock-in).

---

## 🌟 Feature Parity Status (v3.2+)

### 1. Core Platform & Knowledge Graph

| Feature                           | Unblocked                             | Our 3-Pillar Ecosystem (`ctxman` + `@plansmithai/analyzer`)                                                                                | Status          |
| :-------------------------------- | :------------------------------------ | :----------------------------------------------------------------------------------------------------------------------------------------- | :-------------- |
| **Code Indexing**                 | ✅ Git-based                          | ✅ Exact token counts, AST/method chunks, PageRank `ctxman map`, directional `ctxman focus`                                                | **✅ Complete** |
| **External Data Sources**         | ✅ GitHub/GitLab, Jira, Linear, Slack | ✅ `@plansmithai/analyzer` (`github` issues/PRs/reviews/diffs, `gitlab`, `jira`, `linear`, `slack`) bridged via `ctxman why --analyzer-db` | **✅ Complete** |
| **Vector Search (RAG)**           | ✅ Semantic Search                    | ✅ Zero-dependency `SqliteVectorStore` (`node:sqlite`), `LocalHashEmbeddingProvider` + Transformers.js, BM25 + Semantic RRF `hybridSearch` | **✅ Complete** |
| **Data Shield / Export Policy**   | ✅ Permission-aware answers           | ✅ `.ctxman/policy.json` (`ctxman policy`, secret redaction, path deny rules, token caps, model allowlists)                                | **✅ Complete** |
| **Cross-Entity Relational Graph** | ✅ Links commits ↔ PRs ↔ tickets      | ✅ `@plansmithai/analyzer` `buildGraph` + 1-hop/multi-hop neighbor expansion + `hydrate_url`                                               | **✅ Complete** |

### 2. Specialized Agents

| Feature                          | Unblocked                       | `ctxman` Implementation                                                                                                                                        | Status          |
| :------------------------------- | :------------------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------------- |
| **Task Context Agent**           | ✅ Automatic task context       | ✅ `ctxman task "<goal>"` & MCP `task_context` (hybrid search + PageRank import neighborhood + recent commits + tests)                                         | **✅ Complete** |
| **Failure / CI Diagnosis Agent** | ✅ Analyzes stack traces & logs | ✅ `ctxman diagnose` & MCP `diagnose_failure` (stack frame parser + enclosing symbols + recent touching commits)                                               | **✅ Complete** |
| **PR / Code Review Agent**       | ✅ Automated PR review context  | ✅ `ctxman pr` & MCP `pr_context` + `plansmith` `mode-review` / `verify-core`                                                                                  | **✅ Complete** |
| **Code Archaeology ("Why?")**    | ✅ Explains historical intent   | ✅ `ctxman why <target>` & MCP `explain_history` (commits, renames, co-change coupling, discussions, `@plansmithai/analyzer` SQLite citations)                 | **✅ Complete** |
| **Expert Finder ("Who?")**       | ✅ "Who knows about this?"      | ✅ `ctxman who <target-or-topic>` & MCP `find_experts` (surviving git blame + exponential recency-decayed commit/churn + `CODEOWNERS` + BM25 topic resolution) | **✅ Complete** |

### 3. Security & Governance

| Feature                        | Unblocked         | `ctxman` Implementation                                                           | Status          |
| :----------------------------- | :---------------- | :-------------------------------------------------------------------------------- | :-------------- |
| **Local / Air-Gapped Privacy** | ⚠️ Cloud SaaS     | ✅ 100% local execution by default (`node:sqlite` + local git + secret redaction) | **✅ Complete** |
| **Audit Logs**                 | ✅ Usage tracking | ✅ `ctxman audit` & MCP `audit_log` (append-only SHA-256 export audit trail)      | **✅ Complete** |

### 4. Interfaces

| Feature                    | Unblocked            | Our 3-Pillar Ecosystem                                                                                                                         | Status          |
| :------------------------- | :------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------- | :-------------- |
| **MCP Server**             | ✅ IDE/Agent MCP     | ✅ 18-tool `ctxman mcp`, 15-tool `@plansmithai/mcp`, 43-tool `plansmith_a2a` (`smith mcp`), 2-tool `plansmith-browser` (`smith mcp --browser`) | **✅ Complete** |
| **Web Dashboard**          | ✅ Management & Chat | ✅ `plansmith/apps/web` (Next.js dashboard, Deep Wiki, Foundry, i18n EN/TR)                                                                    | **✅ Complete** |
| **IDE Extension**          | ✅ VS Code           | ✅ `plansmith/apps/extension` (23 commands, offline cache, `@-references`, EN/TR i18n, `AGENTS.md`)                                            | **✅ Complete** |
| **Native Mac Desktop App** | ✅ macOS App         | ✅ `plansmith-desktop` (`clients/desktop` Electron + `clients/gui-app` + `@plansmith/host` daemon + `smith` CLI)                               | **✅ Complete** |

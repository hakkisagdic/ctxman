# Unblocked Analysis & Feature Parity Matrix

## 🎯 Overview

Unblocked connects source code with git history and external institutional knowledge sources (GitHub/GitLab PRs and review threads, Linear, Jira, Slack, docs) to answer **why** code looks the way it does, **who** owns a subsystem, and **what** context is needed for a task or failure.

ctxman does not implement every core Unblocked capability. Its own code only fetches, through git and the GitHub or GitLab REST API, the titles and first comments of issues and pull requests named in commits (`lib/why/discussions.js`, option `--discussions`). Slack, Jira, Linear, Notion and Sentry data live in the separate repository plansmith (package `@plansmithai/analyzer`). ctxman only bridges them by reading that package's `.plansmith/analyzer.sqlite` file (`lib/why/analyzer-bridge.js`). It does not read chat or a wiki. That is the same boundary as `website/tr/compare.md`.

---

## 🌟 Feature Parity Status (v3.2+)

### 1. Core Platform & Knowledge Graph

| Feature                           | Unblocked                             | Our 3-Pillar Ecosystem (`ctxman` + `@plansmithai/analyzer`)                                                                                                                                                                                                                                                                                                                              | Status          |
| :-------------------------------- | :------------------------------------ | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------------- |
| **Code Indexing**                 | ✅ Git-based                          | ✅ Exact token counts, AST/method chunks, PageRank `ctxman map`, directional `ctxman focus`                                                                                                                                                                                                                                                                                              | **✅ Complete** |
| **External Data Sources**         | ✅ GitHub/GitLab, Jira, Linear, Slack | Partly. `--discussions` fetches, via git and the GitHub or GitLab REST API, titles and the first comments of issues and PRs named in commits (`lib/why/discussions.js`). Slack, Jira, Linear, Notion and Sentry live in plansmith (`@plansmithai/analyzer`); ctxman only reads `.plansmith/analyzer.sqlite` (`lib/why/analyzer-bridge.js`). Pull-request review threads are not fetched. | **Partly**      |
| **Vector Search (RAG)**           | ✅ Semantic Search                    | ✅ Zero-dependency `SqliteVectorStore` (`node:sqlite`), `LocalHashEmbeddingProvider` + Transformers.js, BM25 + Semantic RRF `hybridSearch`                                                                                                                                                                                                                                               | **✅ Complete** |
| **Data Shield / Export Policy**   | ✅ Permission-aware answers           | ✅ `.ctxman/policy.json` (`ctxman policy`, secret redaction, path deny rules, token caps, model allowlists)                                                                                                                                                                                                                                                                              | **✅ Complete** |
| **Cross-Entity Relational Graph** | ✅ Links commits ↔ PRs ↔ tickets      | Partly. ctxman has no `buildGraph` or `hydrate_url`. Jira, Linear and other ticket links exist only as rows plansmith already stored; ctxman reads matching documents from `.plansmith/analyzer.sqlite` (`lib/why/analyzer-bridge.js`).                                                                                                                                                  | **Partly**      |

### 2. Specialized Agents

| Feature                          | Unblocked                       | `ctxman` Implementation                                                                                                                                                                                                                                                                               | Status          |
| :------------------------------- | :------------------------------ | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------------- |
| **Task Context Agent**           | ✅ Automatic task context       | ✅ `ctxman task "<goal>"` & MCP `task_context` (hybrid search + PageRank import neighborhood + recent commits + tests)                                                                                                                                                                                | **✅ Complete** |
| **Failure / CI Diagnosis Agent** | ✅ Analyzes stack traces & logs | ✅ `ctxman diagnose` & MCP `diagnose_failure` (stack frame parser + enclosing symbols + recent touching commits)                                                                                                                                                                                      | **✅ Complete** |
| **PR / Code Review Agent**       | ✅ Automated PR review context  | Partly for review comments. `ctxman pr` and MCP `pr_context` build local review context from the diff. They do not fetch GitHub or GitLab pull-request review comments. Slack, Jira and Linear review context is not read here; plansmith `mode-review` / `verify-core` live in the other repository. | **Partly**      |
| **Code Archaeology ("Why?")**    | ✅ Explains historical intent   | Partly. `ctxman why` covers commits, renames, co-change and blame from git. `--discussions` adds only GitHub/GitLab titles and first comments (`lib/why/discussions.js`), not pull-request review threads. Slack, Jira and Linear appear only through `.plansmith/analyzer.sqlite`.                   | **Partly**      |
| **Expert Finder ("Who?")**       | ✅ "Who knows about this?"      | ✅ `ctxman who <target-or-topic>` & MCP `find_experts` (surviving git blame + exponential recency-decayed commit/churn + `CODEOWNERS` + BM25 topic resolution)                                                                                                                                        | **✅ Complete** |

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

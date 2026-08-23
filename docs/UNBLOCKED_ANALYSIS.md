# Unblocked Analysis & Feature Roadmap

## 🎯 What is Unblocked?

Unblocked is an AI-powered development assistant that connects source code with external knowledge sources (Slack, Linear, Confluence, GitHub) to provide **deep context**. Unlike standard AI coding tools that only see the code in your editor, Unblocked understands _why_ the code was written that way by referencing discussions, tickets, and docs.

## 🌟 Feature Breakdown (Gap Analysis)

We have analyzed the Unblocked documentation and identified the following key feature sets.

### 1. Core Platform & Knowledge Graph

| Feature                   | Unblocked                                         | Ctxman (Us)                | Status                |
| :------------------------ | :------------------------------------------------ | :------------------------- | :-------------------- |
| **Code Indexing**         | ✅ Git-based                                      | ✅ Advanced (Exact tokens) | **Done**              |
| **External Data Sources** | ✅ Slack, Jira, Linear, Notion, Drive, Confluence | ❌ None                    | **Critical Priority** |
| **Vector Search (RAG)**   | ✅ Semantic Search                                | ⚠️ Basic Regex only        | **Critical Priority** |
| **Data Shield**           | ✅ Permission-aware answers (ACLs)                | ❌ None                    | **High Priority**     |
| **Identity Linking**      | ✅ Map users across platforms (Slack <-> GitHub)  | ❌ None                    | **Medium Priority**   |

### 2. Specialized Agents

| Feature               | Unblocked                           | Ctxman (Us)             | Status              |
| :-------------------- | :---------------------------------- | :---------------------- | :------------------ |
| **PR Failure Agent**  | ✅ Analyzes CI logs, suggests fixes | ❌ None                 | **High Priority**   |
| **Code Review Agent** | ✅ Automated PR reviews             | ❌ None                 | **High Priority**   |
| **Expert Finder**     | ✅ "Who knows about this?"          | ❌ Basic Git Blame only | **Medium Priority** |

### 3. Enterprise & Security

| Feature            | Unblocked             | Ctxman (Us)         | Status                 |
| :----------------- | :-------------------- | :------------------ | :--------------------- |
| **SSO / RBAC**     | ✅ SAML, Okta, Google | ❌ None             | **Low Priority (MVP)** |
| **Incognito Mode** | ✅ Private questions  | ❌ N/A (Local only) | **N/A**                |
| **Audit Logs**     | ✅ Usage tracking     | ⚠️ Basic Telemetry  | **Low Priority**       |

### 4. Interfaces

| Feature            | Unblocked             | Ctxman (Us)                   | Status              |
| :----------------- | :-------------------- | :---------------------------- | :------------------ |
| **Web Dashboard**  | ✅ Management & Chat  | ❌ CLI only                   | **Medium Priority** |
| **IDE Extensions** | ✅ VSCode, JetBrains  | ❌ None                       | **High Priority**   |
| **Mac App**        | ✅ Native Desktop App | ⚠️ `desktop-app` (Incomplete) | **Medium Priority** |
| **Slack Bot**      | ✅ Conversational Bot | ❌ None                       | **Medium Priority** |

---

## 🗺️ Execution Roadmap

### Phase 1: The Engine (Architecture Refactor)

**Goal:** Enable ingestion of non-code data.

- [ ] **Refactor `PluginManager`:** Support `DataSourcePlugin` interface.
- [ ] **Implement Vector Store:** Integrate a local vector database (e.g., LanceDB) for semantic search.
- [ ] **Universal Indexer:** Unified interface to index Code + Docs + Issues.

### Phase 2: The Connectors (Data Sources)

**Goal:** Connect the most popular tools.

- [ ] **GitHub Issues/PRs Plugin:** Fetch context from PR descriptions and comments.
- [ ] **Slack Plugin:** Ingest public channel history.
- [ ] **Linear/Jira Plugin:** Index tickets and specs.

### Phase 3: The Intelligence (Agents)

**Goal:** Active assistance, not just passive chat.

- [ ] **Build "PR Failure Agent":**
  - Input: CI Log
  - Process: Analyze error -> Search Context -> Suggest Fix
  - Output: Comment on PR
- [ ] **Build "Code Review Agent":**
  - Input: Git Diff
  - Process: Style check + Bug hunt + Context verification
  - Output: Line-level comments

### Phase 4: The Interface (Consumption)

**Goal:** Meet the developer where they are.

- [ ] **Enhance MCP Server:** Serve rich context to Cursor/Claude.
- [ ] **VSCode Extension:** Lightweight wrapper around the MCP server.

---

## 🛠️ Implementation Strategy

We are using a multi-agent approach to accelerate development:

1.  **Agent A (Architecture):** Focus on `PluginManager` and `DataSource` interfaces.
2.  **Agent B (RAG Engine):** Focus on `VectorStore` implementation and Embedding generation.
3.  **Agent C (Features):** Focus on specific agents like `PR Failure Agent`.

**Current Status:**

- Agent A is currently analyzing `PluginManager`.
- Agent B (RAG) is queuing for launch.
- Agent C (PR Agent) is queuing for launch.

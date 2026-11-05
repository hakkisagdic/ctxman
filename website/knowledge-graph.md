---
title: Cross-Repo Knowledge Graph & Expert Map
description: Unified 3-repository hybrid knowledge graph (3,881 nodes, 3,566 semantic vectors), live SQLite query_knowledge_graph MCP architecture, and ctxman who expert map across ctxman, plansmith, and plansmith-desktop.
---

<!--@include: ../docs/adr/knowledge-graph.md-->

---

## `query_knowledge_graph` MCP Tool Architectural Flow

The `query_knowledge_graph` tool in `MCPServer` (`lib/api/mcp/server.js`) provides direct, policy-enforced access to the persistent SQLite knowledge graph (`.ctxman/self-knowledge/index.sqlite`) and the per-project `IncrementalAnalyzer` cache (`lib/watch/IncrementalAnalyzer.js`).

```mermaid
flowchart TD
  Client["MCP Client / Agent"] -->|"CallTool: query_knowledge_graph"| Sandbox["resolveSandboxPath & Scanner.getPolicy()"]
  Sandbox --> Cache["MCPServer.getIncrementalAnalyzer(projectPath)"]
  Cache --> Ready["IncrementalAnalyzer.ensureSyncReady()"]
  Ready --> Check{"refresh === true OR\ngraphCounts().nodes === 0?"}
  Check -->|"Yes (bootstrapped = true)"| Boot["IncrementalAnalyzer.bootstrapSync(projectPath)\nScan files -> redactSecrets -> syncGraph()"]
  Check -->|"No (bootstrapped = false)"| Store[("SqliteVectorStore\n.ctxman/self-knowledge/index.sqlite\ngraph_nodes & graph_edges")]
  Boot --> Store
  Store --> FilterPolicy["Filter denied nodes & edges\nScanner.isDenied(path)"]
  FilterPolicy --> FilterArgs["Apply file + depth (1..4 hop BFS),\nquery (path/method/signature), and limit"]
  FilterArgs --> Response["Return JSON Payload\n{ bootstrapped, cached, stats, nodes, edges }"]
```

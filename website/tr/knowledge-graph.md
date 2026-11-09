---
title: Çapraz-Depo Bilgi Grafiği ve Uzman Haritası
description: ctxman, plansmith ve plansmith-desktop depolarını kapsayan 3.881 düğümlü hibrit bilgi grafiği, query_knowledge_graph MCP mimari akışı ve ctxman who uzman haritası özeti.
---

<!--@include: ../../docs/adr/knowledge-graph.md-->

---

## `query_knowledge_graph` MCP Aracı Mimari Akış Diyagramı

`MCPServer` (`lib/api/mcp/server.js`) içindeki `query_knowledge_graph` aracı, kalıcı SQLite bilgi grafiğine (`.ctxman/self-knowledge/index.sqlite`) ve `IncrementalAnalyzer` önbelleğine (`lib/watch/IncrementalAnalyzer.js`) politika korumalı doğrudan erişim sağlar; hem tekli projeleri hem de `<alias>/<path>` altında çoklu depo çalışma alanlarını (`repos` / `ctxman watch --repo <dir>`) destekler.

```mermaid
flowchart TD
  Client["MCP İstemcisi / Ajan"] -->|"CallTool: query_knowledge_graph"| Sandbox["resolveSandboxPath & Scanner.getPolicy()"]
  Sandbox --> Cache["MCPServer.getIncrementalAnalyzer(projectPath, repos)"]
  Cache --> Ready["IncrementalAnalyzer.ensureSyncReady()"]
  Ready --> Check{"refresh === true VEYA\ngraphCounts().nodes === 0?"}
  Check -->|"Evet (bootstrapped = true)"| Boot["IncrementalAnalyzer.bootstrapSync(projectPath)\nDosya tarama -> redactSecrets -> syncGraph()"]
  Check -->|"Hayır (bootstrapped = false)"| Store[("SqliteVectorStore\n.ctxman/self-knowledge/index.sqlite\ngraph_nodes & graph_edges")]
  Boot --> Store
  Store --> FilterPolicy["Engellenen düğüm ve kenarları filtrele\nScanner.isDenied(path)"]
  FilterPolicy --> FilterArgs["file + depth (1..4 hop BFS),\nquery (yol/metot/imza) ve limit uygula"]
  FilterArgs --> Response["JSON Yanıtı Döndür\n{ bootstrapped, cached, stats, nodes, edges }"]
```

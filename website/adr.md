---
title: Architecture Decision Records (ADRs)
description: Evidence-grounded Architecture Decision Records synthesized via ctxman why --analyzer-db and Evren LLM over the 3-repository knowledge graph.
---

# Architecture Decision Records (ADRs)

This section documents the architectural decisions of the 3-pillar ecosystem (**`ctxman`** · **`plansmith`** · **`plansmith-desktop`**). Each ADR is synthesized from Git commit history, surviving `git blame -w` ownership, co-change coupling, and cross-repository hybrid knowledge graph citations via `ctxman why --analyzer-db` and the **Evren (`evren/auto`)** LLM through the Keysmith gateway (`127.0.0.1:8787/v1`).

> Canonical Markdown copies live in [`docs/adr/`](https://github.com/hakkisagdic/ctxman/tree/main/docs/adr) in the repository.

## Directory

| Document                                                                                                                                                                   | Pillar & Target Module                                                  | Summary                                                                                                                                                             |
| :------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [**Cross-Repo Knowledge Graph & Expert Map**](/knowledge-graph)                                                                                                            | All 3 Pillars (`.plansmith/analyzer.sqlite`)                            | Unified SQLite FTS5 + semantic vector index (**3,881 nodes**, **3,566 vectors**, **7 cross-repo edges**) and `ctxman who` expert scores across 6 target scopes      |
| [**ADR-001 · Expert Finder & 18-Tool MCP**](#adr-001-ctxman-uzman-bulucu-ctxman-who-findexperts-ve-18-araclik-mcp-sunucu-mimarisi)                                         | Pillar 1 · `ctxman` (`lib/who/index.js`)                                | Weighted expert scoring combining `git blame -w`, exponential recency decay (`halfLifeDays = 90`), `CODEOWNERS`, and BM25 topic resolution exposed via 18 MCP tools |
| [**ADR-002 · Hybrid Graph & Keysmith/Evren RAG**](#adr-002-plansmithai-analyzer-3-depo-birlesik-hibrit-bilgi-grafigi-ve-keysmith-evren-rag-sentezleyicisi)                 | Pillar 2 · `plansmith` (`packages/analyzer/src/synthesize.ts`)          | Grounded citation-backed `[n]` RAG synthesis over the 3-repository knowledge graph via Keysmith/Evren with deterministic fallback                                   |
| [**ADR-003 · 43+2 MCP & Traycer 1.5.1 Electron IPC Parity**](#adr-003-plansmith-desktop-43-2-a2a-browser-mcp-orkestrasyonu-ve-traycer-1-5-1-birebir-electron-ipc-paritesi) | Pillar 3 · `plansmith-desktop` (`host/src/mcp/plansmith-a2a-server.ts`) | `PlansmithA2aServer` JSON-RPC 2.0 orchestration (`43` A2A + `2` Browser MCP tools) and 1:1 Electron `runnerHost` (`327/327`) & IPC (`258/258`) parity               |

---

## Reproducing the Knowledge Graph & ADRs

```bash
# 1. Index all 3 repositories into a single SQLite (FTS5 + vector) database
plansmith-analyzer ingest \
  --repo /path/to/ctxman \
  --repo /path/to/plansmith \
  --repo /path/to/plansmith-desktop \
  --db .plansmith/analyzer.sqlite --chunk --semantic --namespace

# 2. Export the unified cross-repository knowledge graph
plansmith-analyzer export-graph \
  --db .plansmith/analyzer.sqlite \
  --out .plansmith/cross-repo-knowledge-graph.json

# 3. Synthesize evidence-grounded history + institutional citations
ctxman why lib/who/index.js --analyzer-db .plansmith/analyzer.sqlite
```

---

<!--@include: ../docs/adr/ADR-001-ctxman-who-and-18-tool-mcp.md-->

---

<!--@include: ../docs/adr/ADR-002-plansmith-analyzer-keysmith-evren-rag.md-->

---

<!--@include: ../docs/adr/ADR-003-plansmith-desktop-43-mcp-and-electron-parity.md-->

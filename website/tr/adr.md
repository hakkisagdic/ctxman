---
title: Mimari Karar Günlükleri (ADR)
description: ctxman why --analyzer-db ve Keysmith/Evren LLM ile 3-depo hibrit bilgi grafiği üzerinden otomatik sentezlenen Mimari Karar Günlükleri (ADR).
---

# Mimari Karar Günlükleri (ADR)

Bu bölüm, 3 sütunlu ekosistemin (**`ctxman`** · **`plansmith`** · **`plansmith-desktop`**) mimari kararlarını kalıcı dokümantasyon olarak sunar. ADR'ler, `ctxman why --analyzer-db` ile toplanan Git geçmişi/blame sahipliği ve birleşik hibrit bilgi grafiği atıfları üzerinden Keysmith geçidi (`127.0.0.1:8787/v1`) aracılığıyla **Evren (`evren/auto`)** modeliyle otomatik sentezlenmiştir.

> Kalıcı Markdown kopyaları depoda [`docs/adr/`](https://github.com/hakkisagdic/ctxman/tree/main/docs/adr) dizininde tutulur.

## Dizin

| Belge                                                                                                                                                                              | Sütun & Hedef Modül                                                    | Kapsam                                                                                                                                                          |
| :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [**Çapraz-Depo Bilgi Grafiği & Uzman Haritası**](/tr/knowledge-graph)                                                                                                              | 3 Sütun (`.plansmith/analyzer.sqlite`)                                 | Birleşik SQLite FTS5 + semantik vektör indeksi (**3.881 düğüm**, **3.566 vektör**, **7 çapraz bağ**) ve 6 kapsam için `ctxman who` uzmanlık skorları            |
| [**ADR-001 · Uzman Bulucu (`ctxman who`) ve 18 Araçlık MCP**](#adr-001-ctxman-uzman-bulucu-ctxman-who-findexperts-ve-18-araclik-mcp-sunucu-mimarisi)                               | Sütun 1 · `ctxman` (`lib/who/index.js`)                                | `git blame -w`, üstel zaman aşınmalı (`halfLifeDays = 90`) commit geçmişi, `CODEOWNERS` ve BM25 konu çözümlemesini birleştiren 18 araçlık MCP mimarisi          |
| [**ADR-002 · Hibrit Bilgi Grafiği ve Keysmith/Evren RAG**](#adr-002-plansmithai-analyzer-3-depo-birlesik-hibrit-bilgi-grafigi-ve-keysmith-evren-rag-sentezleyicisi)                | Sütun 2 · `plansmith` (`packages/analyzer/src/synthesize.ts`)          | 3-depo birleşik bilgi grafiği üzerinde Keysmith/Evren aracılığıyla kaynak atıflı `[n]` RAG sentezi ve deterministik geri dönüş                                  |
| [**ADR-003 · 43+2 MCP Orkestrasyonu ve Traycer 1.5.1 IPC Paritesi**](#adr-003-plansmith-desktop-43-2-a2a-browser-mcp-orkestrasyonu-ve-traycer-1-5-1-birebir-electron-ipc-paritesi) | Sütun 3 · `plansmith-desktop` (`host/src/mcp/plansmith-a2a-server.ts`) | `PlansmithA2aServer` JSON-RPC 2.0 orkestrasyonu (`43` A2A + `2` Browser MCP aracı) ve Traycer 1.5.1 ile 1:1 `runnerHost` (`327/327`) & IPC (`258/258`) paritesi |

---

<!--@include: ../../docs/adr/ADR-001-ctxman-who-and-18-tool-mcp.md-->

---

<!--@include: ../../docs/adr/ADR-002-plansmith-analyzer-keysmith-evren-rag.md-->

---

<!--@include: ../../docs/adr/ADR-003-plansmith-desktop-43-mcp-and-electron-parity.md-->

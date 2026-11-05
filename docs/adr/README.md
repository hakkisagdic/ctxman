# Mimari Karar Günlükleri (ADR)

Bu dizin, 3 sütunlu ekosistemin (`ctxman` · `plansmith` · `plansmith-desktop`) mimari
kararlarını kalıcı dokümantasyon olarak tutar. ADR'ler, `ctxman why --analyzer-db`
ile toplanan git geçmişi/blame sahipliği ve birleşik hibrit bilgi grafiği atıfları
üzerinden Keysmith geçidi (`127.0.0.1:8787/v1`) üzerinden Evren (`evren/auto`)
modeliyle otomatik sentezlenmiştir.

> `.plansmith/` dizini yerel çalışma zamanı çıktısıdır (`.gitignore`'da) ve
> yeniden üretilebilir. Kalıcı kopyalar bu dizinde tutulur.

## Dizin

| Belge                                                                                                                | Kapsam                                                                                                      |
| :------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------- |
| [`ADR_CATALOG.md`](ADR_CATALOG.md)                                                                                   | Üç ADR'nin tamamını ve kesişen kararları bir arada sunan katalog                                            |
| [`ADR-001-ctxman-who-and-18-tool-mcp.md`](ADR-001-ctxman-who-and-18-tool-mcp.md)                                     | Sütun 1 · `ctxman` uzman bulucu (`ctxman who` / `findExperts`) ve 18 araçlık MCP mimarisi                   |
| [`ADR-002-plansmith-analyzer-keysmith-evren-rag.md`](ADR-002-plansmith-analyzer-keysmith-evren-rag.md)               | Sütun 2 · `@plansmithai/analyzer` 3 depo birleşik hibrit bilgi grafiği ve Keysmith/Evren RAG sentezleyicisi |
| [`ADR-003-plansmith-desktop-43-mcp-and-electron-parity.md`](ADR-003-plansmith-desktop-43-mcp-and-electron-parity.md) | Sütun 3 · `plansmith-desktop` 43+2 A2A/Browser MCP orkestrasyonu ve Traycer 1.5.1 Electron IPC paritesi     |
| [`knowledge-graph.md`](knowledge-graph.md)                                                                           | Çapraz-depo hibrit bilgi grafiği özeti (3.881 düğüm, 3.566 vektör)                                          |

## Yeniden Üretim

```bash
# 3 depoyu tek SQLite (FTS5 + vektör) indeksine yaz
plansmith-analyzer ingest \
  --repo /path/to/ctxman \
  --repo /path/to/plansmith \
  --repo /path/to/plansmith-desktop \
  --db .plansmith/analyzer.sqlite --chunk --semantic --namespace

# Birleşik grafiği dışa aktar
plansmith-analyzer export-graph \
  --db .plansmith/analyzer.sqlite \
  --out .plansmith/cross-repo-knowledge-graph.json

# Kanıta dayalı geçmiş + atıflarla ADR sentezi
ctxman why lib/who/index.js --analyzer-db .plansmith/analyzer.sqlite
```

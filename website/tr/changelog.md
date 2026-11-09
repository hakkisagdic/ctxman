# Değişiklik Günlüğü

Ctxman'daki tüm önemli değişiklikler bu sayfada belgelenmiştir.

Format [Keep a Changelog](https://keepachangelog.com/tr/1.0.0/) tabanlıdır,
ve bu proje [Semantic Versioning](https://semver.org/spec/v2.0.0.html) takip eder.

Tam değişiklik günlüğü için GitHub'da [CHANGELOG.md](https://github.com/hakkisagdic/ctxman/blob/main/CHANGELOG.md) dosyasına bakın.

## [3.2.4] - 2026-11-09

### Eklendi

- **Çoklu Depo Odaklı Komşuluk, Görev Bağlamı ve Hata Teşhisi (`buildWorkspaceGraph`, `focus --repo`, `task --repo`, `diagnose --repo`)**:
  - `lib/workspace/index.js` içinde depo içi import'ları, depolar arası paket/alias/göreli import'ları (`<alias>/...`, `@<alias>/...`, `@<scope>/<alias>/...`, `<pkgName>/...` ve kardeş dizin yolları) ve depolar arası AST sembol çağrı kenarlarını (`buildCallGraph` ile `<aliasA>/<path>:caller -> <aliasB>/<path>:callee`) birleştiren `buildWorkspaceGraph` eklendi ve dışa aktarıldı
  - `ctxman focus --repo <dir>` (`focusContext` `options.repos` ve MCP `focus_context` `repos`): çalışma alanı depoları genelinde `<alias>/<path>[:symbol]` hedeflerini çözümler, depolar arası import ve sembol çağrı komşuluklarını dolaşır ve `enforceWorkspacePolicies` ile paketler
  - `ctxman task --repo <dir>` (`buildTaskContext` `options.repos` ve MCP `task_context` `repos`): `searchWorkspace` tohum keşfini, `buildWorkspaceGraph` 1-hop ve 2-hop çapraz depo çağrı/import genişletmesini ve `mapWorkspace` mimari özetini tek bir paylaşılan token bütçesinde birleştirir
  - `ctxman diagnose --repo <dir>` (`diagnoseFailure` `options.repos` ve MCP `diagnose_failure` `repos`): yığın izi (stack trace) çerçevelerini birden fazla depoda çözümler, 1-hop çapraz depo çağrı/import komşularını toplar ve her dosyanın kendi deposundaki `explainHistory` git geçmişini sorgular

## [3.2.3] - 2026-11-09

### Eklendi

- **Çapraz Depo Canlı İzleme ve Bilgi Grafiği Senkronizasyonu (`ctxman watch --repo`, `FileWatcher`, `IncrementalAnalyzer`, MCP `query_knowledge_graph`)**:
  - `FileWatcher` ve `IncrementalAnalyzer` modüllerine çoklu depo çalışma alanı desteği (`options.repos`) eklendi; izlenen dosyalar, SQLite RAG vektörleri ve bilgi grafiği düğümleri `<alias>/<path>` altında isimlendirildi
  - `@<alias>/...`, `<alias>/...`, `@<scope>/<alias>/...` ve göreli kardeş dizin yolları üzerinden depolar arası import kenarları (`<aliasA>/<file> -> <aliasB>/<file>`) ve çapraz depo sembol referans puanlaması (`symbolRefs`) çözümlendi
  - İzlenen tüm depolarda depo bazlı `.ctxman/policy.json` engelleme kuralları (`isPathDenied`) ve gitignore kuralları zorunlu kılındı; `ctxman watch` için tekrarlanabilir `--repo <dir>` ve MCP `query_knowledge_graph` için `repos` desteği eklendi

### Düzeltildi

- İzleme entegrasyon testlerinde (`test/ignore-rules-integration.test.js`) macOS `FSEvents` gecikme (debounce) kararlılığı iyileştirildi

## [3.2.2] - 2026-11-05

### Eklendi

- **Dosyalar Arası AST Sembol Çağrı Grafiği (`buildCallGraph`, `map`, `focus`, `task`, `diagnose`)**:
  - Yorum ve dizgilerden arındırılmış fonksiyon çağrı noktalarını çıkaran ve doğrudan import'lar, 1-hop barrel re-export'lar (`index.js` / `index.ts`) ve depo genelinde benzersiz semboller üzerinden dosyalar arası `caller -> callee` kenarlarını çözümleyen `lib/map/call-graph.js` (`buildCallGraph`, `extractFileCallSites`, `extractCallsFromSource`, `stripCommentsAndStrings`) eklendi
  - `ctxman map`: `-c, --call-graph` ve `--focus <file:symbol>` desteği, fonksiyon satırlarında `-> path:callee` açıklamaları, `--graph --call-graph` altında `file:caller -> file:callee` çıktısı, `--style dot --call-graph` içinde kesikli çağrı kenarları ve doğrudan sembol çağrı komşularına (`0.85` ağırlık) PageRank kişiselleştirmesi eklendi
  - `ctxman focus`: `<file>:<symbol>`, `-s, --symbol`, `--calls-only`, `--callers-only` ve `--calls` / `--no-calls` (ve MCP `focus_context` `symbol` ve `callGraph` parametreleri) ile dosya içi yardımcı fonksiyon kapanışı ve dosyalar arası sembol çağrı gezintisi eklendi
  - `ctxman task` ve `ctxman diagnose`: `buildTaskContext` ve `diagnoseFailure` içinde 1-hop ve 2-hop dosyalar arası AST sembol çağrı kenarlarına öncelik verildi, `--calls` / `--no-calls` CLI bayrakları ve teşhis raporlarında `## Related 1-Hop Neighborhood` altında `caller -> callee` açıklamaları eklendi

### Düzeltildi

- `index.d.ts` dosyasına `buildCallGraph` TypeScript bildirimi eklendi

## [3.2.1] - 2026-11-05

### Eklendi

- **İzleme Modunda Artımlı RAG ve Bilgi Grafiği Senkronizasyonu (`ctxman watch`)**:
  - `IncrementalAnalyzer`, izleme modunda değişen ve silinen dosyaları gerçek zamanlı olarak `SqliteVectorStore` ile senkronize eder: değişen dosyaların vektörlerini yeniden hesaplayıp upsert eder, `graph_nodes` ve `graph_edges` import komşuluklarını günceller ve silinen dosyaları temizlerken `.ctxman/policy.json` erişim kurallarını ve sır maskelemeyi uygular
- **Bilgi Grafiği MCP Aracı (`query_knowledge_graph` — 19 Araçlı MCP Sunucusu)**:
  - Aktif olduğunda bellek içi `IncrementalAnalyzer` grafik önbelleğini sorgular; önbellek yoksa `.ctxman/rag-index/index.sqlite` içindeki kalıcı `SqliteVectorStore` `graph_nodes` ve `graph_edges` tablolarına otomatik geri döner (`direction: "both" | "imports" | "importers"`, `depth: 1..5`, sembol filtreleme ve en yüksek dereceli hub sıralaması)
- **MCP `explain_history` Kurumsal Hafıza Eşliği**:
  - `explain_history` MCP aracına `--root` sandbox doğrulamasıyla birlikte `analyzer` ve `analyzerDb` parametreleri eklendi
- **Mimari Karar Kayıtları (ADR) ve Çapraz Depo Bilgi Grafiği Dokümantasyonu**:
  - [ADR Kataloğu](/tr/adr) (`ADR-001`, `ADR-002`, `ADR-003`) ve [Bilgi Grafiği](/tr/knowledge-graph) (3.881 düğüm, 3.566 vektör, 7 çapraz depo kenarı) ile `query_knowledge_graph` Mermaid mimari akış diyagramları ve API referans örnekleri yayınlandı

### Düzeltildi

- Testlerde LLM otomatik algılama ortam değişkenleri izole edildi ve broken-pipe zaman aşımı kararlılığı iyileştirildi

## [3.2.0] - 2026-10-30

### Eklendi

- **Sıfır Native Bağımlılıklı `SqliteVectorStore` ve `AutoEmbeddingProvider`**:
  - Node.js 22/24 yerleşik `node:sqlite` (`DatabaseSync`) kullanan `SqliteVectorStore`; SHA-256 artımlı upsert ve kosinüs benzerlik araması ile `<storePath>/index.sqlite` içinde çalışır
  - `LocalHashEmbeddingProvider`: tanımlayıcı token'ları ve karakter trigram'ları üzerinde deterministik 256 boyutlu L2-normalize özellik özetleme (sıfır bağımlılık, %100 çevrimdışı)
  - `AutoEmbeddingProvider`: `@xenova/transformers` kuruluysa kullanır, aksi halde otomatik olarak `LocalHashEmbeddingProvider`'a geçer
- **Görev Odaklı Otomatik Bağlam (`ctxman task` + `buildTaskContext` + MCP `task_context`)**:
  - `hybridSearch` ile tohum dosya ve sembolleri keşfeder, 1-hop tam kod ve 2-hop sıkıştırılmış imzaları `renderRepoMap` mimari özetiyle `--budget` (varsayılan `32000`) içinde birleştirir
- **Hata / Stack-Trace Kök Neden Paketi (`ctxman diagnose` + `diagnoseFailure` + MCP `diagnose_failure`)**:
  - Node/TS/JS, Python, Go, Rust, Java, C# ve Vitest yığın izlerini ayrıştırır; çevreleyen fonksiyonları, 1-hop komşulukları ve yakın git geçmişini (`explainHistory`) `--budget` (varsayılan `24000`) içinde toplar
- **Uzman Bulucu (`ctxman who` + `findExperts` + MCP `find_experts`)**:
  - Dosya, sembol (`file:symbol`), satır aralığı (`file#L10-L40`), dizin veya doğal dil konusu için yaşayan `git blame -w` payı (`0.45`), üstel zaman aşınmalı commit geçmişi (`0.35`, 90 gün yarı ömür), toplam commit (`0.20`) ve `CODEOWNERS` sahipliğini (`+0.15`) birleştirerek uzmanları sıralar
- **Kurumsal Hafıza Köprüsü (`ctxman why --analyzer-db` / `--analyzer`)**:
  - `@plansmithai/analyzer` SQLite `documents` tablosunu (`.plansmith/analyzer.sqlite`) commit, PR, issue, Slack, Linear ve Jira atıfları için sorgular ve sırları otomatik maskeler
- **Odaklı Import Komşuluğu (`ctxman focus` + `focusContext` + MCP `focus_context`)**:
  - Ortak hub patlamasını önleyen yönlü `N`-hop import/importer gezintisi (`--direction both|imports|importers`)
- **Çoklu Depo Çalışma Alanı (`--repo <dir>`) ve Hibrit Arama (`ctxman search --hybrid`)**:
  - `<alias>/<path>` ad alanları altında çoklu depo `map`, `search`, `pack` ve Reciprocal Rank Fusion (`BM25 + semantik`)

## [3.1.1] - 2026-10-15

### Eklendi

- **MCP Yönetişim ve RAG Araçları**: `ctxman mcp` sunucusuna `check_policy`, `audit_log` ve `ask_codebase` araçları eklendi
- **Node 24 CI & GitHub Actions**: İş akışları Node 24 sürümlerine yükseltildi

### Düzeltildi

- `ctxman ask` indeksleme ve sorgulamasında `.gitignore`, `.contextignore` ve `.ctxman/policy.json` erişim kuralları ile sır maskeleme zorunlu kılındı

## [3.1.0] - 2026-10-14

### Eklendi

- **Kod Zekası Komutları**:
  - `ctxman map` (`renderRepoMap`, MCP `repo_map`): 14 dilde import grafiği üzerinde PageRank, git değişim sıklığı ve sembol referanslarıyla bütçeli depo haritası
  - `ctxman pack` (`packContext`, MCP `pack_context`): `--compress` ve `--budget` destekli tek belgede LLM bağlam paketi (`xml`, `markdown`, `plain`, `json`)
  - `ctxman pr` (`buildPrContext`, MCP `pr_context`): değişen fonksiyonlar, diff ve ilgili testlerle PR inceleme bağlamı
  - `ctxman why` (`explainHistory`, MCP `explain_history`): commit geçmişi, PR/issue referansları, `--discussions`, blame sahipliği, birlikte değişen dosyalar, ADR/dokümanlar ve testlerle kod arkeolojisi
  - `ctxman search` (`searchProject`, MCP `search_code` / `get_symbol`): tanımlayıcı bölümlemeli BM25 kod araması ve sembol kaynağı getirme
  - `ctxman count` (`countForModel`, MCP `count_tokens`): 44+ güncel LLM profili için `o200k_base` ve Anthropic `--api` ile kesin token sayımı
  - `ctxman mcp`: Claude Desktop, Claude Code, Cursor, VS Code ve Windsurf için tek komutla kurulum (`ctxman mcp install`) ve `--root` sandbox
  - `ctxman policy` ve `ctxman audit`: `.ctxman/policy.json` Veri Kalkanı ve SHA-256 dışa aktarım denetim günlüğü

## [3.0.0] - 2025-11-05

### Eklendi

- **Plugin Mimarisi**: Diller ve dışa aktarıcılar için modüler, genişletilebilir sistem
- **Git Entegrasyonu**: Değişen dosyaları analiz et, diff analizi, yazar takibi
- **İzleme Modu**: Gerçek zamanlı dosya izleme ve otomatik analiz
- **REST API**: Programatik erişim için 6 uç noktalı HTTP sunucusu
- **Önbellek Sistemi**: 5-10 kat daha hızlı tekrarlanan analizler için akıllı önbellek
- **Paralel İşleme**: Büyük kod tabanları için çok çekirdek kullanımı
- **TOON Formatı**: LLM optimizasyonu için %40-50 token azaltma
- **İnteraktif Sihirbaz**: Kullanıcı dostu rehberli kurulum (varsayılan mod)
- **TypeScript Tanımları**: Programatik API için tam tip desteği

## [2.3.7] - 2025-11-05

### Eklendi

- LLM otomatik model algılama ve optimizasyon özellikleri
- Token bütçeleme araçları ve bağlam penceresi uyum analizi

## [2.3.0] - 2025-11-02

### Eklendi

- Yöntem düzeyinde token analizi
- GitIngest format desteği ve akıllı bölümleme (chunking)
- Çoklu çıktı formatları (TOON, JSON, YAML, Markdown, CSV, XML, GitIngest)

## [2.0.0] - 2025-10-13

### Eklendi

- Çoklu dil desteği (14+ dil)
- AST ve regex tabanlı yöntem analizi
- Kesin token sayımı için tiktoken entegrasyonu

---

## Sürüm Geçmişi

| Sürüm | Tarih      | Öne Çıkanlar                                                                                                                                 |
| ----- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 3.2.4 | 2026-11-09 | Çapraz depo AST sembol çağrı ve import grafiği (`buildWorkspaceGraph`) ile çoklu depo `focus`, `task` ve `diagnose` (`--repo` / MCP `repos`) |
| 3.2.3 | 2026-11-09 | Çapraz depo canlı izleme (`ctxman watch --repo`) ve çoklu kök SQLite bilgi grafiği / RAG senkronu (`query_knowledge_graph` `repos`)          |
| 3.2.2 | 2026-11-05 | Dosyalar arası AST sembol çağrı grafiği (`buildCallGraph`, `map --call-graph`, `focus file:symbol`, `task` ve `diagnose`)                    |
| 3.2.1 | 2026-11-05 | `watch` artımlı RAG ve bilgi grafiği senkronu, 19 araçlı MCP (`query_knowledge_graph`), ADR Kataloğu ve Bilgi Grafiği sayfaları              |
| 3.2.0 | 2026-10-30 | `SqliteVectorStore`, `ctxman task`, `ctxman diagnose`, `ctxman who`, `ctxman focus`, 18 araçlı MCP                                           |
| 3.1.1 | 2026-10-15 | MCP `check_policy`, `audit_log`, `ask_codebase`, RAG politika doğrulaması                                                                    |
| 3.1.0 | 2026-10-14 | `map`, `pack`, `pr`, `why`, `search`, `count`, `policy`, `audit`, `mcp install`, 44+ LLM profili                                             |
| 3.0.0 | 2025-11-05 | Plugin mimarisi, Git entegrasyonu, REST API, İzleme modu                                                                                     |
| 2.3.7 | 2025-11-05 | LLM otomatik algılama, token bütçeleme                                                                                                       |
| 2.3.0 | 2025-11-02 | TOON formatı, akıllı GitIngest bölümleme, Ink arayüzü                                                                                        |
| 2.0.0 | 2025-10-13 | Modüler mimari, 14+ dil desteği                                                                                                              |

## Yol Haritası

### v3.1 – v3.2.4 ile Tamamlananlar

- **Çoklu Depo Focus, Task ve Diagnose Ajanları**: `ctxman focus --repo`, `ctxman task --repo` ve `ctxman diagnose --repo` (ve MCP `repos`) genelinde çapraz depo import ve AST sembol çağrı grafiği gezintisi (`buildWorkspaceGraph`)

- **Çapraz Depo Canlı İzleme ve Bilgi Grafiği Senkronizasyonu**: Kardeş depolar arasında `<alias>/<path>` düğümlerini, çapraz depo import kenarlarını ve SQLite RAG vektörlerini eşzamanlı güncelleyen çoklu depo izleme modu (`ctxman watch --repo <dir>`)

- **Dosyalar Arası AST Sembol Çağrı Grafiği**: `ctxman map --call-graph`, `ctxman focus <file>:<symbol>`, `ctxman task` ve `ctxman diagnose` genelinde fonksiyonlar arası çağrı kenarları ve barrel re-export çözümlemesi
- **19 Araçlı MCP Sunucusu ve İstemci Kurucusu**: Claude Desktop, Claude Code, Cursor, VS Code ve Windsurf için yerleşik entegrasyon (`ctxman mcp`) ve `query_knowledge_graph` aracı
- **Çevrimdışı SQLite RAG, Hibrit Arama ve Canlı İzleme Grafik Senkronizasyonu**: Sıfır native bağımlılıklı `node:sqlite` vektör ve bilgi grafiği indeksi + Reciprocal Rank Fusion (`ctxman search --hybrid`, `ctxman ask`, `ctxman watch`)
- **Kod Arkeolojisi ve Uzman Bulucu**: `ctxman why` (GitHub/GitLab tartışmaları ve `@plansmithai/analyzer` kurumsal hafıza atıflarıyla) ve `ctxman who`
- **Görev ve Hata Ajanları**: `ctxman task` ve `ctxman diagnose`
- **3 Sütunlu Ekosistem Entegrasyonu**: `plansmith` ve `plansmith-desktop` ile çapraz depo bilgi grafiği ([ADR Kataloğu](/tr/adr), [Bilgi Grafiği](/tr/knowledge-graph))

### Katkıda Bulunma

Katkılarınızı bekliyoruz! Başlamak için [Katkı Rehberi](https://github.com/hakkisagdic/ctxman/blob/main/CONTRIBUTING-tr.md)'ne bakın.

### Destek

- **Dokümantasyon**: [Başlangıç](/tr/getting-started)
- **Mimari ve ADR'ler**: [ADR Kataloğu](/tr/adr) · [Bilgi Grafiği](/tr/knowledge-graph)
- **Sorunlar**: [GitHub Issues](https://github.com/hakkisagdic/ctxman/issues)
- **Tartışmalar**: [GitHub Discussions](https://github.com/hakkisagdic/ctxman/discussions)

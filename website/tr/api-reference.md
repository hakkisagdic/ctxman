# API Referansı

Ctxman v3.2 CLI komutları, 19 araçlı MCP sunucusu, REST API ve programatik kütüphane dışa aktarımları için tam referans.

## CLI Referansı

### Genel ve Analiz Seçenekleri

| Seçenek                  | Kısa | Açıklama                                                          | Varsayılan          |
| ------------------------ | ---- | ----------------------------------------------------------------- | ------------------- |
| `--cli`                  | `-c` | CLI modunda çalıştır (sihirbazı atla)                             | `false`             |
| `--help`                 | `-h` | Yardımı göster                                                    | -                   |
| `--version`              | `-v` | Sürümü göster                                                     | -                   |
| `--method-level`         | `-m` | Fonksiyon düzeyinde token analizini etkinleştir                   | `false`             |
| `--target-model`         | `-t` | Hedef LLM profil kimliği (örn. `claude-sonnet-5-5`)               | `claude-sonnet-5-5` |
| `--list-llms`            |      | 44+ LLM profilini listele (`--all` emekli modelleri de içerir)    | -                   |
| `--output`               | `-o` | Çıktı formatı (`toon`, `json`, `markdown`, `yaml`, ...)           | `json`              |
| `--gitingest`            | `-g` | GitIngest özeti oluştur (`digest.txt`)                            | `false`             |
| `--changed-only`         |      | Sadece çalışma ağacında değişen dosyaları analiz et               | `false`             |
| `--changed-since`        |      | Belirli bir git referansından beri değişen dosyaları analiz et    | -                   |
| `--with-authors`         |      | Git blame yazar bilgisini dahil et                                | `false`             |
| `--cache` / `--no-cache` |      | SHA-256 disk/bellek önbelleğini etkinleştir veya devre dışı bırak | `true`              |
| `--no-redact`            |      | Otomatik sır maskelemeyi devre dışı bırak                         | `false`             |

## CLI Alt Komutları (v3.2)

### `ctxman map [dir]`

Token bütçesi içinde fonksiyon ve sınıf imzalarıyla PageRank sıralamalı depo haritası üretir:

```bash
ctxman map --tokens 2048 --focus lib/why/index.js
ctxman map --repo ../plansmith --repo ../plansmith-desktop --tokens 4096
```

### `ctxman focus <file>[:symbol]`

Hedef dosya veya sembolü `N`-hop import/importer komşuluğuyla paketler:

```bash
ctxman focus lib/api/mcp/server.js --depth 2 --direction both --budget 20k
```

### `ctxman pack [dir]`

Depo dosyalarını tek bir LLM belgesinde (`xml`, `markdown`, `plain`, `json`) paketler:

```bash
ctxman pack --budget 32k --compress --style xml
ctxman pack --include "lib/**/*.js" --max-tokens 50000
```

### `ctxman pr [dir]`

Pull-request inceleme bağlamı (özet, commit günlüğü, değişen fonksiyonlar, diff ve ilgili testler) oluşturur:

```bash
ctxman pr --base main --head HEAD --budget 24k
```

### `ctxman why <target>`

Bir dosya, sembol (`file:symbol`) veya satır aralığının (`file#L10-L40`) neden öyle göründüğünü açıklar:

```bash
ctxman why lib/why/index.js:explainHistory
ctxman why lib/why/index.js:explainHistory --discussions --analyzer
ctxman why lib/why/index.js#L1-L80 --patches --budget 12k
```

### `ctxman who <target-or-topic>`

Yaşayan `git blame -w` payı (`0.45`), zaman aşınmalı commit geçmişi (`0.35`, 90 gün yarı ömür), toplam commit (`0.20`) ve `CODEOWNERS` (`+0.15`) sinyallerini birleştirerek uzmanları sıralar:

```bash
ctxman who lib/why/index.js:explainHistory
ctxman who lib/rag
ctxman who "hybrid search RRF" --limit 5 --style json
```

### `ctxman task "<goal>"`

Görev açıklamasından otomatik bağlam paketi (hibrit arama tohumları + 1-hop tam kod + 2-hop sıkıştırılmış imzalar + mimari depo haritası) üretir:

```bash
ctxman task "add OAuth token refresh retry logic" --budget 32k --format markdown
```

### `ctxman diagnose [trace]`

Çok dilli yığın izlerini (stack trace) ve hata günlüklerini kök neden paketine (etkilenen satırlar, çevreleyen fonksiyonlar, 1-hop komşular ve yakın git commit'leri) dönüştürür:

```bash
npm test 2>&1 | ctxman diagnose --budget 24k
ctxman diagnose --file ci-failure.log --format json
```

### `ctxman search "<query>"`

BM25, yerel SQLite vektör gömmeleri veya Reciprocal Rank Fusion (`--hybrid`) ile kod parçalarını arar:

```bash
ctxman search "expire session" --limit 10
ctxman search "sqlite vector cosine similarity" --hybrid
```

### `ctxman ask "<question>"`

Yerel SQLite semantik indeksini (`.ctxman/self-knowledge/index.sqlite`) doğal dille sorgular:

```bash
ctxman ask "how does export policy redaction work?"
```

### `ctxman count [path|-]`

Belirli bir LLM modeli için token sayar (veya Anthropic `count_tokens` API ile kesin Claude sayımı yapar):

```bash
ctxman count . --model gpt-5.5
ctxman count . --model claude-opus-5-5 --api --json
```

### `ctxman policy` ve `ctxman audit`

`.ctxman/policy.json` Veri Kalkanı kurallarını doğrular ve SHA-256 dışa aktarım denetim günlüğünü inceler:

```bash
ctxman policy init
ctxman policy check
ctxman audit --since 7d --limit 20
```

### `ctxman mcp`

19 araçlı MCP sunucusunu (`stdio` veya `sse`) çalıştırır veya istemci yapılandırmalarını kurar:

```bash
ctxman mcp install --client claude-desktop
ctxman mcp install --client claude-code --npx
ctxman mcp --root /path/to/project
```

### `ctxman watch` ve `ctxman serve`

Canlı dosya izlemeyi veya yerel REST API sunucusunu başlatır:

```bash
ctxman watch --debounce 1000
ctxman serve --port 3000
```

## MCP Sunucu Araçları (19 Araç)

| Araç                    | Temel Argümanlar                                                                              | Açıklama                                                              |
| ----------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `analyze_codebase`      | `path`                                                                                        | Depo token istatistikleri ve dosya dökümü                             |
| `generate_context`      | `path`, `template?`, `maxTokens?`                                                             | Şablon tabanlı LLM bağlamı                                            |
| `git_diff`              | `path`, `branch?`                                                                             | Doğrulanmış `git diff <branch>`                                       |
| `search_code`           | `path`, `query`, `type?` (`regex`, `substring`, `ranked`, `semantic`, `hybrid`), `repos?`     | Satır araması veya BM25 / hibrit RRF kod parçası araması              |
| `list_methods`          | `path`, `file?`                                                                               | Dosya başına çıkarılan fonksiyonlar                                   |
| `get_symbol`            | `path`, `name`, `file?`, `redact?`                                                            | İsimle fonksiyon, metot veya sınıfın tam kaynak kodu                  |
| `repo_map`              | `path`, `tokens?`, `focus?`, `repos?`                                                         | PageRank depo haritası (`ctxman map`)                                 |
| `pr_context`            | `path`, `base?`, `head?`, `budget?`, `style?`                                                 | Pull-request inceleme paketi (`ctxman pr`)                            |
| `count_tokens`          | `path` veya `text`, `model?`, `top?`                                                          | Modele duyarlı token sayımı ve pencere uyumu (`ctxman count`)         |
| `explain_history`       | `path`, `target`, `limit?`, `budget?`, `patches?`, `discussions?`, `analyzer?`, `analyzerDb?` | Git arkeolojisi ve kurumsal hafıza atıfları (`ctxman why`)            |
| `pack_context`          | `path`, `include?`, `exclude?`, `files?`, `style?`, `compress?`, `budget?`, `repos?`          | Paketlenmiş kod tabanı belgesi (`ctxman pack`)                        |
| `focus_context`         | `path`, `file`, `depth?`, `direction?`, `style?`, `compress?`, `budget?`                      | Yönlü `N`-hop import komşuluğu (`ctxman focus`)                       |
| `check_policy`          | `path`                                                                                        | Etkin `.ctxman/policy.json` doğrulaması (`ctxman policy`)             |
| `audit_log`             | `path`, `since?`, `limit?`                                                                    | SHA-256 dışa aktarım denetim günlüğü (`ctxman audit`)                 |
| `ask_codebase`          | `path`, `query`, `limit?`                                                                     | Çevrimdışı SQLite semantik arama (`ctxman ask`)                       |
| `task_context`          | `path`, `task`, `budget?`, `format?`, `model?`                                                | Otomatik görev bağlam paketi (`ctxman task`)                          |
| `diagnose_failure`      | `path`, `trace`, `budget?`, `format?`                                                         | Stack-trace kök neden teşhisi (`ctxman diagnose`)                     |
| `find_experts`          | `path`, `target`, `limit?`, `halfLifeDays?`, `style?`                                         | Blame + güncellik + CODEOWNERS uzman sıralaması (`ctxman who`)        |
| `query_knowledge_graph` | `path`, `query?`, `file?`, `depth?`, `limit?`, `refresh?`                                     | Kalıcı SQLite bilgi grafiği ve `IncrementalAnalyzer` önbellek sorgusu |

### `query_knowledge_graph` Örnek Kullanımı

Dosya düğümlerini, fonksiyon/metot bildirimlerini ve import/bağımlılık kenarlarını doğrudan `.ctxman/self-knowledge/index.sqlite` ve önbellekteki `IncrementalAnalyzer` durumundan sorgular:

```json
{
  "name": "query_knowledge_graph",
  "arguments": {
    "path": "/path/to/repo",
    "file": "lib/watch/IncrementalAnalyzer.js",
    "depth": 1,
    "query": "bootstrapSync",
    "limit": 20,
    "refresh": false
  }
}
```

Örnek yanıt çıktısı:

```json
{
  "path": "/path/to/repo",
  "bootstrapped": false,
  "cached": true,
  "stats": {
    "totalNodes": 42,
    "totalEdges": 68,
    "vectorDocuments": 42,
    "cachedFiles": 5
  },
  "nodes": [
    {
      "path": "lib/watch/IncrementalAnalyzer.js",
      "language": "javascript",
      "bytes": 14820,
      "methods": [
        {
          "name": "bootstrapSync",
          "line": 175,
          "signature": "async bootstrapSync(root = this.projectRoot)"
        }
      ],
      "symbolRefs": 3,
      "unresolvedImports": 0
    }
  ],
  "edges": [
    {
      "from": "lib/watch/IncrementalAnalyzer.js",
      "to": "lib/rag/stores/SqliteVectorStore.js",
      "weight": 1
    }
  ]
}
```

## Programatik API (`index.js`)

### Kurulum ve İçe Aktarma

```bash
npm install ctxman
```

```javascript
import {
  // Kod Zekası ve Ajanlar
  buildRepoGraph,
  rankFiles,
  renderRepoMap,
  focusContext,
  packContext,
  buildPrContext,
  explainHistory,
  queryAnalyzerCitations,
  findExperts,
  buildTaskContext,
  diagnoseFailure,

  // Arama, Semboller, Sayım ve Çevrimdışı SQLite RAG
  searchProject,
  hybridSearch,
  getSymbol,
  countForModel,
  askCodebase,
  SqliteVectorStore,
  AutoEmbeddingProvider,
  LocalHashEmbeddingProvider,

  // Çoklu Depo Çalışma Alanı ve Yönetişim Politikası
  resolveWorkspaceRepos,
  mapWorkspace,
  searchWorkspace,
  packWorkspace,
  loadPolicy,
  Policy,

  // Çekirdek v3 Hattı
  Scanner,
  Analyzer,
  ContextBuilder,
  Reporter,
  CacheManager,
  TokenCalculator,
} from 'ctxman';
```

### Kod Zekası Örnekleri

```javascript
// 1. Sıralı Depo Haritası
const map = renderRepoMap('/path/to/repo', { tokens: 2048, focus: ['lib/why/index.js'] });
console.log(map.output);

// 2. Kurumsal Hafıza Atıflarıyla Kod Geçmişi Açıklama
const why = await explainHistory('/path/to/repo', 'lib/why/index.js:explainHistory', {
  analyzer: true,
  budget: 12000,
});
console.log(why.text);

// 3. Alan Uzmanlarını Bulma
const who = await findExperts('/path/to/repo', 'hybrid search RRF', { limit: 5 });
console.log(who.experts);

// 4. Görev Bağlamı ve Hata Teşhisi
const taskBundle = await buildTaskContext('/path/to/repo', 'add retry backoff', { budget: 32000 });
const diagReport = await diagnoseFailure('/path/to/repo', errorStackText, { budget: 24000 });
```

## REST API (`ctxman serve`)

### Temel URL

```text
http://127.0.0.1:3000/api/v1
```

### Uç Noktalar

- `GET /api/v1/docs` — OpenAPI uç nokta listesi
- `POST /api/v1/analyze` — Depo dosyalarını ve token sayılarını analiz et
- `GET /api/v1/methods?file=<path>` — Bir dosya veya proje için fonksiyonları çıkar
- `GET /api/v1/stats` — Önbelleğe alınmış depo istatistikleri
- `GET /api/v1/diff?since=<ref>` — Git diff analizi (`isValidGitRef` korumalı)
- `POST /api/v1/context` — Politika denetimli LLM bağlamı oluştur

## Çıkış Kodları

| Kod | Açıklama                                                      |
| --- | ------------------------------------------------------------- |
| `0` | Başarılı                                                      |
| `1` | Genel veya çalışma zamanı hatası                              |
| `2` | Geçersiz CLI argümanları veya `--max-tokens` bütçe aşımı      |
| `3` | Dışa aktarım politikası ihlali (`.ctxman/policy.json` engeli) |

---

Yardım mı lazım? [ADR Kataloğu](/tr/adr) ve [Bilgi Grafiği](/tr/knowledge-graph) sayfalarını inceleyin veya [GitHub'da bir sorun açın](https://github.com/hakkisagdic/ctxman/issues).

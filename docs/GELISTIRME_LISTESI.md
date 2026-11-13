# Ctxman — Geliştirme Listesi (Rakip Matrisi Boşluk Kapatma ve Gelir Odaklı Yol Haritası)

> **Tarih:** 13 Kasım 2026  
> **Kaynak:** [`docs/RAKIP_ANALIZI.md`](./RAKIP_ANALIZI.md) içindeki **"Yok"** ve **"Kısmi"** durumundaki 7 özelliğin **tamamı** ve [`docs/GELIR_MODELI.md`](./GELIR_MODELI.md) ticari gereksinimleri.  
> **Önceliklendirme Formülü:** $\text{Öncelik Skoru} = \frac{\text{Gelir Etkisi (1–10)} \times \text{Kullanıcı Değeri (1–10)}}{\text{Efor (1–5)}}$  
> **Sınıflandırma:**
>
> - **P0:** Ürünün doğrudan satılabilir (monetizable) olması ve Türkiye/Global kurumsal satış kancası için şart olan kalemler.
> - **P1:** Rakip paritesini (Greptile, CodeRabbit, Repomix, Sourcegraph) tamamlayan yüksek değerli kalemler.
> - **P2:** Kurumsal CI/CD ve DevSecOps entegrasyonunu güçlendiren tamamlayıcı kalemler.

---

## Özet Öncelik Tablosu

| Kod      | Matris Ref | İş Kalemi                                                                                                       | Mevcut Durum | Gelir (1-10) | Değer (1-10) | Efor (1-5) |   Skor   | Öncelik |     Durum      |
| :------- | :--------: | :-------------------------------------------------------------------------------------------------------------- | :----------: | :----------: | :----------: | :--------: | :------: | :-----: | :------------: |
| **P0-1** |    #16     | Kullanım Ölçümü (Metering), Paket/Kota Yönetimi, Fatura Kaydı (`node:sqlite`) ve `iyzico` Ödeme Soyutlaması     |     Yok      |      10      |      9       |    3.0     | **30.0** | **P0**  | [x] Tamamlandı |
| **P0-2** |    #13     | KVKK / BDDK Uyumlu PII Maskeleme (TCKN, TR IBAN, Kredi Kartı, E-posta, Tel) ve `kvkk-bddk` Politika Preset'i    |    Kısmi     |      10      |      9       |    2.0     | **45.0** | **P0**  |  [ ] Bekliyor  |
| **P0-3** |    #12     | Ajan Yönergesi ve Proje Kuralları Otomatik Keşfi (`CLAUDE.md`, `AGENTS.md`, `.cursorrules`, Copilot)            |     Yok      |      8       |      10      |    2.0     | **40.0** | **P0**  |  [ ] Bekliyor  |
| **P1-1** |    #15     | REST API v1 Bilgi Grafiği Uç Noktası (`GET /api/v1/graph`) — Tekli ve Çoklu Depo (`repos`)                      |    Kısmi     |      7       |      8       |    1.5     | **37.3** | **P1**  |  [ ] Bekliyor  |
| **P1-2** |    #14     | PR İnceleme Güven/Risk Skoru, Kural Denetimi (`.ctxman/rules.json`) ve Otomatik Mermaid Diyagramı (`ctxman pr`) |    Kısmi     |      9       |      9       |    2.5     | **32.4** | **P1**  |  [ ] Bekliyor  |
| **P1-3** |    #11     | Uzak Git Deposu Doğrudan Analiz ve Paketleme (`--remote <url\|owner/repo> --branch <ref>`)                      |    Kısmi     |      7       |      9       |    2.5     | **25.2** | **P1**  |  [ ] Bekliyor  |
| **P2-1** |    #17     | CI/CD Kalite ve Politika Kapısı için Standart SARIF v2.1.0 Rapor Çıktısı (`policy` & `pr`)                      |    Kısmi     |      7       |      7       |    2.0     | **24.5** | **P2**  |  [ ] Bekliyor  |

---

## Detaylı İş Kalemleri, Kabul Ölçütleri, Efor ve Bağımlılıklar

### [x] P0-1: Kullanım Ölçümü (Metering), Paket/Kota Yönetimi, Fatura Kaydı ve `iyzico` Ödeme Sağlayıcı Soyutlaması

- **Rakip Matrisi Karşılığı:** #16 (Unblocked, Greptile, Augment Code, CodeRabbit ticari katman paritesi — bizde **Yok**).
- **Tahmini Efor:** 3 birim (~1 tam mühendislik fazı).
- **Bağımlılık:** Yok (`node:sqlite` yerleşik modülü kullanılır).
- **Kabul Ölçütleri:**
  1. `lib/billing/plans.js`: `community` (₺0/$0), `pro` (₺690/$19), `team` (₺2.990/$79) ve `enterprise` (₺19.900/$590) paket tanımları, aylık/yıllık fiyatları (TRY ve USD), maksimum depo (`maxRepos`), aylık istek (`monthlyRequests`) ve aylık token (`monthlyTokens`) kotaları tanımlanmalı.
  2. `lib/billing/store.js` (`BillingStore`): Yerleşik `node:sqlite` üzerinde `.ctxman/billing/billing.sqlite` (veya özel dosya yolu) içinde `customers`, `api_keys` (yalnız SHA-256 hash saklanır), `subscriptions`, `usage_events` ve `invoices` (`CTX-YYYY-NNNNNN`, KDV %20 hesaplamalı) tablolarını yönetmeli; kullanım kaydetme (`recordUsage`), kota kontrolü (`checkQuota`), kredi/paket yükseltme ve fatura kesme (`createInvoice`, `markInvoicePaid`) işlemlerini desteklemeli.
  3. `lib/billing/providers/index.js`: `PaymentProvider` taban arayüzü, HMAC-SHA256 imza doğrulamalı ve TRY/USD destekli `IyzicoProvider` (sırları yalnızca ortam değişkeninden okuyan, asla loglamayan yapı) ve çevrimdışı/test ortamları için `MockPaymentProvider` içermeli.
  4. `lib/api/rest/server.js`: `APIServer` üzerinde `/api/v1/billing/plans`, `/api/v1/billing/usage`, `/api/v1/billing/invoices`, `POST /api/v1/billing/customers`, `POST /api/v1/billing/checkout` ve `POST /api/v1/billing/webhook/iyzico` uç noktaları çalışmalı; `billingStore` ve `enforceQuotas: true` aktifken kota aşımında `402 Payment Required` / `429 Quota Exceeded` döndürmeli.
  5. `index.js` dışa aktarımları ve birim/entegrasyon testleri (`test/billing.test.js`) %100 yeşil olmalı.

---

### [ ] P0-2: KVKK / BDDK Uyumlu PII Maskeleme (TCKN, TR IBAN, Kredi Kartı, E-posta, Tel) ve `kvkk-bddk` Politika Preset'i

- **Rakip Matrisi Karşılığı:** #13 (Türkiye regüle kurumsal pazar & Kondukto veri güvenliği paritesi — bizde **Kısmi**).
- **Tahmini Efor:** 2 birim.
- **Bağımlılık:** Yok (`lib/utils/secret-redactor.js` ve `lib/policy/` üzerine inşa edilir).
- **Kabul Ölçütleri:**
  1. `lib/utils/secret-redactor.js`: Mevcut API anahtarı maskelemesine ek olarak (veya `redactPII: true` / varsayılan kurumsal mod ile) **TCKN** (11 haneli resmi mod-10/mod-11 algoritma doğrulamalı, rastgele 11 haneli sayıları yanlış pozitif olarak maskelemeyen), **TR IBAN** (`TR\d{2}\s?\d{4}...`), **Kredi Kartı Numarası** (13–19 hane Luhn doğrulamalı), **E-posta Adresi** ve **Türkiye Telefon Numarası** (`+90 5xx...` / `05xx...`) kalıplarını `[REDACTED:TCKN]`, `[REDACTED:TR_IBAN]`, `[REDACTED:CREDIT_CARD]`, `[REDACTED:EMAIL]`, `[REDACTED:TR_PHONE]` olarak maskelemeli.
  2. `lib/policy/schema.js` & `lib/policy/index.js`: `.ctxman/policy.json` şemasında `redactPII` (`boolean`) ve `compliancePreset` (`"kvkk-bddk" | "soc2" | null`) alanlarını desteklemeli; `createPolicyTemplate('kvkk-bddk')` ve `ctxman policy init --preset kvkk-bddk` komutu BDDK/KVKK uyumlu kuralları (`requireRedaction: true`, `redactPII: true`, `audit: true`, hassas dosya `deny` listesi) otomatik üretmeli.
  3. Birim ve CLI testleri (`test/kvkk-bddk-redaction.test.js`) %100 yeşil olmalı.

---

### [ ] P0-3: Ajan Yönergesi ve Proje Kuralları Otomatik Keşfi (`CLAUDE.md`, `AGENTS.md`, `.cursorrules`, Copilot)

- **Rakip Matrisi Karşılığı:** #12 (Repomix ve Greptile kural/yönerge keşfi paritesi — bizde **Yok**).
- **Tahmini Efor:** 2 birim.
- **Bağımlılık:** Yok.
- **Kabul Ölçütleri:**
  1. `lib/pack/rules-discovery.js`: Bir depo veya çoklu depo (`repos`) çalışma alanında `AGENTS.md`, `CLAUDE.md`, `.cursorrules`, `.cursor/rules/*.mdc`, `.github/copilot-instructions.md` ve `.windsurfrules` dosyalarını güvenli biçimde (gitignore ve export policy kurallarına uyarak, sırları maskeleyerek) keşfeden `discoverProjectRules(root, options)` fonksiyonu yazılmalı.
  2. `lib/pack/index.js`, `lib/task/index.js`, `bin/cli.js` ve `lib/api/rest/server.js`: `packContext` ve `buildTaskContext` içinde `includeRules: true` (`ctxman pack --include-rules`, `ctxman task --include-rules`, `GET /api/v1/rules` ve `POST /api/v1/pack` / `POST /api/v1/task`) seçeneğiyle keşfedilen ajan yönergeleri çıktı belgesine yapılandırılmış `<project_rules>` / `## Project Rules & Agent Instructions` bölümü olarak eklenmeli.
  3. Testler (`test/rules-discovery.test.js`) %100 yeşil olmalı.

---

### [ ] P1-1: REST API v1 Bilgi Grafiği Uç Noktası (`GET /api/v1/graph`)

- **Rakip Matrisi Karşılığı:** #15 (Sourcegraph & Greptile Code Graph REST API paritesi — bizde **Kısmi**).
- **Tahmini Efor:** 1.5 birim.
- **Bağımlılık:** Yok (`IncrementalAnalyzer` ve `SqliteVectorStore` mevcut).
- **Kabul Ölçütleri:**
  1. `lib/api/rest/server.js`: `GET /api/v1/graph` uç noktası (`path`, `repos`, `file`, `query`, `depth`, `limit`, `refresh` parametreleriyle) MCP `query_knowledge_graph` aracıyla birebir paritede düğümleri (`nodes`), metot imzalarını (`methods`), bağımlılık kenarlarını (`edges`) ve graf istatistiklerini (`stats`) JSON olarak döndürmeli.
  2. `GET /api/v1/docs` listesine `/api/v1/graph` eklenmeli ve `test/rest-server-client-errors.test.js` içinde tekli/çoklu depo testleriyle doğrulanmalı.

---

### [ ] P1-2: PR İnceleme Güven/Risk Skoru, Kural Denetimi ve Otomatik Mermaid Diyagramı (`ctxman pr`)

- **Rakip Matrisi Karşılığı:** #14 (Greptile Confidence Score + Scoped Rules & CodeRabbit Mermaid Walkthrough paritesi — bizde **Kısmi**).
- **Tahmini Efor:** 2.5 birim.
- **Bağımlılık:** P0-3 (proje kuralları keşfi ile entegre çalışır).
- **Kabul Ölçütleri:**
  1. `lib/pr/pr-context.js`: PR analiz sonucunda değişen dosya sayısı, etkilenen çağrı/import komşuları, eksik test kapsama oranı, hassas dizinler (`auth`, `billing`, `security`, `policy`, `migration`) ve satır değişim hacmine göre deterministik **`riskScore` (0–100)**, **`confidenceScore` (1–5)** ve gerekçe listesi (`riskFactors`) hesaplamalı.
  2. Değişen dosyalar ve etkiledikleri modüller arasındaki akışı gösteren otomatik **Mermaid (`flowchart LR`)** etki diyagramı (`mermaidDiagram`) üretmeli ve Markdown/XML/JSON çıktısına dahil etmeli.
  3. `.ctxman/rules.json` (veya `options.rules`) içindeki kapsamlı kuralları (`pathPattern`, `forbidPattern`, `requireTest`, `maxFileAdditions`) denetleyip `ruleViolations` listesi döndürmeli.
  4. Testler (`test/pr-intelligence.test.js`) %100 yeşil olmalı.

---

### [ ] P1-3: Uzak Git Deposu Doğrudan Analiz ve Paketleme (`--remote <url|owner/repo> --branch <ref>`)

- **Rakip Matrisi Karşılığı:** #11 (Repomix `--remote` ve GitIngest URL/branch paritesi — bizde **Kısmi**).
- **Tahmini Efor:** 2.5 birim.
- **Bağımlılık:** Yok.
- **Kabul Ölçütleri:**
  1. `lib/utils/remote-repo.js`: `https://github.com/owner/repo`, `github:owner/repo`, `owner/repo` veya yerel `file://` Git URL'lerini (ve isteğe bağlı `--branch <ref>` dal/etiketini) güvenli biçimde (`isValidGitRef` ve protokol doğrulamasıyla, komut enjeksiyonuna karşı `execFileSync` ile) geçici shallow clone (`--depth 1`) olarak indiren ve temizleyen `withRemoteRepo(remoteSpec, options, fn)` yardımcısı yazılmalı.
  2. `bin/cli.js` (`ctxman pack --remote <spec> [--branch <ref>]`, `ctxman map --remote <spec> [--branch <ref>]`) ve `lib/api/rest/server.js` (`remote`, `branch` parametreleri) uzak depoları klonlamadan tek komutla analiz edip paketleyebilmeli.
  3. Testler (`test/remote-repo.test.js`) yerel bir bare/fixture git deposu üzerinden %100 çevrimdışı ve deterministik olarak yeşil geçmeli.

---

### [ ] P2-1: CI/CD Kalite ve Politika Kapısı için Standart SARIF v2.1.0 Rapor Çıktısı

- **Rakip Matrisi Karşılığı:** #17 (Kondukto & CodeRabbit GitHub Security / CI Gate paritesi — bizde **Kısmi**).
- **Tahmini Efor:** 2 birim.
- **Bağımlılık:** P0-2 ve P1-2.
- **Kabul Ölçütleri:**
  1. `lib/policy/sarif.js`: Politika doğrulama hatalarını, dışa aktarım ihlallerini (`PolicyViolationError`), sır/PII bulgularını ve PR kural ihlallerini (`ruleViolations`) OASIS **SARIF v2.1.0** (`$schema`, `version: "2.1.0"`, `runs[].tool.driver`, `runs[].results`) şemasına dönüştüren `buildSarifReport` fonksiyonu yazılmalı.
  2. `ctxman policy check --format sarif` ve `GET /api/v1/policy?format=sarif` doğrudan geçerli SARIF v2.1.0 JSON çıktısı döndürmeli.
  3. Testler (`test/sarif-report.test.js`) %100 yeşil olmalı.

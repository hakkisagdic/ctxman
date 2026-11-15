# Ctxman — Geliştirme Listesi (Rakip Matrisi Boşluk Kapatma ve Yaratıcı Farklılaştırıcı Yol Haritası)

> **Son Güncelleme:** 15 Kasım 2026  
> **Kaynak:** [`docs/RAKIP_ANALIZI.md`](./RAKIP_ANALIZI.md) içindeki rakip parite maddeleri, [`docs/GELIR_MODELI.md`](./GELIR_MODELI.md) ticari gereksinimleri ve Faz 2–3 yaratıcı farklılaştırıcı özellikler.  
> **Önceliklendirme Formülü:** $\text{Öncelik Skoru} = \frac{\text{Gelir Etkisi (1–10)} \times \text{Kullanıcı Değeri (1–10)}}{\text{Efor (1–5)}}$  
> **Sınıflandırma:**
>
> - **P0:** Ürünün doğrudan satılabilir (monetizable) olması ve Türkiye/Global kurumsal satış kancası için şart olan kalemler.
> - **P1:** Rakip paritesini (Greptile, CodeRabbit, Repomix, Sourcegraph) tamamlayan yüksek değerli kalemler.
> - **P2:** Kurumsal CI/CD ve DevSecOps entegrasyonunu güçlendiren tamamlayıcı kalemler.
> - **C1–C5 (Faz 2 Yaratıcı Özellikler — %100 Tamamlandı):** Rakiplerin hiçbirinde bulunmayan, Ctxman'i kategori lideri yapan yaratıcı farklılaştırıcı yetenekler (`C-1`..`C-5` tamamı uygulandı).
> - **F3-1..F3-5 (Faz 3 Yeni Yaratıcı Özellik Önerileri):** Faz 2 tamamlandıktan sonra sonraki iterasyon için önerilen 5 yeni yaratıcı yetenek.

---

## Faz 1: Rakip Matrisi Boşluk Kapatma Tablosu (`v3.3.0` — %100 Tamamlandı)

| Kod      | Matris Ref | İş Kalemi                                                                                                       | Önceki Durum | Gelir (1-10) | Değer (1-10) | Efor (1-5) |   Skor   | Öncelik |     Durum      |
| :------- | :--------: | :-------------------------------------------------------------------------------------------------------------- | :----------: | :----------: | :----------: | :--------: | :------: | :-----: | :------------: |
| **P0-1** |    #16     | Kullanım Ölçümü (Metering), Paket/Kota Yönetimi, Fatura Kaydı (`node:sqlite`) ve `iyzico` Ödeme Soyutlaması     |     Yok      |      10      |      9       |    3.0     | **30.0** | **P0**  | [x] Tamamlandı |
| **P0-2** |    #13     | KVKK / BDDK Uyumlu PII Maskeleme (TCKN, TR IBAN, Kredi Kartı, E-posta, Tel) ve `kvkk-bddk` Politika Preset'i    |    Kısmi     |      10      |      9       |    2.0     | **45.0** | **P0**  | [x] Tamamlandı |
| **P0-3** |    #12     | Ajan Yönergesi ve Proje Kuralları Otomatik Keşfi (`CLAUDE.md`, `AGENTS.md`, `.cursorrules`, Copilot)            |     Yok      |      8       |      10      |    2.0     | **40.0** | **P0**  | [x] Tamamlandı |
| **P1-1** |    #15     | REST API v1 Bilgi Grafiği Uç Noktası (`GET /api/v1/graph`) — Tekli ve Çoklu Depo (`repos`)                      |    Kısmi     |      7       |      8       |    1.5     | **37.3** | **P1**  | [x] Tamamlandı |
| **P1-2** |    #14     | PR İnceleme Güven/Risk Skoru, Kural Denetimi (`.ctxman/rules.json`) ve Otomatik Mermaid Diyagramı (`ctxman pr`) |    Kısmi     |      9       |      9       |    2.5     | **32.4** | **P1**  | [x] Tamamlandı |
| **P1-3** |    #11     | Uzak Git Deposu Doğrudan Analiz ve Paketleme (`--remote <url\|owner/repo> --branch <ref>`)                      |    Kısmi     |      7       |      9       |    2.5     | **25.2** | **P1**  | [x] Tamamlandı |
| **P2-1** |    #17     | CI/CD Kalite ve Politika Kapısı için Standart SARIF v2.1.0 Rapor Çıktısı (`policy` & `pr`)                      |    Kısmi     |      7       |      7       |    2.0     | **24.5** | **P2**  | [x] Tamamlandı |

---

## Faz 2: 5 Yaratıcı Farklılaştırıcı Özellik (`C-1`..`C-5` — %100 Tamamlandı)

Rakip matrisindeki tüm boşluklar kapatıldıktan sonra Ctxman'i rakiplerinden (Repomix, Greptile, CodeRabbit, Sourcegraph, Kondukto) ayıran **5 yaratıcı özelliğin tamamı (`C-1`..`C-5`) uygulanıp doğrulanmıştır**:

| Kod     | Yaratıcı Özellik                                                                                                                                | Gelir (1-10) | Değer (1-10) | Efor (1-5) |   Skor   |       Durum        |
| :------ | :---------------------------------------------------------------------------------------------------------------------------------------------- | :----------: | :----------: | :--------: | :------: | :----------------: |
| **C-1** | **Prompt Cache Optimizer & Deterministik Önek Sabitleme** (`ctxman pack --cache-control`, Anthropic `ephemeral` bloklar & OpenAI 1024-token)    |      9       |      10      |    2.0     | **45.0** | **[x] Tamamlandı** |
| **C-2** | **Değişiklik Öncesi Kırılma Etkisi Simülatörü — Blast Radius Analyzer** (`ctxman impact <file[:symbol]>`, `GET /api/v1/impact`, Mermaid & Test) |      9       |      10      |    2.2     | **40.9** | **[x] Tamamlandı** |
| **C-3** | **Mimari Sapma & Katman İhlali Dedektörü (Architecture Drift Detector)** — Yasaklı katmanlar arası (`ui -> billing`) import/çağrı denetimi      |      8       |      8       |    2.5     | **25.6** | **[x] Tamamlandı** |
| **C-4** | **Ajan Oturumu Delta Bağlam Paketleme (Session Delta Pack)** — Önceki turun SHA-256 manifest'ine göre yalnızca değişen dosyaları gönderme       |      7       |      9       |    2.5     | **25.2** | **[x] Tamamlandı** |
| **C-5** | **Hassas Veri Akışı (Taint Path) İzleyici** — PII/Sır kaynaklarından (`req.body.tckn`) log/HTTP çıkışına giden maskelenmemiş akışları yakalama  |      9       |      8       |    3.5     | **20.6** | **[x] Tamamlandı** |

---

### [x] C-1 (Uygulandı): Prompt Cache Optimizer & Deterministik Önek Sabitleme (`lib/pack/cache-optimizer.js`)

- **Neden Yaratıcı ve Değerli:** Çok turlu AI kodlama ajanları (Claude Code, Cursor, Cline, özel kurumsal ajanlar) her turda depo bağlamını yeniden gönderir. Paketlenen dosyaların sırası deterministik değilse veya sık değişen test/görev dosyaları üstte yer alırsa Anthropic (%90 indirimli `cache_control: { type: "ephemeral" }`) ve OpenAI (%50 indirimli 1024+ token otomatik önek önbelleği) her turda bozulur (cache miss).
- **Uygulanan Yetenekler:**
  1. [`lib/pack/cache-optimizer.js`](../lib/pack/cache-optimizer.js): Dosyaları deterministik olarak 3 kararlılık katmanına (`static_core`, `semi_stable`, `volatile_tail`) ayırır (`classifyCacheTier`, `orderEntriesForPromptCache`).
  2. `buildPromptCachePlan`: Anthropic için en fazla 4 adet `cache_control: { type: "ephemeral" }` kesme noktası (`breakpoints`) ve `anthropic.systemBlocks` dizisi üretir; OpenAI için 1024-token/128-token hizalı önek uygunluğunu (`openai.alignedPrefixTokens`) ve `estimatedSavings` yüzdesini hesaplar.

---

### [x] C-2 (Uygulandı): Değişiklik Öncesi Kırılma Etkisi Simülatörü — Blast Radius Analyzer (`lib/impact/index.js`)

- **Uygulanan Yetenekler:**
  1. [`lib/impact/index.js`](../lib/impact/index.js) (`analyzeBlastRadius`, `buildBlastMermaidDiagram`, `formatBlastRadiusReport`): 1-hop/2-hop bağımlıları, AST sembol çağrı noktalarını (`directCallers`), etkilenen test kümesini (`affectedTests` & `recommendedTestCommand`), önerilen inceleyicileri (`reviewers`), `blastScore` (0–100) ve Mermaid diyagramını üretir.
  2. CLI (`ctxman impact <file[:symbol]> [--json]`) ve REST API (`GET /api/v1/impact`) üzerinden sunulmuştur.

---

### [x] C-3 (Uygulandı): Mimari Sapma & Katman İhlali Dedektörü (`lib/architecture/index.js`)

- **Uygulanan Yetenekler:**
  1. [`lib/architecture/index.js`](../lib/architecture/index.js) (`checkArchitectureDrift`, `loadArchitectureConfig`): `.ctxman/architecture.json` (veya varsayılan mimari kurallar) içindeki katman sınırlarını (`from` -> `cannotImport`) AST import ve çağrı kenarları üzerinde denetler.
  2. [`lib/policy/sarif.js`](../lib/policy/sarif.js) (`architectureViolations` -> `ctxman/arch/*`) ve REST API (`GET /api/v1/architecture?format=sarif`) ile tam entegre edilmiştir.

---

### [x] C-4 (Uygulandı): Ajan Oturumu Delta Bağlam Paketleme (`lib/pack/delta.js`)

- **Uygulanan Yetenekler:**
  1. [`lib/pack/delta.js`](../lib/pack/delta.js) (`createPackManifest`, `packDeltaContext`): Önceki `packContext` çıktısının dosya bazlı SHA-256 özetini üretir; sonraki turda değişmeyen dosyalar için 1 satırlık `[UNCHANGED sha256=...]` referansı döndürürken yalnızca değişen (`modified`) veya yeni eklenen (`added`) dosyaların tam içeriğini paketler (`savedTokens`, `savingsPct`).
  2. `POST /api/v1/pack` içinde `previousManifest` gövde alanı ile doğrudan desteklenir.

---

### [x] C-5 (Uygulandı): Hassas Veri Akışı (Taint Path) İzleyici (`lib/security/taint.js`)

- **Uygulanan Yetenekler:**
  1. [`lib/security/taint.js`](../lib/security/taint.js) (`analyzeTaintFlows`): KVKK/BDDK kapsamındaki PII ve sır tanımlayıcılarının (`tckn`, `iban`, `cardNumber`, `password`, `apiKey`, `secretKey`) `redactSecrets` / `redactPII` çağrılmadan `console.*`, `logger.*`, `fetch`/`axios` veya `res.send` çıkışlarına akışını statik olarak izler.
  2. [`lib/policy/sarif.js`](../lib/policy/sarif.js) (`taintFlows` -> `ctxman/taint/TAINT-UNREDACTED-SINK`) ve REST API (`GET /api/v1/taint?format=sarif`) ile entegre edilmiştir.

---

## Faz 3: Sonraki İterasyon İçin 5 Yeni Yaratıcı Özellik Önerisi

| Kod      | Yaratıcı Özellik Önerisi                                                                                                                          | Gelir (1-10) | Değer (1-10) | Efor (1-5) |   Skor   |     Durum     |
| :------- | :------------------------------------------------------------------------------------------------------------------------------------------------ | :----------: | :----------: | :--------: | :------: | :-----------: |
| **F3-1** | **Semantik Ölü Kod & Yetim Sembol Avcısı (Semantic Dead-Symbol Hunter)** — AST çağrı grafiği ve git geçmişiyle sıfır referanslı sembol tespiti    |      8       |      9       |    2.0     | **36.0** | [ ] Planlandı |
| **F3-2** | **Çoklu Model Token & Maliyet Arbitraj Danışmanı (Multi-LLM Cost Router)** — Görev karmaşıklığına göre en ekonomik LLM ve bütçe önerisi           |      9       |      8       |    2.0     | **36.0** | [ ] Planlandı |
| **F3-3** | **Otomatik PR Bölücü (Atomic PR Splitter)** — Büyük PR'ları bağımlılık grafiğindeki bağlantılı bileşenlere göre bağımsız alt PR'lara ayırma       |      8       |      9       |    2.5     | **28.8** | [ ] Planlandı |
| **F3-4** | **Canlı Test Kapsama Haritası & Riskli Satır Eşleştirici (LCOV-to-AST Risk Mapper)** — LCOV raporu ile PR değişen metodlarını kesiştirme          |      8       |      8       |    2.5     | **25.6** | [ ] Planlandı |
| **F3-5** | **Kurumsal Bilgi Köprüsü Senkronizasyonu (ADR & Runbook Drift Checker)** — Kod değiştiğinde güncelliğini yitiren `docs/` ve ADR dosyalarını bulma |      7       |      8       |    2.5     | **22.4** | [ ] Planlandı |

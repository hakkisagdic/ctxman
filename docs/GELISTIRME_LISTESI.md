# Ctxman — Geliştirme Listesi (Rakip Matrisi Boşluk Kapatma ve Yaratıcı Farklılaştırıcı Yol Haritası)

> **Son Güncelleme:** 15 Kasım 2026  
> **Kaynak:** [`docs/RAKIP_ANALIZI.md`](./RAKIP_ANALIZI.md) içindeki rakip parite maddeleri, [`docs/GELIR_MODELI.md`](./GELIR_MODELI.md) ticari gereksinimleri ve Faz 2 yaratıcı farklılaştırıcı özellikler.  
> **Önceliklendirme Formülü:** $\text{Öncelik Skoru} = \frac{\text{Gelir Etkisi (1–10)} \times \text{Kullanıcı Değeri (1–10)}}{\text{Efor (1–5)}}$  
> **Sınıflandırma:**
>
> - **P0:** Ürünün doğrudan satılabilir (monetizable) olması ve Türkiye/Global kurumsal satış kancası için şart olan kalemler.
> - **P1:** Rakip paritesini (Greptile, CodeRabbit, Repomix, Sourcegraph) tamamlayan yüksek değerli kalemler.
> - **P2:** Kurumsal CI/CD ve DevSecOps entegrasyonunu güçlendiren tamamlayıcı kalemler.
> - **C1–C5 (Faz 2 Yaratıcı Özellikler):** Rakiplerin hiçbirinde bulunmayan, Ctxman'i kategori lideri yapan yaratıcı farklılaştırıcı yetenekler (en değerli ikisi `C-1` ve `C-2` uygulanmıştır).

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

## Faz 2: 5 Yaratıcı Farklılaştırıcı Özellik Önerisi (En Değerli İkisi Uygulandı)

Rakip matrisindeki tüm boşluklar kapatıldıktan sonra Ctxman'i rakiplerinden (Repomix, Greptile, CodeRabbit, Sourcegraph, Kondukto) ayıran **5 yaratıcı özellik** tasarlanmış ve **en yüksek skorlu ilk ikisi (`C-1` ve `C-2`) doğrudan uygulanmıştır**:

| Kod     | Yaratıcı Özellik                                                                                                                                | Gelir (1-10) | Değer (1-10) | Efor (1-5) |   Skor   |           Durum            |
| :------ | :---------------------------------------------------------------------------------------------------------------------------------------------- | :----------: | :----------: | :--------: | :------: | :------------------------: |
| **C-1** | **Prompt Cache Optimizer & Deterministik Önek Sabitleme** (`ctxman pack --cache-control`, Anthropic `ephemeral` bloklar & OpenAI 1024-token)    |      9       |      10      |    2.0     | **45.0** | **[x] Tamamlandı (Top 1)** |
| **C-2** | **Değişiklik Öncesi Kırılma Etkisi Simülatörü — Blast Radius Analyzer** (`ctxman impact <file[:symbol]>`, `GET /api/v1/impact`, Mermaid & Test) |      9       |      10      |    2.2     | **40.9** | **[x] Tamamlandı (Top 2)** |
| **C-3** | **Mimari Sapma & Katman İhlali Dedektörü (Architecture Drift Detector)** — Yasaklı katmanlar arası (`ui -> db`) import/çağrı denetimi           |      8       |      8       |    2.5     | **25.6** |       [ ] Planlandı        |
| **C-4** | **Ajan Oturumu Delta Bağlam Paketleme (Session Delta Pack)** — Önceki turun SHA-256 manifest'ine göre yalnızca değişen sembolleri gönderme      |      7       |      9       |    2.5     | **25.2** |       [ ] Planlandı        |
| **C-5** | **Hassas Veri Akışı (Taint Path) İzleyici** — PII/Sır kaynaklarından (`req.body.tckn`) log/LLM çıkışına giden AST çağrı zincirini yakalama      |      9       |      8       |    3.5     | **20.6** |       [ ] Planlandı        |

---

### [x] C-1 (Uygulandı): Prompt Cache Optimizer & Deterministik Önek Sabitleme (`lib/pack/cache-optimizer.js`)

- **Neden Yaratıcı ve Değerli:** Çok turlu AI kodlama ajanları (Claude Code, Cursor, Cline, özel kurumsal ajanlar) her turda depo bağlamını yeniden gönderir. Paketlenen dosyaların sırası deterministik değilse veya sık değişen test/görev dosyaları üstte yer alırsa Anthropic (%90 indirimli `cache_control: { type: "ephemeral" }`) ve OpenAI (%50 indirimli 1024+ token otomatik önek önbelleği) her turda bozulur (cache miss).
- **Uygulanan Yetenekler:**
  1. [`lib/pack/cache-optimizer.js`](../lib/pack/cache-optimizer.js): Dosyaları deterministik olarak 3 kararlılık katmanına (`static_core`, `semi_stable`, `volatile_tail`) ayırır (`classifyCacheTier`, `orderEntriesForPromptCache`). Yapılandırma, şema ve çekirdek kütüphaneler en başa; sık değişen test dosyaları ve dinamik görev yönergeleri (`instructions`) en sona yerleştirilir.
  2. `buildPromptCachePlan`: Anthropic için en fazla 4 adet `cache_control: { type: "ephemeral" }` kesme noktası (`breakpoints`) ve doğrudan API'ye gönderilmeye hazır `anthropic.systemBlocks` dizisi üretir; OpenAI için 1024-token/128-token hizalı önek uygunluğunu (`openai.alignedPrefixTokens`) ve 10 turluk ajan oturumunda tahmini token/maliyet tasarruf yüzdesini (`estimatedSavings`) hesaplar.
  3. [`lib/pack/index.js`](../lib/pack/index.js), [`bin/cm-pack.js`](../bin/cm-pack.js) (`ctxman pack --cache-control`) ve [`lib/api/rest/server.js`](../lib/api/rest/server.js) (`POST /api/v1/pack` `cacheControl` parametresi) ile tam entegre edilmiştir.

---

### [x] C-2 (Uygulandı): Değişiklik Öncesi Kırılma Etkisi Simülatörü — Blast Radius Analyzer (`lib/impact/index.js`)

- **Neden Yaratıcı ve Değerli:** Mevcut araçlar (`git diff` veya PR inceleyiciler) değişiklik yapıldıktan _sonra_ çalışır. Geliştirici veya AI ajanı kritik bir dosyaya ya da fonksiyona (`lib/core/validator.js:validateOrder`) dokunmadan _önce_ "Bunu değiştirirsem hangi üretim modülleri kırılır, hangi çağrı noktaları etkilenir, hangi minimum testleri koşmalıyım ve kime danışmalıyım?" sorusunun cevabını tek komutta alır.
- **Uygulanan Yetenekler:**
  1. [`lib/impact/index.js`](../lib/impact/index.js) (`analyzeBlastRadius`, `buildBlastMermaidDiagram`, `formatBlastRadiusReport`):
     - 1-hop doğrudan üretim importer'larını (`directImporters`) ve 2-hop dolaylı bağımlıları (`transitiveImporters`) hesaplar.
     - AST sembol çağrı grafiği üzerinden hedef fonksiyonu çağıran tüm noktaları (`directCallers` ve `transitiveCallers`) satır numaralarıyla bulur.
     - Etkilenen minimum test kümesini (`affectedTests`) ve doğrudan çalıştırılabilir test komutunu (`recommendedTestCommand`: `npx vitest run ...`) çıkarır.
     - Git geçmişinden önerilen kod sahiplerini (`reviewers`) getirir, deterministik `blastScore` (0–100) + `severity` (`low` | `medium` | `high` | `critical`) ve otomatik **Mermaid (`flowchart LR`)** etki diyagramı üretir.
  2. CLI (`ctxman impact <file[:symbol]> [--json]`), REST API (`GET /api/v1/impact?target=<file[:symbol]>`) ve programatik SDK (`import { analyzeBlastRadius } from 'ctxman'`) üzerinden kullanıma sunulmuştur.

---

### [ ] C-3 (Planlandı): Mimari Sapma & Katman İhlali Dedektörü (Architecture Drift Detector)

- `.ctxman/architecture.json` içinde tanımlanan katman kurallarını (ör. `ui/**` katmanı doğrudan `db/**` veya `billing/store.js` modülünü import edemez, yalnızca `api/**` üzerinden geçebilir) AST import ve sembol çağrı grafiği üzerinde denetleyip SARIF v2.1.0 çıktısı üreten mimari yönetişim kapısı.

### [ ] C-4 (Planlandı): Ajan Oturumu Delta Bağlam Paketleme (Session Delta Pack)

- Çok adımlı ajan görevlerinde önceki `ctxman pack` çıktısının dosya/sembol SHA-256 özetini saklayıp (`--since-pack <manifest>`), bir sonraki turda değişmeyen dosyalar için yalnızca 1 satırlık `[UNCHANGED: sha256]` referansı ve yalnızca değişen fonksiyonların tam gövdesini göndererek %80+ token tasarrufu sağlayan artımlı paketleyici.

### [ ] C-5 (Planlandı): Hassas Veri Akışı (Taint Path) İzleyici

- KVKK/BDDK kapsamındaki PII alanlarının (`tckn`, `iban`, `cardNumber`, `password`) okunduğu fonksiyonlardan başlayarak AST çağrı grafiği boyunca `console.log`, `logger.info` veya dış HTTP/LLM çağrılarına maskelenmeden (`redactSecrets` çağrılmadan) ulaşıp ulaşmadığını statik olarak izleyen güvenlik analizi.

---

## Faz 1 Detaylı İş Kalemleri ve Kabul Ölçütleri Arşivi

### [x] P0-1: Kullanım Ölçümü (Metering), Paket/Kota Yönetimi, Fatura Kaydı ve `iyzico` Ödeme Sağlayıcı Soyutlaması

- **Rakip Matrisi Karşılığı:** #16 (Unblocked, Greptile, Augment Code, CodeRabbit ticari katman paritesi).
- **Durum:** Tamamlandı (`lib/billing/plans.js`, `lib/billing/store.js`, `lib/billing/providers/index.js`, `test/billing.test.js`).

### [x] P0-2: KVKK / BDDK Uyumlu PII Maskeleme (TCKN, TR IBAN, Kredi Kartı, E-posta, Tel) ve `kvkk-bddk` Politika Preset'i

- **Rakip Matrisi Karşılığı:** #13 (Türkiye regüle kurumsal pazar & Kondukto veri güvenliği paritesi).
- **Durum:** Tamamlandı (`lib/utils/secret-redactor.js`, `lib/policy/index.js`, `test/kvkk-bddk-redaction.test.js`).

### [x] P0-3: Ajan Yönergesi ve Proje Kuralları Otomatik Keşfi (`CLAUDE.md`, `AGENTS.md`, `.cursorrules`, Copilot)

- **Rakip Matrisi Karşılığı:** #12 (Repomix ve Greptile kural/yönerge keşfi paritesi).
- **Durum:** Tamamlandı (`lib/pack/rules-discovery.js`, `test/rules-discovery.test.js`).

### [x] P1-1: REST API v1 Bilgi Grafiği Uç Noktası (`GET /api/v1/graph`)

- **Rakip Matrisi Karşılığı:** #15 (Sourcegraph & Greptile Code Graph REST API paritesi).
- **Durum:** Tamamlandı (`lib/api/rest/server.js`, `test/rest-server-client-errors.test.js`).

### [x] P1-2: PR İnceleme Güven/Risk Skoru, Kural Denetimi ve Otomatik Mermaid Diyagramı (`ctxman pr`)

- **Rakip Matrisi Karşılığı:** #14 (Greptile Confidence Score + Scoped Rules & CodeRabbit Mermaid Walkthrough paritesi).
- **Durum:** Tamamlandı (`lib/pr/pr-intelligence.js`, `test/pr-intelligence.test.js`).

### [x] P1-3: Uzak Git Deposu Doğrudan Analiz ve Paketleme (`--remote <url|owner/repo> --branch <ref>`)

- **Rakip Matrisi Karşılığı:** #11 (Repomix `--remote` ve GitIngest URL/branch paritesi).
- **Durum:** Tamamlandı (`lib/utils/remote-repo.js`, `test/remote-repo.test.js`).

### [x] P2-1: CI/CD Kalite ve Politika Kapısı için Standart SARIF v2.1.0 Rapor Çıktısı

- **Rakip Matrisi Karşılığı:** #17 (Kondukto & CodeRabbit GitHub Security / CI Gate paritesi).
- **Durum:** Tamamlandı (`lib/policy/sarif.js`, `test/sarif-report.test.js`).

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
> - **F3-1..F3-5 (Faz 3 Yaratıcı Özellik Önerileri — En Değerli İkisi `F3-1` & `F3-2` Uygulandı):** Faz 2 tamamlandıktan sonra önerilen 5 yeni yaratıcı yetenek; en yüksek skorlu ilk ikisi (`F3-1` ve `F3-2`) doğrudan uygulanmıştır.

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

| Kod     | Yaratıcı Özellik                                                                                                                                | Gelir (1-10) | Değer (1-10) | Efor (1-5) |   Skor   |       Durum        |
| :------ | :---------------------------------------------------------------------------------------------------------------------------------------------- | :----------: | :----------: | :--------: | :------: | :----------------: |
| **C-1** | **Prompt Cache Optimizer & Deterministik Önek Sabitleme** (`ctxman pack --cache-control`, Anthropic `ephemeral` bloklar & OpenAI 1024-token)    |      9       |      10      |    2.0     | **45.0** | **[x] Tamamlandı** |
| **C-2** | **Değişiklik Öncesi Kırılma Etkisi Simülatörü — Blast Radius Analyzer** (`ctxman impact <file[:symbol]>`, `GET /api/v1/impact`, Mermaid & Test) |      9       |      10      |    2.2     | **40.9** | **[x] Tamamlandı** |
| **C-3** | **Mimari Sapma & Katman İhlali Dedektörü (Architecture Drift Detector)** — Yasaklı katmanlar arası (`ui -> billing`) import/çağrı denetimi      |      8       |      8       |    2.5     | **25.6** | **[x] Tamamlandı** |
| **C-4** | **Ajan Oturumu Delta Bağlam Paketleme (Session Delta Pack)** — Önceki turun SHA-256 manifest'ine göre yalnızca değişen dosyaları gönderme       |      7       |      9       |    2.5     | **25.2** | **[x] Tamamlandı** |
| **C-5** | **Hassas Veri Akışı (Taint Path) İzleyici** — PII/Sır kaynaklarından (`req.body.tckn`) log/HTTP çıkışına giden maskelenmemiş akışları yakalama  |      9       |      8       |    3.5     | **20.6** | **[x] Tamamlandı** |

---

## Faz 3: 5 Yeni Yaratıcı Özellik Önerisi (En Değerli İkisi `F3-1` & `F3-2` Uygulandı)

| Kod      | Yaratıcı Özellik Önerisi                                                                                                                          | Gelir (1-10) | Değer (1-10) | Efor (1-5) |   Skor   |           Durum            |
| :------- | :------------------------------------------------------------------------------------------------------------------------------------------------ | :----------: | :----------: | :--------: | :------: | :------------------------: |
| **F3-1** | **Semantik Ölü Kod & Yetim Sembol Avcısı (Semantic Dead-Symbol Hunter)** — AST çağrı grafiği ve import grafiğiyle sıfır referanslı sembol tespiti |      8       |      9       |    2.0     | **36.0** | **[x] Tamamlandı (Top 1)** |
| **F3-2** | **Çoklu Model Token & Maliyet Arbitraj Danışmanı (Multi-LLM Cost Router)** — Görev karmaşıklığına göre en ekonomik LLM ve bütçe önerisi           |      9       |      8       |    2.0     | **36.0** | **[x] Tamamlandı (Top 2)** |
| **F3-3** | **Otomatik PR Bölücü (Atomic PR Splitter)** — Büyük PR'ları bağımlılık grafiğindeki bağlantılı bileşenlere göre bağımsız alt PR'lara ayırma       |      8       |      9       |    2.5     | **28.8** |       [ ] Planlandı        |
| **F3-4** | **Canlı Test Kapsama Haritası & Riskli Satır Eşleştirici (LCOV-to-AST Risk Mapper)** — LCOV raporu ile PR değişen metodlarını kesiştirme          |      8       |      8       |    2.5     | **25.6** |       [ ] Planlandı        |
| **F3-5** | **Kurumsal Bilgi Köprüsü Senkronizasyonu (ADR & Runbook Drift Checker)** — Kod değiştiğinde güncelliğini yitiren `docs/` ve ADR dosyalarını bulma |      7       |      8       |    2.5     | **22.4** |       [ ] Planlandı        |

---

### [x] F3-1 (Uygulandı): Semantik Ölü Kod & Yetim Sembol Avcısı (`lib/architecture/dead-symbols.js`)

- **Uygulanan Yetenekler:**
  1. [`lib/architecture/dead-symbols.js`](../lib/architecture/dead-symbols.js) (`findDeadSymbols`): Depo import grafiği ve AST sembol çağrı grafiği (`buildRepoGraph`) üzerinde gelen import/çağrı sayısı sıfır olan yetim modülleri (`orphanModules`) ve hem dosya dışından hem dosya içinden hiç çağrılmayan ölü fonksiyonları (`deadSymbols`) tespit eder.
  2. REST API (`GET /api/v1/dead-symbols`) ve programatik SDK (`import { findDeadSymbols } from 'ctxman'`) ile kullanıma sunulmuştur.

---

### [x] F3-2 (Uygulandı): Çoklu Model Token & Maliyet Arbitraj Danışmanı (`lib/count/cost-router.js`)

- **Uygulanan Yetenekler:**
  1. [`lib/count/cost-router.js`](../lib/count/cost-router.js) (`recommendModelRoute`, `classifyTaskComplexity`, `MODEL_CATALOG`): Görev açıklamasını ve girdi token sayısını analiz ederek görevi `fast`, `balanced` veya `reasoning` karmaşıklık katmanına ayırır; 7 büyük LLM modeli (DeepSeek V3, Gemini 2.5 Flash/Pro, GPT-4o/mini, Claude Haiku/Sonnet) için çok turlu ajan oturumunda önbelleksiz (`uncachedSessionUsd`) ve prompt-cache aktif (`cachedSessionUsd`) maliyetleri hesaplayıp en ekonomik modeli ve önerilen token bütçesini (`recommendedBudget`) döndürür.
  2. REST API (`GET /api/v1/cost-router`) ve programatik SDK (`import { recommendModelRoute } from 'ctxman'`) ile kullanıma sunulmuştur.

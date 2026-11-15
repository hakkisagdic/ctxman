# Ctxman — Geliştirme Listesi (Rakip Matrisi Boşluk Kapatma ve Yaratıcı Farklılaştırıcı Yol Haritası)

> **Son Güncelleme:** 15 Kasım 2026  
> **Kaynak:** [`docs/RAKIP_ANALIZI.md`](./RAKIP_ANALIZI.md) içindeki rakip parite maddeleri, [`docs/GELIR_MODELI.md`](./GELIR_MODELI.md) ticari gereksinimleri ve Faz 2–8 yaratıcı farklılaştırıcı özellikler.  
> **Önceliklendirme Formülü:** $\text{Öncelik Skoru} = \frac{\text{Gelir Etkisi (1–10)} \times \text{Kullanıcı Değeri (1–10)}}{\text{Efor (1–5)}}$  
> **Sınıflandırma:**
>
> - **P0–P2 (Faz 1 — %100 Tamamlandı):** Rakip paritesi ve ticari altyapı (`iyzico`, KVKK/BDDK PII, kural keşfi, bilgi grafiği REST, PR zekası, uzak depo, SARIF).
> - **C1–C5 (Faz 2 — %100 Tamamlandı):** Rakiplerin hiçbirinde bulunmayan ilk 5 yaratıcı farklılaştırıcı yetenek (`C-1`..`C-5` tamamı uygulandı).
> - **F3-1..F3-5 (Faz 3 — %100 Tamamlandı):** İkinci 5 yaratıcı farklılaştırıcı yetenek (`F3-1`..`F3-5` tamamı uygulandı).
> - **F4-1..F4-5 (Faz 4 — %100 Tamamlandı):** Üçüncü 5 yaratıcı farklılaştırıcı yetenek (`F4-1`..`F4-5` tamamı uygulandı).
> - **F5-1..F5-5 (Faz 5 — %100 Tamamlandı):** Dördüncü 5 yaratıcı farklılaştırıcı yetenek (`F5-1`..`F5-5` tamamı uygulandı).
> - **F6-1..F6-5 (Faz 6 — %100 Tamamlandı):** Beşinci 5 yaratıcı farklılaştırıcı yetenek (`F6-1`..`F6-5` tamamı uygulandı).
> - **F7-1..F7-5 (Faz 7 — %100 Tamamlandı):** Altıncı 5 yaratıcı farklılaştırıcı yetenek (`F7-1`..`F7-5` tamamı uygulandı).
> - **F8-1..F8-5 (Faz 8 — %100 Tamamlandı):** Yedinci 5 yaratıcı farklılaştırıcı yetenek (`F8-1`..`F8-5` tamamı uygulandı).
> - **F9-1..F9-5 (Faz 9 — Sonraki İterasyon Önerileri):** Gelecek sürüm için önerilen 5 yeni yaratıcı özellik.

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

## Faz 3: 5 Yaratıcı Farklılaştırıcı Özellik (`F3-1`..`F3-5` — %100 Tamamlandı)

| Kod      | Yaratıcı Özellik                                                                                                                                   | Gelir (1-10) | Değer (1-10) | Efor (1-5) |   Skor   |       Durum        |
| :------- | :------------------------------------------------------------------------------------------------------------------------------------------------- | :----------: | :----------: | :--------: | :------: | :----------------: |
| **F3-1** | **Semantik Ölü Kod & Yetim Sembol Avcısı (`findDeadSymbols`)** — AST çağrı grafiği ve import grafiğiyle sıfır referanslı sembol tespiti            |      8       |      9       |    2.0     | **36.0** | **[x] Tamamlandı** |
| **F3-2** | **Çoklu Model Token & Maliyet Arbitraj Danışmanı (`recommendModelRoute`)** — Görev karmaşıklığına göre en ekonomik LLM ve bütçe önerisi            |      9       |      8       |    2.0     | **36.0** | **[x] Tamamlandı** |
| **F3-3** | **Otomatik PR Bölücü (`splitPrIntoAtomicGroups`)** — Büyük PR'ları bağımlılık grafiğindeki bağlantılı bileşenlere göre bağımsız alt PR'lara ayırma |      8       |      9       |    2.5     | **28.8** | **[x] Tamamlandı** |
| **F3-4** | **Canlı Test Kapsama Haritası & Riskli Satır Eşleştirici (`analyzeUncoveredRisk`)** — LCOV raporu ile AST metodlarını kesiştirme                   |      8       |      8       |    2.5     | **25.6** | **[x] Tamamlandı** |
| **F3-5** | **Kurumsal Bilgi Köprüsü Senkronizasyonu (`checkDocDrift`)** — Kod değiştiğinde güncelliğini yitiren `docs/` ve ADR dosyalarını bulma              |      7       |      8       |    2.5     | **22.4** | **[x] Tamamlandı** |

---

## Faz 4: 5 Yaratıcı Farklılaştırıcı Özellik (`F4-1`..`F4-5` — %100 Tamamlandı)

| Kod      | Yaratıcı Özellik                                                                                                                                               | Gelir (1-10) | Değer (1-10) | Efor (1-5) |   Skor   |       Durum        |
| :------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------: | :----------: | :--------: | :------: | :----------------: |
| **F4-1** | **Ajan Halüsinasyon & Sembol Doğrulayıcı (`verifyPatchGrounding` & `POST /api/v1/verify-patch`)** — Yamadaki import/fonksiyon çağrılarının varlığını denetleme |      9       |      9       |    2.0     | **40.5** | **[x] Tamamlandı** |
| **F4-2** | **Döngüsel Bağımlılık Kırıcı (`findCircularDependencies` & `GET /api/v1/circular-deps`)** — Tarjan SCC ile import döngülerini bulup kesim kenarı önerme        |      8       |      9       |    2.0     | **36.0** | **[x] Tamamlandı** |
| **F4-3** | **Çoklu Depo API Sözleşme Uyumluluk Denetçisi (`checkCrossRepoContracts`)** — Servisler arası REST/sembol şema kırılmalarını statik yakalama                   |      8       |      8       |    2.5     | **25.6** | **[x] Tamamlandı** |
| **F4-4** | **Git Bisect Odaklı Regresyon Bağlam Paketleyici (`buildBisectContextPack`)** — İki commit arasındaki aday suçlu commitleri graf merkeziliğiyle puanlama       |      7       |      8       |    2.5     | **22.4** | **[x] Tamamlandı** |
| **F4-5** | **Kurumsal Lisans & Tedarik Zinciri Risk Tarayıcı (`checkLicenseCompliance` & `GET /api/v1/license-gate`)** — CycloneDX SBOM ve SPDX lisans politikası kapısı  |      8       |      7       |    2.5     | **22.4** | **[x] Tamamlandı** |

---

## Faz 5: 5 Yaratıcı Farklılaştırıcı Özellik (`F5-1`..`F5-5` — %100 Tamamlandı)

| Kod      | Yaratıcı Özellik                                                                                                                                              | Gelir (1-10) | Değer (1-10) | Efor (1-5) |   Skor   |       Durum        |
| :------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------ | :----------: | :----------: | :--------: | :------: | :----------------: |
| **F5-1** | **Ajan Bağlam Bütçesi Otomatik Daraltıcı (`pruneContextToBudget`)** — Token sınırı dolduğunda düşük entropili blokları AST düzeyinde kademeli budama          |      9       |      9       |    2.0     | **40.5** | **[x] Tamamlandı** |
| **F5-2** | **Semantik Klon & Kopya Mantık Dedektörü (`findSemanticClones`)** — Farklı dosyalardaki yapısal olarak eşdeğer metodları 3-shingle Jaccard ile yakalama       |      8       |      9       |    2.0     | **36.0** | **[x] Tamamlandı** |
| **F5-3** | **Kurumsal Bilgi Kaybı & Bus-Factor Risk Haritası (`analyzeBusFactor`)** — Tek kişiye bağımlı bilgi silosu modülleri ve depo Bus-Factor değerini bulma        |      8       |      8       |    2.0     | **32.0** | **[x] Tamamlandı** |
| **F5-4** | **Veritabanı Şema & Sorgu Darboğazı Tespiti (`findQueryBottlenecks`)** — Döngü içi N+1 SQL/ORM/fetch çağrılarını ve sınırsız `SELECT *` sorgularını bulma     |      8       |      8       |    2.5     | **25.6** | **[x] Tamamlandı** |
| **F5-5** | **Çok Dilli İstem & Kural Çevirici (`compileAgentRules`)** — Tek bir `.ctxman/rules.json` tanımından `CLAUDE.md`, `AGENTS.md`, `.cursorrules`, Copilot üretme |      7       |      8       |    2.0     | **28.0** | **[x] Tamamlandı** |

---

## Faz 6: 5 Yaratıcı Farklılaştırıcı Özellik (`F6-1`..`F6-5` — %100 Tamamlandı)

| Kod      | Yaratıcı Özellik                                                                                                                                       | Gelir (1-10) | Değer (1-10) | Efor (1-5) |   Skor   |       Durum        |
| :------- | :----------------------------------------------------------------------------------------------------------------------------------------------------- | :----------: | :----------: | :--------: | :------: | :----------------: |
| **F6-1** | **Canlı Ortam Değişkeni & Konfigürasyon Sözleşme Denetçisi (`checkEnvConfigDrift`)** — `process.env.*` referanslarını `.env.example` ile eşleştirme    |      8       |      9       |    2.0     | **36.0** | **[x] Tamamlandı** |
| **F6-2** | **Otomatik Sembolik Test İskeleti Üretici (`generateTestScaffold`)** — Kapsanmayan fonksiyon imzalarından hazır Vitest/Jest birim test şablonu üretme  |      8       |      9       |    2.0     | **36.0** | **[x] Tamamlandı** |
| **F6-3** | **Geriye Dönük Uyumluluk & SemVer Kırılma Dedektörü (`analyzeSemverBreakage`)** — İki sürüm arasında silinen/değişen export imzalarından SemVer önerme |      8       |      8       |    2.0     | **32.0** | **[x] Tamamlandı** |
| **F6-4** | **İstem Enjeksiyonu & Zararlı Bağlam Kalkanı (`sanitizePromptContext`)** — Depo yorumları/dokümanlarındaki gizli jailbreak/prompt injection tespiti    |      9       |      8       |    2.5     | **28.8** | **[x] Tamamlandı** |
| **F6-5** | **Mikroservis Olay & Mesaj Şeması İzleyici (`mapEventLineage`)** — `emit`/`publish` ve `on`/`subscribe` kanallarını eşleştirip yetim olayları bulma    |      7       |      8       |    2.5     | **22.4** | **[x] Tamamlandı** |

---

## Faz 7: 5 Yaratıcı Farklılaştırıcı Özellik (`F7-1`..`F7-5` — %100 Tamamlandı)

| Kod      | Yaratıcı Özellik                                                                                                                                                | Gelir (1-10) | Değer (1-10) | Efor (1-5) |   Skor   |       Durum        |
| :------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------: | :----------: | :--------: | :------: | :----------------: |
| **F7-1** | **Özellik Bayrağı Yaşam Döngüsü & Bayat Bayrak Avcısı (`findStaleFeatureFlags`)** — Kalıcılaşmış ve temizlenmemiş feature flag dallarını bulma                  |      8       |      9       |    2.0     | **36.0** | **[x] Tamamlandı** |
| **F7-2** | **Otomatik Sürüm Notu & Müşteri Odaklı Changelog Üretici (`generateSemanticReleaseNotes`)** — Commit ve sembol grafiğinden kategorize sürüm notu derleme        |      8       |      8       |    2.0     | **32.0** | **[x] Tamamlandı** |
| **F7-3** | **API Hız Sınırı & Dayanıklılık Denetçisi (`auditResiliencePatterns`)** — Timeout/AbortSignal tanımlanmamış dış HTTP/fetch çağrılarını statik yakalama          |      8       |      8       |    2.5     | **25.6** | **[x] Tamamlandı** |
| **F7-4** | **Çok Dilli Çeviri (i18n) Anahtar Tutarlılığı Denetçisi (`checkI18nDrift`)** — Çoklu dil sözlükleri (`en`/`tr`) arasındaki eksik anahtarları bulma              |      7       |      8       |    2.0     | **28.0** | **[x] Tamamlandı** |
| **F7-5** | **Ajan Görev Planı & Alt-Görev Ayrıştırıcı (`decomposeTaskIntoSteps`)** — Doğal dil görevini etkilenen dosya katmanlarına göre sıralı uygulama adımlarına bölme |      9       |      9       |    2.5     | **32.4** | **[x] Tamamlandı** |

---

## Faz 8: 5 Yaratıcı Farklılaştırıcı Özellik (`F8-1`..`F8-5` — %100 Tamamlandı)

| Kod      | Yaratıcı Özellik Önerisi                                                                                                                                     | Gelir (1-10) | Değer (1-10) | Efor (1-5) |   Skor   |       Durum        |
| :------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------: | :----------: | :--------: | :------: | :----------------: |
| **F8-1** | **Teknik Borç & Karmaşıklık Sıcak Nokta Haritası (`analyzeTechDebtHotspots`)** — Git değişim sıklığı (churn) ile metod karmaşıklığını çarpıp önceliklendirme |      8       |      9       |    2.0     | **36.0** | **[x] Tamamlandı** |
| **F8-2** | **Kırılgan Test (Flaky Test) Deseni Dedektörü (`detectFlakyTestPatterns`)** — Testlerdeki sabit `setTimeout`, rastgele sayı ve sıraya bağımlı durum tespiti  |      8       |      9       |    2.0     | **36.0** | **[x] Tamamlandı** |
| **F8-3** | **Yüksek Entropili Sır & Kanarya Token Tarayıcı (`scanHighEntropySecrets`)** — Shannon entropisiyle regex'ten kaçan özel API/kripto anahtarlarını yakalama   |      9       |      8       |    2.5     | **28.8** | **[x] Tamamlandı** |
| **F8-4** | **GraphQL & OpenAPI Şema-Kod Senkronizasyon Denetçisi (`checkSchemaCodeParity`)** — `.graphql`/`openapi.json` tanımları ile bağlı handler'ları eşleştirme    |      8       |      8       |    2.5     | **25.6** | **[x] Tamamlandı** |
| **F8-5** | **Çoklu Ajan Çakışma Önleyici & Dosya Kilit Planlayıcı (`planParallelAgentWorkspaces`)** — Paralel çalışan ajanlar için kesişmeyen dosya kümeleri atama      |      9       |      8       |    2.5     | **28.8** | **[x] Tamamlandı** |

---

## Faz 9: Sonraki İterasyon İçin 5 Yeni Yaratıcı Özellik Önerisi

| Kod      | Yaratıcı Özellik Önerisi                                                                                                                                    | Gelir (1-10) | Değer (1-10) | Efor (1-5) |   Skor   |     Durum     |
| :------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------: | :----------: | :--------: | :------: | :-----------: |
| **F9-1** | **Veritabanı Göç (Migration) Geri Dönüş & Kilit Risk Denetçisi (`auditMigrationSafety`)** — SQL/ORM migration dosyalarında kilitli tablo/veri kaybı tespiti |      9       |      9       |    2.0     | **40.5** | [ ] Planlandı |
| **F9-2** | **Ajan Öz-Onarım (Self-Healing) Test Döngüsü Orkestratörü (`buildSelfHealingPrompt`)** — Kırılan test çıktısı ve AST farkından tek adımlık onarım istemi    |      9       |      9       |    2.2     | **36.8** | [ ] Planlandı |
| **F9-3** | **Performans Bütçesi & Paket Boyutu Etkisi Tahmincisi (`estimateBundleImpact`)** — Yeni eklenen importların ağaca-sallama (tree-shaking) ve boyut analizi   |      8       |      8       |    2.0     | **32.0** | [ ] Planlandı |
| **F9-4** | **Kurumsal Denetim & Uyumluluk Kanıt Paketi Üretici (`generateComplianceEvidencePack`)** — BDDK/KVKK/SOC2 denetçileri için imzalı özet rapor derleyici      |      9       |      8       |    2.5     | **28.8** | [ ] Planlandı |
| **F9-5** | **Çağrı Grafiği Tabanlı Kaos & Hata Enjeksiyon Noktası Önerici (`suggestChaosTargets`)** — Kritik dış bağımlılık sınırlarında kaos testi hedefleri bulma    |      7       |      8       |    2.0     | **28.0** | [ ] Planlandı |

# Ctxman — Geliştirme Listesi (Rakip Matrisi Boşluk Kapatma ve Yaratıcı Farklılaştırıcı Yol Haritası)

> **Son Güncelleme:** 17 Kasım 2026  
> **Kaynak:** [`docs/RAKIP_ANALIZI.md`](./RAKIP_ANALIZI.md) içindeki rakip parite maddeleri, [`docs/GELIR_MODELI.md`](./GELIR_MODELI.md) ticari gereksinimleri ve Faz 2–19 yaratıcı farklılaştırıcı özellikler.  
> **Önceliklendirme Formülü:** $\text{Öncelik Skoru} = \frac{\text{Gelir Etkisi (1–10)} \times \text{Kullanıcı Değeri (1–10)}}{\text{Efor (1–5)}}$  
> **Sınıflandırma:**
>
> - **P0–P2 (Faz 1 — kodda uygulandı):** Rakip paritesi ve ticari altyapı (`iyzico`, KVKK/BDDK PII, kural keşfi, bilgi grafiği REST, PR zekası, uzak depo, SARIF).
> - **C1–C5 (Faz 2 — kodda uygulandı):** Rakiplerin hiçbirinde bulunmayan ilk 5 yaratıcı farklılaştırıcı yetenek (`C-1`..`C-5` kodda uygulandı).
> - **F3-1..F3-5 (Faz 3 — kodda uygulandı):** İkinci 5 yaratıcı farklılaştırıcı yetenek (`F3-1`..`F3-5` kodda uygulandı).
> - **F4-1..F4-5 (Faz 4 — kodda uygulandı):** Üçüncü 5 yaratıcı farklılaştırıcı yetenek (`F4-1`..`F4-5` kodda uygulandı).
> - **F5-1..F5-5 (Faz 5 — kodda uygulandı):** Dördüncü 5 yaratıcı farklılaştırıcı yetenek (`F5-1`..`F5-5` kodda uygulandı).
> - **F6-1..F6-5 (Faz 6 — kodda uygulandı):** Beşinci 5 yaratıcı farklılaştırıcı yetenek (`F6-1`..`F6-5` kodda uygulandı).
> - **F7-1..F7-5 (Faz 7 — kodda uygulandı):** Altıncı 5 yaratıcı farklılaştırıcı yetenek (`F7-1`..`F7-5` kodda uygulandı).
> - **F8-1..F8-5 (Faz 8 — kodda uygulandı):** Yedinci 5 yaratıcı farklılaştırıcı yetenek (`F8-1`..`F8-5` kodda uygulandı).
> - **F9-1..F9-5 (Faz 9 — kodda uygulandı):** Sekizinci 5 yaratıcı farklılaştırıcı yetenek (`F9-1`..`F9-5` kodda uygulandı).
> - **F10-1..F10-5 (Faz 10 — kodda uygulandı):** Dokuzuncu 5 yaratıcı farklılaştırıcı yetenek (`F10-1`..`F10-5` kodda uygulandı).
> - **F11-1..F11-5 (Faz 11 — kodda uygulandı):** Onuncu 5 yaratıcı farklılaştırıcı yetenek (`F11-1`..`F11-5` kodda uygulandı).
> - **F12-1..F12-5 (Faz 12 — kodda uygulandı):** On birinci 5 yaratıcı farklılaştırıcı yetenek (`F12-1`..`F12-5` kodda uygulandı).
> - **F13-1..F13-5 (Faz 13 — kodda uygulandı):** On ikinci 5 yaratıcı farklılaştırıcı yetenek (`F13-1`..`F13-5` kodda uygulandı).
> - **F14-1..F14-5 (Faz 14 — kodda uygulandı):** On üçüncü 5 yaratıcı farklılaştırıcı yetenek (`F14-1`..`F14-5` kodda uygulandı).
> - **F15-1..F15-5 (Faz 15 — kodda uygulandı):** On dördüncü 5 yaratıcı farklılaştırıcı yetenek (`F15-1`..`F15-5` kodda uygulandı).
> - **F16-1..F16-5 (Faz 16 — kodda uygulandı):** On beşinci 5 yaratıcı farklılaştırıcı yetenek (`F16-1`..`F16-5` kodda uygulandı).
> - **F17-1..F17-5 (Faz 17 — kodda uygulandı):** On altıncı 5 yaratıcı farklılaştırıcı yetenek (`F17-1`..`F17-5` kodda uygulandı).
> - **F18-1..F18-5 (Faz 18 — kodda uygulandı):** On yedinci 5 yaratıcı farklılaştırıcı yetenek (`F18-1`..`F18-5` kodda uygulandı).
> - **F19-1..F19-5 (Faz 19 — Sonraki İterasyon Önerileri):** Gelecek sürüm için önerilen 5 yeni yaratıcı özellik.

Faz 1–18 kalemleri bu commit itibarıyla kodda uygulanmıştır ve yerel test takımı bunları kapsar. Tablodaki "[x] Kodda" işareti bu anlamdadır. GitHub Actions `CI` iş akışı depo ayarlarında elle kapatılmıştır (`disabled_manually`) ve 10 Kasım 2026'dan beri bu kalemleri doğrulamamıştır. Hiçbir faz için yüzde yüz tamamlandı denmez. Faz 19 uygulanmış değildir.

---

## Faz 1: Rakip Matrisi Boşluk Kapatma Tablosu (`v3.3.0` — kodda uygulandı)

| Kod      | Matris Ref | İş Kalemi                                                                                                       | Önceki Durum | Gelir (1-10) | Değer (1-10) | Efor (1-5) |   Skor   | Öncelik |     Durum      |
| :------- | :--------: | :-------------------------------------------------------------------------------------------------------------- | :----------: | :----------: | :----------: | :--------: | :------: | :-----: | :------------: |
| **P0-1** |    #16     | Kullanım Ölçümü (Metering), Paket/Kota Yönetimi, Fatura Kaydı (`node:sqlite`) ve `iyzico` Ödeme Soyutlaması     |     Yok      |      10      |      9       |    3.0     | **30.0** | **P0**  | [x] Kodda      |
| **P0-2** |    #13     | KVKK / BDDK Uyumlu PII Maskeleme (TCKN, TR IBAN, Kredi Kartı, E-posta, Tel) ve `kvkk-bddk` Politika Preset'i    |    Kısmi     |      10      |      9       |    2.0     | **45.0** | **P0**  | [x] Kodda      |
| **P0-3** |    #12     | Ajan Yönergesi ve Proje Kuralları Otomatik Keşfi (`CLAUDE.md`, `AGENTS.md`, `.cursorrules`, Copilot)            |     Yok      |      8       |      10      |    2.0     | **40.0** | **P0**  | [x] Kodda      |
| **P1-1** |    #15     | REST API v1 Bilgi Grafiği Uç Noktası (`GET /api/v1/graph`) — Tekli ve Çoklu Depo (`repos`)                      |    Kısmi     |      7       |      8       |    1.5     | **37.3** | **P1**  | [x] Kodda      |
| **P1-2** |    #14     | PR İnceleme Güven/Risk Skoru, Kural Denetimi (`.ctxman/rules.json`) ve Otomatik Mermaid Diyagramı (`ctxman pr`) |    Kısmi     |      9       |      9       |    2.5     | **32.4** | **P1**  | [x] Kodda      |
| **P1-3** |    #11     | Uzak Git Deposu Doğrudan Analiz ve Paketleme (`--remote <url\|owner/repo> --branch <ref>`)                      |    Kısmi     |      7       |      9       |    2.5     | **25.2** | **P1**  | [x] Kodda      |
| **P2-1** |    #17     | CI/CD Kalite ve Politika Kapısı için Standart SARIF v2.1.0 Rapor Çıktısı (`policy` & `pr`)                      |    Kısmi     |      7       |      7       |    2.0     | **24.5** | **P2**  | [x] Kodda      |

---

## Faz 2: 5 Yaratıcı Farklılaştırıcı Özellik (`C-1`..`C-5` — kodda uygulandı)

| Kod     | Yaratıcı Özellik                                                                                                                                | Gelir (1-10) | Değer (1-10) | Efor (1-5) |   Skor   |       Durum        |
| :------ | :---------------------------------------------------------------------------------------------------------------------------------------------- | :----------: | :----------: | :--------: | :------: | :----------------: |
| **C-1** | **Prompt Cache Optimizer & Deterministik Önek Sabitleme** (`ctxman pack --cache-control`, Anthropic `ephemeral` bloklar & OpenAI 1024-token)    |      9       |      10      |    2.0     | **45.0** | **[x] Kodda**      |
| **C-2** | **Değişiklik Öncesi Kırılma Etkisi Simülatörü — Blast Radius Analyzer** (`ctxman impact <file[:symbol]>`, `GET /api/v1/impact`, Mermaid & Test) |      9       |      10      |    2.2     | **40.9** | **[x] Kodda**      |
| **C-3** | **Mimari Sapma & Katman İhlali Dedektörü (Architecture Drift Detector)** — Yasaklı katmanlar arası (`ui -> billing`) import/çağrı denetimi      |      8       |      8       |    2.5     | **25.6** | **[x] Kodda**      |
| **C-4** | **Ajan Oturumu Delta Bağlam Paketleme (Session Delta Pack)** — Önceki turun SHA-256 manifest'ine göre yalnızca değişen dosyaları gönderme       |      7       |      9       |    2.5     | **25.2** | **[x] Kodda**      |
| **C-5** | **Hassas Veri Akışı (Taint Path) İzleyici** — PII/Sır kaynaklarından (`req.body.tckn`) log/HTTP çıkışına giden maskelenmemiş akışları yakalama  |      9       |      8       |    3.5     | **20.6** | **[x] Kodda**      |

---

## Faz 3: 5 Yaratıcı Farklılaştırıcı Özellik (`F3-1`..`F3-5` — kodda uygulandı)

| Kod      | Yaratıcı Özellik                                                                                                                                   | Gelir (1-10) | Değer (1-10) | Efor (1-5) |   Skor   |       Durum        |
| :------- | :------------------------------------------------------------------------------------------------------------------------------------------------- | :----------: | :----------: | :--------: | :------: | :----------------: |
| **F3-1** | **Semantik Ölü Kod & Yetim Sembol Avcısı (`findDeadSymbols`)** — AST çağrı grafiği ve import grafiğiyle sıfır referanslı sembol tespiti            |      8       |      9       |    2.0     | **36.0** | **[x] Kodda**      |
| **F3-2** | **Çoklu Model Token & Maliyet Arbitraj Danışmanı (`recommendModelRoute`)** — Görev karmaşıklığına göre en ekonomik LLM ve bütçe önerisi            |      9       |      8       |    2.0     | **36.0** | **[x] Kodda**      |
| **F3-3** | **Otomatik PR Bölücü (`splitPrIntoAtomicGroups`)** — Büyük PR'ları bağımlılık grafiğindeki bağlantılı bileşenlere göre bağımsız alt PR'lara ayırma |      8       |      9       |    2.5     | **28.8** | **[x] Kodda**      |
| **F3-4** | **Canlı Test Kapsama Haritası & Riskli Satır Eşleştirici (`analyzeUncoveredRisk`)** — LCOV raporu ile AST metodlarını kesiştirme                   |      8       |      8       |    2.5     | **25.6** | **[x] Kodda**      |
| **F3-5** | **Kurumsal Bilgi Köprüsü Senkronizasyonu (`checkDocDrift`)** — Kod değiştiğinde güncelliğini yitiren `docs/` ve ADR dosyalarını bulma              |      7       |      8       |    2.5     | **22.4** | **[x] Kodda**      |

---

## Faz 4: 5 Yaratıcı Farklılaştırıcı Özellik (`F4-1`..`F4-5` — kodda uygulandı)

| Kod      | Yaratıcı Özellik                                                                                                                                               | Gelir (1-10) | Değer (1-10) | Efor (1-5) |   Skor   |       Durum        |
| :------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------: | :----------: | :--------: | :------: | :----------------: |
| **F4-1** | **Ajan Halüsinasyon & Sembol Doğrulayıcı (`verifyPatchGrounding` & `POST /api/v1/verify-patch`)** — Yamadaki import/fonksiyon çağrılarının varlığını denetleme |      9       |      9       |    2.0     | **40.5** | **[x] Kodda**      |
| **F4-2** | **Döngüsel Bağımlılık Kırıcı (`findCircularDependencies` & `GET /api/v1/circular-deps`)** — Tarjan SCC ile import döngülerini bulup kesim kenarı önerme        |      8       |      9       |    2.0     | **36.0** | **[x] Kodda**      |
| **F4-3** | **Çoklu Depo API Sözleşme Uyumluluk Denetçisi (`checkCrossRepoContracts`)** — Servisler arası REST/sembol şema kırılmalarını statik yakalama                   |      8       |      8       |    2.5     | **25.6** | **[x] Kodda**      |
| **F4-4** | **Git Bisect Odaklı Regresyon Bağlam Paketleyici (`buildBisectContextPack`)** — İki commit arasındaki aday suçlu commitleri graf merkeziliğiyle puanlama       |      7       |      8       |    2.5     | **22.4** | **[x] Kodda**      |
| **F4-5** | **Kurumsal Lisans & Tedarik Zinciri Risk Tarayıcı (`checkLicenseCompliance` & `GET /api/v1/license-gate`)** — CycloneDX SBOM ve SPDX lisans politikası kapısı  |      8       |      7       |    2.5     | **22.4** | **[x] Kodda**      |

---

## Faz 5: 5 Yaratıcı Farklılaştırıcı Özellik (`F5-1`..`F5-5` — kodda uygulandı)

| Kod      | Yaratıcı Özellik                                                                                                                                              | Gelir (1-10) | Değer (1-10) | Efor (1-5) |   Skor   |       Durum        |
| :------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------ | :----------: | :----------: | :--------: | :------: | :----------------: |
| **F5-1** | **Ajan Bağlam Bütçesi Otomatik Daraltıcı (`pruneContextToBudget`)** — Token sınırı dolduğunda düşük entropili blokları AST düzeyinde kademeli budama          |      9       |      9       |    2.0     | **40.5** | **[x] Kodda**      |
| **F5-2** | **Semantik Klon & Kopya Mantık Dedektörü (`findSemanticClones`)** — Farklı dosyalardaki yapısal olarak eşdeğer metodları 3-shingle Jaccard ile yakalama       |      8       |      9       |    2.0     | **36.0** | **[x] Kodda**      |
| **F5-3** | **Kurumsal Bilgi Kaybı & Bus-Factor Risk Haritası (`analyzeBusFactor`)** — Tek kişiye bağımlı bilgi silosu modülleri ve depo Bus-Factor değerini bulma        |      8       |      8       |    2.0     | **32.0** | **[x] Kodda**      |
| **F5-4** | **Veritabanı Şema & Sorgu Darboğazı Tespiti (`findQueryBottlenecks`)** — Döngü içi N+1 SQL/ORM/fetch çağrılarını ve sınırsız `SELECT *` sorgularını bulma     |      8       |      8       |    2.5     | **25.6** | **[x] Kodda**      |
| **F5-5** | **Çok Dilli İstem & Kural Çevirici (`compileAgentRules`)** — Tek bir `.ctxman/rules.json` tanımından `CLAUDE.md`, `AGENTS.md`, `.cursorrules`, Copilot üretme |      7       |      8       |    2.0     | **28.0** | **[x] Kodda**      |

---

## Faz 6: 5 Yaratıcı Farklılaştırıcı Özellik (`F6-1`..`F6-5` — kodda uygulandı)

| Kod      | Yaratıcı Özellik                                                                                                                                       | Gelir (1-10) | Değer (1-10) | Efor (1-5) |   Skor   |       Durum        |
| :------- | :----------------------------------------------------------------------------------------------------------------------------------------------------- | :----------: | :----------: | :--------: | :------: | :----------------: |
| **F6-1** | **Canlı Ortam Değişkeni & Konfigürasyon Sözleşme Denetçisi (`checkEnvConfigDrift`)** — `process.env.*` referanslarını `.env.example` ile eşleştirme    |      8       |      9       |    2.0     | **36.0** | **[x] Kodda**      |
| **F6-2** | **Otomatik Sembolik Test İskeleti Üretici (`generateTestScaffold`)** — Kapsanmayan fonksiyon imzalarından hazır Vitest/Jest birim test şablonu üretme  |      8       |      9       |    2.0     | **36.0** | **[x] Kodda**      |
| **F6-3** | **Geriye Dönük Uyumluluk & SemVer Kırılma Dedektörü (`analyzeSemverBreakage`)** — İki sürüm arasında silinen/değişen export imzalarından SemVer önerme |      8       |      8       |    2.0     | **32.0** | **[x] Kodda**      |
| **F6-4** | **İstem Enjeksiyonu & Zararlı Bağlam Kalkanı (`sanitizePromptContext`)** — Depo yorumları/dokümanlarındaki gizli jailbreak/prompt injection tespiti    |      9       |      8       |    2.5     | **28.8** | **[x] Kodda**      |
| **F6-5** | **Mikroservis Olay & Mesaj Şeması İzleyici (`mapEventLineage`)** — `emit`/`publish` ve `on`/`subscribe` kanallarını eşleştirip yetim olayları bulma    |      7       |      8       |    2.5     | **22.4** | **[x] Kodda**      |

---

## Faz 7: 5 Yaratıcı Farklılaştırıcı Özellik (`F7-1`..`F7-5` — kodda uygulandı)

| Kod      | Yaratıcı Özellik                                                                                                                                                | Gelir (1-10) | Değer (1-10) | Efor (1-5) |   Skor   |       Durum        |
| :------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------: | :----------: | :--------: | :------: | :----------------: |
| **F7-1** | **Özellik Bayrağı Yaşam Döngüsü & Bayat Bayrak Avcısı (`findStaleFeatureFlags`)** — Kalıcılaşmış ve temizlenmemiş feature flag dallarını bulma                  |      8       |      9       |    2.0     | **36.0** | **[x] Kodda**      |
| **F7-2** | **Otomatik Sürüm Notu & Müşteri Odaklı Changelog Üretici (`generateSemanticReleaseNotes`)** — Commit ve sembol grafiğinden kategorize sürüm notu derleme        |      8       |      8       |    2.0     | **32.0** | **[x] Kodda**      |
| **F7-3** | **API Hız Sınırı & Dayanıklılık Denetçisi (`auditResiliencePatterns`)** — Timeout/AbortSignal tanımlanmamış dış HTTP/fetch çağrılarını statik yakalama          |      8       |      8       |    2.5     | **25.6** | **[x] Kodda**      |
| **F7-4** | **Çok Dilli Çeviri (i18n) Anahtar Tutarlılığı Denetçisi (`checkI18nDrift`)** — Çoklu dil sözlükleri (`en`/`tr`) arasındaki eksik anahtarları bulma              |      7       |      8       |    2.0     | **28.0** | **[x] Kodda**      |
| **F7-5** | **Ajan Görev Planı & Alt-Görev Ayrıştırıcı (`decomposeTaskIntoSteps`)** — Doğal dil görevini etkilenen dosya katmanlarına göre sıralı uygulama adımlarına bölme |      9       |      9       |    2.5     | **32.4** | **[x] Kodda**      |

---

## Faz 8: 5 Yaratıcı Farklılaştırıcı Özellik (`F8-1`..`F8-5` — kodda uygulandı)

| Kod      | Yaratıcı Özellik Önerisi                                                                                                                                     | Gelir (1-10) | Değer (1-10) | Efor (1-5) |   Skor   |       Durum        |
| :------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------: | :----------: | :--------: | :------: | :----------------: |
| **F8-1** | **Teknik Borç & Karmaşıklık Sıcak Nokta Haritası (`analyzeTechDebtHotspots`)** — Git değişim sıklığı (churn) ile metod karmaşıklığını çarpıp önceliklendirme |      8       |      9       |    2.0     | **36.0** | **[x] Kodda**      |
| **F8-2** | **Kırılgan Test (Flaky Test) Deseni Dedektörü (`detectFlakyTestPatterns`)** — Testlerdeki sabit `setTimeout`, rastgele sayı ve sıraya bağımlı durum tespiti  |      8       |      9       |    2.0     | **36.0** | **[x] Kodda**      |
| **F8-3** | **Yüksek Entropili Sır & Kanarya Token Tarayıcı (`scanHighEntropySecrets`)** — Shannon entropisiyle regex'ten kaçan özel API/kripto anahtarlarını yakalama   |      9       |      8       |    2.5     | **28.8** | **[x] Kodda**      |
| **F8-4** | **GraphQL & OpenAPI Şema-Kod Senkronizasyon Denetçisi (`checkSchemaCodeParity`)** — `.graphql`/`openapi.json` tanımları ile bağlı handler'ları eşleştirme    |      8       |      8       |    2.5     | **25.6** | **[x] Kodda**      |
| **F8-5** | **Çoklu Ajan Çakışma Önleyici & Dosya Kilit Planlayıcı (`planParallelAgentWorkspaces`)** — Paralel çalışan ajanlar için kesişmeyen dosya kümeleri atama      |      9       |      8       |    2.5     | **28.8** | **[x] Kodda**      |

---

## Faz 9: 5 Yaratıcı Farklılaştırıcı Özellik (`F9-1`..`F9-5` — kodda uygulandı)

| Kod      | Yaratıcı Özellik Önerisi                                                                                                                                    | Gelir (1-10) | Değer (1-10) | Efor (1-5) |   Skor   |       Durum        |
| :------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------: | :----------: | :--------: | :------: | :----------------: |
| **F9-1** | **Veritabanı Göç (Migration) Geri Dönüş & Kilit Risk Denetçisi (`auditMigrationSafety`)** — SQL/ORM migration dosyalarında kilitli tablo/veri kaybı tespiti |      9       |      9       |    2.0     | **40.5** | **[x] Kodda**      |
| **F9-2** | **Ajan Öz-Onarım (Self-Healing) Test Döngüsü Orkestratörü (`buildSelfHealingPrompt`)** — Kırılan test çıktısı ve AST farkından tek adımlık onarım istemi    |      9       |      9       |    2.2     | **36.8** | **[x] Kodda**      |
| **F9-3** | **Performans Bütçesi & Paket Boyutu Etkisi Tahmincisi (`estimateBundleImpact`)** — Yeni eklenen importların ağaca-sallama (tree-shaking) ve boyut analizi   |      8       |      8       |    2.0     | **32.0** | **[x] Kodda**      |
| **F9-4** | **Kurumsal Denetim & Uyumluluk Kanıt Paketi Üretici (`generateComplianceEvidencePack`)** — BDDK/KVKK/SOC2 denetçileri için imzalı özet rapor derleyici      |      9       |      8       |    2.5     | **28.8** | **[x] Kodda**      |
| **F9-5** | **Çağrı Grafiği Tabanlı Kaos & Hata Enjeksiyon Noktası Önerici (`suggestChaosTargets`)** — Kritik dış bağımlılık sınırlarında kaos testi hedefleri bulma    |      7       |      8       |    2.0     | **28.0** | **[x] Kodda**      |

---

## Faz 10: 5 Yaratıcı Farklılaştırıcı Özellik (`F10-1`..`F10-5` — kodda uygulandı)

| Kod       | Yaratıcı Özellik Önerisi                                                                                                                                       | Gelir (1-10) | Değer (1-10) | Efor (1-5) |   Skor   |       Durum        |
| :-------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------: | :----------: | :--------: | :------: | :----------------: |
| **F10-1** | **Sıfır-Kesinti Özellik Emeklilik & Temizlik Yama Üretici (`planFeatureFlagRetirement`)** — Kalıcılaşmış bayrak dallarını otomatik sadeleştirme planı          |      8       |      9       |    2.0     | **36.0** | **[x] Kodda**      |
| **F10-2** | **Çoklu Ajan Oturumu Bellek Özeti & Devir Paketi (`buildAgentHandoffPack`)** — Ajanlar arası görev devrinde sıkıştırılmış karar ve durum özeti üretme          |      9       |      9       |    2.2     | **36.8** | **[x] Kodda**      |
| **F10-3** | **API Geriye Dönük Sözleşme Tüketici Simülatörü (`simulateConsumerContractImpact`)** — Değişen yanıt alanlarının istemci yıkımlarını statik simüle etme        |      8       |      8       |    2.0     | **32.0** | **[x] Kodda**      |
| **F10-4** | **Kurumsal Veri Sınıflandırma & Hassasiyet Etiketleyici (`classifyDataSensitivity`)** — Modülleri PII/Finansal/Gizli veri yoğunluğuna göre otomatik etiketleme |      9       |      8       |    2.5     | **28.8** | **[x] Kodda**      |
| **F10-5** | **Deterministik Derleme & Ortam Tekrarlanabilirlik Denetçisi (`auditBuildReproducibility`)** — Sabitlenmemiş sürümler ve yerel yol bağımlılıklarını yakalama   |      7       |      8       |    2.0     | **28.0** | **[x] Kodda**      |

---

## Faz 11: 5 Yaratıcı Farklılaştırıcı Özellik (`F11-1`..`F11-5` — kodda uygulandı)

| Kod       | Yaratıcı Özellik Önerisi                                                                                                                                              | Gelir (1-10) | Değer (1-10) | Efor (1-5) |   Skor   |       Durum        |
| :-------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------: | :----------: | :--------: | :------: | :----------------: |
| **F11-1** | **SLO / Hata Bütçesi Odaklı Dağıtım Kapısı (`evaluateDeployFreezeGate`)** — PR risk skoru ile servis hata bütçesini (error budget) birleştirip yayın kararı verme     |      9       |      9       |    2.0     | **40.5** | **[x] Kodda**      |
| **F11-2** | **Ajan Araç Çağrısı (MCP Tool-Call) Maliyet & Döngü Koruması (`analyzeAgentToolLoop`)** — Tekrarlayan/sonsuz MCP araç çağrılarını yakalayıp önbellek önerme           |      9       |      9       |    2.2     | **36.8** | **[x] Kodda**      |
| **F11-3** | **Çoklu Kiracı (Multi-Tenant) Veri İzolasyonu Denetçisi (`auditTenantIsolation`)** — `tenant_id` / `org_id` filtresi eksik çok kiracılı sorguları yakalama            |      9       |      8       |    2.2     | **32.7** | **[x] Kodda**      |
| **F11-4** | **Mimari Karar Kaydı (ADR) Otomatik Taslak Üretici (`generateAdrDraft`)** — Büyük yapısal PR değişikliklerinden standart Markdown ADR belgesi üretme                  |      7       |      8       |    2.0     | **28.0** | **[x] Kodda**      |
| **F11-5** | **Regüle Ortam (Air-Gapped) Model & Tokenizer Uyumluluk Denetçisi (`verifyAirgappedReadiness`)** — Dış ağ çağrısı yapan kod ve bağımlılıkları sıfır-bulut için tarama |      8       |      8       |    2.5     | **25.6** | **[x] Kodda**      |

---

## Faz 12: 5 Yaratıcı Farklılaştırıcı Özellik (`F12-1`..`F12-5` — kodda uygulandı)

| Kod       | Yaratıcı Özellik Önerisi                                                                                                                                                                          | Gelir (1-10) | Değer (1-10) | Efor (1-5) |   Skor   |       Durum        |
| :-------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :----------: | :----------: | :--------: | :------: | :----------------: |
| **F12-1** | **Olay Müdahale (Incident Post-Mortem) & Kök Neden Bağlam Paketi (`buildIncidentPostmortemPack`)** — Üretim hatası zaman çizelgesi, son dağıtımlar ve suçlu commitlerden kök neden raporu derleme |      9       |      9       |    2.0     | **40.5** | **[x] Kodda**      |
| **F12-2** | **API İdempotensi & Çift Ödeme Risk Denetçisi (`auditPaymentIdempotency`)** — Finansal/ödeme uç noktalarında `Idempotency-Key` ve tekrar-koruma eksikliği tespiti                                 |      9       |      9       |    2.2     | **36.8** | **[x] Kodda**      |
| **F12-3** | **İstem Şablonu (Prompt Regression) Regresyon & Drift Denetçisi (`checkPromptTemplateDrift`)** — Sistem istemlerindeki değişken ve şema kırılmalarını statik yakalama                             |      8       |      9       |    2.0     | **36.0** | **[x] Kodda**      |
| **F12-4** | **Asenkron Kuyruk & Dead-Letter (DLQ) Dayanıklılık Denetçisi (`auditQueueConsumerResilience`)** — Kuyruk tüketicilerinde eksik backoff/DLQ/ack kalıplarını bulma                                  |      8       |      8       |    2.2     | **29.1** | **[x] Kodda**      |
| **F12-5** | **Monorepo Önbellek & Görev Grafiği (Task Pipeline) Hızlandırıcı (`optimizeWorkspaceTaskGraph`)** — Değişen dosyalara göre minimum etkilenen paket/görev sırasını çıkarma                         |      8       |      8       |    2.5     | **25.6** | **[x] Kodda**      |

---

## Faz 13: 5 Yaratıcı Farklılaştırıcı Özellik (`F13-1`..`F13-5` — kodda uygulandı)

| Kod       | Yaratıcı Özellik Önerisi                                                                                                                                                                      | Gelir (1-10) | Değer (1-10) | Efor (1-5) |   Skor   |       Durum        |
| :-------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------: | :----------: | :--------: | :------: | :----------------: |
| **F13-1** | **Canlı Kanarya (Canary) Telemetri & Otomatik Geri Alma Karar Motoru (`evaluateCanaryRollout`)** — Kanarya sürümü hata/gecikme metriklerini taban sürümle karşılaştırıp rollback kararı verme |      9       |      9       |    2.0     | **40.5** | **[x] Kodda**      |
| **F13-2** | **Kriptografik Bağlam İmzası & Zincirleme Kanıt Doğrulayıcı (`signAndVerifyContextPack`)** — Paketlenen bağlam ve denetim çıktılarını HMAC/SHA-256 zinciriyle imzalayıp kurcalamayı yakalama  |      9       |      8       |    2.0     | **36.0** | **[x] Kodda**      |
| **F13-3** | **Veritabanı İndeks Kapsama & Yavaş Sorgu Önerici (`recommendMissingIndexes`)** — SQL `WHERE`/`ORDER BY`/`JOIN` sütunlarını şema indeksleriyle eşleştirip eksik indeks DDL önerme             |      8       |      9       |    2.2     | **32.7** | **[x] Kodda**      |
| **F13-4** | **PR İnceleyici Yük Dengeleyici & Uzman Rotasyonu (`assignBalancedReviewers`)** — Uzmanlık skoru ile aktif inceleme yükünü birleştirip darboğaz yaratmayan hakem atama                        |      8       |      8       |    2.0     | **32.0** | **[x] Kodda**      |
| **F13-5** | **Ajan Bellek Zehirlenmesi (Memory Poisoning) & RAG Bütünlük Denetçisi (`auditRagCorpusIntegrity`)** — RAG parçalarındaki çelişkili veya enjekte edilmiş sahte kuralları tarama               |      9       |      8       |    2.5     | **28.8** | **[x] Kodda**      |

---

## Faz 14: 5 Yaratıcı Farklılaştırıcı Özellik (`F14-1`..`F14-5` — kodda uygulandı)

| Kod       | Yaratıcı Özellik Önerisi                                                                                                                                                                         | Gelir (1-10) | Değer (1-10) | Efor (1-5) |   Skor   |       Durum        |
| :-------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------: | :----------: | :--------: | :------: | :----------------: |
| **F14-1** | **FinOps & Bulut/LLM Maliyet Anomalisi Dedektörü (`detectFinopsCostAnomalies`)** — Model/servis bazlı günlük token ve fatura sıçramalarını yakalayıp bütçe koruma aksiyonu önerme                |      9       |      9       |    2.0     | **40.5** | **[x] Kodda**      |
| **F14-2** | **Sıfır-Güven (Zero-Trust) Yetki & RBAC Kapsama Denetçisi (`auditEndpointAuthCoverage`)** — Kimlik doğrulama veya RBAC middleware koruması eksik API rotalarını yakalama                         |      9       |      9       |    2.2     | **36.8** | **[x] Kodda**      |
| **F14-3** | **Otomatik Geri Alma (Rollback) & Acil Müdahale Runbook Üretici (`generateRollbackRunbook`)** — PR içindeki veritabanı, bayrak ve servis değişikliklerinden adım adım geri alma kılavuzu derleme |      8       |      9       |    2.0     | **36.0** | **[x] Kodda**      |
| **F14-4** | **Eşzamanlılık & Yarış Durumu (Race Condition / Lock) Risk Avcısı (`detectConcurrencyHazards`)** — Senkronize edilmemiş paylaşılan durum yazımlarını ve eksik kilitleri tespit etme              |      8       |      8       |    2.2     | **29.1** | **[x] Kodda**      |
| **F14-5** | **Müşteri SLA & Kırılma Bildirimi Etki Raporlayıcı (`buildSlaImpactReport`)** — Etkilenen uç noktaları kurumsal müşteri SLA sözleşmeleriyle eşleştirip bildirim taslağı üretme                   |      8       |      8       |    2.5     | **25.6** | **[x] Kodda**      |

---

## Faz 15: 5 Yaratıcı Farklılaştırıcı Özellik (`F15-1`..`F15-5` — kodda uygulandı)

| Kod       | Yaratıcı Özellik Önerisi                                                                                                                                                                         | Gelir (1-10) | Değer (1-10) | Efor (1-5) |   Skor   |       Durum        |
| :-------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------: | :----------: | :--------: | :------: | :----------------: |
| **F15-1** | **Kuantum-Sonrası (Post-Quantum / PQC) & Zayıf Kriptografi Denetçisi (`auditCryptoAgility`)** — MD5/SHA-1/DES/ECB ve sabit RSA-1024/ECC kullanımlarını tarayıp PQC geçiş planı önerme            |      9       |      9       |    2.0     | **40.5** | **[x] Kodda**      |
| **F15-2** | **Ajan Konsensüs & Çoklu-Model Hakem Değerlendirici (`evaluateMultiAgentConsensus`)** — Birden fazla ajan/modelin ürettiği yamaları veya inceleme kararlarını ağırlıklı oylamayla uzlaştırma     |      9       |      9       |    2.2     | **36.8** | **[x] Kodda**      |
| **F15-3** | **Gölge Trafik (Shadow Traffic) & Regresyon Tekrar-Oynatma Senaryo Üretici (`generateShadowReplayPlan`)** — Değişen API rotaları için üretim trafiği yansıtma ve fark karşılaştırma planı üretme |      8       |      9       |    2.0     | **36.0** | **[x] Kodda**      |
| **F15-4** | **KVKK / GDPR Unutulma Hakkı (RTBF) & Veri Silme Soykütüğü Denetçisi (`auditRightToBeForgotten`)** — Kullanıcı silme akışlarında unutulan alt tabloları ve önbellek/log kalıntılarını yakalama   |      9       |      8       |    2.2     | **32.7** | **[x] Kodda**      |
| **F15-5** | **Soğuk Başlatma (Cold-Start) & Başlangıç Gecikmesi Darboğaz Analizörü (`analyzeColdStartBottlenecks`)** — Üst düzey senkron G/Ç ve ağır barrel import zincirlerini tespit etme                  |      8       |      8       |    2.2     | **29.1** | **[x] Kodda**      |

---

## Faz 16: 5 Yaratıcı Farklılaştırıcı Özellik (`F16-1`..`F16-5` — kodda uygulandı)

| Kod       | Yaratıcı Özellik Önerisi                                                                                                                                                                                   | Gelir (1-10) | Değer (1-10) | Efor (1-5) |   Skor   |       Durum        |
| :-------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------: | :----------: | :--------: | :------: | :----------------: |
| **F16-1** | **Tedarik Zinciri Typosquatting & Zararlı Paket Kalkanı (`auditDependencyTyposquatting`)** — `package.json` bağımlılıklarını popüler paketlere Levenshtein yakınlığı ve install-script riskine göre tarama |      9       |      9       |    2.0     | **40.5** | **[x] Kodda**      |
| **F16-2** | **Ajan İstem Sıkıştırma & Semantik Kısaltma Motoru (`compressPromptSemantically`)** — Tekrarlayan kod kalıplarını ve boşlukları korunan sembol tablosuyla sıkıştırarak %35+ ek token tasarrufu sağlama     |      9       |      9       |    2.2     | **36.8** | **[x] Kodda**      |
| **F16-3** | **GrafQL Derinlik & Karmaşıklık DoS Denetçisi (`auditGraphqlQueryComplexity`)** — İç içe döngüsel GraphQL sorgularını ve derinlik sınırı eksik şemaları statik yakalama                                    |      8       |      9       |    2.0     | **36.0** | **[x] Kodda**      |
| **F16-4** | **Mikroservis Dağıtık İzleme (OpenTelemetry / Trace Context) Süreklilik Denetçisi (`auditTraceContextPropagation`)** — Servisler arası çağrılarda `traceparent` / korelasyon başlığı kopukluklarını bulma  |      8       |      8       |    2.2     | **29.1** | **[x] Kodda**      |
| **F16-5** | **Yeşil Yazılım (GreenOps) & Karbon Ayak İzi Tahmincisi (`estimateCarbonFootprint`)** — LLM token kullanımı ve CI/CD iş yüklerinin enerji (Wh) ve $CO_2e$ emisyon etkisini raporlama                       |      7       |      8       |    2.0     | **28.0** | **[x] Kodda**      |

---

## Faz 17: 5 Yaratıcı Farklılaştırıcı Özellik (`F17-1`..`F17-5` — kodda uygulandı)

| Kod       | Yaratıcı Özellik Önerisi                                                                                                                                                                                        | Gelir (1-10) | Değer (1-10) | Efor (1-5) |   Skor   |       Durum        |
| :-------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------: | :----------: | :--------: | :------: | :----------------: |
| **F17-1** | **Sıfır-Kesinti Şema Genişlet-Daralt (Expand-Contract) Göç Planlayıcı (`planZeroDowntimeSchemaMigration`)** — Kırıcı sütun yeniden adlandırma/silme işlemlerini 3 aşamalı güvenli göç planına dönüştürme        |      9       |      9       |    2.0     | **40.5** | **[x] Kodda**      |
| **F17-2** | **Ajan Halüsinasyonlu Paket & Hayalet İçe Aktarım (Slopsquatting) Kalkanı (`detectHallucinatedPackages`)** — Kaynak kodda import edilen ancak `package.json` içinde tanımlı olmayan dış paketleri yakalama      |      9       |      9       |    2.0     | **40.5** | **[x] Kodda**      |
| **F17-3** | **Kurumsal Sır Rotasyonu (Secret Rotation) & Anahtar Yaşlanma Denetçisi (`auditSecretRotationReadiness`)** — Sabit anahtar referanslarını ve rotasyon (dual-key) desteği eksik doğrulayıcıları tespit etme      |      9       |      8       |    2.2     | **32.7** | **[x] Kodda**      |
| **F17-4** | **PR Bilişsel Yük (Cognitive Load) & İnceleme Süresi Tahmincisi (`estimatePrReviewCognitiveLoad`)** — Değişen dosya yayılımı, AST derinliği ve bağlam geçişlerine göre dakika cinsinden inceleme süresi tahmini |      8       |      8       |    2.0     | **32.0** | **[x] Kodda**      |
| **F17-5** | **API Sürüm Yaşam Döngüsü & Sunset Başlığı Denetçisi (`auditApiDeprecationHeaders`)** — Kullanımdan kaldırılan (`v1`/deprecated) uç noktalarda RFC 8594 `Sunset` ve `Deprecation` başlığı kontrolü              |      8       |      8       |    2.2     | **29.1** | **[x] Kodda**      |

---

## Faz 18: 5 Yaratıcı Farklılaştırıcı Özellik (`F18-1`..`F18-5` — kodda uygulandı)

| Kod       | Yaratıcı Özellik Önerisi                                                                                                                                                                                                 | Gelir (1-10) | Değer (1-10) | Efor (1-5) |   Skor   |       Durum        |
| :-------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------: | :----------: | :--------: | :------: | :----------------: |
| **F18-1** | **Düzenli İfade (ReDoS) & Felaket Geri-İzleme Denetçisi (`auditRegexDosRisk`)** — Kullanıcı girdisiyle çalışan karmaşık/iç içe nicelikli regex kalıplarında üstel geri-izleme (catastrophic backtracking) tespiti        |      9       |      9       |    2.0     | **40.5** | **[x] Kodda**      |
| **F18-2** | **Ajan Araç/MCP Şema Güvenliği & Aşırı Yetki Denetçisi (`auditMcpToolPermissions`)** — MCP araç tanımlarında sınırsız dosya sistemi/kabuk erişimi ve eksik girdi doğrulama şemalarını yakalama                           |      9       |      9       |    2.0     | **40.5** | **[x] Kodda**      |
| **F18-3** | **Veritabanı Bağlantı Havuzu (Connection Pool) & Sızıntı Risk Denetçisi (`auditConnectionPoolExhaustion`)** — Serbest bırakılmayan (`release()`/`finally` eksik) DB istemcilerini ve havuz sınırı uyumsuzluklarını bulma |      8       |      9       |    2.2     | **32.7** | **[x] Kodda**      |
| **F18-4** | **Çoklu Ortam (Dev/Staging/Prod) Konfigürasyon Parite & Sapma Denetçisi (`compareEnvironmentParity`)** — Ortamlar arası eksik özellik bayrağı, zaman aşımı ve kota parametre sapmalarını karşılaştırma                   |      8       |      8       |    2.0     | **32.0** | **[x] Kodda**      |
| **F18-5** | **LLM Yanıt Önbellek (Semantic Response Cache) İsabet & Tasarruf Tahmincisi (`estimateSemanticCacheHitRate`)** — Tekrarlayan ajan sorgu kümelerini benzerlik eşiğine göre gruplayıp önbellek ROI tahmini üretme          |      8       |      8       |    2.2     | **29.1** | **[x] Kodda**      |

---

## Faz 19: Sonraki İterasyon İçin 5 Yeni Yaratıcı Özellik Önerisi

| Kod       | Yaratıcı Özellik Önerisi                                                                                                                                                                                                             | Gelir (1-10) | Değer (1-10) | Efor (1-5) |   Skor   |     Durum     |
| :-------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------: | :----------: | :--------: | :------: | :-----------: |
| **F19-1** | **Webhook İmza & Tekrar-Saldırısı (Replay Attack) Güvenlik Denetçisi (`auditWebhookSignatureSecurity`)** — Gelen ödeme/webhook işleyicilerinde `timingSafeEqual`, HMAC doğrulaması ve zaman damgası (replay) kontrolü denetimi       |      9       |      9       |    2.0     | **40.5** | [ ] Planlandı |
| **F19-2** | **Ajan Uzun-Bağlam "Ortada Kaybolma" (Lost-in-the-Middle) Yeniden Sıralayıcı (`rebalanceContextAttention`)** — Kritik mimari/sözleşme dosyalarını dikkat eğrisinin başı ve sonuna yerleştirip orta bölge kaybını önleme              |      9       |      9       |    2.0     | **40.5** | [ ] Planlandı |
| **F19-3** | **SSRF & Dış URL İzin Listesi (Egress Allowlist) Güvenlik Denetçisi (`auditSsrfEgressSafety`)** — Kullanıcı girdisiyle beslenen `fetch`/`axios` çağrılarında özel IP blokları (`169.254.169.254`, `10.0.0.0/8`) korumasını denetleme |      9       |      8       |    2.2     | **32.7** | [ ] Planlandı |
| **F19-4** | **Git Monorepo CODEOWNERS Kapsama & Yetim Dizin Denetçisi (`auditCodeownersCoverage`)** — `CODEOWNERS` dosyasında sahibi tanımlanmamış veya geçersiz takıma atanmış dizin ve kritik modülleri tespit etme                            |      8       |      8       |    2.0     | **32.0** | [ ] Planlandı |
| **F19-5** | **Zaman Uyumsuz İş (Cron / Background Job) Çakışma & Tekil-Kilit Denetçisi (`auditCronJobIdempotency`)** — Çoklu kopya (multi-replica) çalışan cron/worker görevlerinde dağıtık kilit (distributed lock) eksikliğini bulma           |      8       |      8       |    2.2     | **29.1** | [ ] Planlandı |

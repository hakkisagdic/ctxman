# Ctxman — Gelir Modeli ve Ticari Mimari

> **Tarih:** 13 Kasım 2026  
> **Ürün:** Ctxman (AI Context Intelligence, Multi-Repo MCP & REST Sunucusu, KVKK/BDDK Uyumlu Veri Kalkanı ve Kod Arkeolojisi Platformu)  
> **Pazar Odakları:** Türkiye (TL — iyzico) ve Küresel (USD — iyzico Yurt Dışı Kart / Döviz Desteği + Sağlayıcı Soyutlaması)

---

## 1. Kim Öder, Neye Öder?

Bireysel geliştiriciler temel CLI araçlarını (`pack`, `map`, `count`) açık kaynak olarak ücretsiz kullanırken; **mühendislik takımları, fintekler, bankalar, yazılım ajansları ve yapay zeka ajanlarını yoğun kullanan şirketler** şu 4 somut değer için ödeme yapar:

1. **LLM API Maliyetinde %60–75 Tasarruf:** Tüm depoyu LLM'e dökmek yerine PageRank depo haritası (`map`), yönlü AST çağrı komşuluğu (`focus`), imza sıkıştırma (`--compress`) ve TOON formatıyla aylık binlerce dolarlık Claude/OpenAI API faturasını düşürmek.
2. **Çoklu Depo (Multi-Repo) Kurumsal Hafıza ve PR Otomasyonu:** Mikroservis mimarilerinde (`--repo`) kod arkeolojisi (`why`), uzman bulma (`who`), PR risk/güven skoru + Mermaid etki diyagramı (`pr`) ve CI hata teşhisini (`diagnose`) paylaşılan REST API ve MCP sunucusu üzerinden tüm takıma açmak.
3. **KVKK / BDDK / SOC 2 Veri Kalkanı ve Denetim İzi (Data Shield):** Kaynak kod AI araçlarına (Claude Code, Cursor, Copilot, şirket içi LLM) çıkmadan önce API sırlarını + kişisel verileri (TCKN, TR IBAN, Kredi Kartı, E-posta/Telefon) otomatik maskelemek, model izin listesini (`allowedModels`) zorlamak ve kriptografik SHA-256 dışa aktarım denetim günlüğü (`ctxman audit` + SARIF raporu) üretmek.
4. **%100 Yerinde (On-Premise / Air-Gapped) Kurumsal Çalışma:** Kodu yurt dışı bulutlara (Unblocked, Greptile, CodeRabbit Cloud) göndermeden kurum içi sunucuda barındırılan `ctxman serve` REST API ve MCP geçidi.

---

## 2. Hedef Müşteri Dilimleri

| Dilim                                                                                      | Profil                                                                                    | Temel Acı Noktası                                                                                                                           | Satın Alma Karar Vericisi                   |
| :----------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------ | :------------------------------------------ |
| **1. Hızlı Büyüyen SaaS & AI-First Startuplar (5–25 Geliştirici)**                         | Claude Code, Cursor ve CI ajanlarıyla günde 10–50 PR açan ekipler                         | Greptile ($1/kredi) ve Augment (%40 komisyon) faturalarının şişmesi; çoklu depoda ajanların yanlış dosyaları değiştirmesi                   | CTO, Kurucu Ortak, VP of Engineering        |
| **2. Türkiye Fintek, Ödeme Kuruluşları, E-Ticaret ve Yazılım Evleri (20–150 Geliştirici)** | BDDK (BSY Yönetmeliği) ve KVKK denetimine tabi, mikroservis mimarisi kullanan ekipler     | Yurt dışı bulut AI araçlarının bilgi güvenliği (InfoSec) onayından geçememesi; TCKN/IBAN/Sır sızıntısı riski; yüksek USD koltuk maliyetleri | CTO, CISO, Yazılım Geliştirme Direktörü     |
| **3. Kurumsal Bankalar, Sigorta, Telekom ve Savunma Sanayii (150+ Geliştirici)**           | Air-gapped / kurum içi GitLab Self-Managed veya GitHub Enterprise kullanan büyük kurumlar | Kodu kurum dışına çıkarmadan yerel LLM + kurumsal MCP + SHA-256 denetim izi ve SARIF güvenlik kapısı zorunluluğu                            | CISO, BT Genel Müdür Yardımcısı, Satın Alma |

---

## 3. Paketler, Fiyatlandırma (TL + USD) ve Ücretsiz / Ücretli Ayrımı

Rakiplerin ($29–$72/kullanıcı/ay) Türkiye pazarında yarattığı maliyet bariyerini kırmak ve küresel pazarda yüksek dönüşüm yakalamak için **Hibrit (Taban Paket + Kullanım/Kredi Havuzu)** modeli uygulanır:

| Paket                                              | Aylık Fiyat (TL / USD)                                                        | Yıllık Fiyat (%20 İndirim)                            | Kim İçin?                                                          | Dahil Olan Kotası ve Özellikler                                                                                                                                                                                                                                                                                                                                                                                      |
| :------------------------------------------------- | :---------------------------------------------------------------------------- | :---------------------------------------------------- | :----------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Community (Ücretsiz / Açık Kaynak)**             | **₺0 / $0**                                                                   | **₺0 / $0**                                           | Bireysel geliştiriciler ve açık kaynak projeler                    | • Tekli depo yerel CLI (`pack`, `map`, `focus`, `count`, `search`)<br>• Yerel `stdio` MCP (bireysel kullanım)<br>• Temel API anahtarı maskeleme<br>• REST API'de günlük **100 ücretsiz istek** / aylık **500.000 token** işleme kotası                                                                                                                                                                               |
| **Pro (Bireysel Profesyonel & Bağımsız Danışman)** | **₺690 / ay**<br>**($19 / ay)**                                               | **₺550 / ay**<br>_(₺6.600 / yıl — $180 / yıl)_        | Kıdemli mühendisler, bağımsız danışmanlar, küçük projeler          | • **14 Gün Ücretsiz Deneme**<br>• **3 depoya kadar** çoklu depo (`--repo`) çalışma alanı<br>• `why`, `who`, `task`, `diagnose`, `pr` (Mermaid + Risk Skoru) ve `--remote` Git paketleme<br>• Aylık **10.000 REST/MCP çağrısı** ve **25 Milyon token** bağlam bütçesi<br>• Otomatik ajan kural keşfi (`CLAUDE.md`, `AGENTS.md`, `.cursorrules`)                                                                       |
| **Team (Takım & Fintek Paketi — En Çok Satan)**    | **₺2.990 / ay**<br>**($79 / ay)**<br>_(5 koltuk dahil; ek koltuk ₺490 / $14)_ | **₺2.390 / ay**<br>_(₺28.680 / yıl — $750 / yıl)_     | 5–50 kişilik yazılım ekipleri, fintekler, yazılım ajansları        | • **14 Gün Ücretsiz Deneme**<br>• **Sınırsız çoklu depo (`repos`)** ve paylaşılan `ctxman serve` REST API v1 + Bilgi Grafiği (`/api/v1/graph`)<br>• **KVKK / BDDK Veri Kalkanı Preset'i** (TCKN, TR IBAN, Kredi Kartı, E-posta, Telefon PII maskeleme)<br>• CI/CD **SARIF v2.1.0** güvenlik/politika raporu ve PR kalite kapısı<br>• Takım ortak havuzunda aylık **100.000 API/MCP çağrısı** ve **250 Milyon token** |
| **Enterprise (Kurumsal On-Prem & Air-Gapped)**     | **₺19.900 / ay'dan başlayan**<br>**($590 / ay)**                              | **₺15.900 / ay**<br>_(₺190.800 / yıl — $5.600 / yıl)_ | Bankalar, ödeme kuruluşları, savunma sanayii, 50+ kişilik kurumlar | • **%100 Air-Gapped / On-Premise Docker & Self-Hosted Lisans**<br>• Kurumsal genel politika (`CTXMAN_POLICY`) + imzalı SHA-256 denetim günlüğü (`ctxman audit`)<br>• Çoklu kiracı / departman bazlı API anahtarları ve hız sınırları<br>• Sınırsız yerel token işleme, SLA ve öncelikli mühendislik desteği                                                                                                          |

### Ücretsiz ve Ücretli Kesin Ayrımı

- **Ücretsiz (Community):** Tekli depoda çalışan yerel CLI komutları ve günlük 100 istekle sınırlı yerel geliştirici deneyimi her zaman ücretsiz kalır (viral büyüme ve geliştirici benimsemesi için).
- **Ücretli (Pro / Team / Enterprise):**
  1. Paylaşılan REST API sunucusunda yüksek hacimli çağrı ve token kotaları (`>100 istek/gün`),
  2. Çoklu depo (`repos`) kurumsal çalışma alanı ve CI/CD PR otomasyonu (Mermaid + Risk Skoru + SARIF çıktısı),
  3. KVKK/BDDK PII maskeleme şablonu (`kvkk-bddk`), kurumsal politika zorlama ve denetim raporlaması,
  4. Takım API anahtarı yönetimi, kullanım analitiği ve faturalama.

---

## 4. Gelir Artıran İlk 3 Kaldıraç

1. **Kaldıraç 1 — Kullanım Bazlı Kredi / Kota Aşım Paketi (Pay-As-You-Go Top-Up):**
   - CI/CD boru hatlarında her PR ve her hata günlüğü için `ctxman pr` ve `ctxman diagnose` çalıştıran takımlar aylık paket kotalarını doldurduğunda sistemi durdurmak yerine otomatik veya tek tıkla **Ek Kredi Paketi (1.000 PR/Teşhis Kredisi = ₺450 / $12 veya +100M Token = ₺350 / $10)** satın alır.
2. **Kaldıraç 2 — KVKK / BDDK Uyumluluk ve Denetim Eklentisi (Compliance Shield Add-on):**
   - Türkiye'deki regüle şirketler ve danışmanlık firmaları için **TCKN/IBAN/Kredi Kartı PII Maskeleme + İmzalı SHA-256 Audit Log + SARIF Denetim Raporu** modülü, Pro paket müşterilerini doğrudan 4.3× daha yüksek gelirli **Team (₺2.990/ay)** veya **Enterprise (₺19.900/ay)** paketine yükseltir.
3. **Kaldıraç 3 — Yıllık Peşin Plan (%20 İndirim + Kur Sabitleme Avantajı):**
   - Türkiye'deki kurumsal müşterilere **TL bazında 12 ay fiyat sabitleme** (₺28.680/yıl Team veya ₺190.800/yıl Enterprise) sunularak nakit akışı (upfront cashflow) ilk günden tahsil edilir ve müşteri kaybı (churn) sıfıra yaklaştırılır.

---

## 5. İlk 10 Müşteriyi Bulma Planı (30 Günlük İcra Planı)

1. **Müşteri 1–3 (Açık Kaynak → Pro/Team Dönüşümü & Kendi Ağımızdaki AI-First Ekipler):**
   - Halihazırda Claude Code, Cursor ve MCP kullanan, aylık LLM API faturası $200+ olan 15 yazılım ekibine **"15 Dakikalık Token Tasarrufu ve Çoklu Depo MCP Denetimi"** uygulanır. `ctxman count` ve `ctxman focus` ile mevcut depolarında %65 token tasarrufu canlı gösterilerek **Team (₺2.990/ay)** paketine geçirilir.
2. **Müşteri 4–7 (Türkiye Fintek, Ödeme Kuruluşu ve E-Ticaret Ekipleri — KVKK/BDDK Kancası):**
   - İstanbul Teknopark (İTÜ ARI, YTÜ, Teknopark İstanbul) ve Bilişim Vadisi'ndeki 30 fintek/ödeme kuruluşunun CTO ve CISO'larına doğrudan ulaşılır.
   - Teklif: _"Geliştiricileriniz Cursor ve Claude kullanırken kod içindeki TCKN, IBAN ve API anahtarlarının yurt dışına çıkmasını `.ctxman/policy.json` (`kvkk-bddk` şablonu) ve SHA-256 denetim iziyle 10 dakikada engelleyin — kodu buluta göndermeden kurum içinde çalıştırın."_
3. **Müşteri 8–10 (Yazılım Danışmanlık Evleri ve DevSecOps Ajansları — Kanal Ortaklığı):**
   - Birden fazla müşteri projesine bakım veren yazılım ajanslarına `--remote` ve `--repo` özellikleriyle yeni devralınan kod tabanlarının mimari haritasını (`map`), kod arkeolojisini (`why`) ve riskli PR'larını (`pr`) dakikalar içinde çıkaran **Ajans / Team Yıllık Lisansı** satılır.

---

## 6. Ödeme, Kullanım Ölçümü (Metering) ve Fatura Kaydı Mimarisi

### 6.1. Ödeme Sağlayıcı Soyutlaması (`iyzico` Birincil Sağlayıcı)

- Tüm ödeme işlemleri `lib/billing/providers/` altındaki sağlayıcıdan bağımsız **`PaymentProvider`** arayüzü (`createCheckoutSession`, `verifyWebhookSignature`, `createSubscription`, `cancelSubscription`, `getPaymentStatus`) üzerinden yürütülür.
- **Birincil Sağlayıcı (`IyzicoProvider`):**
  - `iyzico` REST API v2 (`/v2/subscription/checkoutform/initialize`, `/payment/iyzipos/checkoutform/auth/ecom/detail`) ve HMAC-SHA256 imza doğrulamalı (`x-iyz-signature-v3` / `iyzico` API key + secret key + random string) kullanır.
  - Sırlar/anahtarlar kodda veya depoda asla tutulmaz; yalnızca çalışma zamanında ortam değişkenlerinden (`IYZICO_API_KEY`, `IYZICO_SECRET_KEY`, `IYZICO_BASE_URL`) okunur ve loglanmaz.
  - Hem **TRY (`₺`)** hem **USD (`$`)** para birimlerini ve taksitli/abonelikli ödemeleri destekler.
- **Test / Çevrimdışı Sağlayıcı (`MockPaymentProvider`):**
  - Geliştirme, CI testleri ve air-gapped kurumsal kurulumlar için dış ağa çıkmadan deterministik abonelik ve fatura döngüsü çalıştırır.

### 6.2. Kullanım Ölçümü (Metering) ve Fatura Kayıtlarının Tutulacağı Yer

- Sıfır harici veritabanı bağımlılığı (`zero-native-binary`) ilkesine sadık kalınarak tüm ticari kayıtlar yerleşik **`node:sqlite`** (`DatabaseSync`) üzerinde **`.ctxman/billing/billing.sqlite`** dosyasında (veya `CTXMAN_BILLING_DB` ile belirtilen yolda) WAL modunda tutulur:
  1. **`customers` tablosu:** `id`, `email`, `name`, `organization`, `tax_id` (VKN/TCKN), `plan_id` (`community`, `pro`, `team`, `enterprise`), `status`, `created_at`.
  2. **`api_keys` tablosu:** `id`, `customer_id`, `key_prefix`, `key_hash` (SHA-256 — açık anahtar asla saklanmaz), `label`, `revoked_at`, `created_at`.
  3. **`subscriptions` tablosu:** `id`, `customer_id`, `plan_id`, `billing_cycle` (`monthly` / `yearly`), `currency` (`TRY` / `USD`), `provider` (`iyzico` / `offline`), `provider_ref`, `status`, `current_period_start`, `current_period_end`.
  4. **`usage_events` tablosu (Kullanım Ölçümü):** `id`, `customer_id`, `api_key_id`, `endpoint`, `tokens_processed`, `credits_used`, `repo_count`, `created_at`.
  5. **`invoices` tablosu (Fatura Kaydı):** `id`, `invoice_number` (`CTX-2026-XXXXXX`), `customer_id`, `subscription_id`, `amount_minor` (kuruş/cent), `currency` (`TRY` / `USD`), `vat_rate` (KDV %20), `status` (`draft`, `paid`, `void`), `provider`, `provider_payment_id`, `line_items_json`, `issued_at`, `paid_at`.
- **REST API Entegrasyonu (`ctxman serve`):**
  - `APIServer` içinde `billingEnabled: true` (veya `billingStore` verildiğinde) her `/api/v1/*` çağrısında API anahtarını doğrular, planın aylık çağrı/token/çoklu-depo kotasını kontrol eder (`402 Payment Required` veya `429 Quota Exceeded`), kullanımı `usage_events` tablosuna yazar ve `/api/v1/billing/*` uç noktalarıyla plan, kullanım özeti, fatura listesi ve `iyzico` ödeme başlatma/webhook akışını sunar.

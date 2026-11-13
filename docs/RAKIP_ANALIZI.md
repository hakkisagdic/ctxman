# Ctxman — Rakip Analizi (Dünya ve Türkiye Pazarı)

> **Tarih:** 13 Kasım 2026  
> **Kapsam:** Yapay Zeka Bağlam Mühendisliği (AI Context Engineering), Kod Tabanı Zekası (Codebase Intelligence), MCP Sunucuları, Kurumsal Veri Kalkanı (Data Shield) ve PR/Hata Teşhis Ajanları  
> **Yöntem:** Canlı web araştırması, resmi fiyatlandırma sayfaları, GitHub depoları, G2 / Product Hunt / Hacker News / Reddit kullanıcı geri bildirimleri ve Türkiye KVKK/BDDK regülasyon kaynakları. Doğrulanamayan bilgiler açıkça **"doğrulanmadı"** olarak işaretlenmiştir.

---

## 1. İncelenen 8 Rakip (Dünya + Türkiye)

1. **Repomix (`yamadashy/repomix`)** — Açık kaynak kod tabanı paketleyici ve MCP sunucusu (Dünya)
2. **GitIngest (`coderamp-labs/gitingest`)** — Açık kaynak Git-to-Prompt özetleyici ve URL/CLI aracı (Dünya)
3. **Unblocked (`getunblocked.com`)** — Kurumsal Bağlam Motoru, Kod Arkeolojisi ("Why?"), Uzman Bulucu ve CI Hata Ajanı (Dünya)
4. **Greptile (`greptile.com`)** — Graf Tabanlı Kod Tabanı Zekası, Çoklu Depo PR İnceleme, MCP ve REST API (Dünya)
5. **Sourcegraph Cody Enterprise & MCP (`sourcegraph.com`)** — Kurumsal Çoklu Depo Kod Zekası, SCIP Grafı ve Deep Search (Dünya)
6. **Augment Code (`augmentcode.com`)** — Kurumsal Context Engine, `Auggie` CLI, Yerel/Uzak MCP ve SDK (Dünya)
7. **CodeRabbit (`coderabbit.ai`)** — Yapay Zeka PR İnceleme, Linter/SAST Orkestrasyonu ve MCP İstemcisi (Dünya)
8. **Kondukto (`kondukto.io` / Invicti — Türkiye) & Türkiye Regüle Kurumsal Pazar (KVKK / BDDK On-Prem AI Çözümleri)** — Türkiye çıkışlı kurumsal AppSec/ASPM orkestrasyonu ve Türkiye finans/kurumsal pazarındaki yerinde (on-prem) kod analizi standartları

---

## 2. Özellik Matrisi (Özellik × Rakip × Ctxman)

Durum göstergeleri: **Var** (tam destek), **Kısmi** (sınırlı/eksik alt özellik), **Yok** (desteklenmiyor).

| #   | Özellik                                                                                      | Repomix | GitIngest | Unblocked | Greptile | Sourcegraph | Augment Code | CodeRabbit | Kondukto (TR) | **Ctxman (Biz)** | Bizdeki Durum Açıklaması                                                                                                                 |
| :-- | :------------------------------------------------------------------------------------------- | :-----: | :-------: | :-------: | :------: | :---------: | :----------: | :--------: | :-----------: | :--------------: | :--------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Tam Depo Paketleme (XML / Markdown / JSON / TOON / GitIngest)**                            |   Var   |   Kısmi   |    Yok    |   Yok    |     Yok     |     Yok      |    Yok     |      Yok      |     **Var**      | `ctxman pack` + TOON + GitIngest + XML/MD/JSON + bütçe ve `--split`                                                                      |
| 2   | **AST / İmza Sıkıştırma (`--compress`)**                                                     |   Var   |    Yok    |    Yok    |   Yok    |     Yok     |    Kısmi     |    Yok     |      Yok      |     **Var**      | `ctxman pack --compress`, `ctxman focus --compress`                                                                                      |
| 3   | **PageRank Depo Haritası & AST Sembol Çağrı Grafiği (`--call-graph`)**                       |   Yok   |    Yok    |   Kısmi   |   Var    |     Var     |     Var      |   Kısmi    |      Yok      |     **Var**      | `ctxman map --call-graph` (PageRank + dosyalar arası AST çağrı kenarları)                                                                |
| 4   | **Yönlü `N`-Hop Import & AST Çağrı Komşuluğu (`focus`)**                                     |   Yok   |    Yok    |   Kısmi   |   Var    |     Var     |     Var      |   Kısmi    |      Yok      |     **Var**      | `ctxman focus <file>[:symbol]` (`--calls-only`, `--callers-only`, `--depth`)                                                             |
| 5   | **Çoklu Depo (`--repo` / `repos`) Çalışma Alanı Desteği**                                    |   Yok   |    Yok    |    Var    |   Var    |     Var     |     Var      |    Var     |      Var      |     **Var**      | CLI, 19 MCP aracı ve 19 REST API v1 uç noktasında `<alias>/<path>`                                                                       |
| 6   | **Çevrimdışı (Zero-Cloud) BM25 + Yerel SQLite Vektör + Hibrit RRF Arama**                    |   Yok   |    Yok    |    Yok    |   Yok    |     Yok     |    Kısmi     |    Yok     |      Yok      |     **Var**      | `node:sqlite` `SqliteVectorStore`, `LocalHashEmbeddingProvider`, `hybridSearch`                                                          |
| 7   | **Kod Arkeolojisi ("Why?") & Kurumsal Hafıza Atıfları**                                      |   Yok   |    Yok    |    Var    |  Kısmi   |    Kısmi    |    Kısmi     |   Kısmi    |      Yok      |     **Var**      | `ctxman why` (blame, rename, co-change, PR/Issue tartışmaları, `.plansmith/analyzer.sqlite`)                                             |
| 8   | **Alan Uzmanı Bulucu ("Who knows about this?")**                                             |   Yok   |    Yok    |    Var    |   Yok    |    Kısmi    |     Yok      |    Yok     |      Yok      |     **Var**      | `ctxman who` (blame 0.45 + 90g yarı ömürlü commit 0.35 + toplam 0.20 + `CODEOWNERS` +0.15)                                               |
| 9   | **Görev Odaklı Bağlam (`task`) & Stack-Trace Kök Neden Teşhisi (`diagnose`)**                |   Yok   |    Yok    |    Var    |  Kısmi   |    Kısmi    |     Var      |   Kısmi    |      Yok      |     **Var**      | `ctxman task` ve `ctxman diagnose` (7 dil stack trace + AST çağrı komşuluğu + git geçmişi)                                               |
| 10  | **MCP Sunucusu (IDE / Ajan Entegrasyonu)**                                                   |   Var   |    Yok    |    Var    |   Var    |     Var     |     Var      |    Var     |      Yok      |     **Var**      | 19 araçlı `ctxman mcp` (`stdio`/`sse`) + tek komutla IDE kurulumu (`ctxman mcp install`)                                                 |
| 11  | **Uzak Git Deposu Doğrudan Paketleme / Analiz (`--remote <url\|owner/repo> --branch`)**      |   Var   |    Var    |    Var    |   Var    |     Var     |     Var      |    Var     |      Var      |    **Kısmi**     | `GitUtils` yalnız temel akışta var; `ctxman pack/map/search/count` ve REST API v1'de `--remote` + `--branch` yok                         |
| 12  | **Ajan Yönergesi Otomatik Keşfi (`CLAUDE.md`, `AGENTS.md`, `.cursorrules`, Copilot)**        |   Var   |    Yok    |   Kısmi   |   Var    |     Var     |     Var      |    Var     |      Yok      |     **Yok**      | Depodaki `CLAUDE.md`, `AGENTS.md`, `.cursorrules`, `.github/copilot-instructions.md` dosyalarını otomatik keşfedip bağlama ekleme yok    |
| 13  | **KVKK / BDDK Uyumlu PII Maskeleme (TCKN, TR IBAN, Kredi Kartı, E-posta, Tel) & Preset**     |  Kısmi  |    Yok    |   Kısmi   |   Yok    |    Kısmi    |    Kısmi     |   Kısmi    |      Var      |    **Kısmi**     | API anahtarları maskeleniyor (`secret-redactor.js`), ancak TCKN/TR IBAN/Kredi Kartı/PII maskelemesi ve `kvkk-bddk` politika şablonu yok  |
| 14  | **PR İnceleme Güven/Risk Skoru, Kural Denetimi ve Otomatik Mermaid Diyagramı**               |   Yok   |    Yok    |    Var    |   Var    |    Kısmi    |     Var      |    Var     |      Var      |    **Kısmi**     | `ctxman pr` diff/metot/test topluyor; ancak otomatik Risk/Güven Skoru, Mermaid etki diyagramı ve `.ctxman/rules.json` kural kontrolü yok |
| 15  | **REST API v1 Bilgi Grafiği Uç Noktası (`GET /api/v1/graph`)**                               |   Yok   |    Yok    |   Kısmi   |   Var    |     Var     |     Var      |   Kısmi    |      Yok      |    **Kısmi**     | MCP'de `query_knowledge_graph` var; REST API v1'de `GET /api/v1/graph` uç noktası eksik                                                  |
| 16  | **Kullanım Ölçümü (Metering), Kota/Kredi Havuzu, Çoklu API Anahtarı ve `iyzico` Faturalama** |   Yok   |    Yok    |    Var    |   Var    |     Var     |     Var      |    Var     |      Var      |     **Yok**      | Ticari satış için SQLite tabanlı kullanım/token sayacı, plan kotaları, API anahtarı yönetimi ve `iyzico` ödeme soyutlaması yok           |
| 17  | **CI/CD Kalite ve Politika Kapısı (SARIF / JUnit / GitHub Check Çıktısı)**                   |  Kısmi  |    Yok    |    Var    |   Var    |     Var     |     Var      |    Var     |      Var      |    **Kısmi**     | GitHub Action var; ancak `ctxman policy check` ve `ctxman pr` için standart SARIF v2.1.0 güvenlik/politika raporu çıktısı yok            |

---

## 3. Rakip Bazlı Detaylı Analiz (Fiyat, Paketler, Övgüler, Şikâyetler ve Kaynaklar)

### 3.1. Repomix (`yamadashy/repomix`)

- **Konumlandırma:** Tüm kod deposunu tek bir AI-dostu dosyaya (XML, Markdown, JSON, Plain) dönüştüren açık kaynak CLI, web ve MCP aracı.
- **Fiyat ve Paketler:**
  - **Ücretsiz ($0 / MIT Lisansı):** CLI (`npx repomix`), Docker, VS Code eklentisi ve `repomix.com` web arayüzü tamamen ücretsizdir; ücretli kurumsal paketi yoktur.
- **En Çok Övülen Yönler:**
  - Mimari planlama ve büyük bağlam pencereli modellerle (Claude, Gemini Pro) hızlı başlangıç sağlama.
  - Tree-sitter tabanlı `--compress` bayrağıyla fonksiyon gövdelerini çıkarıp yalnızca imzaları tutarak ~%70 token tasarrufu sağlama.
  - `Secretlint` entegrasyonu ve `--remote` ile klonlamadan GitHub deposu paketleme kolaylığı.
- **En Çok Şikâyet Edilen Yönler:**
  - **"Lost in the Middle" (Bağlam Şişmesi):** Tüm depoyu tek seferde LLM'e dökmenin büyük projelerde halüsinasyonları artırması ve yüksek API token maliyetine yol açması; hedefli graf/komşuluk (`focus` / `task`) yeteneğinin bulunmaması.
  - Ajan tabanlı IDE'lerde (Claude Code, Cursor) akıllı semantik arama, git arkeolojisi (`why`) veya uzman bulma (`who`) gibi derin kod zekası araçlarının olmaması.
  - Web arayüzüne (`repomix.com`) özel kod yükleme konusunda kurumsal veri güvenliği endişeleri.
- **Kaynaklar:**
  - Resmi Site ve Dokümantasyon: https://repomix.com
  - GitHub Deposu: https://github.com/yamadashy/repomix
  - İnceleme ve Topluluk Değerlendirmesi: https://scored.tools/tools/repomix , https://ai-tldr.dev/repo/yamadashy/repomix

---

### 3.2. GitIngest (`coderamp-labs/gitingest`)

- **Konumlandırma:** Herhangi bir GitHub URL'sinde `hub` yerine `ingest` yazarak (`gitingest.com`) veya CLI/Python paketiyle hızlı metin özeti (`digest.txt`) üreten açık kaynak araç.
- **Fiyat ve Paketler:**
  - **Ücretsiz ($0 / MIT Lisansı):** Web uygulaması, CLI, Python paketi ve Chrome eklentisi tamamen ücretsizdir.
- **En Çok Övülen Yönler:**
  - Sıfır kurulum gerektiren URL kısayolu ve Chrome Web Mağazası'nda 4.9/5 kullanıcı puanı.
  - Dizin ağacı + dosya içerikleri + tahmini token istatistiğini tek metinde sunma sadeliği.
- **En Çok Şikâyet Edilen Yönler:**
  - **Kod Sıkıştırma (AST Compression) Eksikliği:** Fonksiyon gövdelerini daraltamadığı için orta/büyük depolarda LLM bağlam sınırlarını hızla aşması.
  - Web sürümünde büyük monorepo ve dosya boyutu sınırları.
  - Alt dal (`-b` / `--branch`) ve alt dizin URL çözümlemesinde bildirilen açık GitHub sorunları (issues) ve PR/Issue geçmişini bağlama dahil edememesi.
- **Kaynaklar:**
  - Resmi Site: https://gitingest.com
  - GitHub Deposu ve Sorun Kayıtları: https://github.com/coderamp-labs/gitingest , https://github.com/coderamp-labs/gitingest/issues

---

### 3.3. Unblocked (`getunblocked.com`)

- **Konumlandırma:** Kaynak kodunu Git geçmişi, PR tartışmaları, Slack, Jira, Linear ve Confluence ile birleştirerek "Bu kod neden böyle yazıldı?" sorusunu yanıtlayan kurumsal bağlam motoru.
- **Fiyat ve Paketler:**
  - **Ücretsiz Deneme:** 21 gün (kredi kartı gerekmez).
  - **Platform Planı:** Yıllık ödemede **$29 / kullanıcı / ay**, aylık ödemede **$35 / kullanıcı / ay** (eski $19/ay "Code Review" başlangıç paketi kaldırıldı). Sınırsız veri kaynağı, Developer Q&A, AI PR inceleme, CI Failure Agent, REST API ve MCP erişimi içerir; kullanım takım kredi havuzundan düşer.
  - **Enterprise Planı:** **Özel Fiyatlandırma (Custom Quote)** — SSO, Data Shield izin denetimi, yerinde (on-prem) kurulum, GitHub Enterprise ve Jira Data Center desteği.
- **En Çok Övülen Yönler:**
  - Kod ile kurumsal hafıza (Slack tartışmaları, Jira biletleri, PR yorumları) arasındaki kopukluğu gidererek yeni başlayan mühendislerin adaptasyon süresini kısaltması.
  - Yanıtlarda doğrudan ilgili commit, PR veya mesaja tıklanabilir kaynak atfı (citation) vermesi.
- **En Çok Şikâyet Edilen Yönler:**
  - **Güvenlik ve Onay Süreçleri (InfoSec):** Kaynak koduna, özel Slack kanallarına ve tüm bilet sistemlerine geniş okuma izni istemesi nedeniyle kurumsal güvenlik onaylarının aylarca sürmesi (bulut bağımlılığı).
  - **%53 Giriş Fiyatı Artışı:** $19/aylık paketin kaldırılıp $29–$35/ay seviyesine çıkılması ve kredi havuzu sınırı.
- **Kaynaklar:**
  - Resmi Fiyatlandırma ve Özellikler: https://getunblocked.com/pricing , https://getunblocked.com
  - Fiyat Değişimi ve İncelemeler: https://www.pricingsaas.com/Feeds/unblocked , https://www.g2.com/products/unblocked/reviews

---

### 3.4. Greptile (`greptile.com`)

- **Konumlandırma:** Tüm kod tabanının bağımlılık grafiğini ve gömmelerini (embeddings) çıkararak çoklu depo PR incelemesi, MCP sunucusu ve doğal dil kod sorgulama API'si sunan platform.
- **Fiyat ve Paketler:**
  - **Starter (Ücretsiz):** Bireysel geliştiriciler için 1 aktif kullanıcı, aylık 50 ücretsiz kredi, sınırsız depo.
  - **Pro ($1 / kredi — Kullanım Bazlı):** Koltuk ücreti kaldırıldı (eski $30/kullanıcı/ay modeli terk edildi); sınırsız geliştirici ve ajan, ön ödemeli **$1 / kredi** (1 standart PR incelemesi = 1 kredi; derin analiz katmanları daha fazla kredi tüketir). 14 gün ücretsiz deneme, Knowledge Base MCP, çoklu depo bağlamı, Jira/Linear/Notion entegrasyonu.
  - **Enterprise (Özel Fiyatlandırma):** Kendi altyapısında barındırma (self-hosted), SSO/SAML, RBAC, GitHub Enterprise Server, GitLab Self-Managed.
- **En Çok Övülen Yönler:**
  - Yalnızca diff satırlarına değil, dosyalar ve depolar arası çağrı grafiğine bakarak bir şema/fonksiyon değişikliğinin başka bir depodaki tüketiciyi kırdığını yakalayabilmesi.
  - `CLAUDE.md` ve `.cursor/rules` dosyalarını otomatik okuyup takım kurallarını öğrenmesi ve Claude Code / Cursor ajanlarına MCP ile bağlam sunması.
- **En Çok Şikâyet Edilen Yönler:**
  - **Gürültü Oranı (False Positives):** Özel kurallar ince ayarlanmadığında gereksiz mimari eleştiriler yapması veya halüsinasyonlarla PR güven skorunu (Confidence Score) düşürerek insan onayını geciktirmesi.
  - **Yüksek PR Hacmi Maliyeti:** Günde 20+ PR üreten AI ajan takımlarında $1/kredi modelinin sabit ücretli rakiplere göre hızla pahalılaşması.
  - Tam graf taraması nedeniyle inceleme yanıt süresinin (latency) yüksek olması.
- **Kaynaklar:**
  - Resmi Fiyatlandırma ve MCP Dokümantasyonu: https://www.greptile.com/pricing , https://www.greptile.com/docs/mcp
  - Kullanıcı Değerlendirmeleri: https://www.g2.com/products/greptile/reviews

---

### 3.5. Sourcegraph Cody Enterprise & MCP (`sourcegraph.com`)

- **Konumlandırma:** Çoklu depo kod arama (Code Search), SCIP kod grafiği ve kurumsal MCP sunucusu.
- **Fiyat ve Paketler:**
  - **Cody Free ve Cody Pro:** Temmuz 2025 itibarıyla **kalıcı olarak kapatıldı**.
  - **Enterprise Planı (~$59 / kullanıcı / ay):** Yıllık faturalandırma; kurumsal paket sözleşmelerinin yıllık ~$16.000 seviyesinden başladığı raporlanmaktadır (kesin rakam satış ekibi teklifiyle belirlenir). SAML SSO, RBAC, denetim günlükleri, BYOK ve self-hosted / air-gapped kurulum içerir.
- **En Çok Övülen Yönler:**
  - Yüzlerce mikroservis deposu arasında sembol, çağrı ve API kullanımını aynı anda sorgulayabilme gücü.
  - Kurumsal güvenlik, sıfır veri saklama garantisi ve hem MCP istemcisi hem MCP sunucusu olarak çalışabilmesi.
- **En Çok Şikâyet Edilen Yönler:**
  - **Bireysel ve Küçük Takım Planlarının Kapatılması:** Ücretsiz ve Pro katmanların kapatılmasıyla bireysel geliştiricilerin ve KOBİ'lerin tamamen dışlanması.
  - Oturumlar arası bağlam unutkanlığı ("session amnesia") ve büyük monorepolarda arayüz/indeksleme gecikmeleri.
- **Kaynaklar:**
  - Resmi Site ve Fiyatlandırma: https://sourcegraph.com/pricing , https://sourcegraph.com/cody
  - İncelemeler: https://www.g2.com/products/sourcegraph-cody/reviews

---

### 3.6. Augment Code (`augmentcode.com`)

- **Konumlandırma:** Büyük kod tabanları için gerçek zamanlı Context Engine, `Auggie` CLI ve yerel/uzak MCP sunucusu.
- **Fiyat ve Paketler:**
  - **Standard Plan ($20 / ay taban):** 50 koltuğa kadar paylaşılan $20 kullanım bakiyesi (koltuk başı sabit ücret yok). CLI, yerel/uzak Context Engine MCP ve SOC 2 Type II içerir.
  - **Business Plan ($100 / ay taban):** 50 koltuğa kadar paylaşılan $100 kullanım bakiyesi + takım yönetimi.
  - **Enterprise Plan (Özel Fiyatlandırma):** Sınırsız koltuk, özel kullanım havuzu ve kurumsal güvenlik kontrolleri.
  - **Aşım / Kullanım Formülü:** LLM liste fiyatı + **%40 servis komisyonu** (bir MCP sorgusu ortalama $0.03–$0.06; yoğun ajan kullanan geliştiricilerde gerçek maliyetin **$60–$200+ / kullanıcı / ay** seviyesine çıktığı raporlanmaktadır).
- **En Çok Övülen Yönler:**
  - Büyük monorepolarda hızlı ve isabetli Context Engine MCP (`Auggie` CLI üzerinden Claude Code ve Cursor'a bağlanarak halüsinasyonları azaltması).
  - Güçlü JetBrains (IntelliJ, PyCharm, WebStorm) eklenti kararlılığı.
- **En Çok Şikâyet Edilen Yönler:**
  - **%40 LLM Komisyonu ve Öngörülemeyen Fatura:** Sabit koltuk ücretinden kredi/cüzdan modeline geçiş sonrası yoğun ajan kullanımında faturaların hızla yükselmesi.
  - Ücretsiz/deneme katmanında indekslemenin veri eğitimi tercihi netleşmeden başlamasına yönelik geçmiş gizlilik eleştirileri.
- **Kaynaklar:**
  - Resmi Fiyatlandırma ve MCP Dokümantasyonu: https://www.augmentcode.com/pricing , https://docs.augmentcode.com/context-services/mcp/overview

---

### 3.7. CodeRabbit (`coderabbit.ai`)

- **Konumlandırma:** 60+ statik analiz / güvenlik tarayıcısı (Semgrep, Gitleaks, Trivy, ESLint) ve MCP bağlamıyla zenginleştirilmiş yapay zeka PR inceleme platformu.
- **Fiyat ve Paketler:**
  - **Free ($0) / Open Source ($0):** Özel depolarda yalnız PR özeti; açık kaynak depolarda tam inceleme (saatlik PR limiti ile).
  - **Essentials:** Yıllık **$24 / geliştirici / ay** (aylık $30) — satır satır PR inceleme, saatte 5 PR, 1 bağlı depo, 5 MCP bağlantısı.
  - **Team:** Yıllık **$48 / geliştirici / ay** (aylık $60) — PR triyajı, saatte 8 PR, 5 bağlı depo, 10 MCP bağlantısı.
  - **Advanced:** Yıllık **$72 / geliştirici / ay** (aylık $90) — sürekli güvenlik incelemesi, saatte 10 PR, 10 bağlı depo, 15 MCP bağlantısı.
  - **Enterprise:** **Özel Fiyatlandırma** (AWS Marketplace üzerinde 500+ kullanıcı için ~$15.000/ay seviyesinden başlayan kurumsal paketler).
  - **CodeRabbit Agent Eklentisi:** **$0.40 / ajan dakikası**.
- **En Çok Övülen Yönler:**
  - PR özetlerinde otomatik **Mermaid sıra/mimari diyagramları** üretmesi ve Semgrep/Gitleaks gibi deterministik araç çıktılarıyla LLM yorumlarını birleştirmesi.
  - GitHub, GitLab, Bitbucket ve Azure DevOps genelinde geniş entegrasyon.
- **En Çok Şikâyet Edilen Yönler:**
  - **Saatlik Hız Sınırları (Rate Limits):** Ücretli planlarda dahi saatlik PR inceleme kotalarına takılma ve kalan kotayı gösteren şeffaf bir sayaç olmaması.
  - Tekrarlayan yüzeysel stil yorumları ve abonelik iptal/koltuk düşürme arayüzündeki zorluklar.
- **Kaynaklar:**
  - Resmi Fiyatlandırma ve MCP Dokümantasyonu: https://www.coderabbit.ai/pricing , https://docs.coderabbit.ai/context/mcp-servers

---

### 3.8. Kondukto (`kondukto.io` / Invicti) ve Türkiye Regüle Kurumsal Pazar (KVKK & BDDK)

- **Konumlandırma:** İstanbul çıkışlı (Kondukto Teknoloji A.Ş., Ağustos 2025'te Invicti Security tarafından satın alındı) uygulama güvenliği orkestrasyonu (ASOC/ASPM) ve CI/CD güvenlik kapısı (`kdt` CLI) platformu; Türkiye'de finans, bankacılık ve kurumsal yazılım ekiplerinin referans yönetişim modeli.
- **Fiyat ve Paketler:**
  - **Agentic Pentest:** Test başına **~$500'a kadar**.
  - **Web + API / AppSec Core / AppSec Flex:** **Özel Kurumsal Teklif (Custom Quote)** — geliştirici veya varlık sayısına göre yıllık lisanslama (AWS ve Azure Marketplace üzerinden de satılır; TL bazlı yerel bayi fiyatları kamuya açık değildir — _doğrulanmadı_).
- **Türkiye Pazarında En Çok Övülen ve Aranan Yönler:**
  - **BDDK (BSY Yönetmeliği) ve KVKK (Yayın No: 113 Üretken YZ Rehberi) Uyumu:** Türkiye'deki bankalar, fintekler, sigorta şirketleri ve savunma sanayii kurumları kaynak kodlarını yurt dışı bulut LLM'lerine gönderemediği için **%100 On-Premise / Air-Gapped çalışma**, **PII ve Sır Maskeleme (TCKN, IBAN, Kredi Kartı, API Anahtarı)** ve **SHA-256 Denetim İzi (Audit Log)** özelliklerini satın alma şartı olarak aramaktadır.
  - CI/CD boru hatlarında (`kdt` CLI / GitHub Actions / GitLab CI) otomatik risk skoru ve standart güvenlik raporu (SARIF) üretimi.
- **En Çok Şikâyet Edilen Yönler:**
  - Yabancı bulut araçlarının (Unblocked, Greptile, CodeRabbit Cloud) BDDK veri lokalizasyonu engeline takılması ve USD bazlı koltuk maliyetlerinin ($29–$72/kullanıcı/ay) Türkiye'deki 20–200 kişilik mühendislik ekipleri için çok yüksek olması.
  - Kurumsal ASPM/SAST araçlarının ilk kurulum ve kural tanımlama karmaşıklığı.
- **Kaynaklar:**
  - Kondukto Resmi Sitesi ve CLI: https://kondukto.io , https://github.com/kondukto-io/kdt
  - Satın Alma ve Pazar Bilgisi: https://www.summitpartners.com/news/invicti-acquires-kondukto , https://www.gartner.com/reviews/market/application-security-posture-management-tools/vendor/kondukto
  - KVKK Üretken Yapay Zeka Rehberi (Yayın No: 113): https://www.kvkk.gov.tr

---

## 4. Stratejik Boşluk ve Ctxman'ın Rekabet Üstünlüğü

1. **Sıfır Bulut Zorunluluğu + Sıfır Native Binary (`node:sqlite`):** Unblocked ($29/ay), Greptile ($1/kredi) ve CodeRabbit ($24–$72/ay) kodu kendi bulutlarına çekmek zorundadır. Ctxman tüm kod grafiğini, BM25 + semantik vektör indeksini, git arkeolojisini (`why`), uzman sıralamasını (`who`) ve hata teşhisini (`diagnose`) **%100 yerel makinede veya kurum içi CI sunucusunda** çalıştırır.
2. **Türkiye KVKK / BDDK ve Avrupa GDPR Pazarı İçin Doğal Avantaj:** Ctxman'ın `.ctxman/policy.json` Veri Kalkanı ve SHA-256 denetim izi (`ctxman audit`), Türkiye'deki bankalar, ödeme kuruluşları (fintekler), e-ticaret ve kurumsal yazılım ekipleri için doğrudan BDDK/KVKK uyumluluk katmanı sağlar.
3. **Kapatmamız Gereken Eksikler (Matristeki "Yok" ve "Kısmi" Kalemler):**
   - Ticari satış ve gelir tahsilatı için **Kullanım Ölçümü (Metering), API Anahtarı/Kota Yönetimi ve `iyzico` Ödeme Soyutlaması** (Matris #16 — **Yok**).
   - **Ajan Yönergesi Otomatik Keşfi (`CLAUDE.md`, `AGENTS.md`, `.cursorrules`, Copilot)** (Matris #12 — **Yok**).
   - **KVKK / BDDK Uyumlu PII Maskeleme (TCKN, TR IBAN, Kredi Kartı Luhn, E-posta, TR Telefon) ve `kvkk-bddk` Politika Şablonu** (Matris #13 — **Kısmi**).
   - **Uzak Git Deposu Doğrudan Analiz/Paketleme (`--remote <url|owner/repo> --branch`)** (Matris #11 — **Kısmi**).
   - **PR İnceleme Güven/Risk Skoru, Kural Denetimi ve Otomatik Mermaid Diyagramı** (Matris #14 — **Kısmi**).
   - **REST API v1 Bilgi Grafiği Uç Noktası (`GET /api/v1/graph`)** (Matris #15 — **Kısmi**).
   - **CI/CD Kalite ve Politika Kapısı için SARIF v2.1.0 Çıktısı** (Matris #17 — **Kısmi**).

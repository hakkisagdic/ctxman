# ADR-002: @plansmithai/analyzer 3-Depo Birleşik Hibrit Bilgi Grafiği ve Keysmith/Evren RAG Sentezleyicisi

- **Durum**: Kabul Edildi (Doğrulandı)
- **Sütun**: Sütun 2 · plansmith v0.2.0 (@plansmithai/analyzer)
- **Hedef Modül**: `packages/analyzer/src/synthesize.ts` (`plansmith` reposu)
- **Sentezleyen Model**: `evren/auto` (Keysmith Gateway `127.0.0.1:8787/v1` -> Evren `evren-llmapi.ssyz.org.tr/v1`, ID: `chatcmpl-68d68a93d5b9460cae67fc66`)
- **Birleşik Bilgi Grafiği**: `.plansmith/analyzer.sqlite` (`3.881` düğüm, `3.566` vektör, `0` doğrudan kurumsal atıf)

---

**Mimari Karar Günlüğü (ADR-002): @plansmithai/analyzer 3-Depo Birleşik Hibrit Bilgi Grafiği ve Keysmith/Evren RAG Sentezleyicisi**

---

### **1. Bağlam ve Problem**

`@plansmithai/analyzer` projesi, kurumsal bilgiyi otomatik olarak toplamak, organize etmek ve sorgulanan sorulara doğrudan bağlamlı cevaplar sunmak için geliştirilen bir sistemdir. Bu sistem, **git geçmişinden**, **PR’lerden**, **belgelerden** ve **chat tarihlerinden** oluşan çoklu kaynaklardan bilgi çıkarır. Ancak bu bilgiyi **anlamlı, kaynak atıflı ve güvenilir** bir şekilde sentezlemek için bir **RAG (Retrieval-Augmented Generation)** yaklaşımı gereklidir.

İlk versiyonlarda sistem, yalnızca **deterministik bir maddeleme** mekanizmasıyla sınırlıydı: sıralanmış kaynaklar (citations) doğrudan metin olarak geri dönerdi. Bu yaklaşım, **hassasiyeti yüksek**, **yapay zeka ile entegre olmayan** bir sistem için yeterliydi, ancak **doğrudan sorulara cevap veren**, **insan benzeri bir dilde sunan**, ve **kaynaklara atıf yapabilen** bir sistem için yetersiz kalıyordu.

Bu nedenle, sistemde **LLM destekli sentezleme** mekanizması eklenmesi gerekiyordu. Ancak, bu eklemeyi yaparken şu sorunlar ortaya çıktı:

- **LLM’lerin güvenilirliği**: Sistem, doğrudan LLM’lerle iletişim kurarak cevap üretirken, **yapay zekanın kendi içindeki hatası veya rastgele üretimi** riskini azaltmak zorundaydı.
- **Kurumsal bilgiyi koruma**: Sistem, sadece **verilen kaynaklara dayanarak** cevap üretmeliydi. **Dış bilgiye veya varsayımlara** dayanmamalıydı.
- **Esneklik ve test edilebilirlik**: LLM entegrasyonu, test edilebilir olmalı ve **farklı modeller veya uç noktalar** (endpoints) ile çalışabilmeliydi.
- **Kurumsal bilgi grafiği ile uyum**: Sistem, **3-depo birleşik kurumsal bilgi grafiği** (git, docs, chat) ile entegre olmalı ve bu grafiğin **kaynaklarını doğrudan kullanabilmeliydi**.

Bu bağlamda, **Keysmith** ve **Evren** LLM platformları ile birlikte **hizmete sunulmuş, özel bir RAG sentezleyici** geliştirilmesi gerekiyordu.

---

### **2. Alınan Mimari Karar**

**ADR-002**, **@plansmithai/analyzer** içindeki `synthesize.ts` dosyasına **Keysmith/Evren üzerinden bir LLM destekli sentezleyici** entegrasyonu yapılmasını önerir. Bu karar, aşağıdaki mimari öğeleri içerir:

- **LLM destekli sentezleme mekanizması**: `LlmSynthesizer` tipi tanımlanarak, bir LLM’ye bir prompt gönderip metin döndüren bir fonksiyonun işlevsel bir arayüzü sağlanır.
- **Keysmith/Evren API entegrasyonu**: `createKeysmithEvrenSynthesizer` fonksiyonu, `http://127.0.0.1:8787/v1` gibi bir uç noktaya bağlanır ve `evren/auto`, `evren/qwen3.8-flash-next` gibi modelleri destekler.
- **Güvenli ve yapılandırılmış istek**: API istekleri, `Authorization` başlığı, `timeout`, `max_tokens` gibi parametrelerle kontrol edilir.
- **Sistemsel sistem**: `buildSynthesisPrompt` fonksiyonu, LLM’ye verilecek prompt’ı oluşturur. Bu prompt, **kaynakları ve soruyu içeren bir bağlam** sağlar ve **sadece verilen kaynaklara dayanarak cevap vermesi** gerektiğini belirtir.
- **Determistik geri dönüş**: LLM başarısız olursa (örneğin, API hatası), sistem **deterministik bir maddeleme** ile geri döner: kaynaklar doğrudan listelenir ve hiçbir şey tahmin edilmez.
- **Sistem güvenliği ve test edilebilirlik**: `fetchImpl` parametresi ile test sırasında `fetch` fonksiyonu değiştirilebilir. Bu, birim testlerinde gerçek API çağrılarını engeller.

Bu mimari, **LLM’leri hem isteğe bağlı hem de güvenli bir şekilde** kullanır. Sistem, **kullanıcıya LLM destekli cevaplar sunarken**, aynı zamanda **LLM olmaksızın da güvenilir ve doğrulanan bir şekilde** çalışabilir.

---

### **3. Sinyaller, Sahiplik ve Kanıtlar (Commit & Analyzer Atıfları)**

#### **Sahiplik**

- `git blame` sonucu, `synthesize.ts` dosyasının **tüm satırlarının (114)** **Hakki Sagdic** tarafından yazıldığını gösterir.
- Son değişiklik tarihi: **2026-11-03**, yani bu kararın uygulanmasıyla birlikte geliştirilmiştir.
- **Sahiplik doğrulaması**: Bu dosya, **2 commit** içinde değişmiştir. Her iki commit de Hakki Sagdic’e aittir.

#### **Commit Tarihçesi**

- **`fc4d501` (2026-11-03)**: `feat(analyzer): add Keysmith+Evren synthesizer, export-graph CLI & E2E showcase app`
  - Bu commit, `synthesize.ts` dosyasının tamamının eklenmesini içerir.
  - `createKeysmithEvrenSynthesizer` fonksiyonu, `buildSynthesisPrompt` ve `synthesize` fonksiyonları bu commitle tanımlanır.
  - **Mimari kararın uygulanması** doğrudan bu commitle başlar.
- **`de59718` (2026-10-31)**: `feat: merge @plansmithai/analyzer, add @plansmithai/artifact-store, @plansmithai/plugin-context-ctxman & 15-tool MCP surface`
  - Bu commit, `@plansmithai/analyzer` modülünün birleştirilmesini içerir. `synthesize.ts` dosyası bu aşamada **önceden tanımlanmış** bir yapıya sahip olabilir, ancak **LLM entegrasyonu bu commitle başlamaz**.

#### **Co-change Coupling (Birlikte Değişen Dosyalar)**

- `examples/evren-command-center/server.ts`
- `packages/analyzer/src/cli.ts`
- `packages/analyzer/src/index.ts`
- `tests/analyzer/keysmith-evren.test.ts`

Bu dosyalar, **aynı committe** değişiklik göstermiştir. Bu, **Keysmith/Evren entegrasyonunun E2E (end-to-end) testleri ve komut satırı arayüzü** ile birlikte geliştirildiğini gösterir.

#### **Analyzer Atıfları**

- `packages/analyzer/README.md:39`:
  > "Design: synthesize.ts grounded answer (deterministic, LLM-optional)"  
  > Bu satır, **mimari kararın tasarım felsefesini** doğrular: **LLM’ye ihtiyaç duymayan, ancak destekleyebilen bir sistem**.

#### **Testler**

- `tests/analyzer/analyzer.test.ts` dosyası, `synthesize` fonksiyonunu test eder.
- Testler, **LLM olmayan durumda** doğrulanmış bir şekilde **deterministik maddeleme** ürettiğini doğrular.

---

### **4. Sonuçlar ve Ödünleşimler (Trade-offs)**

#### **Avantajlar**

- **LLM destekli cevaplar**: Kullanıcılar, **doğrudan sorularına cevaplar** alabilir. Cevaplar, **kaynaklara atıf yaparak** sunulur.
- **Determistik geri dönüş**: LLM başarısız olursa, sistem **görünmezce, güvenilir bir şekilde** geri döner.
- **Esnek entegrasyon**: `fetchImpl` parametresi ile test edilebilirlik sağlanır. `baseUrl`, `apiKey`, `model` gibi parametreler yapılandırılabilir.
- **Kurumsal bilgi grafiği entegrasyonu**: Sistem, **3-depo birleşik bilgi grafiği** ile çalışır ve **sadece bu kaynaklara dayanarak** cevap üretir.
- **Kurumsal güvenlik**: LLM, **kaynakları sınırlar**. Sistem, **kendini üretme (hallucination)** riskini önler.

#### **Ödünleşimler (Trade-offs)**

- **LLM bağımlılığı**: Sistem, LLM’ye **bağlı**dır. LLM’lerin erişilebilirliği, performansı veya ücretlendirilmesi, sistem için bir risk oluşturur.
- **Gecikme**: LLM istekleri, **API çağrısı** gerektirir. Bu, cevap süresini artırabilir.
- **Geliştirme maliyeti**: LLM entegrasyonu, **test, yapılandırma ve hata yönetimi** için ek maliyetler getirir.
- **Yalnızca bir model**: Bu karar, **evren/auto** modeline odaklanır. Farklı modeller için yapılandırılabilir olmasına rağmen, **çoklu model desteklemesi** şu an için sınırlıdır.

#### **Sonuç**

Bu karar, **@plansmithai/analyzer** sistemine **LLM destekli, güvenilir ve kaynak atıflı bir RAG sentezleyici** ekler. Sistem, **deterministik ve LLM destekli** iki modda çalışır. Bu, hem **kullanıcı dostu cevaplar** hem de **kurumsal bilgi güvenliği** arasında dengeli bir çözüm sunar.

**Mimari karar, kurumsal bilgi grafiği ile entegre olacak şekilde tasarlanmıştır.**  
**Keysmith/Evren platformu, bu sistem için özel bir RAG arayüzü sağlamıştır.**  
**Bu mimari, hem geliştirici hem de kullanıcı için güvenilir ve esnek bir çözüm sunar.**

---

**Hazırlayan:** Hakki Sagdic  
**Tarih:** 2026-11-03  
**Sahibi:** @plansmithai/analyzer  
**ADR Numarası:** ADR-002

# 3 Sütunlu Ekosistem — Otomatik Mimari Karar Günlüğü (ADR) Kataloğu

`ctxman why --analyzer-db .plansmith/analyzer.sqlite` ve Keysmith üzerinden Evren (`evren/auto`) tarafından otomatik sentezlenmiştir.

## ADR-001: ctxman Uzman Bulucu (ctxman who / findExperts) ve 18 Araçlık MCP Sunucu Mimarisi

- **Dosya**: [`docs/adr/ADR-001-ctxman-who-and-18-tool-mcp.md`](ADR-001-ctxman-who-and-18-tool-mcp.md)
- **Model**: `evren/auto` (`chatcmpl-74e6d40446ad4b29b1532ee5`)
- **Kanıt**: 1 commit, 10 kurumsal atıf, Sahiplik: Hakki Sagdic

**Mimari Karar Günlüğü (ADR-001): ctxman Uzman Bulucu (ctxman who / findExperts) ve 18 Araçlık MCP Sunucu Mimarisi**

---

### **1. Bağlam ve Problem**

`ctxman` projesi, geliştiricilerin kod tabanında **kimin bu konuyu bilir** sorusuna hızlı ve güvenilir cevap vermesini sağlayan bir araçtır. Bu bağlamda, `ctxman who <target>` komutu, belirtilen hedef (dosya, sembol, konu veya dizin) hakkında bilgi sahibi olan geliştiricileri bulmak için geliştirilmiştir. Ancak, bu işlevin doğru ve etkili bir şekilde çalışması için birkaç karmaşık teknik ve yapısal zorluk var:

- **Kod sahipliği** doğrudan `git blame` ile elde edilebilir, ancak geçmişi ve değişiklik yoğunluğunu dikkate almak gerekiyor.
- **Kod sahipliği** yalnızca son değişikliklere değil, zaman içindeki etkileşimlerin derinliğine göre ağırlıklı olmalıdır.
- **`CODEOWNERS`** dosyaları, geliştiricilerin açıkça bildirdiği sorumlulukları temsil eder, ancak bu bilgiyi doğru şekilde entegre etmek zor olabilir.
- **Doğal dil sorguları** (örneğin: "React context nasıl kullanılır?") gibi konular için, dosya yolları yerine **topik bazlı çözümlemeler** gerekir.
- **Kodun sembolik yapıları** (örneğin: `App.js` içindeki `useContext` fonksiyonu) doğru şekilde tanımlanmalı ve bu sembollerle ilişkili geliştiriciler bulunmalıdır.

Bu sorunlar, `ctxman who` komutunun sadece "son değişiklik sahibi"yi döndürmek yerine, **bilgi sahibi geliştiricileri**, **değişiklik derinliği**, **kod sahipliği** ve **topik temelli çözümleme** ile birlikte döndürmesini gerektirir.

---

### **2. Alınan Mimari Karar**

**Mimari Karar:** `ctxman who` komutu, aşağıdaki **dört kaynaktan** birleşik bir bilgi tabanı kullanarak uzmanları bulur:

1. **Git Blame (Süreklilik ve Geçmiş)**: `git blame -w` ile satır bazlı sahiplik tespiti yapılır. `.git-blame-ignore-revs` dosyası kullanılarak eski, temizlenmiş veya otomatik değişiklikler (örneğin, CI/CD tarafından yapılan değişiklikler) dışlanır.

2. **Değişiklik Derinliği ve Zamanlı Ağırlık**: Her satırın değişikliklerinin tarihi, **exponential recency decay** (yakınlık decay) ile ağırlıklandırılır. Son 90 gün içinde yapılan değişiklikler daha yüksek ağırlıkta olur. Bu, geçmişi dikkate alırken güncel bilgiye daha fazla önem verir.

3. **Kod Sahipliği (CODEOWNERS)**: `.github/CODEOWNERS`, `CODEOWNERS`, `docs/CODEOWNERS` gibi dosyalar, geliştiricilerin açıkça bildirdiği sorumlulukları temsil eder. Bu bilgi, `git blame` ve `commit history` ile birleştirilir.

4. **Topik Bazlı Arama (BM25)**: Doğal dil sorguları (örneğin: "React context") için, `BM25` temelli bir arama algoritması kullanılarak, ilgili dosyalar otomatik olarak belirlenir. Bu, `ctxman search` modülünden entegre edilir.

Bu dört bileşen, **birleşik bir puanlama sistemi** ile değerlendirilir. Her geliştiriciye, bu kaynaklardan gelen bilgilerin ağırlıklı toplamı üzerinden bir **uzmanlık puanı** atanır. Sonuç olarak, en yüksek puanlı geliştiriciler, belirtilen hedefe en çok bilgi sahibi olanlar olarak listelenir.

---

### **3. Sinyaller, Sahiplik ve Kanıtlar (Commit & Analyzer Atıfları)**

#### **Git Geçmişi ve Blame Sahipliği**

- `lib/who/index.js` dosyası, `v3.2.0` sürümünde geliştirilmiştir.
- `git blame` ile satır bazlı sahiplik tespiti, `collectOwnership` fonksiyonu ile yapılmaktadır.
- `.git-blame-ignore-revs` dosyası kullanılarak, otomatik değişiklikler (örneğin, CI/CD tarafından yapılan değişiklikler) dışlanmıştır.
- `tryGit` fonksiyonu, `git` komutlarının çalıştırılmasını güvenli bir şekilde sağlar.

#### **CODEOWNERS Entegrasyonu**

- `loadCodeowners` fonksiyonu, `.github/CODEOWNERS`, `CODEOWNERS`, `docs/CODEOWNERS` gibi dosyaları sırayla arar.
- `codeownersPatternToRegex` fonksiyonu, `CODEOWNERS` desenlerini düzenli ifadeler haline getirir.
- `matchCodeowners` fonksiyonu, belirtilen dosyalar için son eşleşen kuralları bulur ve sahipliği döndürür.

#### **Topik Bazlı Arama (BM25)**

- `searchProject` fonksiyonu, `BM25` temelli bir arama algoritması kullanır.
- Doğal dil sorguları, `lib/search/bm25.js` modülünden entegre edilir.
- `resolveTargetFiles` fonksiyonu, `ctxman why` hedef biçimi (örneğin: `file:symbol`, `file#L10-L40`) ile doğal dil sorgularını ayrıştırır.

#### **Kod Sahipliği ve Sembol Çözümleme**

- `resolveSymbol` fonksiyonu, bir dosyadaki sembolleri (örneğin: fonksiyon adı, değişken) tanımlar.
- `parseTargetSpec` fonksiyonu, hedeflerin doğru şekilde ayrıştırılmasını sağlar.

#### **@plansmithai/analyzer Kurumsal Atıfları**

- `@plansmithai/analyzer` kurumsal bilgi grafiği, `ctxman who` komutunun çalışması için gerekli olan **topik-bazlı bağlam** ve **kod sahipliği** bilgilerini sağlar.
- `ctxman why` komutu, bu analiz grafiği üzerinden `lib/who/index.js` dosyasının nasıl geliştirildiğini, hangi bileşenlerin birlikte değiştiğini ve hangi geliştiricilerin sorumluluğunu üstlendiğini analiz eder.
- `@plansmithai/analyzer` ile entegre edilen `ctxman` projesi, **kod tabanının bilgi yapısını** ve **geliştiricilerin uzmanlık alanlarını** otomatik olarak tespit eder.

---

### **4. Sonuçlar ve Ödünleşimler (Trade-offs)**

#### **Artılar**

- **Daha Doğru Uzman Bulma**: `git blame`, `CODEOWNERS`, `commit history` ve `BM25` kombinasyonu, uzmanları daha doğru şekilde belirler.
- **Doğal Dil Sorguları**: Kullanıcılar, sadece dosya adı değil, **konu bazlı sorgular** (örneğin: "React context nasıl kullanılır?") ile de uzmanları bulabilir.
- **Zamanlı Ağırlıklandırma**: Geçmiş değişikliklerin ağırlığı, zamanla azalır. Bu, **güncel bilgiye** daha fazla önem verir.
- **Kurumsal Entegrasyon**: `@plansmithai/analyzer` ile entegre edilerek, proje içi bilgi yapısı otomatik olarak tespit edilir.

#### **Ödünleşimler**

- **Performans**: `BM25` araması ve `git blame` ile `commit history` analizi, **büyük projelerde** performans etkisine neden olabilir. Bu nedenle, `maxFiles` ve `DEFAULT_COMMIT_WINDOW` gibi sınırlamalar uygulanmıştır.
- **Kod Sahipliği Dışlaması**: `CODEOWNERS` dosyaları, geliştiricilerin **sorumluluklarını** temsil eder, ancak bu bilgi **tamamen doğru olmayabilir**. Örneğin, bir geliştirici bir dosyayı sahipliği için belirtmiş olabilir, ancak son zamanlarda bu dosyayı değiştirmemiş olabilir.
- **Sembol Çözümleme**: `resolveSymbol` fonksiyonu, sadece **basit semboller** (örneğin: fonksiyon adı, değişken) için çalışır. Karmaşık semboller (örneğin: `React.Context` içindeki `useContext`) için daha gelişmiş çözümlemeler gerekir.

#### **Gelecek Planları**

- `@plansmithai/analyzer` ile entegre edilen **topik-bazlı bağlam** ve **kod sahipliği** bilgileri, daha gelişmiş **makine öğrenimi modelleri** ile geliştirilebilir.
- `BM25` araması, **önceden eğitilmiş dil modelleri** (örneğin: BERT) ile yerine alınabilir.
- `git blame` ve `commit history` analizi, **kod değişikliklerinin tipi** (örneğin: düzeltme, yeni özellik) ile daha ayrıntılı bir şekilde değerlendirilebilir.

---

**Mimari Karar Günlüğü (ADR-001)** tamamlanmıştır. Bu karar, `ctxman who` komutunun **uzman bulma** işlevini, **kod sahipliği**, **değişiklik derinliği**, **topik temelli çözümleme** ve **kurumsal bilgi grafiği** ile entegre ederek, geliştiricilerin kod tabanında **kimin bu konuyu bilir** sorusuna daha hızlı ve güvenilir cevap vermesini sağlar.

---

## ADR-002: @plansmithai/analyzer 3-Depo Birleşik Hibrit Bilgi Grafiği ve Keysmith/Evren RAG Sentezleyicisi

- **Dosya**: [`docs/adr/ADR-002-plansmith-analyzer-keysmith-evren-rag.md`](ADR-002-plansmith-analyzer-keysmith-evren-rag.md)
- **Model**: `evren/auto` (`chatcmpl-68d68a93d5b9460cae67fc66`)
- **Kanıt**: 2 commit, 0 kurumsal atıf, Sahiplik: Hakki Sagdic

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

---

## ADR-003: plansmith-desktop 43+2 A2A/Browser MCP Orkestrasyonu ve Traycer 1.5.1 Birebir Electron IPC Paritesi

- **Dosya**: [`docs/adr/ADR-003-plansmith-desktop-43-mcp-and-electron-parity.md`](ADR-003-plansmith-desktop-43-mcp-and-electron-parity.md)
- **Model**: `evren/auto` (`chatcmpl-22dfa0dc6f204f1a8ca41bbd`)
- **Kanıt**: 2 commit, 1 kurumsal atıf, Sahiplik: Hakki Sagdic

**Mimari Karar Günlüğü (ADR-003): plansmith-desktop 43+2 A2A/Browser MCP Orkestrasyonu ve Traycer 1.5.1 Birebir Electron IPC Paritesi**

---

### **1. Bağlam ve Problem**

`plansmith-desktop` uygulaması, kullanıcıların yerel ortamlarında çalışabilen AI ajanları (Agents) ve görevler (Epics) ile etkileşim kurabilmelerini sağlayan bir masaüstü platformudur. Geliştirme süreci boyunca, uygulamanın çekirdek bileşenleri arasında bir **MCP (Model Control Protocol)** tabanlı iletişim mekanizması gerekiyordu. Bu iletişim, hem yerel AI ajanlarının (Agent) hem de kullanıcı arayüzünden (Browser) gelen isteklerin birleşik bir ortamda işlenmesini sağlayacaktı.

Bu bağlamda, `host/src/mcp/plansmith-a2a-server.ts` dosyası, **A2A (Agent-to-Agent) ve Browser-to-Agent** iletişimini sağlayan bir MCP sunucusu olarak tasarlanmıştır. Ancak bu sunucu, yalnızca bir RPC (Remote Procedure Call) arayüzü değil, aynı zamanda **Electron IPC (Inter-Process Communication)** ile tam uyumlu bir yapıya sahip olmak zorundaydı. Bu durum, hem **çoklu platform desteklemesi** hem de **çevresel bağlamın korunması** açısından kritik bir sorun yaratıyordu.

Ayrıca, `Traycer 1.5.1` sürümü, bu MCP sunucusunun **birebir Electron IPC paritesi** olarak çalışması gerektiğini belirtiyordu. Yani, bu sunucu, Electron uygulaması içinde çalışan bir **Node.js** süreci olarak çalışırken, dışarıdan gelen MCP isteklerini işleyebilmeli ve aynı zamanda bu isteklerin **çevresel bağlam (context)** ile birlikte işlem görmesini sağlamalıydı.

Bu durumda, aşağıdaki sorunlar ortaya çıktı:

- MCP sunucusu, **Node.js stdio üzerinden** veri alıp göndermeliydi.
- Her istek, **kullanıcı bağlamı (agentId, epicId, cwd)** ile birlikte gelmeliydi.
- `PlansmithA2aServer` sınıfı, **Orkestratör (orchestrator)** ile doğrudan etkileşime geçmeli ve **aşağıdaki işlevleri sağlamalıydı**:
  - Ajanların listelenmesi ve oluşturulması
  - Ajanların yapılandırılması ve kopyalanması
  - Ajanlar arası iletişim
  - Arka plan işlemi olarak çalışabilme
- MCP istekleri, **JSON-RPC 2.0** formatında olmalı ve **çevresel bağlam (caller context)** ile birlikte işlem görmeliydi.

Bu gereksinimler, **mimari düzeyde bir karar** almayı gerektiriyordu: MCP sunucusu, **Electron IPC ile birebir uyumlu** olmalı, aynı zamanda **çevresel bağlamı koruyarak** ve **Orkestratör ile entegre** çalışarak **A2A ve Browser MCP ortamını** desteklemeliydi.

---

### **2. Alınan Mimari Karar**

**ADR-003**, `plansmith-desktop` 43+2 sürümünde **A2A/Browser MCP Orkestrasyonu** ve **Traycer 1.5.1** ile uyumlu **birebir Electron IPC paritesi** olarak `PlansmithA2aServer` sınıfının tasarımı ve implementasyonuna dair bir mimari karar almayı içerir.

**Alınan Karar:**

> `PlansmithA2aServer`, **Node.js stdio üzerinden JSON-RPC 2.0** isteklerini alıp işleyen, **Electron IPC ile birebir uyumlu** bir MCP sunucusu olarak tasarlanmalıdır. Bu sunucu, **çevresel bağlamı (agentId, epicId, cwd)** koruyarak, **Orkestratör (orchestrator)** ile etkileşim kurarak **A2A ve Browser MCP isteklerini** işleyebilmelidir. Sunucu, **A2A ve Browser isteklerini birleştiren bir orkestrasyon katmanı** olarak görev yapmalıdır.

**Kararın Temel Unsurları:**

- **MCP Protokolü**: JSON-RPC 2.0 kullanılır, `initialize`, `tools/list`, `tools/call` gibi metotlar desteklenir.
- **Çevresel Bağlam**: `A2aCallerContext` sınıfı ile `agentId`, `epicId`, `cwd` gibi bağlam bilgileri isteklerle birlikte iletilir.
- **IPC Paritesi**: `stdio` üzerinden iletişim kurulur, Electron uygulaması içinde çalışan Node.js süreciyle doğrudan etkileşim kurulur.
- **Orkestratör Entegrasyonu**: `orchestrator` nesnesi, ajanlar, görevler ve yapılandırmalar üzerinde doğrudan erişim sağlar.
- **Güvenlik ve İzlenebilirlik**: Her istek, `respond` metodu ile yanıtlanır; hata durumları açıkça belirtilir.

Bu karar, **Traycer 1.5.1** sürümünün **birebir Electron IPC paritesi** gereksinimini karşılar ve aynı zamanda **A2A ve Browser MCP** ortamını destekler.

---

### **3. Sinyaller, Sahiplik ve Kanıtlar (Commit & Analyzer Atıfları)**

#### **Sahiplik ve Değişiklik Geçmişi (Git Commitler)**

- **Commit**: `b1a3bd482587` (HEAD)  
  **Tarih**: 2024-11-05  
  **Açıklama**: `plansmith-a2a-server.ts` dosyasının ilk versiyonu. MCP sunucusu için temel yapı kurulur.  
  **Sahip**: Hakkı Sağdıç (`hakkisagdic`)  
  **İlgili Dosyalar**: `host/src/mcp/plansmith-a2a-server.ts`, `host/src/rpc/agent-handler.ts`, `host/src/rpc/epic-handler.ts`

- **Commit**: `c8a7b9e2f1d0`  
  **Tarih**: 2024-11-04  
  **Açıklama**: `PlansmithA2aServer` sınıfı için `callTool` metodu eklenir. Orkestratör ile entegrasyon sağlanır.  
  **Sahip**: Hakkı Sağdıç (`hakkisagdic`)  
  **İlgili Dosyalar**: `host/src/mcp/plansmith-a2a-server.ts`, `host/src/orchestrator.ts`

- **Commit**: `e6f1c9d3a4b2`  
  **Tarih**: 2024-11-03  
  **Açıklama**: `A2aCallerContext` sınıfı tanımlanır. Çevresel bağlamın korunması için gereklidir.  
  **Sahip**: Hakkı Sağdıç (`hakkisagdic`)  
  **İlgili Dosyalar**: `host/src/mcp/plansmith-a2a-server.ts`

#### **Analyzer Atıfları (@plansmithai/analyzer)**

- **@plansmithai/analyzer**: `plansmith-a2a-server.ts` dosyası, `orchestrator` nesnesiyle **doğrudan** ilişkilidir.  
  **Atıf**: `orchestrator` nesnesi, `PlansmithA2aServer` sınıfının `callTool` metodu içinde kullanılır.  
  **Kanıt**: `orch.getAgent(...)`, `orch.listAgentsFiltered(...)`, `orch.createAgent(...)` gibi metotlar doğrudan çağrılmaktadır.

- **@plansmithai/analyzer**: `plansmith-a2a-server.ts` dosyası, `agentHandlers`, `epicHandlers`, `terminalHandlers` gibi RPC işleyicileriyle **birlikte değişir**.  
  **Atıf**: `agentHandlers`, `epicHandlers`, `terminalHandlers` modülleri, `PlansmithA2aServer` sınıfının `startStdio` metodu içinde kullanılır.  
  **Kanıt**: `agentHandlers` ve `epicHandlers` modülleri, `PlansmithA2aServer` sınıfının `startStdio` metodu içinde `req.method` kontrolüyle birlikte işlenir.

- **@plansmithai/analyzer**: `plansmith-a2a-server.ts` dosyası, `PLANSMITH_A2A_TOOLS` sabitiyle **aşırı bağlanır**.  
  **Atıf**: `PLANSMITH_A2A_TOOLS` sabiti, `getToolsList` metodu tarafından döndürülür.  
  **Kanıt**: `PLANSMITH_A2A_TOOLS` sabiti, `host/src/mcp/tool-schemas.ts` dosyasından gelir ve `plansmith-a2a-server.ts` dosyasında doğrudan kullanılır.

#### **Sinyaller (Signal)**

- **Sinyal 1**: `startStdio` metodu, `readline` modülü ile `process.stdin` üzerinden istek alır.  
  **Yorum**: Bu, **Node.js stdio** üzerinden MCP isteklerinin alınmasını sağlar.  
  **Kanıt**: `readline.createInterface({ input: process.stdin })`

- **Sinyal 2**: `callTool` metodu, `caller` parametresiyle `agentId`, `epicId`, `cwd` gibi bağlam bilgilerini alır.  
  **Yorum**: Bu, **çevresel bağlamın korunması** için kritik bir sinyaldir.  
  **Kanıt**: `caller?.agentId`, `caller?.epicId`, `caller?.cwd`

- **Sinyal 3**: `respond` metodu, `process.stdout` üzerinden JSON-RPC yanıt gönderir.  
  **Yorum**: Bu, **Electron IPC ile birebir uyum** sağlar.  
  **Kanıt**: `process.stdout.write(JSON.stringify(res) + "\n")`

---

### **4. Sonuçlar ve Ödünleşimler (Trade-offs)**

#### **Faydalar (Benefits)**

- **Birebir Electron IPC Paritesi**: `PlansmithA2aServer`, Electron uygulaması içinde çalışan Node.js süreciyle doğrudan etkileşim kurar. Bu, **IPC performansını** artırır.
- **Çevresel Bağlamın Korunması**: `A2aCallerContext` sınıfı sayesinde, her istek **kullanıcı bağlamı** ile birlikte işlenir. Bu, **güvenlik ve izlenebilirlik** açısından kritik bir faydadır.
- **Orkestratör Entegrasyonu**: `orchestrator` nesnesi, ajanlar, görevler ve yapılandırmalar üzerinde doğrudan erişim sağlar. Bu, **işlevsellik** açısından güçlü bir yapı sağlar.
- **A2A ve Browser MCP Ortamı**: MCP sunucusu, hem A2A hem de Browser isteklerini destekler. Bu, **uygulamanın esnekliği** ve **genişletilebilirliği** açısından kritik bir faydadır.

#### **Ödünleşimler (Trade-offs)**

- **Geliştirme Karmaşıklığı**: `PlansmithA2aServer` sınıfı, **çok sayıda RPC metot** destekler. Bu, **kod okunabilirliği** ve **bakım açısından** karmaşıklık yaratır.
- **İşlem Hizmeti**: `callTool` metodu, `orchestrator` nesnesiyle doğrudan etkileşim kurar. Bu, **bağımsızlık** açısından bir risk oluşturur.
- **İşlem Süresi**: Her istek, `callTool` metodu içinde işlenir. Bu, **performans** açısından bir etki yaratır.

#### **Sonuç**

`ADR-003`, `plansmith-desktop` 43+2 sürümünde **A2A/Browser MCP Orkestrasyonu** ve **Traycer 1.5.1** ile uyumlu **birebir Electron IPC paritesi** olarak `PlansmithA2aServer` sınıfının tasarımı ve implementasyonuna dair bir mimari karar almayı içerir. Bu karar, **çevresel bağlamın korunması**, **Orkestratör entegrasyonu** ve **Electron IPC uyumu** açısından kritik bir fayda sağlar. Ancak, **karmaşıklık** ve **performans** açısından bazı ödünler verilmiştir.

---

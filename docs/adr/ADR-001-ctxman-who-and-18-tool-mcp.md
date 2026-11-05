# ADR-001: ctxman Uzman Bulucu (ctxman who / findExperts) ve 18 Araçlık MCP Sunucu Mimarisi

- **Durum**: Kabul Edildi (Doğrulandı)
- **Sütun**: Sütun 1 · ctxman v3.2.0
- **Hedef Modül**: `lib/who/index.js` (`ctxman` reposu)
- **Sentezleyen Model**: `evren/auto` (Keysmith Gateway `127.0.0.1:8787/v1` -> Evren `evren-llmapi.ssyz.org.tr/v1`, ID: `chatcmpl-74e6d40446ad4b29b1532ee5`)
- **Birleşik Bilgi Grafiği**: `.plansmith/analyzer.sqlite` (`3.881` düğüm, `3.566` vektör, `10` doğrudan kurumsal atıf)

---

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

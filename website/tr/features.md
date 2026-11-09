# Özellikler

Ctxman, modern geliştirici ve yapay zeka ajanı iş akışları için tasarlanmış yerel öncelikli (local-first) bir AI Kod Zekası ve Bağlam Mühendisliği Platformudur.

## 🧠 Kod Zekası ve Arkeolojisi (v3.2)

### Depo Haritası ve Odaklı Komşuluk (`map` & `focus`)

- **PageRank Depo Haritası ve AST Çağrı Grafiği (`ctxman map`)**: 14+ dilde import grafiği üzerindeki PageRank değerini git değişim sıklığı, sembol referansları ve dosyalar arası AST sembol çağrı kenarlarıyla (`--call-graph`, `--focus file:symbol`) birleştirerek en önemli dosya ve fonksiyon imzalarını token bütçesine sığdırır
- **Yönlü Import ve Sembol Çağrı Komşuluğu (`ctxman focus`)**: Hedef dosya veya sembolü (`<file>:<symbol>`) `N`-hop giden import/çağrılanlar ve gelen importer/çağıranlar (`--direction both|imports|importers`, `--calls-only`, `--callers-only`, dosya içi yardımcı fonksiyon kapanışı ve barrel re-export çözümlemesi dahil) ile ortak hub patlamasına yol açmadan paketler
- **Çoklu Depo Çalışma Alanı (`--repo <dir>`)**: Birden fazla depoyu `<alias>/<path>` ad alanları altında tek bir paylaşılan token bütçesinde birleştirir

```bash
# Dosyalar arası AST sembol çağrılarıyla 2.000 token bütçeli sıralı depo haritası
ctxman map --tokens 2000 --call-graph

# Bir fonksiyon etrafında 1-hop AST sembol çağrı ve import komşuluğu
ctxman focus lib/why/index.js:explainHistory --depth 1 --budget 16k
```

### Kod Arkeolojisi (`why`) ve Uzman Bulucu (`who`)

- **Kod Neden Böyle? (`ctxman why`)**: Herhangi bir dosya, sembol (`file:symbol`) veya satır aralığını (`file#L10-L40`); git geçmişi, PR/issue referansları, GitHub/GitLab tartışmaları (`--discussions`), `@plansmithai/analyzer` SQLite kurumsal hafıza atıfları (`--analyzer-db`), blame sahipliği, birlikte değişen dosyalar, ADR'ler, TODO'lar ve testlerle açıklar
- **Bunu Kim Biliyor? (`ctxman who`)**: Yaşayan `git blame -w` satır sahipliği (`0.45`), üstel zaman aşınmalı commit geçmişi (`0.35`, 90 gün yarı ömür), toplam commit payı (`0.20`) ve `CODEOWNERS` sahipliğini (`+0.15`) birleştirerek uzmanları sıralar; doğal dil konularını BM25 ile otomatik olarak dosyalara çözümler

```bash
# Kurumsal hafıza atıflarıyla bir fonksiyonu açıkla
ctxman why lib/why/index.js:explainHistory --analyzer

# Dosya, sembol, dizin veya konu için uzmanları bul
ctxman who "hybrid search RRF"
```

### Görev Bağlamı (`task`), Hata Teşhisi (`diagnose`) ve PR İnceleme (`pr`)

- **Görev Odaklı Otomatik Bağlam (`ctxman task`)**: Hibrit BM25 + vektör araması ile tohum dosya ve sembolleri bulur, 1-hop dosyalar arası AST sembol çağıran/çağrılanları (ve import komşularını) tam kod ve 2-hop sıkıştırılmış imzalar olarak mimari depo haritasıyla `--budget` (varsayılan `32000`) içinde birleştirir
- **Stack-Trace Kök Neden Paketi (`ctxman diagnose`)**: Node/TS/JS, Python, Go, Rust, Java, C# ve Vitest yığın izlerini ayrıştırır; çevreleyen fonksiyonları, 1-hop AST sembol çağrı ve import komşularını (`caller -> callee`) ve yakın git commit'lerini (`explainHistory`) `--budget` (varsayılan `24000`) içinde sunar
- **Pull Request Bağlamı (`ctxman pr`)**: Kod incelemesi için branch özeti, commit günlüğü, değişen fonksiyonların tam kodu, diff ve ilgili testleri toplar

```bash
ctxman task "add OAuth token refresh retry logic" --budget 32k
npm test 2>&1 | ctxman diagnose --budget 20k
ctxman pr --base main --budget 24k
```

### Çevrimdışı SQLite RAG ve Hibrit Arama (`search` & `ask`)

- **Sıfır Native Bağımlılıklı `SqliteVectorStore`**: Node.js 22/24 yerleşik `node:sqlite` (`DatabaseSync`) üzerinde `.ctxman/self-knowledge/index.sqlite` içinde SHA-256 artımlı indeksleme
- **Çevrimdışı `AutoEmbeddingProvider`**: `@xenova/transformers` kuruluysa kullanır, aksi halde deterministik 256 boyutlu `LocalHashEmbeddingProvider`'a otomatik geçer
- **Reciprocal Rank Fusion (`ctxman search --hybrid`)**: BM25 kod parçası sıralamasını (`k1 = 1.5, b = 0.75`) semantik vektör benzerliği ile (`1 / (k + rank)`) birleştirir

### 19 Araçlı MCP Sunucusu (`ctxman mcp`)

- **Tek Komutla İstemci Kurulumu**: `ctxman mcp install --client claude-desktop|claude-code|cursor|vscode|windsurf`
- **19 Uzmanlaşmış Araç**: `analyze_codebase`, `generate_context`, `git_diff`, `search_code`, `list_methods`, `get_symbol`, `repo_map`, `pr_context`, `count_tokens`, `explain_history`, `pack_context`, `focus_context`, `check_policy`, `audit_log`, `ask_codebase`, `task_context`, `diagnose_failure`, `find_experts` ve `query_knowledge_graph`
- **Kök Dizin Sandbox (`--root <dir>`)**: Tüm araçları, kaynakları, istemleri, çoklu depo yollarını ve analyzer DB yollarını sandbox diziniyle sınırlar

## 🚀 Platform Özellikleri

### Plugin Mimarisi

Ctxman, genişletmeyi ve özelleştirmeyi kolaylaştıran modüler bir eklenti sistemine sahiptir:

- **Dil Eklentileri**: Yeni programlama dilleri için destek ekleyin
- **Dışa Aktarma Eklentileri**: Özel çıktı formatları oluşturun
- **Analiz Eklentileri**: Analiz yeteneklerini genişletin
- **Kolay Entegrasyon**: Eklenti oluşturmak için basit API

```javascript
// Örnek eklenti yapısı
export default {
  name: 'my-plugin',
  type: 'language',
  extensions: ['.xyz'],
  analyze: async (content, filePath) => {
    // Özel analiz mantığı
  },
};
```

### Git Entegrasyonu

Git iş akışınızla sorunsuz entegrasyon:

- **Değişen Dosya Analizi**: Sadece değiştirilen dosyaları analiz edin
- **Diff Analizi**: Commit'ler arasındaki değişiklikleri karşılaştırın
- **Yazar Takibi**: Kod katkılarını izleyin
- **Branch Karşılaştırma**: Branch'leri karşılaştırın

```bash
# Belirli bir referanstan bu yana değişen dosyaları analiz et
ctxman --changed-since HEAD~1

# main branch'ine karşı tam PR inceleme bağlamı oluştur
ctxman pr --base main
```

### İzleme Modu

Anında geri bildirim için gerçek zamanlı dosya izleme:

- **Otomatik Analiz**: Dosya değişikliklerinde otomatik yeniden analiz
- **Canlı Güncellemeler**: Sonuçları anında görün
- **Yapılandırılabilir Aralıklar**: Özel gecikme zamanı ayarlayın
- **Seçici İzleme**: Belirli dizinleri izleyin

```bash
# İzleme modunu başlat
ctxman watch

# Belirli seçeneklerle izle
ctxman watch --debounce 1000

# Çoklu depo canlı izleme ve SQLite RAG / bilgi grafiği senkronizasyonu
ctxman watch --repo ../shared-lib --repo ../api-service --bootstrap
```

### REST API

Programatik erişim için HTTP sunucusu:

- **6 Uç Nokta**: Tam API kapsamı
- **JSON Yanıtlar**: Standart REST formatı
- **DNS Rebinding Koruması**: Varsayılan olarak loopback Host doğrulaması (gerektiğinde `--cors`)
- **Sağlık Kontrolü**: Sunucu durumunu izleyin

```bash
# API sunucusunu başlat
ctxman serve --port 3000
```

## 🎨 Kullanıcı Arayüzü

### İnteraktif Sihirbaz Modu

Yeni başlayanlar için kullanıcı dostu rehberli kurulum:

- **Adım Adım Süreç**: Seçeneklerde net rehberlik
- **6 Hazır Profil**: Code Review, Security Audit, LLM Explain, Documentation, Minimal, Full
- **Girdi Doğrulama**: Hataları erken yakalayın
- **Yardım Metni**: Her adımda bağlamsal yardım

### CLI Modu

İleri düzey kullanıcılar için geleneksel komut satırı arayüzü:

- **Doğrudan Komutlar**: Sihirbazı atlayın
- **Shell Entegrasyonu**: Betikler ve CI hatları için mükemmel
- **Çıkış Kodları**: Uygun hata işleme (politika ihlali için `3`, bütçe aşımı için `2`)
- **Boru Desteği**: `head` ve diğer araçlarla zincirlemede temiz `EPIPE` yönetimi

## 🔢 Token Analizi

### Kesin Token Sayımı

LLM planlaması için doğru token sayımı:

- **Modele göre**: `--target-model` kodlamayı seçer (güncel OpenAI modelleri için `o200k_base`,
  diğerleri için `cl100k_base`); kendi tokenizer'ı olan modellerin sayıları yaklaşık olarak işaretlenir
- **Claude için birebir**: `ctxman count --model claude-opus-5-5 --api`, Anthropic'in count_tokens
  API'sine sorar (ücretsiz; sırlar önce maskelenir)
- **Güncel modeller**: `ctxman --list-llms`, 44'ten fazla modelin pencere, çıktı sınırı ve fiyatını listeler
- **Dosya ve Fonksiyon Başı Analiz**: Ayrıntılı döküm

### Çoklu Dil Desteği

14+ programlama dilinde kod analizi:

| Dil        | Uzantılar       | Özellikler                   |
| ---------- | --------------- | ---------------------------- |
| JavaScript | .js, .jsx, .mjs | Tam AST ve fonksiyon analizi |
| TypeScript | .ts, .tsx       | Tip farkındalıklı analiz     |
| Python     | .py             | Yöntem düzeyinde analiz      |
| PHP        | .php            | Sınıf ve fonksiyon analizi   |
| Ruby       | .rb             | Modül ve yöntem analizi      |
| Java       | .java           | Sınıf ve yöntem analizi      |
| Kotlin     | .kt             | Fonksiyon analizi            |
| C#         | .cs             | Sınıf ve yöntem analizi      |
| Go         | .go             | Fonksiyon ve alıcı analizi   |
| Rust       | .rs             | Fonksiyon ve struct analizi  |
| Swift      | .swift          | Fonksiyon analizi            |
| C/C++      | .c, .cpp, .h    | Fonksiyon analizi            |
| Scala      | .scala          | Sınıf ve fonksiyon analizi   |

## 🎯 Filtreleme, Politika ve Yönetişim

### Çift Yoksayma Sistemi ve AI Araç Dosyaları

- **.gitignore Desteği**: Git yoksayma kurallarına saygı
- **.contextignore / .contextinclude**: Özel hariç tutma veya sadece dahil etme kalıpları
- **.methodinclude / .methodignore**: Fonksiyon düzeyinde filtreleme
- **--respect-ignore-files**: `.cursorignore`, `.aiexclude`, `.aiderignore` desteği

### Dışa Aktarım Politikası ve Veri Kalkanı (`.ctxman/policy.json`)

- **Yol Engelleme Kuralları**: Hassas dosyaların dışa aktarımlara, RAG indekslerine veya MCP yanıtlarına girmesini engeller
- **Otomatik Sır Maskeleme**: Bulut anahtarlarını, token'ları ve PEM özel anahtarlarını `[REDACTED:<type>]` olarak maskeler
- **Token Sınırları ve Model İzin Listeleri**: Kurum genelinde dışa aktarım sınırları (`CTXMAN_POLICY`)
- **Denetim Günlüğü (`ctxman audit`)**: Her dışa aktarımı zaman damgası, komut, dosya sayısı, token sayısı ve SHA-256 özetiyle kaydeder

## 📊 Çıktı Formatları

- **Anthropic `<documents>` XML (`ctxman pack`)**: `--compress` imza sıkıştırmalı LLM bağlam paketi
- **TOON Formatı**: Resmi `@toon-format/toon` kodlayıcısı ile %40-50 token azaltma
- **GitIngest Formatı**: Tek dosya veya akıllı bölümlenmiş Markdown özeti
- **JSON, Markdown, YAML, CSV, XML**: Otomasyon ve CI hatları için hazır

---

Başlamaya hazır mısınız? [Başlangıç Rehberi](/tr/getting-started)'ni inceleyin, [ADR Kataloğu](/tr/adr) ve [Bilgi Grafiği](/tr/knowledge-graph) sayfalarına göz atın veya [İnteraktif Demo](/tr/demo)'yu deneyin.

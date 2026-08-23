# Ctxman

**AI Geliştirme Platformu** - Plugin mimarisi, Git entegrasyonu, REST API ve watch modu ile 14+ programlama dilini destekleyen, method seviyesi filtreleme, otomatik LLM optimizasyonu ve gerçek zamanlı analiz sunan platform. AI destekli geliştirme iş akışları için mükemmel.

**v3.0.0** - Platform Foundation Sürümü 🚀

## ☕ Bu Projeyi Destekleyin

Bu aracı yararlı buluyorsanız, bana bir kahve ısmarlayabilirsiniz! Desteğiniz bu projenin sürdürülmesine ve geliştirilmesine yardımcı olur.

<p align="center">
  <a href="https://www.buymeacoffee.com/hakkisagdic" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" style="height: 60px !important;width: 217px !important;" ></a>
</p>

<p align="center">
  <img src="qr-code.png" alt="Destek QR Kodu" width="300">
</p>

---

## Dokümantasyon

| Belge                                                  | Açıklama                                           |
| ------------------------------------------------------ | -------------------------------------------------- |
| [API Dokümantasyonu](docs/API-tr.md)                   | REST API uç noktaları ve kullanım                  |
| [Mimari](docs/ARCHITECTURE-tr.md)                      | Plugin sistemi, çekirdek modüller, veri akışı      |
| [Performans Kıyaslamaları](docs/PERFORMANCE-tr.md)     | Performans metrikleri ve optimizasyon ipuçları     |
| [Değişiklik Günlüğü](CHANGELOG.md)                     | Sürüm geçmişi ve sürüm notları                     |
| [Katkı Rehberi](CONTRIBUTING-tr.md)                    | Geliştirme kurulumu ve yönergeler                  |
| [Güvenlik Politikası](SECURITY.md)                     | Güvenlik politikası ve güvenlik açığı bildirimi    |
| [Davranış Kuralları](CODE_OF_CONDUCT.md)               | Topluluk kuralları                                 |
| [API Documentation](docs/API.md)                       | REST API endpoints and usage (English)             |
| [Architecture](docs/ARCHITECTURE.md)                   | Plugin system, core modules (English)              |
| [Performance Benchmarks](docs/PERFORMANCE.md)          | Performance metrics and optimization tips (English)|
| [Contributing Guide](CONTRIBUTING.md)                  | Development setup and guidelines (English)         |

## Dosyalar

- **`ctxman.js`** - Kesin token sayımı ile ana LLM bağlam analiz scripti
- **`.contextignore`** - Token hesaplamadan hariç tutulacak dosyalar (EXCLUDE modu)
- **`.contextinclude`** - Token hesaplamaya dahil edilecek dosyalar (INCLUDE modu)
- **`README.md`** - İngilizce dokümantasyon dosyası
- **`README-tr.md`** - Bu Türkçe dokümantasyon dosyası

## Özellikler

### 🚀 Platform Özellikleri (v3.0.0)

- 🔌 **Plugin Mimarisi** - Modüler, genişletilebilir dil ve exporter sistemi
- 🔀 **Git Entegrasyonu** - Sadece değişen dosyaları analiz et, diff analizi, yazar takibi
- 👁️ **Watch Modu** - Gerçek zamanlı dosya izleme ve otomatik analiz
- 🌐 **REST API** - Programatik erişim için HTTP serveri (6 endpoint)
- ⚡ **Performans** - Önbellekleme sistemi, paralel işleme (5-10x daha hızlı)
- 🏗️ **Modüler Çekirdek** - Scanner, Analyzer, ContextBuilder, Reporter

### 🔢 Token Analizi

- ✅ **Kesin token sayımı** tiktoken kullanarak (GPT-4 uyumlu)
- 🚫 **Çifte ignore sistemi** - hem `.gitignore` hem calculator ignore kurallarını dikkate alır
- 📋 **Include/Exclude modları** - `.contextinclude` dosyası `.contextignore` üzerinde önceliğe sahip
- 📊 **Detaylı raporlama** - dosya tipine göre, en büyük dosyalar, istatistikler
- 💾 **İsteğe bağlı JSON dışa aktarım** - detaylı analiz raporları
- 🔍 **Verbose modu (varsayılan)** - şeffaflık için tüm dahil edilen dosyaları gösterir
- 🎯 **Ana uygulama odağı** - sadece temel JS dosyalarını analiz etmek için yapılandırılmış
- 📈 **Bağlam optimizasyonu** - LLM bağlam penceresi yönetimi için mükemmel
- 🤖 **LLM bağlam dışa aktarımı** - LLM tüketimi için optimize edilmiş dosya listeleri oluştur
- 📋 **Clipboard entegrasyonu** - bağlamı doğrudan clipboard'a kopyala
- ⚡ **JSON format** - llm-context.json dosyası ile aynı yapılandırılmış clipboard çıktısı
- 🎯 **LLM-optimize** - Token sayısı olmadan temiz dizin yapısı
- 🔗 **Tutarlı dışa aktarımlar** - Clipboard ve dosya dışa aktarımları aynı JSON formatını kullanır
- 📤 **Etkileşimli dışa aktarım** - Seçenek belirtilmediğinde dışa aktarım seçimi sorar

## Hızlı Başlangıç

### Ana Uygulama Analizi (Varsayılan)

```bash
# Sadece ana JavaScript uygulama dosyalarını analiz et (181k token)
# Etkileşimli analiz ile dışa aktarım seçimi
ctxman

# Verbose dosya listesini devre dışı bırak
ctxman --no-verbose

# Detaylı rapor kaydet
ctxman --save-report

# Minimal LLM bağlam dosya listesi oluştur
ctxman --context-export

# Minimal bağlamı clipboard'a kopyala
ctxman --context-clipboard

# Detaylı bağlam formatı kullan - eski format
ctxman --detailed-context --context-clipboard
```

### Sarmalayıcı Script Kullanımı

```bash
# NPM paketi ile global kullanım
ctxman
ctxman --save-report
ctxman --context-clipboard
```

## Mevcut Yapılandırma

Araç **sadece ana uygulama mantığına** odaklanacak şekilde yapılandırılmıştır:

### ✅ Dahil Edilenler (64 JS dosyası, ~181k token)

- Ana MCP sunucu implementasyonu (`utility-mcp/src/`)
- Kimlik doğrulama ve güvenlik katmanları
- İstek işleyicileri ve yönlendirme
- Transport protokolleri ve iletişim
- Yardımcı araçlar ve doğrulama mantığı
- Yapılandırma yönetimi
- Hata işleme ve izleme

### 🚫 Context ignore kuralları ile Hariç Tutulanlar

- Dokümantasyon dosyaları (`.md`, `.txt`)
- Yapılandırma dosyaları (`.json`, `.yml`)
- Altyapı ve dağıtım dosyaları
- Test ve script dizinleri
- Derleme çıktıları ve bağımlılıklar
- İş akışı orkestrasyon dosyaları (`utility-mcp/src/workflows/**`)
- Test yardımcıları (`utility-mcp/src/testing/**`)
- Tüm temel olmayan destekleyici dosyalar

## Kullanım

### Temel Analiz

```bash
# Etkileşimli analiz - sonuç sonrası dışa aktarım seçimi
ctxman

# Soru sormadan doğrudan dışa aktarım
ctxman --context-clipboard
ctxman --save-report

# Detaylı JSON raporu ile
ctxman --save-report

# Minimal LLM bağlam dosya listesi oluştur
ctxman --context-export

# Detaylı bağlam formatı kullan - eski format
ctxman --detailed-context --context-clipboard
```

### Etkileşimli Dışa Aktarım Seçimi

Araç dışa aktarım seçenekleri (`--save-report`, `--context-export` veya `--context-clipboard`) belirtmeden çalıştırdığınızda, analiz sonrasında otomatik olarak dışa aktarım seçeneği seçmenizi ister:

```bash
# Analizi çalıştır ve dışa aktarım seçenekleri için soru sorulmasını sağla
node token-analysis/token-calculator.js

# Araç şunları gösterecek:
# 📤 Dışa Aktarım Seçenekleri:
# 1) Detaylı JSON raporu kaydet (token-analysis-report.json)
# 2) LLM bağlam dosyası oluştur (llm-context.json)
# 3) LLM bağlamını clipboard'a kopyala
# 4) Dışa aktarım yok (geç)
#
# 🤔 Hangi dışa aktarım seçeneğini istiyorsunuz? (1-4):
```

Bu etkileşimli mod, analiz sonuçlarınızı ihtiyacınız olan formatta dışa aktarma fırsatını kaçırmamanızı sağlar.

## Include ve Exclude Modları

Token calculator iki tamamlayıcı filtreleme modu destekler:

### EXCLUDE Modu (.contextignore)

- Yalnızca `.contextignore` mevcut olduğunda **varsayılan mod**
- Ignore desenlerine uyan dosyalar **hariç** tüm dosyaları dahil eder
- Geleneksel gitignore tarzı hariç tutma mantığı

### INCLUDE Modu (.contextinclude)

- **Öncelik modu** - `.contextinclude` mevcut olduğunda, `.contextignore` göz ardı edilir
- **Yalnızca** include desenlerine uyan dosyaları dahil eder
- Belirli dosya seçimi için daha kesin kontrol
- Odaklanmış analiz setleri oluşturmak için mükemmel

### Mod Önceliği

1. `.contextinclude` mevcutsa → **INCLUDE modu** (`.contextignore` göz ardı edilir)
2. Yalnızca `.contextignore` mevcutsa → **EXCLUDE modu**
3. Hiçbiri mevcut değilse → Tüm dosyaları dahil et (yalnızca `.gitignore` saygı göster)

### Kullanım Örneği

```bash
# EXCLUDE modu: .contextignore'daki desenler hariç herşeyi dahil et
rm token-analysis/.contextinclude  # Include dosyasını kaldır
node token-analysis/token-calculator.js

# INCLUDE modu: Yalnızca .contextinclude'daki desenleri dahil et
# (otomatik olarak .contextignore'u göz ardı eder)
node token-analysis/token-calculator.js
```

### Yardım ve Seçenekler

```bash
node token-analysis/token-calculator.js --help
```

### Mevcut Seçenekler

- `--save-report`, `-s` - Detaylı JSON raporu kaydet
- `--no-verbose` - Dosya listesini devre dışı bırak (verbose varsayılan)
- `--context-export` - LLM bağlam dosya listesi oluştur (llm-context.json olarak kaydeder)
- `--context-clipboard` - LLM bağlamını doğrudan clipboard'a kopyala
- `--detailed-context` - Detaylı bağlam formatı kullan (8.6k karakter, varsayılan kompakt 1k)
- `--help`, `-h` - Yardım mesajını göster

## LLM Bağlam Dışa Aktarımı

Token calculator, iki format seçeneği ile LLM tüketimi için optimize edilmiş dosya listeleri oluşturabilir:

### Ultra-Kompakt Format (Varsayılan)

- **Boyut**: ~2.3k karakter (yapılandırılmış JSON)
- **İçerik**: Token sayısı olmadan proje metadata'sı ve organize edilmiş dosya yolları
- **Format**: llm-context.json dosyası ile aynı - tam JSON yapısı
- **Mükemmel**: LLM tüketimi, programatik işleme, yapılandırılmış veri ihtiyaçları
- **Kullanım**: `--context-clipboard` veya `--context-export`

### Detaylı Format (Eski)

- **Boyut**: ~8.6k karakter (kapsamlı)
- **İçerik**: Tam yollar, kategoriler, önem puanları, dizin istatistikleri
- **Mükemmel**: İlk proje analizi, kapsamlı dokümantasyon
- **Kullanım**: `--detailed-context --context-clipboard`

### Özellikler

- **Akıllı dosya seçimi** - Token sayısı ve öneme göre en üst dosyalar
- **Dizin gruplama** - Ortak önek sıkıştırması yer tasarrufu sağlar
- **Minimal formatlama** - LLM için optimize edilmiş, sıfır gereksiz karakter
- **Uzantı korunması** - `.js` uzantıları dosya tipini belirtir
- **Çapraz platform clipboard** - macOS, Linux ve Windows'ta çalışır
- **Çoklu çıktı formatları** - JSON dosyası veya clipboard hazır metin

### Kullanım

```bash
# Minimal LLM bağlamı oluştur ve llm-context.json'a kaydet
ctxman --context-export

# Minimal bağlamı doğrudan clipboard'a kopyala
ctxman --context-clipboard

# Detaylı bağlamı clipboard'a kopyala
ctxman --detailed-context --context-clipboard

# Normal analiz ile birleştir
ctxman --save-report --context-clipboard
```

### Çıktı Format Örnekleri

**Kompakt Format (JSON - 2.3k karakter):**

```json
{
  "project": {
    "root": "cloudstack-go-mcp-proxy",
    "totalFiles": 64,
    "totalTokens": 181480
  },
  "paths": {
    "utility-mcp/src/server/": ["CloudStackUtilityMCP.js"],
    "utility-mcp/src/handlers/": [
      "workflow-handlers.js",
      "tool-handlers.js",
      "analytics-handler.js"
    ],
    "utility-mcp/src/utils/": ["security.js", "usage-tracker.js", "cache-warming.js"]
  }
}
```

**Detaylı Format (8.6k karakter):**

````markdown
# cloudstack-go-mcp-proxy Kod Tabanı Bağlamı

**Proje:** 64 dosya, 181,480 token

**Ana Dosyalar (En Büyük 20):**

1. `utility-mcp/src/server/CloudStackUtilityMCP.js` (12,388 token, server)
2. `utility-mcp/src/handlers/workflow-handlers.js` (11,007 token, handler)
   ...

**Tüm Dosyalar:**

```json
[{ "path": "file.js", "t": 1234, "c": "core", "i": 85 }]
```
````

### Kullanım Durumları

**Kompakt Format (2.3k karakter JSON):**

1. **LLM Entegrasyonu** - Tam proje bağlamı ile AI asistanları için yapılandırılmış veri
2. **Programatik İşleme** - Otomatik araçlar ve scriptler için JSON formatı
3. **Bağlam Paylaşımı** - Clipboard ve dosya dışa aktarımlarında aynı format
4. **Geliştirme İş Akışları** - CI/CD ve otomasyon için tutarlı yapı

**Detaylı Format (8.6k karakter):**

1. **Mimari Planlama** - Büyük kararlar için kapsamlı proje özeti
2. **Yeni Takım Üyesi Alıştırma** - Tam kod tabanı anlayışı
3. **Dokümantasyon Oluşturma** - Tam proje yapısı analizi
4. **Kod İnceleme Hazırlığı** - Detaylı dosya ilişkileri ve önem

**Genel Kullanım Durumları:**

- Geliştirme iş akışı entegrasyonu
- CI/CD pipeline bağlam oluşturma
- Otomatik dokümantasyon güncellemeleri
- Proje sağlık izleme

## Yapılandırma

### .contextignore Dosyası (EXCLUDE Modu)

`.contextignore` dosyası ana uygulama analizi için önceden yapılandırılmıştır:

```bash
# Mevcut odak: Sadece utility-mcp/src/ içindeki ana JS dosyaları
# Hariç tutulanlar:
**/*.md              # Tüm dokümantasyon
**/*.json            # Tüm yapılandırma dosyaları
**/*.yml             # Tüm YAML dosyaları
infrastructure/**    # Altyapı kodu
workflows/**         # İş akışı tanımları
docs/**              # Dokümantasyon dizini
token-analysis/**    # Analiz araçlarının kendisi
utility-mcp/scripts/** # Yardımcı scriptler
utility-mcp/src/workflows/** # İş akışı JS dosyaları
utility-mcp/src/testing/**   # Test yardımcıları
```

### .contextinclude Dosyası (INCLUDE Modu)

`.contextinclude` dosyası kesin dosya seçimi sağlar:

```bash
# Yalnızca ana JavaScript dosyalarını dahil et
# Bu tam olarak 64 dosya üretmelidir

# Ana giriş noktasını dahil et
utility-mcp/index.js

# Workflows ve testing hariç tüm src JavaScript dosyalarını dahil et
utility-mcp/src/**/*.js

# Belirli alt dizinleri hariç tut (olumsuzlama kullanarak)
!utility-mcp/src/workflows/**
!utility-mcp/src/testing/**
```

### Özel Yapılandırma Oluşturma

**EXCLUDE modu için** (`.contextignore` düzenle):

```bash
# Daha fazla dosya tipini dahil etmek için satırları kaldır
# Belirli dosyaları hariç tutmak için desen ekle

# Örnek: Dokümantasyonu dahil et
# **/*.md    <- bu satırı yorum satırı yap veya kaldır

# Örnek: Belirli büyük dosyaları hariç tut
your-large-file.js
specific-directory/**
```

**INCLUDE modu için** (`.contextinclude` oluştur):

```bash
# Belirli dosyaları veya desenleri dahil et
src/**/*.js          # src'deki tüm JS dosyaları
config/*.json        # Yalnızca config dosyaları
docs/api/**/*.md     # Yalnızca API dokümantasyonu

# Geniş desenlerden hariç tutmak için olumsuzlama kullan
src/**/*.js
!src/legacy/**       # Eski kodu hariç tut
!src/**/*.test.js    # Test dosyalarını hariç tut
```

## Yapılandırma Dosyası Önceliği

1. **`.gitignore`** (proje kökü) - Standart git hariç tutmaları (her zaman saygı görülür)
2. **`.contextinclude`** (token-analysis/) - INCLUDE modu (en yüksek öncelik)
3. **`.contextignore`** (token-analysis/) - EXCLUDE modu (include dosyası olmadığında kullanılır)
4. **`.contextignore`** (proje kökü) - Yedek EXCLUDE modu konumu

## Kurulum

Kesin token sayımı için tiktoken kurun:

```bash
npm install tiktoken
```

Tiktoken olmadan araç akıllı tahmin kullanır (~%95 doğruluk).

## Çıktı Örneği

```
🎯 PROJE TOKEN ANALİZ RAPORU
================================================================================
📊 Analiz edilen toplam dosya: 64
🔢 Toplam token: 181,480
💾 Toplam boyut: 0.78 MB
📄 Toplam satır: 28,721
📈 Dosya başına ortalama token: 2,836
🚫 .gitignore tarafından yok sayılan dosyalar: 11,912
📋 Calculator kuralları tarafından yok sayılan dosyalar: 198

📋 DOSYA TİPİNE GÖRE:
--------------------------------------------------------------------------------
Uzantı           Dosyalar      Tokenlar   Boyut (KB)    Satırlar
--------------------------------------------------------------------------------
.js                  64     181,480       799.8    28,721

🏆 TOKEN SAYISINA GÖRE EN BÜYÜK 5 DOSYA:
--------------------------------------------------------------------------------
 1.   12,388 token (%6.8) - utility-mcp/src/server/CloudStackUtilityMCP.js
 2.   11,007 token (%6.1) - utility-mcp/src/handlers/workflow-handlers.js
 3.    7,814 token (%4.3) - utility-mcp/src/utils/security.js
 4.    6,669 token (%3.7) - utility-mcp/src/handlers/tool-handlers.js
 5.    5,640 token (%3.1) - utility-mcp/src/ci-cd/pipeline-integration.js
```

## Bağlam Yönetimi

LLM bağlam penceresi optimizasyonu için mükemmel:

- **181k token** = Sadece ana uygulama mantığı
- **Temiz analiz** = Dokümantasyon, yapılandırma veya derleme dosyalarından gürültü yok
- **Odaklanmış geliştirme** = AI destekli geliştirme için temel kod
- **Bağlam verimliliği** = Token başına maksimum faydalı kod
- **Çift mod esnekliği** = Kesin include/exclude kontrolü
- **Ultra-minimal dışa aktarım** = 1k karakter (%89 azalma) sık AI etkileşimleri için
- **Detaylı dışa aktarım** = Gerektiğinde kapsamlı analiz için 8.6k karakter

## Entegrasyon

Bu aracı şunlara entegre edebilirsiniz:

- Kod boyutu izleme için CI/CD pipeline'ları
- Token bütçesi kontrolleri için pre-commit hook'ları
- Dokümantasyon oluşturma iş akışları
- Kod kalitesi kapıları
- LLM bağlam hazırlama iş akışları
- Geliştirme ortamı kurulumu

## Sorun Giderme

### Include ve Exclude Mod Sorunları

- **INCLUDE modu aktif**: EXCLUDE modunu kullanmak için `.contextinclude` dosyasını kaldırın
- **Yanlış dosyalar dahil**: `.contextinclude` dosyasının var olup olmadığını kontrol edin (önceliğe sahip)
- **Mod karışıklığı**: Hangi modun aktif olduğunu görmek için verbose modu kullanın

### Desenler Çalışmıyor

- Ignore/include desen dosyalarında satır içi yorum olmadığından emin olun
- Dizin desenleri (`docs/`) yerine dosya desenleri (`docs/**`) kullanın
- Verbose mod ile belirli desenleri test edin
- Desen sözdizimini kontrol edin: rekursif için `**`, tek seviye için `*`

### Token Sayısı Sorunları

- **Çok yüksek**: Verbose mod ile dahil edilen dosyaları gözden geçirin, hariç tutma desenleri ekleyin
- **Çok düşük**: Önemli dosyaların hariç tutulup tutulmadığını kontrol edin, desenleri gözden geçirin
- **Tutarsız**: Hangi modun aktif olduğunu doğrulayın (include vs exclude)

### Beklenen Dosyalar Eksik

- Dosyaların `.gitignore` tarafından hariç tutulup tutulmadığını kontrol edin (her zaman saygı görülür)
- Context ignore/include desenlerini doğrulayın
- Dosyaların metin dosyaları olarak tanındığından emin olun
- Hariç tutma nedenlerini görmek için verbose modu kullanın

## Dil Desteği

- **İngilizce**: `README.md`
- **Türkçe**: `README-tr.md` (bu dosya)

## Gelişmiş Kullanım

### Özel Analiz Senaryoları

```bash
# Sadana dokümantasyon analizi için geçici yapılandırma
# .contextignore dosyasını yedekleyin, sadece *.md hariç tutmayı kaldırın

# CI/CD için otomatik rapor
node token-analysis/token-calculator.js --save-report --no-verbose

# Geliştirme için detaylı analiz
node token-analysis/token-calculator.js --verbose --save-report
```

### Performans İpuçları

- İlk çalıştırmada tiktoken yüklenir (biraz yavaş olabilir)
- Büyük projeler için verbose modu devre dışı bırakın
- JSON raporları büyük projeler için disk alanı kullanır
- `.contextignore` desenlerini optimize edin

---

_❤️ ile Hakkı Sağdıç tarafından oluşturulmuştur_

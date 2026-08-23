# Mimari Dokümantasyonu

Bu belge, Ctxman v3.0.0 - AI Geliştirme Platformu'nun mimarisini açıklar.

## İçindekiler

- [Genel Bakış](#genel-bakış)
- [Çekirdek Modüller](#çekirdek-modüller)
- [Plugin Sistemi](#plugin-sistemi)
- [Veri Akışı](#veri-akışı)
- [Dizin Yapısı](#dizin-yapısı)
- [Temel Bileşenler](#temel-bileşenler)
- [Genişletme Noktaları](#genişletme-noktaları)

## Genel Bakış

Ctxman, genişletilebilirlik ve performans için tasarlanmış modüler bir mimari ile oluşturulmuştur. Platform şunlardan oluşur:

1. **Çekirdek Modüller** - Scanner, Analyzer, ContextBuilder, Reporter
2. **Plugin Sistemi** - Genişletilebilir dil ve dışa aktarma plugin'leri
3. **Entegrasyonlar** - Git, MCP Sunucusu, REST API
4. **UI Katmanı** - Ink ile Terminal UI (React tabanlı)

### Tasarım İlkeleri

- **Modülerlik**: Her bileşenin tek bir sorumluluğu var
- **Genişletilebilirlik**: Diller ve dışa aktarıcılar için plugin sistemi
- **Performans**: Önbellekleme, paralel işleme, tembel yükleme
- **Test Edilebilirlik**: Bağımlılık enjeksiyonu, saf fonksiyonlar, izole modüller

## Çekirdek Modüller

### Scanner (`lib/core/Scanner.js`)

Dosya sistemi gezintisi ve keşfinden sorumludur.

**Sorumluluklar:**
- Dizinleri özyinelemeli tarama
- `.gitignore` ve `.contextignore` kurallarına saygı
- Binary dosyaları filtreleme
- Dosya metadata'sı toplama

**API:**

```javascript
const scanner = new Scanner(projeYolu, secenekler);
const dosyalar = scanner.scan();
// Döndürür: Array<{path, relativePath, name, extension, size, modified}>
```

**Seçenekler:**
- `respectGitignore` - `.gitignore` kurallarına uy (varsayılan: true)
- `followSymlinks` - Sembolik linkleri takip et (varsayılan: false)
- `maxDepth` - Maksimum dizin derinliği (varsayılan: Infinity)

### Analyzer (`lib/core/Analyzer.js`)

Token ve method analiz motoru.

**Sorumluluklar:**
- tiktoken kullanarak token sayılarını hesaplama
- Koddan method/fonksiyon çıkarma
- Programlama dillerini tespit etme
- İstatistik oluşturma

**API:**

```javascript
const analyzer = new Analyzer({ methodLevel: true });
const sonuc = await analyzer.analyze(dosyalar);
// Döndürür: { files: AnalizSonucu[], stats: Istatistikler }
```

**Analiz Sonucu:**
```javascript
{
  path: string,
  relativePath: string,
  tokens: number,
  lines: number,
  language: string,
  methods?: Method[],      // Eğer methodLevel: true ise
  methodCount?: number
}
```

### ContextBuilder (`lib/core/ContextBuilder.js`)

LLM tüketimi için akıllı bağlam oluşturma.

**Sorumluluklar:**
- Optimize edilmiş dosya listeleri oluşturma
- LLM'ye özgü optimizasyonlar uygulama
- Birden çok çıktı formatı oluşturma
- Bağlam penceresi kısıtlamalarını yönetme

**API:**

```javascript
const builder = new ContextBuilder({
  targetModel: 'claude-sonnet-4.5',
  targetTokens: 50000
});
const context = builder.build(analizSonucu);
```

### Reporter (`lib/core/Reporter.js`)

Çok formatlı rapor oluşturma.

**Sorumluluklar:**
- Birden çok formatta rapor oluşturma
- JSON, YAML, CSV, XML, Markdown
- GitIngest digest formatı
- TOON formatı (%40-50 token azaltması)

**API:**

```javascript
const reporter = new Reporter({ format: 'json' });
const rapor = reporter.generate(analizSonucu);
await reporter.save(rapor, 'cikti.json');
```

## Plugin Sistemi

Plugin sistemi, çekirdek kodu değiştirmeden genişletmeyi sağlar.

### Plugin Türleri

1. **Dil Plugin'leri** - Yeni programlama dilleri için destek ekleme
2. **Dışa Aktarma Plugin'leri** - Yeni çıktı formatları ekleme

### Plugin Yöneticisi (`lib/plugins/PluginManager.js`)

**API:**

```javascript
import PluginManager from './plugins/PluginManager.js';

const manager = new PluginManager();

// Plugin kaydet
manager.register('language', 'rust', RustLanguagePlugin);

// Plugin al
const rustPlugin = manager.get('language', 'rust');

// Dizinlerden plugin'leri otomatik keşfet
await manager.discover();
```

### Dil Plugin'i Oluşturma

```javascript
// lib/plugins/languages/RustPlugin.js
import { LanguagePlugin } from '../base/LanguagePlugin.js';

export class RustPlugin extends LanguagePlugin {
  constructor() {
    super('rust', ['.rs']);
  }

  extractMethods(icerik, dosyaYolu) {
    // Rust'a özgü method çıkarma
    const methodRegex = /(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/g;
    const methods = [];
    let match;
    
    while ((match = methodRegex.exec(icerik)) !== null) {
      methods.push({
        name: match[1],
        line: this.getLineNumber(icerik, match.index),
        type: 'function'
      });
    }
    
    return methods;
  }

  getLanguage() {
    return 'Rust';
  }
}
```

### Dışa Aktarma Plugin'i Oluşturma

```javascript
// lib/plugins/exporters/CustomPlugin.js
import { ExporterPlugin } from '../base/ExporterPlugin.js';

export class CustomPlugin extends ExporterPlugin {
  constructor() {
    super('custom', 'custom');
  }

  export(analiz) {
    // Özel dışa aktarma formatı
    return {
      version: '1.0',
      generated: new Date().toISOString(),
      files: analiz.files.map(f => ({
        name: f.name,
        tokens: f.tokens
      }))
    };
  }

  getFileExtension() {
    return '.custom';
  }
}
```

### Plugin Keşfi

Plugin'ler otomatik olarak şuradan keşfedilir:

1. `lib/plugins/languages/` - Yerleşik dil plugin'leri
2. `lib/plugins/exporters/` - Yerleşik dışa aktarma plugin'leri
3. `~/.ctxman/plugins/` - Kullanıcı tarafından yüklenen plugin'ler
4. `./plugins/` - Projeye özgü plugin'ler

## Veri Akışı

### Analiz Pipeline'ı

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Scanner   │────▶│   Analyzer  │────▶│  Context    │────▶│  Reporter   │
│             │     │             │     │  Builder    │     │             │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
       │                   │                   │                   │
       ▼                   ▼                   ▼                   ▼
   Dosya Listesi      Analiz Verisi      Bağlam Verisi       Çıktı Dosyaları
   (yollar,           (tokenlar,         (optimize edilmiş   (JSON, YAML,
    metadata)          methodlar)         dosya listesi)      TOON, vb.)
```

### Git Entegrasyonu Akışı

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  GitClient  │────▶│DiffAnalyzer │────▶│   Etki      │
│             │     │             │     │   Raporu    │
└─────────────┘     └─────────────┘     └─────────────┘
       │                   │                   │
       ▼                   ▼                   ▼
   Git Durumu        Değişen Dosyalar     Etki Skoru
   (branch'lar,      (diff istatistikleri, (etkilenen
    commit'ler)       yazarlar)            modüller)
```

### Watch Modu Akışı

```
┌─────────────┐     ┌─────────────────┐     ┌─────────────┐
│FileWatcher  │────▶│Incremental      │────▶│   Çıktı     │
│             │     │Analyzer         │     │   Güncelleme│
└─────────────┘     └─────────────────┘     └─────────────┘
       │                   │                     │
       ▼                   ▼                     ▼
   Dosya Değişikliği  Sadece Değişen        Console/
    Olayları          Dosyaları Yeniden     Dashboard
                      Analiz Et              Güncelleme
```

## Dizin Yapısı

```
ctxman/
├── bin/                    # CLI giriş noktaları
│   ├── cli.js             # Ana CLI
│   ├── mcp-server.js      # MCP sunucu girişi
│   └── cm-gitingest.js    # GitHub entegrasyonu
│
├── lib/                    # Çekirdek kütüphane
│   ├── analyzers/         # Analiz modülleri
│   │   ├── method-analyzer.js
│   │   └── token-calculator.js
│   │
│   ├── api/               # API modülleri
│   │   ├── rest/          # REST API sunucusu
│   │   └── mcp/           # MCP sunucusu
│   │
│   ├── cache/             # Önbellekleme sistemi
│   │   └── CacheManager.js
│   │
│   ├── core/              # Çekirdek modüller
│   │   ├── Scanner.js
│   │   ├── Analyzer.js
│   │   ├── ContextBuilder.js
│   │   └── Reporter.js
│   │
│   ├── formatters/        # Çıktı formatlayıcıları
│   │   ├── toon-formatter.js
│   │   ├── gitingest-formatter.js
│   │   └── format-registry.js
│   │
│   ├── integrations/      # Harici entegrasyonlar
│   │   └── git/
│   │       ├── GitClient.js
│   │       ├── DiffAnalyzer.js
│   │       └── BlameTracker.js
│   │
│   ├── parsers/           # Dosya ayrıştırıcıları
│   │   ├── gitignore-parser.js
│   │   └── method-filter-parser.js
│   │
│   ├── plugins/           # Plugin sistemi
│   │   ├── PluginManager.js
│   │   ├── base/          # Temel sınıflar
│   │   ├── languages/     # Dil plugin'leri
│   │   └── exporters/     # Dışa aktarma plugin'leri
│   │
│   ├── ui/                # Terminal UI (Ink)
│   │   ├── wizard.js
│   │   ├── dashboard.js
│   │   └── progress-bar.js
│   │
│   ├── utils/             # Yardımcı fonksiyonlar
│   │   ├── token-utils.js
│   │   ├── file-utils.js
│   │   ├── logger.js
│   │   └── error-handler.js
│   │
│   ├── watch/             # Watch modu
│   │   ├── FileWatcher.js
│   │   └── IncrementalAnalyzer.js
│   │
│   └── wizards/           # Etkileşimli sihirbazlar
│       └── profile-wizard.js
│
├── test/                   # Test dosyaları
│   ├── unit/
│   ├── integration/
│   └── e2e/
│
├── docs/                   # Dokümantasyon
│   ├── API.md
│   ├── ARCHITECTURE.md
│   └── content-en/
│
└── .ctxman/               # Yapılandırma
    ├── llm-profiles.json
    └── wizard-profiles/
```

## Temel Bileşenler

### Token Calculator (`lib/analyzers/token-calculator.js`)

Token analizi için ana orkestratör.

**Özellikler:**
- tiktoken ile kesin token sayımı
- Akıllı tahmin fallback'i (~%95 doğruluk)
- Çoklu dil desteği (14+ dil)
- Method seviyesi analizi

### Method Analyzer (`lib/analyzers/method-analyzer.js`)

Kod dosyalarından method/fonksiyon çıkarır.

**Desteklenen Diller:**
- JavaScript/TypeScript
- Python
- PHP
- Ruby
- Java
- Kotlin
- C#
- Go
- Rust
- Swift
- C/C++
- Scala

### Cache Manager (`lib/cache/CacheManager.js`)

Önbellekleme ile performans optimizasyonu.

**Önbellek Türleri:**
- **Bellek Önbelleği**: Hızlı, süreç içi önbellek
- **Disk Önbelleği**: Oturumlar arasında kalıcı önbellek

**Önbellek Anahtarları:**
- Dosya yolu + değiştirilme zamanı
- Analiz sonuçları
- Token sayıları

### Git Entegrasyonu (`lib/integrations/git/`)

**GitClient**: Git işlemleri sarmalayıcısı
- Status, log, diff işlemleri
- Branch ve commit bilgileri

**DiffAnalyzer**: Değişiklik etkisi analizi
- Değişen dosya tespiti
- Etki skorlaması
- Modül tanımlama

**BlameTracker**: Yazar atıflaması
- Son değiştiren bilgisi
- Commit geçmişi analizi

## Genişletme Noktaları

### 1. Dil Desteği

Ek programlama dilleri için yeni bir dil plugin'i ekleyin:

```javascript
// 1. Plugin'i oluştur
// lib/plugins/languages/NewLangPlugin.js

// 2. PluginManager'da kaydet
// lib/plugins/PluginManager.js

// 3. Test ekle
// test/plugins/languages/new-lang.test.js
```

### 2. Çıktı Formatları

Özel çıktı formatları için yeni bir dışa aktarma plugin'i ekleyin:

```javascript
// 1. Plugin'i oluştur
// lib/plugins/exporters/NewFormatPlugin.js

// 2. FormatRegistry'de kaydet
// lib/formatters/format-registry.js

// 3. CLI seçeneği ekle
// bin/cli.js
```

### 3. Analiz Hook'ları

Analiz pipeline'ına hook ekleyin:

```javascript
// Analiz öncesi
scanner.on('beforeScan', (yol) => {
  console.log(`Taranıyor: ${yol}`);
});

// Analiz sonrası
analyzer.on('afterAnalyze', (sonuc) => {
  console.log(`${sonuc.stats.totalFiles} dosya bulundu`);
});
```

### 4. Özel Sihirbazlar

Farklı kullanım durumları için özelleştirilmiş sihirbazlar oluşturun:

```javascript
// lib/wizards/custom-wizard.js
import { Wizard } from '../ui/wizard.js';

export class CustomWizard extends Wizard {
  async run() {
    // Özel sihirbaz akışı
  }
}
```

## Performans Karakteristikleri

| İşlem | Süre | Notlar |
|-------|------|--------|
| 1000 dosya tarama | ~100ms | Paralel gezinme |
| Token analizi | ~30ms/dosya | Önbellek ile: ~5ms |
| Method çıkarma | ~10ms/dosya | Dil bağımlı |
| Bağlam oluşturma | ~50ms | 100 dosya için |
| Rapor oluşturma | ~20ms | JSON formatı |

## Bellek Kullanımı

- **Taban**: ~45MB (Node.js runtime)
- **Her 1000 dosya için**: +5MB
- **tiktoken ile**: +20MB (model verisi)
- **Analiz sırasında pik**: ~100MB

## Test Mimarisi

```
test/
├── unit/           # Hızlı, izole testler
├── integration/    # Modül etkileşim testleri
├── e2e/           # Uçtan uca CLI testleri
└── fixtures/      # Test veri dosyaları
```

**Test Komutları:**
- `npm run test` - Tüm testler
- `npm run test:coverage` - Coverage ile
- `npm run test:v3` - Platform özellikleri
- `npm run test:git` - Git entegrasyonu
- `npm run test:plugin` - Plugin sistemi
- `npm run test:api` - REST API

---

*Mimari Sürümü: 3.0.0 | Son Güncelleme: 2025-08-23*

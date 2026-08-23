# Ctxman'a Katkıda Bulunma Rehberi

Ctxman projesine katkıda bulunma ilginiz için teşekkür ederiz! Bu belge, projeye katkıda bulunmak için yönergeler ve talimatlar sağlar.

## İçindekiler

- [Davranış Kuralları](#davranış-kuralları)
- [Geliştirme Kurulumu](#geliştirme-kurulumu)
- [Proje Yapısı](#proje-yapısı)
- [Kod Stili](#kod-stili)
- [Commit Kuralları](#commit-kuralları)
- [Pull Request Süreci](#pull-request-süreci)
- [Test Gereksinimleri](#test-gereksinimleri)
- [Dokümantasyon](#dokümantasyon)

## Davranış Kuralları

Bu projeye katılarak [Davranış Kuralları](CODE_OF_CONDUCT.md) maddelerine uyacağınızı kabul etmiş olursunuz. Lütfen katkıda bulunmadan önce okuyun.

## Geliştirme Kurulumu

### Ön Gereksinimler

- **Node.js**: Sürüm 20.0.0 veya üzeri
- **npm**: Node.js ile birlikte gelir
- **Git**: Sürüm kontrolü için

### Kurulum

1. **Repoyu fork'layın ve klonlayın**

   ```bash
   git clone https://github.com/KULLANICI_ADINIZ/ctxman.git
   cd ctxman
   ```

2. **Bağımlılıkları yükleyin**

   ```bash
   npm ci --prefer-offline --no-audit
   ```

3. **Kurulumu doğrulayın**

   ```bash
   npm run test
   npm run lint
   ```

### Geliştirme İş Akışı

1. **Feature branch oluşturun**

   ```bash
   git checkout -b feat/ozellik-adi
   ```

2. **Değişikliklerinizi yapın**

   - [Kod stili](#kod-stili) yönergelerine uyun
   - Yeni işlevsellik için testler yazın
   - Gerekirse dokümantasyonu güncelleyin

3. **Değişikliklerinizi test edin**

   ```bash
   # Tüm testleri çalıştır
   npm run test

   # Coverage ile çalıştır
   npm run test:coverage

   # Linting çalıştır
   npm run lint

   # Kodu formatla
   npm run format
   ```

4. **Değişikliklerinizi commit edin**

   ```bash
   git commit -m "feat: yeni özellik ekle"
   ```

   Detaylar için [Commit Kuralları](#commit-kuralları) bölümüne bakın.

## Proje Yapısı

```
ctxman/
├── bin/                  # CLI giriş noktaları
│   ├── cli.js           # Ana CLI
│   ├── mcp-server.js    # MCP sunucusu
│   └── cm-gitingest.js  # GitHub entegrasyonu
├── lib/                  # Çekirdek kütüphane modülleri
│   ├── analyzers/       # Token ve method analizi
│   ├── api/             # REST API ve MCP sunucusu
│   ├── cache/           # Önbellekleme sistemi
│   ├── core/            # Çekirdek modüller (Scanner, Analyzer, vb.)
│   ├── formatters/      # Çıktı formatlayıcıları (JSON, YAML, TOON, vb.)
│   ├── parsers/         # Git ignore ve method filtre ayrıştırıcıları
│   ├── plugins/         # Plugin sistemi
│   ├── ui/              # Terminal UI bileşenleri (Ink tabanlı)
│   ├── utils/           # Yardımcı fonksiyonlar
│   ├── watch/           # Dosya izleme
│   └── wizards/         # Etkileşimli sihirbazlar
├── test/                 # Test dosyaları
├── docs/                 # Dokümantasyon
└── scripts/              # Kurulum scriptleri
```

## Kod Stili

### JavaScript/ES Modules

- **Modül Sistemi**: ES Modules (ESM), package.json'da `type: "module"` ile
- **Sözdizimi**: ES9+ JavaScript
- **Importlar**: `import`/`export` kullanın (`require`/`module.exports` değil)

### Formatlama

Tutarlı kod formatlaması için **Prettier** kullanıyoruz. Yapılandırma `.prettierrc` dosyasındadır.

```bash
# Tüm dosyaları formatla
npm run format

# Değişiklik yapmadan formatı kontrol et
npm run format -- --check
```

### Linting

Flat config (`eslint.config.js`) ile **ESLint 9.x** kullanıyoruz.

```bash
# Linter çalıştır
npm run lint

# Sorunları otomatik düzelt
npm run lint:fix
```

### Kod Kuralları

1. **İsimlendirme**

   - Değişkenler ve fonksiyonlar için `camelCase`
   - Sınıflar ve dışa aktarılan bileşenler için `PascalCase`
   - Sabitler için `UPPER_SNAKE_CASE`

2. **Async/Await**

   - `.then()/.catch()` yerine `async/await` tercih edin
   - Hata yönetimi için `try/catch` kullanın

3. **Hata Yönetimi**

   ```javascript
   // İyi
   try {
     const result = await someAsyncOperation();
     return result;
   } catch (error) {
     logger.error(`İşlem başarısız: ${error.message}`);
     throw error;
   }
   ```

4. **Logging**

   - Yerleşik logger'ı kullanın: `import { getLogger } from '../utils/logger.js'`
   - Log seviyeleri: `debug`, `info`, `warn`, `error`

## Commit Kuralları

Commitlint tarafından zorunlu tutulan [Conventional Commits](https://www.conventionalcommits.org/) kullanıyoruz.

### Format

```
<tip>(<kapsam>): <açıklama>

[isteğe bağlı gövde]

[isteğe bağlı alt bilgi]
```

### Tipler

| Tip | Açıklama |
|-----|----------|
| `feat` | Yeni özellik |
| `fix` | Hata düzeltmesi |
| `docs` | Sadece dokümantasyon |
| `style` | Kod stili (formatlama, noktalı virgüller) |
| `refactor` | Kod yeniden düzenleme |
| `perf` | Performans iyileştirmesi |
| `test` | Test ekleme veya güncelleme |
| `chore` | Bakım görevleri |
| `ci` | CI/CD değişiklikleri |

### Örnekler

```bash
# Özellik
git commit -m "feat: Python dosyaları için destek ekle"

# Hata düzeltmesi
git commit -m "fix: büyük dosyalar için token sayısını düzelt"

# Breaking change
git commit -m "feat!: API yanıt formatını değiştir

BREAKING CHANGE: API artık düz diziler yerine iç içe nesneler döndürüyor"

# Kapsam ile
git commit -m "feat(analyzer): Go için method seviyesi analiz ekle"
```

### Pre-commit Hook'ları

Husky her commit'te lint-staged çalıştırır:

- `.js` dosyalarında ESLint
- Tüm desteklenen dosyalarda Prettier

## Pull Request Süreci

### Göndermeden Önce

1. **Main'den güncelleyin**

   ```bash
   git fetch origin
   git rebase origin/main
   ```

2. **Tüm kontrolleri çalıştırın**

   ```bash
   npm run test
   npm run lint
   npm run format -- --check
   ```

3. **Dokümantasyonu güncelleyin**

   - Yeni özellik eklerken README.md'yi güncelleyin
   - `docs/` dizininde dokümanları güncelleyin veya oluşturun
   - Yeni fonksiyonlara/sınıflara JSDoc yorumları ekleyin

### PR Gereksinimleri

- **Başlık**: Conventional commit formatına uyun
- **Açıklama**: Ne ve neden yaptığınızı açıklayın (sadece nasıl değil)
- **Testler**: Tüm yeni kodun testi olmalı
- **Dokümantasyon**: İlgili dokümanları güncelleyin
- **CI**: Tüm CI kontrolleri geçmeli

### PR Şablonu

PR oluştururken şablonu doldurun:

```markdown
## Açıklama
[Değişikliklerinizi açıklayın]

## Değişiklik Türü
- [ ] Hata düzeltmesi
- [ ] Yeni özellik
- [ ] Breaking change
- [ ] Dokümantasyon güncellemesi

## Test
[Yapılan testleri açıklayın]

## Kontrol Listesi
- [ ] Testler geçiyor
- [ ] Linting geçiyor
- [ ] Dokümantasyon güncellendi
```

### İnceleme Süreci

1. Tüm PR'larda otomatik kontroller çalışır
2. En az bir maintainer incelemesi gerekli
3. Tüm inceleme yorumlarını yanıtlayın
4. Onaylandığında squash ve merge yapılır

## Test Gereksinimleri

### Test Framework'ü

Test için **Vitest** kullanıyoruz.

```bash
# Tüm testleri çalıştır
npm run test

# Watch modunda çalıştır
npm run test:watch

# Coverage ile çalıştır
npm run test:coverage
```

### Test Yapısı

```
test/
├── unit/                 # Birim testler
├── integration/          # Entegrasyon testleri
├── e2e/                  # Uçtan uca testler
└── fixtures/             # Test verileri
```

### Test Yazma

1. **Dosya isimlendirme**: `*.test.js` veya `*.spec.js`
2. **Test yapısı**:

   ```javascript
   import { describe, it, expect, beforeEach } from 'vitest';

   describe('ModulAdi', () => {
     beforeEach(() => {
       // Kurulum
     });

     it('bir şey yapmalı', () => {
       const result = myFunction();
       expect(result).toBe(expected);
     });
   });
   ```

3. **Coverage gereksinimleri**:
   - Yeni kod: %80+ coverage hedefleyin
   - Kritik yollar: Test olmak zorunda
   - Edge case'ler: Sınır testleri ekleyin

### Test Kategorileri

| Kategori | Komut | Açıklama |
|----------|-------|----------|
| Tümü | `npm run test` | Tüm testleri çalıştır |
| Coverage | `npm run test:coverage` | Coverage raporu oluştur |
| V3 Özellikleri | `npm run test:v3` | Platform özellik testleri |
| Git Entegrasyonu | `npm run test:git` | Git özellik testleri |
| Plugin Sistemi | `npm run test:plugin` | Plugin testleri |
| API Sunucusu | `npm run test:api` | REST API testleri |

## Dokümantasyon

### Dokümantasyon Türleri

1. **README.md**: Kullanıcıya yönelik genel bakış ve hızlı başlangıç
2. **docs/**: Detaylı dokümantasyon
3. **JSDoc**: Satır içi API dokümantasyonu
4. **Kod yorumları**: Karmaşık mantık açıklamaları

### Dokümantasyon Stili

- **Açık ve öz**: Hemen konuya girin
- **Örnek ekleyin**: Gösterin, sadece anlatmayın
- **Güncel tutun**: Kod değişiklikleriyle dokümanları güncelleyin
- **Çift dil**: Hem İngilizce hem Türkçe sürümler sağlayın

### Yeni Dokümantasyon Oluşturma

1. Uygun konumda İngilizce sürüm oluşturun
2. `-tr` soneki ile Türkçe çeviri oluşturun
3. Yeni dokümanlara link vermek için README.md'yi güncelleyin
4. Mevcut doküman yapısını takip edin

## Yardım Alma

- **Sorunlar**: Hatalar veya özellik istekleri için GitHub issue açın
- **Tartışmalar**: Sorular için GitHub Discussions kullanın
- **Dokümantasyon**: Önce mevcut dokümanları kontrol edin

## Lisans

Katkıda bulunarak, katkılarınızın MIT Lisansı altında lisanslanacağını kabul etmiş olursunuz.

---

Ctxman'a katkıda bulunduğunuz için teşekkürler! 🎉

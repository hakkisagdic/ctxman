# Kurulum

<cite>
**Bu Belgede Referans Verilen Dosyalar**
- [README.md](file://README.md)
- [package.json](file://package.json)
- [bin/cli.js](file://bin/cli.js)
- [ctxman.js](file://ctxman.js)
</cite>

## İçindekiler

1. [Gereksinimler](#gereksinimler)
2. [Kurulum Yöntemleri](#kurulum-yontemleri)
3. [Token Sayım Yapılandırması](#token-sayim-yapılandırması)
4. [Yapılandırma Dosyaları](#yapılandırma-dosyaları)
5. [Doğrulama ve Kullanım](#dogrulama-ve-kullanım)
6. [Geliştirme İş Akışları ile Entegrasyon](#gelistirme-is-akislari-ile-entegrasyon)
7. [Sorun Giderme](#sorun-giderme)

## Gereksinimler

ctxman aracını kurmadan önce, sisteminizin aşağıdaki gereksinimleri karşıladığından emin olun:

- **Node.js**: Sürüm 22 veya üzeri (package.json dosyasında "engines" altında belirtilmiştir)
- **npm**: Node Package Manager, genellikle Node.js ile birlikte kurulur

Bu gereksinimler, paketin hem global hem de yerel kurulumları için gereklidir. Araç, Node.js'in çapraz platform yeteneklerinden yararlanarak tutarlı davranış için macOS, Linux ve Windows dahil farklı işletim sistemlerinde çalışacak şekilde tasarlanmıştır.

**Bölüm kaynakları**

- [package.json](file://package.json#L15-L17)

## Kurulum Yöntemleri

ctxman aracı, npm kullanılarak iki temel yöntemle kurulabilir: global veya yerel. Her yöntem, geliştirme iş akışınıza bağlı olarak farklı kullanım durumlarına hizmet eder.

### Global Kurulum

Global kurulum, `ctxman` komutunu sistem genelinde kullanılabilir hale getirir ve terminalinizde herhangi bir dizinden kullanmanıza olanak tanır:

```bash
npm install -g ctxman
```

Bu yaklaşım, aracı birden fazla proje genelinde kullanmayı planlıyorsanız veya sisteminizde herhangi bir yerden bağımsız bir CLI aracı olarak erişmek istiyorsanız önerilir. Global kurulumdan sonra, `ctxman` komutlarını `npx` ile öneklendirmeden doğrudan çalıştırabilirsiniz.

### Yerel Kurulum

Yerel kurulum, paketi mevcut projenize bir bağımlılık olarak ekler:

```bash
npm install ctxman
```

Bu yöntem, ctxman'ı belirli bir projenin araç zincirinin parçası olarak dahil etmek istediğinizde veya tutarlı araç sürümlerinin önemli olduğu bir ekip ortamında çalışırken idealdir. Yerel kurulumda, aracı `npx` kullanarak çalıştırabilirsiniz:

```bash
npx ctxman --help
```

Yerel kurulum, tüm ekip üyelerinin projenin package-lock.json dosyasında tanımlandığı gibi aynı araç sürümünü kullanmasını sağlayarak geliştirme ortamları arasında tutarlılığı destekler.

**Bölüm kaynakları**

- [README.md](file://README.md#L235-L245)

## Token Sayım Yapılandırması

ctxman aracı, doğruluğu artıran isteğe bağlı bir bağımlılıkla birlikte token sayımı için iki yöntem sağlar.

### tiktoken ile Kesin Token Sayımı

GPT-4'ün tokenizasyonuyla eşleşen hassas token sayımı için tiktoken paketini kurun:

```bash
npm install tiktoken
```

tiktoken mevcut olduğunda, araç cl100k_base encoding'i (GPT-4 tarafından kullanılır) yükleyerek kesin token sayımı kullanır. Bu, LLM context yönetimi için en doğru token sayımlarını sağlar.

### Akıllı Tahmine Geri Dönüş

tiktoken kurulu değilse, araç otomatik olarak yaklaşık %95 doğrulukla akıllı bir tahmin algoritmasına geri döner. Tahmin, dosya tiplerine özgü karakter-token oranlarını kullanır:

- JavaScript/TypeScript: Token başına 3.2 karakter
- JSON: Token başına 2.5 karakter
- Markdown: Token başına 4.0 karakter
- HTML/XML: Token başına 2.8 karakter
- Diğer metin dosyaları: Token başına 3.5 karakter

Araç önce tiktoken'ı yüklemeye çalışır ve başarısız olursa tahmini yöntemi kullanır. Bu, TokenCalculator sınıfının `calculateTokens` metodunda uygulanmıştır; tiktoken'ı require etmeye çalışır ve tahmini yönteme geri dönmek için hataları yakalar.

**Bölüm kaynakları**

- [README.md](file://README.md#L219-L223)
- [ctxman.js](file://ctxman.js#L287-L317)

## Yapılandırma Dosyaları

ctxman aracı, dosya ve metod dahil etme/hariç tutma kontrolü için tanımlı bir öncelik hiyerarşisi ile birkaç yapılandırma dosyası kullanır.

### Dosya Seviyesi Yapılandırma

#### .contextignore (EXCLUDE Modu)

Bu dosya, analizden hariç tutulacak dosyalar için desenler içerir. gitignore-tarzı sözdizimi kullanır:

```bash
**/*.md              # Tüm dokümantasyon
**/*.json            # Tüm yapılandırma dosyaları
infrastructure/**    # Altyapı kodu
```

#### .contextinclude (INCLUDE Modu)

Bu dosya, analize dahil edilecek dosyalar için desenler belirtir ve .contextignore'dan önceliklidir:

```bash
utility-mcp/src/**/*.js
!utility-mcp/src/workflows/**
```

### Metod Seviyesi Yapılandırma

#### .methodinclude

Metod seviyesi analizine dahil edilecek metodları tanımlar:

```bash
calculateTokens
*Handler
TokenCalculator.*
```

#### .methodignore

Analizden hariç tutulacak metodları belirtir:

```bash
*test*
*debug*
console
```

### Yapılandırma Öncelik Hiyerarşisi

Araç, hangi dosya ve metodların analiz edileceğini belirlerken katı bir öncelik sırası izler:

1. **`.gitignore`** - Her zaman geçerlidir (proje kök dizini)
2. **`.contextinclude`** - Dosyalar için en yüksek öncelik (INCLUDE modu)
3. **`.contextignore`** - Include dosyası yokken kullanılır (EXCLUDE modu)
4. **`.methodinclude`** - Metodlar için en yüksek öncelik (INCLUDE modu)
5. **`.methodignore`** - Method include dosyası yokken kullanılır (EXCLUDE modu)

Hem .contextinclude hem de .contextignore mevcut olduğunda, include dosyası önceliklidir ve ignore dosyası göz ardı edilir. Bu, analiz kapsamı üzerinde hassas kontrol sağlar.

**Bölüm kaynakları**

- [README.md](file://README.md#L145-L184)
- [ctxman.js](file://ctxman.js#L108-L218)

## Doğrulama ve Kullanım

Kurulumdan sonra, aracın düzgün çalıştığını doğrulayın ve temel kullanım desenlerini keşfedin.

### Doğrulama

Yardım menüsüne erişerek kurulumu test edin:

```bash
ctxman --help
```

Bu, CLI seçeneklerini ve kullanım bilgilerini görüntülemeli, aracın düzgün şekilde kurulu ve erişilebilir olduğunu doğrulamalıdır. Yardım çıktısı, yaygın kullanım desenlerinin örnekleriyle birlikte `--save-report`, `--context-export` ve `--method-level` gibi mevcut seçenekleri içerir.

### Temel Kullanım Örnekleri

#### İnteraktif Analiz

Aracı argümansız çalıştırmak, export seçenekleriyle interaktif modu başlatır:

```bash
ctxman
```

#### Doğrudan Export Seçenekleri

```bash
# Detaylı JSON raporu kaydet
ctxman --save-report

# LLM context dosyası oluştur
ctxman --context-export

# Context'i panoya kopyala
ctxman --context-clipboard
```

#### Metod Seviyesi Analiz

```bash
# Sadece belirli metodları analiz et
ctxman --method-level --context-clipboard
```

Araç, yürütme sırasında anında geri bildirim sağlar; kesin token sayımı (tiktoken ile) veya tahmin kullanıp kullanmadığını, analiz modunu (INCLUDE/EXCLUDE) ve tamamlanma sonrasında özet istatistikleri gösterir.

**Bölüm kaynakları**

- [README.md](file://README.md#L247-L255)
- [bin/cli.js](file://bin/cli.js#L35-L65)

## Geliştirme İş Akışları ile Entegrasyon

ctxman aracı, LLM context kullanımını optimize etmek ve kod tabanı karmaşıklığını izlemek için çeşitli geliştirme iş akışlarına entegre edilebilir.

### Package.json Scriptleri

Projenizin package.json dosyasına özel scriptler ekleyin:

```json
"scripts": {
  "analyze": "ctxman",
  "analyze:methods": "ctxman --method-level",
  "llm-context": "ctxman --context-clipboard"
}
```

Ardından bunları şu şekilde kullanın:

```bash
npm run analyze
npm run llm-context
```

### CI/CD Entegrasyonu

Kod tabanı büyümesini izlemek için aracı sürekli entegrasyon pipeline'larına dahil edin:

```bash
# CI script'inde
ctxman --save-report
TOKENS=$(jq '.summary.totalTokens' token-analysis-report.json)
if [ $TOKENS -gt 100000 ]; then
  echo "Codebase exceeds LLM context limits"
  exit 1
fi
```

### Pre-commit Hook'ları

Değişiklikleri push etmeden önce kodun token bütçeleri içinde kalmasını sağlamak için pre-commit hook olarak kullanın.

### LLM Context Hazırlama

Araç, LLM tüketimi için iki formatta optimize edilmiş dosya listeleri oluşturur:

- **Compact format** (~2.3k karakter): Sık AI etkileşimleri için minimal JSON yapısı
- **Detailed format** (~8.6k karakter): İlk proje analizi için kapsamlı context

Bu çıktılar, AI destekli geliştirme iş akışlarına otomatik olarak beslenebilir ve geliştiricilerin en alakalı kod context'i ile çalışmasını sağlar.

**Bölüm kaynakları**

- [README.md](file://README.md#L201-L217)
- [package.json](file://package.json#L7-L13)

## Sorun Giderme

ctxman aracının kurulumu ve kullanımı sırasında ortaya çıkabilecek yaygın sorunları çözün.

### İzin Hataları (Global Kurulum)

Global kurulum yaparken izin hatalarıyla karşılaşabilirsiniz:

```bash
npm install -g ctxman
# Error: EACCES: permission denied
```

**Çözümler:**

- Node.js'i home dizininize kuran nvm gibi bir Node.js sürüm yöneticisi kullanın
- İzin sorunlarından kaçınmak için npm'in varsayılan dizinini değiştirin
- sudo kullanın (güvenlik nedenleriyle önerilmez): `sudo npm install -g ctxman`

### Eksik Bağımlılıklar

tiktoken kurulumu başarısız olursa, araç otomatik olarak tahmin moduna geri döner. Kurulum sorunlarını çözmek için:

```bash
# npm önbelleğini temizle
npm cache clean --force

# Taze bağımlılıklarla yeniden kur
npm install tiktoken
```

### Yapılandırma Sorunları

#### Include vs Exclude Mod Karışıklığı

- **Problem**: Beklenmeyen dosyalar dahil edildi/hariç tutuldu
- **Çözüm**: .contextinclude dosyasının varlığını kontrol edin, çünkü .contextignore'dan önceliklidir

#### Desen Eşleştirme Sorunları

- Desenlerin satır içi yorumları olmadığından emin olun
- Özyinelemeli eşleştirme için `**`, tek seviye için `*` kullanın
- Eşleştirme davranışını görmek için verbose mod ile desenleri test edin

### Platforma Özgü Sorunlar

Uygun pano araçları olmayan Linux sistemlerinde:

```bash
# Gerekli pano yardımcı programlarını kurun
sudo apt-get install xclip xsel  # Debian/Ubuntu
sudo yum install xclip           # CentOS/RHEL
```

Araç, birincil komut başarısız olursa otomatik olarak alternatif pano komutlarını dener ve çapraz platform uyumluluğu için geri dönüş mekanizmaları sağlar.

**Bölüm kaynakları**

- [README.md](file://README.md#L257-L284)
- [ctxman.js](file://ctxman.js#L565-L585)

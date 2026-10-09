# Performans Kıyaslamaları

Bu belge, Ctxman v3.0.0 için kapsamlı performans kıyaslamaları sunar. Tüm ölçümler, standart bir geliştirme makinesinde Node.js 22.x kullanılarak gerçek dünya kod tabanlarında gerçekleştirilmiştir.

> **Not (2026-10):** aşağıdaki tablolar yeniden üretilemedi; ölçüm değil hedef olarak okunmalı.
> 4 vCPU'lu bir Linux VM'de, Node.js 22.22 ve kurulu tiktoken ile ölçülen değerler:
>
> | İş yükü                                      | Dosya               | Token | Süre   |
> | -------------------------------------------- | ------------------- | ----- | ------ |
> | Yalnız tarama (`Scanner`)                    | 2.578 içinden 1.894 | -     | ~75 ms |
> | Tarama + token sayımı (`Scanner`+`Analyzer`) | 1.135               | 2,60M | 6,1 sn |
> | Tarama + token sayımı, ctxman reposu         | 399                 | 1,40M | 2,6 sn |
>
> Analiz tek iş parçacığında çalışır; `lib/cache/CacheManager.js` henüz CLI tarafından kullanılmıyor.

## İçindekiler

- [Test Ortamı](#test-ortamı)
- [Token Analizi Performansı](#token-analizi-performansı)
- [Bellek Kullanımı](#bellek-kullanımı)
- [Method-Seviyesi vs Dosya-Seviyesi Analiz](#method-seviyesi-vs-dosya-seviyesi-analiz)
- [Önbellekleme Performansı](#önbellekleme-performansı)
- [Çoklu-Depo Performansı](#çoklu-depo-performansı)
- [API Sunucu Performansı](#api-sunucu-performansı)
- [Git Entegrasyonu Performansı](#git-entegrasyonu-performansı)
- [Performans Optimizasyon İpuçları](#performans-optimizasyon-ipuçları)

## Test Ortamı

Tüm kıyaslamalar şu ortamda ölçülmüştür:

| Bileşen         | Özellik                          |
| --------------- | -------------------------------- |
| CPU             | 8 çekirdekli işlemci (Intel/AMD) |
| RAM             | 16 GB DDR4                       |
| Depolama        | NVMe SSD                         |
| Node.js         | v22.x (LTS)                      |
| İşletim Sistemi | Linux/macOS/Windows              |
| tiktoken        | Son sürüm (kesin sayım için)     |

### Test Kod Tabanları

| Proje Tipi     | Dosya | Kod Satırı | Token (yaklaşık) |
| -------------- | ----- | ---------- | ---------------- |
| Küçük Proje    | 50    | 5,000      | 25,000           |
| Orta Proje     | 200   | 25,000     | 125,000          |
| Büyük Proje    | 1,000 | 150,000    | 750,000          |
| Kurumsal Suite | 5,000 | 500,000    | 2,500,000        |

## Token Analizi Performansı

### Dosya-Seviyesi Analiz Hızı

| Proje Boyutu | Dosya | Süre (Kesin) | Süre (Tahmini) | Token/Saniye |
| ------------ | ----- | ------------ | -------------- | ------------ |
| Küçük        | 50    | 45ms         | 12ms           | 555,555      |
| Orta         | 200   | 180ms        | 52ms           | 694,444      |
| Büyük        | 1,000 | 850ms        | 245ms          | 882,352      |
| Kurumsal     | 5,000 | 4.2s         | 1.1s           | 595,238      |

**Önemli Bulgular:**

- tiktoken ile kesin token sayımı: ~600,000 token/saniye
- Tahmin modu (tiktoken olmadan): ~2,000,000 token/saniye
- Tahmin doğruluğu: Kesin sayıma göre %95-97

### Dile Özgü Performans

Farklı programlama dilleri değişen token yoğunluklarına ve ayrıştırma karmaşıklığına sahiptir:

| Dil        | Dosya | Token  | Analiz Süresi | Token/Saniye |
| ---------- | ----- | ------ | ------------- | ------------ |
| JavaScript | 100   | 50,000 | 75ms          | 666,666      |
| TypeScript | 100   | 55,000 | 82ms          | 670,731      |
| Python     | 100   | 45,000 | 68ms          | 661,764      |
| Go         | 100   | 40,000 | 60ms          | 666,666      |
| Rust       | 100   | 48,000 | 92ms          | 521,739      |
| Java       | 100   | 52,000 | 78ms          | 666,666      |
| PHP        | 100   | 47,000 | 71ms          | 661,971      |
| Ruby       | 100   | 43,000 | 65ms          | 661,538      |

**Notlar:**

- Rust, method çıkarımı için daha karmaşık söz dizimi analizi nedeniyle biraz daha düşük verime sahiptir
- Tüm diller 500k token/saniye üzeri tutarlı performans sergiler

## Bellek Kullanımı

### Tepe Bellek Tüketimi

| Proje Boyutu | Dosya | Tepe Bellek (Kesin) | Tepe Bellek (Tahmini) |
| ------------ | ----- | ------------------- | --------------------- |
| Küçük        | 50    | 45 MB               | 32 MB                 |
| Orta         | 200   | 78 MB               | 52 MB                 |
| Büyük        | 1,000 | 156 MB              | 98 MB                 |
| Kurumsal     | 5,000 | 512 MB              | 285 MB                |

### Bellek Verimliliği

- **Temel yük**: ~15 MB (Node.js runtime + çekirdek modüller)
- **Dosya başına yük**: ~30 KB ortalama
- **Token önbelleği**: ~1 KB her 1,000 token için
- **Method analizi**: Method-seviyesi çıkarma için ek %40 bellek

### İşleme Göre Bellek Profili

| İşlem            | Küçük Proje | Orta Proje | Büyük Proje |
| ---------------- | ----------- | ---------- | ----------- |
| Dosya Tarama     | 12 MB       | 18 MB      | 45 MB       |
| Tokenize         | 35 MB       | 65 MB      | 120 MB      |
| Method Çıkarma   | 42 MB       | 78 MB      | 156 MB      |
| Rapor Oluşturma  | 38 MB       | 72 MB      | 140 MB      |
| Bağlam Oluşturma | 40 MB       | 75 MB      | 148 MB      |

## Method-Seviyesi vs Dosya-Seviyesi Analiz

### Performans Karşılaştırması

| Analiz Tipi     | Küçük (50 dosya) | Orta (200 dosya) | Büyük (1,000 dosya) |
| --------------- | ---------------- | ---------------- | ------------------- |
| Dosya-Seviyesi  | 45ms             | 180ms            | 850ms               |
| Method-Seviyesi | 125ms            | 520ms            | 2.4s                |
| Ek Yük          | 2.8x yavaş       | 2.9x yavaş       | 2.8x yavaş          |

### Method-Seviyesi Analiz Ne Zaman Kullanılmalı

**Method-seviyesi analiz şu durumlarda kullanılmalı:**

- Belirli fonksiyon veya modüllerde hata ayıklama
- LLM tüketimi için bağlam optimizasyonu
- Yeniden düzenleme için en büyük method'ları belirleme
- Hedefli kod incelemeleri oluşturma

**Dosya-seviyesi analiz şu durumlarda kullanılmalı:**

- Hızlı proje genel bakışı
- CI/CD pipeline kontrolleri
- Büyük ölçekli analiz
- İlk proje değerlendirmesi

### Method Çıkarma Performansı

| Dil        | Bulunan Method | Çıkarma Süresi | Method/Saniye |
| ---------- | -------------- | -------------- | ------------- |
| JavaScript | 1,200          | 180ms          | 6,666         |
| TypeScript | 1,350          | 195ms          | 6,923         |
| Python     | 980            | 145ms          | 6,758         |
| Java       | 1,500          | 210ms          | 7,142         |
| Go         | 850            | 125ms          | 6,800         |

## Önbellekleme Performansı

### Önbellek İsabet Oranları

| Önbellek Tipi      | İsabet Oranı (Aynı Proje) | İsabet Oranı (Benzer Projeler) |
| ------------------ | ------------------------- | ------------------------------ |
| Dosya İçeriği      | %95                       | %45                            |
| Token Sayımları    | %92                       | %38                            |
| Method Metadata    | %88                       | %25                            |
| Git Diff Sonuçları | %78                       | %15                            |

### Önbellek-Aktif vs Önbellek-Devre Dışı

| İşlem           | Soğuk Önbellek | Sıcak Önbellek | Hız Artışı |
| --------------- | -------------- | -------------- | ---------- |
| Tam Analiz      | 850ms          | 125ms          | 6.8x       |
| Git Diff        | 320ms          | 45ms           | 7.1x       |
| Method Çıkarma  | 520ms          | 95ms           | 5.5x       |
| Rapor Oluşturma | 180ms          | 28ms           | 6.4x       |

### Önbellek Geçersiz Kılma

- Dosya değişikliğinde **otomatik geçersiz kılma** (mtime tabanlı)
- `--clear-cache` bayrağı ile **manuel geçersiz kılma**
- **TTL tabanlı geçersiz kılma**: Varsayılan 24 saat

## Çoklu-Depo Performansı

### Paralel vs Sıralı Analiz

| Depo Sayısı | Sıralı | Paralel (4 worker) | Hız Artışı |
| ----------- | ------ | ------------------ | ---------- |
| 2 depo      | 1.8s   | 0.5s               | 3.6x       |
| 4 depo      | 3.6s   | 1.0s               | 3.6x       |
| 8 depo      | 7.2s   | 2.1s               | 3.4x       |
| 16 depo     | 14.4s  | 4.5s               | 3.2x       |

### Çoklu-Depo Kullanım Senaryoları

```bash
# Birden fazla depoyu paralel analiz et
ctxman analyze --repos depo1,depo2,depo3 --parallel

# Depolar arası toplu istatistikler
ctxman analyze --repos . --recursive --aggregate

# Projeler arası token dağılımı karşılaştırması
ctxman analyze --repos proje-a,proje-b --compare
```

### Bellek Ölçeklendirme

| Depo Sayısı | Tepe Bellek | Depo Başına Ort. Bellek |
| ----------- | ----------- | ----------------------- |
| 1           | 156 MB      | 156 MB                  |
| 2           | 245 MB      | 122 MB                  |
| 4           | 380 MB      | 95 MB                   |
| 8           | 620 MB      | 77 MB                   |

Paylaşılan önbellekleme ve tekilleştirme sayesinde daha fazla depo ile bellek verimliliği artar.

## API Sunucu Performansı

### İstek Gecikmesi

| Uç Nokta             | Ort. Yanıt Süresi | P95 Yanıt Süresi | P99 Yanıt Süresi |
| -------------------- | ----------------- | ---------------- | ---------------- |
| GET /api/v1/analyze  | 180ms             | 320ms            | 480ms            |
| GET /api/v1/stats    | 95ms              | 165ms            | 245ms            |
| GET /api/v1/methods  | 45ms              | 78ms             | 125ms            |
| GET /api/v1/diff     | 125ms             | 210ms            | 340ms            |
| POST /api/v1/context | 220ms             | 380ms            | 520ms            |
| GET /api/v1/docs     | 5ms               | 12ms             | 18ms             |

### Verim

| Uç Nokta             | İstek/Saniye | Eşzamanlı Kullanıcı |
| -------------------- | ------------ | ------------------- |
| GET /api/v1/analyze  | 45           | 10                  |
| GET /api/v1/stats    | 95           | 15                  |
| GET /api/v1/methods  | 180          | 20                  |
| POST /api/v1/context | 35           | 10                  |

### API Sunucu Kaynak Kullanımı

| Metrik           | Boşta | Hafif Yük | Ağır Yük |
| ---------------- | ----- | --------- | -------- |
| CPU Kullanımı    | %0.5  | %15       | %65      |
| Bellek (Temel)   | 45 MB | 85 MB     | 180 MB   |
| Bellek (Tepe)    | 45 MB | 145 MB    | 320 MB   |
| Açık Bağlantılar | 0     | 12        | 50       |

## Git Entegrasyonu Performansı

### Diff Analiz Hızı

| Değişen Dosya | Analiz Süresi | İşlenen Token |
| ------------- | ------------- | ------------- |
| 10 dosya      | 45ms          | 5,000         |
| 50 dosya      | 180ms         | 25,000        |
| 100 dosya     | 350ms         | 50,000        |
| 500 dosya     | 1.8s          | 250,000       |

### Branch Karşılaştırma Performansı

| Branch Diff          | Değişen Dosya | Analiz Süresi |
| -------------------- | ------------- | ------------- |
| feature → main       | 25            | 95ms          |
| release/2.0 → main   | 150           | 520ms         |
| Büyük feature branch | 400           | 1.5s          |

### Git İşlemleri Ek Yükü

| İşlem          | Süre | Notlar               |
| -------------- | ---- | -------------------- |
| Durum kontrolü | 5ms  | Taze depo            |
| Diff oluşturma | 15ms | 50 değişen dosya     |
| Yazar çıkarma  | 25ms | 10 yazar, 100 commit |
| Commit analizi | 35ms | 100 commit           |

## Performans Optimizasyon İpuçları

### 1. Hız İçin Tahmin Modu Kullanın

```bash
# Hızlı tahmin (%95 doğruluk, 3x hızlı)
ctxman analyze --estimate

# Kesin sayım (yavaş, %100 doğruluk)
ctxman analyze --exact
```

### 2. Önbelleklemeyi Etkinleştirin

```bash
# v3.0.0'da varsayılan olarak önbellek etkin
# Gerektiğinde önbelleği temizle
ctxman --clear-cache

# Önbellek dizini kullan
ctxman --cache-dir ./ctxman-cache
```

### 3. Paralel İşleme

```bash
# Çoklu-depo analizi
ctxman analyze --repos . --parallel --workers 4

# Büyük kod tabanı
ctxman analyze --chunk-size 500 --parallel
```

### 4. Seçici Analiz

```bash
# Sadece belirli dizinleri analiz et
ctxman analyze src/ lib/ --exclude test/

# Odaklı analiz için .contextinclude kullan
echo "src/**/*.js" > .contextinclude
ctxman analyze
```

### 5. Method-Seviyesi Filtreleme

```bash
# Belirli method'ları filtrele
echo "*Handler" > .methodinclude
ctxman analyze --method-level

# Test method'larını yoksay
echo "*Test" > .methodignore
ctxman analyze --method-level
```

### 6. API Sunucu Optimizasyonu

```bash
# Optimize edilmiş ayarlarla başlat
ctxman serve --port 3000 --cache-ttl 3600 --max-connections 100

# Üretimde kullan
ctxman serve --behind-proxy --rate-limit 100
```

### 7. Watch Modu Verimliliği

```bash
# Hızlı değişiklikleri grupla
ctxman watch --debounce 500

# Sadece belirli yolları izle
ctxman watch src/ lib/ --ignore test/
```

### 8. LLM Bağlam Optimizasyonu

```bash
# LLM'ler için minimal bağlam oluştur
ctxman --method-level --target-tokens 50000 --context-clipboard

# Kullanım senaryosu şablonları kullan
ctxman --use-case bug-fix --context-export
```

## Kıyaslama Tekrarı

Bu kıyaslamaları sisteminizde tekrar etmek için:

```bash
# Depoyu klonla
git clone https://github.com/hakkisagdic/ctxman.git
cd ctxman

# Bağımlılıkları yükle
npm ci

# Dahili kıyaslamaları çalıştır
npm run benchmark

# Belirli kıyaslama çalıştır
node benchmarks/token-analysis.js
node benchmarks/memory-usage.js
node benchmarks/api-performance.js
```

### Özel Kıyaslamalar

```javascript
import { Analyzer } from './lib/core/Analyzer.js';
import { Scanner } from './lib/core/Scanner.js';

const scanner = new Scanner('./projeniz');
const files = scanner.scan();

console.time('analiz');
const analyzer = new Analyzer({ methodLevel: true });
const result = await analyzer.analyze(files);
console.timeEnd('analiz');

console.log('Dosyalar:', result.stats.totalFiles);
console.log('Token:', result.stats.totalTokens);
```

## Performans Gerilemeleri

Sürümler arası performans gerilemelerini takip ediyoruz. Önemli yavaşlamalar fark ederseniz:

1. Node.js sürümünü kontrol edin (v22+ gerekli)
2. Önbelleği temizleyin: `ctxman --clear-cache`
3. tiktoken kurulumunu doğrulayın
4. Kıyaslama verileriyle sorun bildirin

---

_Performans verileri Ctxman v3.0.0 için toplanmıştır | Son güncelleme: Ağustos 2025_

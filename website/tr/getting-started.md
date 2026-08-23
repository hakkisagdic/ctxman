# Başlangıç

Ctxman ile sadece birkaç dakikada başlayın.

## Kurulum

### npm (Önerilen)

Kolay erişim için global olarak yükleyin:

```bash
npm install -g ctxman
```

### npx Kullanarak

Yüklemeden çalıştırın:

```bash
npx ctxman
```

### Kaynaktan

Klonlayın ve yerel olarak yükleyin:

```bash
git clone https://github.com/hakkisagdic/ctxman.git
cd ctxman
npm install
npm link
```

## Gereksinimler

- **Node.js**: Sürüm 20.0.0 veya üzeri
- **npm**: Sürüm 8.0.0 veya üzeri

Node.js sürümünüzü kontrol edin:

```bash
node --version
```

## Hızlı Başlangıç

### 1. Projenize Gidin

```bash
cd /projenizin/yolu
```

### 2. Ctxman'ı Çalıştırın

```bash
ctxman
```

Bu, sizi analiz seçeneklerinde yönlendiren interaktif sihirbaz modunu başlatır.

### 3. Sihirbazı Takip Edin

Sihirbaz şunları isteyecektir:

1. Analiz türünü seçin
2. Çıktı formatını seçin
3. Filtreleme seçeneklerini yapılandırın
4. Gözden geçirin ve onaylayın

### 4. Sonuçları Görüntüleyin

Analiz tamamlandıktan sonra şunları göreceksiniz:

- Token sayısı özeti
- Dosya dökümü
- Yöntem düzeyinde analiz (etkinleştirilmişse)
- Dışa aktarma seçenekleri

## CLI Modu

İleri düzey kullanıcılar ve otomasyon için CLI modunu kullanın:

```bash
ctxman --cli
```

### Yaygın Komutlar

```bash
# Temel analiz
ctxman --cli

# Yöntem düzeyinde analiz ile
ctxman --cli --method-level

# TOON formatına dışa aktar
ctxman --cli --toon

# GitIngest formatına dışa aktar
ctxman --cli --gitingest

# Belirli dizini analiz et
ctxman --cli --path ./src

# Çıktı dosyası ayarla
ctxman --cli --output result.md
```

## Yapılandırma

### .contextignore

Dosyaları analizden hariç tutun:

```gitignore
# Bağımlılıklar
node_modules/
vendor/

# Derleme çıktıları
dist/
build/

# Test dosyaları
*.test.js
*.spec.ts

# Yapılandırma
.env
.env.*
```

### .contextinclude

Sadece belirli dosyaları dahil et (.contextignore üzerinden öncelik alır):

```gitignore
src/
lib/
index.js
```

### .methodinclude

Belirli yöntemleri dahil et:

```text
calculate*
parse*
render*
```

### .methodignore

Belirli yöntemleri hariç tut:

```text
test*
mock*
deprecated*
```

## İzleme Modu

Gerçek zamanlı izlemeyi etkinleştirin:

```bash
ctxman watch
```

### İzleme Seçenekleri

```bash
# Özel aralık (ms)
ctxman watch --interval 500

# Belirli dizin
ctxman watch --path ./src

# Çıktı ile
ctxman watch --output live.json
```

## API Sunucusu

REST API sunucusunu başlatın:

```bash
ctxman serve
```

Varsayılan port 3000'dir. Şu şekilde yapılandırın:

```bash
ctxman serve --port 8080
```

### API Uç Noktaları

| Uç Nokta | Metot | Açıklama |
|----------|-------|----------|
| `/api/analyze` | POST | Kod analiz et |
| `/api/status` | GET | Sunucu durumu |
| `/api/config` | GET | Yapılandırmayı al |
| `/api/config` | POST | Yapılandırmayı güncelle |
| `/api/cache/clear` | POST | Önbelleği temizle |
| `/health` | GET | Sağlık kontrolü |

### Örnek API Kullanımı

```bash
# Geçerli dizini analiz et
curl -X POST http://localhost:3000/api/analyze \
  -H "Content-Type: application/json" \
  -d '{"path": "."}'
```

## Git Entegrasyonu

### Değişen Dosyaları Analiz Et

```bash
# Son commit değişiklikleri
ctxman --git-diff HEAD~1

# Sahnelenmiş değişiklikler
ctxman --git-diff --cached

# Branch'ler arası
ctxman --git-diff main..feature
```

### Git Branch Analizi

```bash
# Main branch ile karşılaştır
ctxman --git-branch main
```

## Çıktı Formatları

### TOON Formatı

LLM'ler için %40-50 token azaltma ile optimize edilmiş:

```bash
ctxman --cli --toon
```

### GitIngest Formatı

GitHub hazır markdown:

```bash
ctxman --cli --gitingest
```

### JSON Formatı

Makine tarafından okunabilir çıktı:

```bash
ctxman --cli --output result.json
```

## Ortam Değişkenleri

Ortam değişkenleri ile yapılandırın:

```bash
# Varsayılan çıktı formatını ayarla
export CTXMAN_OUTPUT_FORMAT=toon

# Varsayılan olarak yöntem düzeyinde analiz etkinleştir
export CTXMAN_METHOD_LEVEL=true

# Önbellek dizini ayarla
export CTXMAN_CACHE_DIR=~/.ctxman/cache
```

## Programatik API

Ctxman'ı Node.js uygulamalarınızda kullanın:

```javascript
import ctxman from 'ctxman';

// Temel analiz
const result = await ctxman.analyze({
  path: './src',
  methodLevel: true
});

console.log(result.totalTokens);

// İzleme modu
const watcher = ctxman.watch({
  path: './src',
  onChange: (result) => {
    console.log('Dosyalar değişti:', result.files);
  }
});

// İzlemeyi durdur
watcher.stop();
```

## Sonraki Adımlar

- Ayrıntılı yetenekler için [Özellikler](/tr/features)'i keşfedin
- Tam dokümantasyon için [API Referansı](/tr/api-reference)'nı kontrol edin
- Aksiyonda görmek için [İnteraktif Demo](/tr/demo)'yu deneyin
- Katılmak için [Katkı Rehberi](https://github.com/hakkisagdic/ctxman/blob/main/CONTRIBUTING-tr.md)'ni okuyun

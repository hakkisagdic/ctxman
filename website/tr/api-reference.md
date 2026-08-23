# API Referansı

Ctxman CLI, REST API ve programatik kullanım için tam referans.

## CLI Referansı

### Global Seçenekler

| Seçenek | Kısa | Açıklama | Varsayılan |
|---------|------|----------|------------|
| `--cli` | `-c` | CLI modunda çalıştır (sihirbazı atla) | `false` |
| `--help` | `-h` | Yardımı göster | - |
| `--version` | `-v` | Sürümü göster | - |
| `--path` | `-p` | Analiz edilecek dizin | Geçerli dizin |
| `--output` | `-o` | Çıktı dosya yolu | `stdout` |

### Analiz Seçenekleri

| Seçenek | Açıklama | Varsayılan |
|---------|----------|------------|
| `--method-level` | Yöntem düzeyinde token analizini etkinleştir | `false` |
| `--token-count` | Kesin token sayılarını hesapla | `true` |
| `--tiktoken` | Kesin sayım için tiktoken kullan | `true` |
| `--include-comments` | Analize yorumları dahil et | `false` |

### Çıktı Formatı Seçenekleri

| Seçenek | Açıklama |
|---------|----------|
| `--toon` | TOON formatında çıktı (%40-50 azaltma) |
| `--gitingest` | GitIngest formatında çıktı |
| `--json` | JSON olarak çıktı |
| `--markdown` | Markdown olarak çıktı |

### Git Entegrasyonu Seçenekleri

| Seçenek | Açıklama |
|---------|----------|
| `--git-diff <ref>` | Diff'te değişen dosyaları analiz et |
| `--git-diff --cached` | Sahnelenmiş değişiklikleri analiz et |
| `--git-branch <branch>` | Branch ile karşılaştır |
| `--git-author <author>` | Yazara göre filtrele |

### İzleme Modu Seçenekleri

| Seçenek | Açıklama | Varsayılan |
|---------|----------|------------|
| `--interval <ms>` | Gecikme aralığı | `1000` |
| `--ignore <pattern>` | Yoksayılacak kalıplar | - |

### Sunucu Seçenekleri

| Seçenek | Açıklama | Varsayılan |
|---------|----------|------------|
| `--port <port>` | API sunucu portu | `3000` |
| `--host <host>` | API sunucu host'u | `localhost` |

## CLI Komutları

### `ctxman` (Varsayılan)

İnteraktif sihirbaz modunu başlat:

```bash
ctxman
```

### `ctxman watch`

İzleme modunu başlat:

```bash
ctxman watch [seçenekler]
```

### `ctxman serve`

REST API sunucusunu başlat:

```bash
ctxman serve [seçenekler]
```

### `ctxman config`

Yapılandırmayı yönet:

```bash
# Geçerli yapılandırmayı göster
ctxman config show

# Yapılandırma değeri ayarla
ctxman config set output.format toon
```

## REST API

### Temel URL

```
http://localhost:3000/api
```

### Kimlik Doğrulama

Şu anda API kimlik doğrulama olmadan yerel olarak çalışır. Üretim kullanımı için, kimlik doğrulama ile ters proxy ekleyin.

### Uç Noktalar

#### POST /api/analyze

Bir dizindeki kodu analiz et.

**İstek Gövdesi:**

```json
{
  "path": "./src",
  "methodLevel": true,
  "outputFormat": "json",
  "exclude": ["*.test.js"],
  "include": []
}
```

**Yanıt:**

```json
{
  "success": true,
  "data": {
    "totalTokens": 12345,
    "totalFiles": 42,
    "files": [
      {
        "path": "src/index.js",
        "tokens": 234,
        "lines": 45,
        "methods": []
      }
    ]
  }
}
```

#### GET /api/status

Sunucu durumunu al.

**Yanıt:**

```json
{
  "status": "running",
  "uptime": 3600,
  "version": "3.0.0"
}
```

#### GET /api/config

Geçerli yapılandırmayı al.

**Yanıt:**

```json
{
  "output": {
    "format": "json",
    "file": null
  },
  "analysis": {
    "methodLevel": true,
    "tokenCount": true
  }
}
```

#### POST /api/config

Yapılandırmayı güncelle.

**İstek Gövdesi:**

```json
{
  "output": {
    "format": "markdown"
  }
}
```

**Yanıt:**

```json
{
  "success": true,
  "config": {
    "output": {
      "format": "markdown"
    }
  }
}
```

#### POST /api/cache/clear

Analiz önbelleğini temizle.

**Yanıt:**

```json
{
  "success": true,
  "message": "Önbellek temizlendi"
}
```

#### GET /health

Sağlık kontrolü uç noktası.

**Yanıt:**

```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

## Programatik API

### Kurulum

```bash
npm install ctxman
```

### İçe Aktar

```javascript
import ctxman from 'ctxman';
// veya
const ctxman = require('ctxman');
```

### Yöntemler

#### `ctxman.analyze(options)`

Bir dizindeki kodu analiz et.

```javascript
const result = await ctxman.analyze({
  path: './src',
  methodLevel: true,
  outputFormat: 'json',
  exclude: ['*.test.js']
});

console.log(result.totalTokens);
console.log(result.files);
```

**Seçenekler:**

| Seçenek | Tip | Varsayılan | Açıklama |
|---------|-----|------------|----------|
| `path` | `string` | `'.'` | Analiz edilecek dizin |
| `methodLevel` | `boolean` | `false` | Yöntem düzeyinde analiz etkinleştir |
| `outputFormat` | `string` | `'json'` | Çıktı formatı |
| `exclude` | `string[]` | `[]` | Hariç tutulacak kalıplar |
| `include` | `string[]` | `[]` | Dahil edilecek kalıplar |

**Döndürür:** `Promise<AnalysisResult>`

#### `ctxman.watch(options)`

İzleme modunu başlat.

```javascript
const watcher = ctxman.watch({
  path: './src',
  interval: 1000,
  onChange: (result) => {
    console.log('Analiz güncellendi:', result.totalTokens);
  },
  onError: (error) => {
    console.error('İzleme hatası:', error);
  }
});

// İzlemeyi durdur
watcher.stop();
```

**Seçenekler:**

| Seçenek | Tip | Varsayılan | Açıklama |
|---------|-----|------------|----------|
| `path` | `string` | `'.'` | İzlenecek dizin |
| `interval` | `number` | `1000` | Gecikme aralığı (ms) |
| `onChange` | `function` | - | Değişiklikte geri çağrı |
| `onError` | `function` | - | Hatada geri çağrı |

**Döndürür:** `stop()` yöntemi olan `Watcher` nesnesi.

#### `ctxman.serve(options)`

REST API sunucusunu başlat.

```javascript
const server = await ctxman.serve({
  port: 3000,
  host: 'localhost'
});

// Sunucuyu durdur
server.stop();
```

**Seçenekler:**

| Seçenek | Tip | Varsayılan | Açıklama |
|---------|-----|------------|----------|
| `port` | `number` | `3000` | Sunucu portu |
| `host` | `string` | `'localhost'` | Sunucu host'u |

**Döndürür:** `stop()` yöntemi olan `Promise<Server>` nesnesi.

#### `ctxman.configure(options)`

Global yapılandırma ayarla.

```javascript
ctxman.configure({
  defaultOutputFormat: 'toon',
  defaultMethodLevel: true
});
```

### Tipler

```typescript
interface AnalysisResult {
  totalTokens: number;
  totalFiles: number;
  totalLines: number;
  files: FileResult[];
  methods?: MethodResult[];
}

interface FileResult {
  path: string;
  tokens: number;
  lines: number;
  language: string;
  methods?: MethodResult[];
}

interface MethodResult {
  name: string;
  tokens: number;
  lines: number;
  file: string;
}

interface Watcher {
  stop(): void;
}

interface Server {
  stop(): Promise<void>;
}
```

## Çıkış Kodları

| Kod | Açıklama |
|-----|----------|
| 0 | Başarılı |
| 1 | Genel hata |
| 2 | Geçersiz argümanlar |
| 3 | Yapılandırma hatası |
| 4 | Analiz hatası |
| 5 | Dosya sistemi hatası |

## Hata İşleme

### CLI Hataları

Hatalar açıklayıcı bir mesaj ile stderr'e yazılır:

```bash
ctxman --invalid-option
# Hata: Bilinmeyen seçenek '--invalid-option'
# Kullanım bilgileri için 'ctxman --help' çalıştırın.
```

### API Hataları

API hataları hata detayları ile JSON döndürür:

```json
{
  "success": false,
  "error": {
    "code": "ANALYSIS_ERROR",
    "message": "Dizin analizi başarısız",
    "details": "İzin reddedildi: /root/secret"
  }
}
```

## Örnekler

### Temel Analiz

```javascript
import ctxman from 'ctxman';

const result = await ctxman.analyze({ path: './src' });
console.log(`Toplam token: ${result.totalTokens}`);
```

### Yöntem Düzeyinde Analiz

```javascript
const result = await ctxman.analyze({
  path: './src',
  methodLevel: true
});

result.files.forEach(file => {
  console.log(`\n${file.path}:`);
  file.methods?.forEach(method => {
    console.log(`  ${method.name}: ${method.tokens} token`);
  });
});
```

### Sunucu ile İzleme Modu

```javascript
import ctxman from 'ctxman';

// Sunucuyu başlat
const server = await ctxman.serve({ port: 3000 });

// İzleme modunu başlat
const watcher = ctxman.watch({
  path: './src',
  onChange: (result) => {
    console.log(`Analiz güncellendi: ${result.totalTokens} token`);
  }
});

// Çıkışta temizle
process.on('SIGINT', async () => {
  watcher.stop();
  await server.stop();
  process.exit(0);
});
```

---

Yardım mı lazım? [Sorun Giderme Rehberi](https://github.com/hakkisagdic/ctxman/blob/main/docs/content-tr/Sorun-Giderme.md)'ni kontrol edin veya [GitHub'da bir sorun açın](https://github.com/hakkisagdic/ctxman/issues).

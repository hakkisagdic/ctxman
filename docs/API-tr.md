# API Dokümantasyonu

Bu belge, Ctxman v3.0.0 tarafından sağlanan REST API uç noktalarını açıklar.

## İçindekiler

- [Genel Bakış](#genel-bakış)
- [Başlarken](#başlarken)
- [Kimlik Doğrulama](#kimlik-doğrulama)
- [Uç Noktalar](#uç-noktalar)
  - [GET /api/v1/analyze](#get-apiv1analyze)
  - [GET /api/v1/methods](#get-apiv1methods)
  - [GET /api/v1/stats](#get-apiv1stats)
  - [GET /api/v1/diff](#get-apiv1diff)
  - [POST /api/v1/context](#post-apiv1context)
  - [GET /api/v1/docs](#get-apiv1docs)
- [Hata Yönetimi](#hata-yönetimi)
- [Örnekler](#örnekler)

## Genel Bakış

Ctxman, analiz yeteneklerine programatik erişim için bir REST API sunucusu sağlar. API, CI/CD pipeline'ları, IDE eklentileri ve diğer araçlarla entegrasyonu mümkün kılar.

### Temel URL

```
http://localhost:3000/api/v1
```

### İçerik Türü

Tüm istekler ve yanıtlar JSON kullanır:

```
Content-Type: application/json
```

## Başlarken

### Sunucuyu Başlatma

```bash
# Varsayılan ayarlarla başlat
ctxman serve

# Özel port ile başlat
ctxman serve --port 8080

# Kimlik doğrulama ile başlat
ctxman serve --port 3000 --auth-token gizli-anahtariniz
```

### Sunucu Seçenekleri

| Seçenek | Varsayılan | Açıklama |
|---------|------------|----------|
| `--port` | 3000 | Dinlenecek port numarası |
| `--host` | localhost | Bağlanılacak host adresi |
| `--auth-token` | null | İsteğe bağlı kimlik doğrulama token'ı |
| `--cors` | true | CORS başlıklarını etkinleştir |

## Kimlik Doğrulama

Kimlik doğrulama etkinleştirildiğinde (`--auth-token`), token'ı `Authorization` başlığına ekleyin:

```bash
curl -H "Authorization: Bearer gizli-anahtariniz" http://localhost:3000/api/v1/analyze
```

## Uç Noktalar

### GET /api/v1/analyze

Proje dosyalarını analiz edin ve kapsamlı token sayılarını alın.

#### Parametreler

| Parametre | Tür | Zorunlu | Açıklama |
|-----------|-----|---------|----------|
| `path` | string | Hayır | Proje yolu (varsayılan: mevcut dizin) |
| `methods` | boolean | Hayır | Method seviyesi analizini dahil et (varsayılan: false) |

#### Örnek İstek

```bash
# Mevcut dizini analiz et
curl http://localhost:3000/api/v1/analyze

# Belirli bir projeyi analiz et
curl "http://localhost:3000/api/v1/analyze?path=/proje/yolu"

# Method analizini dahil et
curl "http://localhost:3000/api/v1/analyze?methods=true"
```

#### Yanıt

```json
{
  "files": [
    {
      "path": "/mutlak/yol/dosya.js",
      "relativePath": "src/dosya.js",
      "name": "dosya.js",
      "extension": ".js",
      "size": 1234,
      "tokens": 456,
      "lines": 50,
      "language": "JavaScript",
      "methods": []
    }
  ],
  "stats": {
    "totalFiles": 64,
    "totalTokens": 181480,
    "totalSize": 819200,
    "totalMethods": 0,
    "byLanguage": {
      "JavaScript": {
        "files": 64,
        "tokens": 181480,
        "size": 819200
      }
    },
    "largestFiles": [
      {
        "path": "src/server.js",
        "tokens": 12388,
        "size": 51200
      }
    ],
    "analysisTime": 150
  }
}
```

---

### GET /api/v1/methods

Belirli bir dosyadan method'ları çıkarın.

#### Parametreler

| Parametre | Tür | Zorunlu | Açıklama |
|-----------|-----|---------|----------|
| `file` | string | Evet | Dosyanın mutlak veya göreli yolu |

#### Örnek İstek

```bash
curl "http://localhost:3000/api/v1/methods?file=src/server.js"
```

#### Yanıt

```json
{
  "file": "src/server.js",
  "methods": [
    {
      "name": "handleRequest",
      "line": 15,
      "tokens": 234,
      "type": "function",
      "async": true
    },
    {
      "name": "validateInput",
      "line": 45,
      "tokens": 156,
      "type": "function",
      "async": false
    }
  ],
  "totalMethods": 2
}
```

#### Hata Yanıtı

```json
{
  "error": "Missing \"file\" parameter",
  "statusCode": 400
}
```

---

### GET /api/v1/stats

Tam dosya detayları olmadan proje istatistiklerini alın.

#### Parametreler

| Parametre | Tür | Zorunlu | Açıklama |
|-----------|-----|---------|----------|
| `path` | string | Hayır | Proje yolu (varsayılan: mevcut dizin) |

#### Örnek İstek

```bash
curl http://localhost:3000/api/v1/stats
curl "http://localhost:3000/api/v1/stats?path=/proje/yolu"
```

#### Yanıt

```json
{
  "totalFiles": 64,
  "totalTokens": 181480,
  "totalSize": 819200,
  "totalMethods": 0,
  "byLanguage": {
    "JavaScript": {
      "files": 64,
      "tokens": 181480,
      "size": 819200
    }
  },
  "largestFiles": [
    {
      "path": "src/server.js",
      "tokens": 12388,
      "size": 51200
    }
  ],
  "analysisTime": 150
}
```

---

### GET /api/v1/diff

Değişen dosyaları ve etkilerini görmek için git diff'i analiz edin.

#### Parametreler

| Parametre | Tür | Zorunlu | Açıklama |
|-----------|-----|---------|----------|
| `path` | string | Hayır | Proje yolu (varsayılan: mevcut dizin) |
| `since` | string | Hayır | Git referansı (branch, tag veya commit) |

#### Örnek İstek

```bash
# Commit edilmemiş değişiklikleri analiz et
curl http://localhost:3000/api/v1/diff

# Bir branch'ten sonraki değişiklikleri analiz et
curl "http://localhost:3000/api/v1/diff?since=main"

# Bir commit'ten sonraki değişiklikleri analiz et
curl "http://localhost:3000/api/v1/diff?since=HEAD~5"

# Bir tag'den sonraki değişiklikleri analiz et
curl "http://localhost:3000/api/v1/diff?since=v2.0.0"
```

#### Yanıt

```json
{
  "changedFiles": [
    {
      "path": "src/server.js",
      "status": "modified",
      "tokens": 12388,
      "additions": 15,
      "deletions": 3
    }
  ],
  "impact": {
    "level": "medium",
    "score": 25,
    "affectedModules": ["core", "api"]
  },
  "authors": [
    {
      "name": "Ahmet Yılmaz",
      "email": "ahmet@ornek.com",
      "commits": 5
    }
  ],
  "summary": {
    "totalFiles": 3,
    "totalAdditions": 45,
    "totalDeletions": 12,
    "totalTokens": 15000
  }
}
```

---

### POST /api/v1/context

Parametrelere göre optimize edilmiş LLM bağlamı oluşturun.

#### İstek Gövdesi

| Parametre | Tür | Zorunlu | Açıklama |
|-----------|-----|---------|----------|
| `path` | string | Hayır | Proje yolu (varsayılan: mevcut dizin) |
| `methodLevel` | boolean | Hayır | Method seviyesi analizini dahil et |
| `targetModel` | string | Hayır | Hedef LLM modeli (örn. "claude-sonnet-4.5") |
| `targetTokens` | number | Hayır | Hedef token bütçesi |
| `useCase` | string | Hayır | Kullanım durumu şablonu (bug-fix, feature, code-review, vb.) |

#### Örnek İstek

```bash
curl -X POST http://localhost:3000/api/v1/context \
  -H "Content-Type: application/json" \
  -d '{
    "path": "/proje/yolu",
    "methodLevel": true,
    "targetModel": "claude-sonnet-4.5",
    "targetTokens": 50000
  }'
```

#### Yanıt

```json
{
  "context": {
    "project": {
      "root": "my-project",
      "totalFiles": 64,
      "totalTokens": 181480
    },
    "paths": {
      "src/core/": ["server.js", "handler.js"],
      "src/utils/": ["helper.js", "validator.js"]
    },
    "methods": {
      "src/server.js": [
        {
          "name": "handleRequest",
          "line": 15,
          "tokens": 234
        }
      ]
    }
  },
  "metadata": {
    "targetModel": "claude-sonnet-4.5",
    "contextWindow": 200000,
    "fitStatus": "fits",
    "recommendedFormat": "toon"
  }
}
```

---

### GET /api/v1/docs

JSON formatında API dokümantasyonunu alın.

#### Örnek İstek

```bash
curl http://localhost:3000/api/v1/docs
```

#### Yanıt

```json
{
  "version": "v1",
  "endpoints": [
    {
      "path": "/api/v1/analyze",
      "method": "GET",
      "description": "Proje dosyalarını analiz et ve token sayılarını al",
      "parameters": {
        "path": "Proje yolu (isteğe bağlı, varsayılan: cwd)",
        "methods": "Method seviyesi analizini dahil et (true/false)"
      }
    }
  ]
}
```

## Hata Yönetimi

### Hata Yanıtı Formatı

Tüm hatalar tutarlı bir JSON yapısı döndürür:

```json
{
  "error": "Neyin yanlış gittiğini açıklayan hata mesajı",
  "statusCode": 400
}
```

### HTTP Durum Kodları

| Kod | Açıklama |
|-----|----------|
| 200 | Başarılı |
| 400 | Kötü İstek (eksik parametreler, geçersiz girdi) |
| 401 | Yetkisiz (geçersiz veya eksik auth token) |
| 404 | Bulunamadı (uç nokta veya kaynak bulunamadı) |
| 500 | İç Sunucu Hatası |

### Yaygın Hatalar

#### Eksik Parametre

```json
{
  "error": "Missing \"file\" parameter",
  "statusCode": 400
}
```

#### Yetkisiz

```json
{
  "error": "Unauthorized",
  "statusCode": 401
}
```

#### Bulunamadı

```json
{
  "error": "Endpoint not found",
  "statusCode": 404
}
```

## Örnekler

### Tam Analiz İş Akışı

```bash
# 1. Sunucuyu başlat
ctxman serve --port 3000 &

# 2. Projeyi analiz et
curl http://localhost:3000/api/v1/analyze > analysis.json

# 3. İstatistikleri al
curl http://localhost:3000/api/v1/stats > stats.json

# 4. Git değişikliklerini kontrol et
curl "http://localhost:3000/api/v1/diff?since=main" > diff.json

# 5. Claude için bağlam oluştur
curl -X POST http://localhost:3000/api/v1/context \
  -H "Content-Type: application/json" \
  -d '{"targetModel": "claude-sonnet-4.5"}' > context.json
```

### CI/CD Entegrasyonu

```bash
#!/bin/bash
# ci-check.sh

# Sunucuyu arka planda başlat
ctxman serve --port 3000 &
SERVER_PID=$!

# Sunucunun başlamasını bekle
sleep 2

# İstatistikleri al
STATS=$(curl -s http://localhost:3000/api/v1/stats)
TOTAL_TOKENS=$(echo $STATS | jq '.totalTokens')

# Token bütçesini kontrol et
if [ $TOTAL_TOKENS -gt 100000 ]; then
  echo "⚠️ Uyarı: Proje 100k token'ı aşıyor"
  exit 1
fi

# Temizlik
kill $SERVER_PID
```

### JavaScript Entegrasyonu

```javascript
const API_BASE = 'http://localhost:3000/api/v1';

async function analyzeProject(projectPath) {
  const response = await fetch(
    `${API_BASE}/analyze?path=${encodeURIComponent(projectPath)}`
  );
  
  if (!response.ok) {
    throw new Error(`API hatası: ${response.status}`);
  }
  
  return response.json();
}

async function generateContext(options) {
  const response = await fetch(`${API_BASE}/context`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options)
  });
  
  return response.json();
}

// Kullanım
const analysis = await analyzeProject('/proje/yolu');
const context = await generateContext({
  targetModel: 'claude-sonnet-4.5',
  methodLevel: true
});
```

## CORS

CORS varsayılan olarak etkindir. Aşağıdaki başlıklar ayarlanır:

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization
```

## Rate Limiting

API varsayılan olarak rate limiting uygulamaz. Üretim kullanımı için şunları düşünün:

1. Ters proxy (nginx, Apache) arkasında çalıştırma
2. `--auth-token` seçeneğini kullanma
3. Altyapı seviyesinde rate limiting uygulama

## WebSocket Desteği

Gerçek zamanlı güncellemeler için WebSocket desteği gelecekteki bir sürüm için planlanmaktadır. Şu an, gerçek zamanlı analiz için polling veya watch modu CLI kullanın.

---

*API Sürümü: v1 | Ctxman Sürümü: 3.0.0*

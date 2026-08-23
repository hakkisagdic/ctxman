# İnteraktif Demo

Ctxman'ı doğrudan tarayıcınızda deneyin! Bu interaktif demo, herhangi bir şey yüklemeden Ctxman'ın temel özelliklerini deneyimlemenizi sağlar.

<InteractiveDemo />

## Nasıl Çalışır

1. **Dil Seçin**: JavaScript, TypeScript, Python veya Rust arasından seçim yapın
2. **Örnek Kodu Görüntüleyin**: Seçilen dilde örnek kodu görün
3. **Analizi Çalıştırın**: Ctxman'ın kodu nasıl işlediğini görmek için "Analizi Çalıştır" düğmesine tıklayın
4. **Sonuçları Görüntüleyin**: Token sayısını, yöntem analizini ve özeti görün

## Canlı Özellikler

### Token Analizi

Ctxman, tiktoken (GPT-4 uyumlu) kullanarak kesin token sayılarını hesaplar:

- **Doğru Sayılar**: Tahmin yok, gerçek token sayıları
- **Dosya Başı Döküm**: Her dosya için token'ları görün
- **Yöntem Düzeyi**: Bireysel fonksiyonlara inin

### Yöntem Tespiti

Ctxman'ın bireysel yöntemleri nasıl tanımladığını ve analiz ettiğini görün:

- **Fonksiyon İsimleri**: Yöntem isimlerini çıkarır
- **Yöntem Başı Token**: Her yöntem için token sayısı
- **Karmaşıklık İçgörüleri**: Kod yapısını anlayın

### Çoklu Dil Desteği

Ctxman, tam AST analizi ile 14+ programlama dilini destekler:

- JavaScript / TypeScript
- Python
- PHP
- Ruby
- Java / Kotlin
- C# / Go / Rust
- Swift / C / C++
- Scala

## Kendiniz Deneyin

### Ctxman'ı Yükleyin

```bash
npm install -g ctxman
```

### Analiz Çalıştırın

```bash
# Projenize gidin
cd projeniz

# Ctxman'ı çalıştırın
ctxman
```

### CLI Modu

Sihirbaz olmadan hızlı analiz için:

```bash
ctxman --cli --method-level
```

### İzleme Modu

Gerçek zamanlı analiz için:

```bash
ctxman watch
```

### API Sunucusu

Programatik erişim için:

```bash
ctxman serve
```

## Örnek Çıktılar

### TOON Formatı

LLM optimizasyonu için %40-50 token azaltma:

````markdown
# src/index.js

## Fonksiyonlar

### calculateSum(arr)

```javascript
return arr.reduce((sum, num) => sum + num, 0);
```
````

Token: 45

### main()

```javascript
const numbers = [1, 2, 3, 4, 5];
console.log(calculateSum(numbers));
```

Token: 32

`````

### GitIngest Formatı

Sözdizimi vurgulama ile GitHub hazır markdown:

````markdown
# Proje Analizi

## Dosya Ağacı

`````

src/
├── index.js
├── utils.js
└── parser.js

````

## Dosyalar

### src/index.js

```javascript
// Örnek JavaScript kodu
function calculateSum(arr) {
  return arr.reduce((sum, num) => sum + num, 0);
}
````

````

### JSON Formatı

Otomasyon için makine tarafından okunabilir:

```json
{
  "totalTokens": 245,
  "totalFiles": 1,
  "files": [
    {
      "path": "example.js",
      "tokens": 245,
      "lines": 8,
      "methods": [
        {
          "name": "calculateSum",
          "tokens": 45
        }
      ]
    }
  ]
}
```

## Sırada Ne Var?

Ctxman'ı projelerinizde kullanmaya hazır mısınız?

1. **[Başlangıç](/tr/getting-started)** - Tam kurulum rehberi
2. **[Özellikler](/tr/features)** - Tüm yetenekleri keşfedin
3. **[API Referansı](/tr/api-reference)** - Tam dokümantasyon
4. **[GitHub](https://github.com/hakkisagdic/ctxman)** - Kaynak kodu ve sorunlar

<script setup>
import InteractiveDemo from '../.vitepress/components/InteractiveDemo.vue'
</script>
````

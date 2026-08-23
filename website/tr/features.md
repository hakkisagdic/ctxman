# Özellikler

Ctxman, modern geliştirme iş akışları için tasarlanmış kapsamlı özelliklere sahip güçlü bir AI Geliştirme Platformudur.

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
# Son commit'teki değişen dosyaları analiz et
ctxman --git-diff HEAD~1

# Belirli bir branch'taki değişen dosyaları analiz et
ctxman --git-branch feature/new-feature
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
ctxman watch --interval 1000 --output json
```

### REST API

Programatik erişim için HTTP sunucusu:

- **6 Uç Nokta**: Tam API kapsamı
- **JSON Yanıtlar**: Standart REST formatı
- **CORS Desteği**: Çapraz kaynak istekleri
- **Sağlık Kontrolü**: Sunucu durumunu izleyin

```bash
# API sunucusunu başlat
ctxman serve

# API http://localhost:3000 adresinde kullanılabilir
curl http://localhost:3000/api/analyze
```

## 🎨 Kullanıcı Arayüzü

### İnteraktif Sihirbaz Modu

Yeni başlayanlar için kullanıcı dostu rehberli kurulum:

- **Adım Adım Süreç**: Seçeneklerde net rehberlik
- **Akıllı Varsayılanlar**: Mantıklı varsayılan değerler
- **Girdi Doğrulama**: Hataları erken yakalayın
- **Yardım Metni**: Her adımda bağlamsal yardım

### CLI Modu

İleri düzey kullanıcılar için geleneksel komut satırı arayüzü:

- **Doğrudan Komutlar**: Sihirbazı atlayın
- **Shell Entegrasyonu**: Betikler için mükemmel
- **Çıkış Kodları**: Uygun hata işleme
- **Boru Desteği**: Diğer araçlarla zincirleme

## 🔢 Token Analizi

### Kesin Token Sayımı

LLM planlaması için doğru token sayımı:

- **tiktoken Entegrasyonu**: GPT-4 uyumlu
- **Çoklu Model**: Çeşitli LLM tokenizer'ları için destek
- **Kesin Sayılar**: Tahmin yok, gerçek token sayıları
- **Dosya Başı Analiz**: Ayrıntılı döküm

### Çoklu Dil Desteği

14+ programlama dilinde kod analizi:

| Dil        | Uzantılar       | Özellikler                  |
| ---------- | --------------- | --------------------------- |
| JavaScript | .js, .jsx, .mjs | Tam AST analizi             |
| TypeScript | .ts, .tsx       | Tip farkındalıklı analiz    |
| Python     | .py             | Yöntem düzeyinde analiz     |
| PHP        | .php            | Sınıf ve fonksiyon analizi  |
| Ruby       | .rb             | Modül ve yöntem analizi     |
| Java       | .java           | Sınıf ve yöntem analizi     |
| Kotlin     | .kt             | Fonksiyon analizi           |
| C#         | .cs             | Sınıf ve yöntem analizi     |
| Go         | .go             | Fonksiyon analizi           |
| Rust       | .rs             | Fonksiyon ve struct analizi |
| Swift      | .swift          | Fonksiyon analizi           |
| C/C++      | .c, .cpp, .h    | Fonksiyon analizi           |
| Scala      | .scala          | Sınıf ve fonksiyon analizi  |

### Yöntem Düzeyinde Analiz

Kodunuz hakkında ayrıntılı içgörüler:

- **Fonksiyon Başı Token**: Her fonksiyon için token sayısı
- **Karmaşıklık Metrikleri**: Kod karmaşıklığını anlayın
- **En Büyük Fonksiyonlar**: Token yoğun kodu belirleyin
- **Optimizasyon İpuçları**: Azaltma için öneriler

## 🎯 Filtreleme ve Yapılandırma

### Çift Yoksayma Sistemi

Esnek dosya filtreleme:

- **.gitignore Desteği**: Git yoksayma kurallarına saygı
- **.contextignore**: Özel yoksayma kalıpları
- **.contextinclude**: Sadece dahil etme modu
- **Öncelik Sistemi**: Net öncelik kuralları

### Yöntem Filtreleme

Analiz üzerinde ayrıntılı kontrol:

- **.methodinclude**: Belirli yöntemleri dahil et
- **.methodignore**: Belirli yöntemleri hariç tut
- **Kalıp Eşleştirme**: Joker karakterler ve regex desteği
- **Performans**: Gereksiz analizi atlayın

## 📊 Çıktı Formatları

### TOON Formatı

Optimize edilmiş çıktı ile %40-50 token azaltma:

- **Sıkı Yapı**: Azaltılmış fazlalık
- **Anlamsal Koruma**: Anlamı bozulmadan koruyun
- **LLM Optimize**: AI tüketimi için mükemmel
- **Geriye Uyumlu**: Geri dönüştürmek kolay

### GitIngest Formatı

GitHub hazır çıktı formatı:

- **Markdown Uyumlu**: GitHub ile çalışır
- **Sözdizimi Vurgulama**: Uygun kod blokları
- **Dosya Ağaçları**: Görsel dizin yapısı
- **Satır Numaraları**: Belirli satırlara referans

### Standart Formatlar

Çoklu çıktı seçenekleri:

- **JSON**: Makine tarafından okunabilir
- **Markdown**: Dokümantasyona hazır
- **Düz Metin**: Basit ve temiz
- **Özel**: Eklentilerle kendi formatınızı oluşturun

## ⚡ Performans

### Önbellek Sistemi

Tekrarlanan analizleri hızlandırın:

- **Akıllı Önbellek**: Sadece değişen dosyaları yeniden analiz et
- **Yapılandırılabilir TTL**: Önbellek sona erme ayarla
- **Önbellek Geçersiz Kılma**: Manuel veya otomatik
- **Bellek Verimli**: Düşük ek yük

### Paralel İşleme

Büyük kod tabanlarını verimli yönetin:

- **Çok Çekirdek Kullanımı**: Tüm kullanılabilir çekirdekleri kullan
- **Toplu İşleme**: Verimlilik için dosyaları grupla
- **İlerleme Raporlama**: Analiz ilerlemesini izle
- **5-10 Kat Daha Hızlı**: Önemli hız iyileştirmeleri

## 🔧 Yapılandırma

### Esnek Yapılandırma

Çoklu yapılandırma seçenekleri:

- **JSON Yapılandırması**: Yapılandırılmış yapılandırma
- **CLI Bayrakları**: Hızlı geçersiz kılmalar
- **Ortam Değişkenleri**: CI/CD entegrasyonu
- **Varsayılanlar**: Kutudan çıktığı gibi mantıklı davranış

### Örnek Yapılandırma

```json
{
  "output": {
    "format": "toon",
    "file": "output.md"
  },
  "analysis": {
    "methodLevel": true,
    "tokenCount": true
  },
  "exclude": ["node_modules", "dist", "*.test.js"]
}
```

## 🔐 Güvenlik

### Varsayılan Olarak Güvenli

Güvenlik öncelikli yaklaşım:

- **Dış Çağrı Yok**: Tüm işleme yerel
- **Dosya Doğrulama**: Güvenli dosya işleme
- **Bellek Sınırları**: Kaynak tükenmesini önle
- **Girdi Temizleme**: Tüm girdileri temizle

---

Başlamaya hazır mısınız? [Başlangıç Rehberi](/tr/getting-started)'ni inceleyin veya [İnteraktif Demo](/tr/demo)'yu deneyin.

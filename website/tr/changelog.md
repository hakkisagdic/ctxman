# Değişiklik Günlüğü

Ctxman'daki tüm önemli değişiklikler bu sayfada belgelenmiştir.

Format [Keep a Changelog](https://keepachangelog.com/tr/1.0.0/) tabanlıdır,
ve bu proje [Semantic Versioning](https://semver.org/spec/v2.0.0.html) takip eder.

Tam değişiklik günlüğü için GitHub'da [CHANGELOG.md](https://github.com/hakkisagdic/ctxman/blob/main/CHANGELOG.md) dosyasına bakın.

## [3.0.0] - 2024-08-20

### Eklendi

- **Plugin Mimarisi**: Diller ve dışa aktarıcılar için modüler, genişletilebilir sistem
- **Git Entegrasyonu**: Değişen dosyaları analiz et, diff analizi, yazar takibi
- **İzleme Modu**: Gerçek zamanlı dosya izleme ve otomatik analiz
- **REST API**: Programatik erişim için 6 uç noktalı HTTP sunucusu
- **Önbellek Sistemi**: 5-10 kat daha hızlı tekrarlanan analizler için akıllı önbellek
- **Paralel İşleme**: Büyük kod tabanları için çok çekirdek kullanımı
- **TOON Formatı**: LLM optimizasyonu için %40-50 token azaltma
- **İnteraktif Sihirbaz**: Kullanıcı dostu rehberli kurulum (varsayılan mod)
- **TypeScript Tanımları**: Programatik API için tam tip desteği

### Değişti

- Modüler mimari ile tam yeniden yazım
- Önbellekleme ve paralel işleme ile iyileştirilmiş performans
- Geliştirilmiş hata işleme ve kullanıcı geri bildirimi
- Daha iyi dokümantasyon ve örnekler

### Düzeltildi

- Büyük dosyalarda bellek kullanımı sorunları
- Çok baytlı karakterler için token sayma doğruluğu
- Ağ sürücülerinde dosya izleme güvenilirliği

## [2.3.7] - 2024-07-15

### Eklendi

- LLM optimizasyon özellikleri
- Token bütçeleme araçları
- Bağlam penceresi yönetimi

### Değişti

- Token sayma doğruluğu iyileştirildi
- Daha iyi hata mesajları

## [2.3.0] - 2024-06-01

### Eklendi

- Yöntem düzeyinde token analizi
- GitIngest format desteği
- Çoklu çıktı formatları

### Değişti

- Çekirdek analiz motoru yeniden düzenlendi
- Performans iyileştirildi

## [2.0.0] - 2024-04-01

### Eklendi

- Çoklu dil desteği (14+ dil)
- AST tabanlı analiz
- Kesin token sayımı için tiktoken entegrasyonu

### Değişti

- Büyük mimari yeniden tasarım
- Yıkıcı API değişiklikleri

## [1.0.0] - 2024-01-01

### Eklendi

- İlk sürüm
- Temel token sayımı
- Dosya analizi
- Markdown çıktı

---

## Sürüm Geçmişi

| Sürüm | Tarih      | Öne Çıkanlar                                             |
| ----- | ---------- | -------------------------------------------------------- |
| 3.0.0 | 2024-08-20 | Plugin mimarisi, Git entegrasyonu, REST API, İzleme modu |
| 2.3.7 | 2024-07-15 | LLM optimizasyonu, token bütçeleme                       |
| 2.3.0 | 2024-06-01 | Yöntem düzeyinde analiz, GitIngest formatı               |
| 2.0.0 | 2024-04-01 | Çoklu dil desteği, AST analizi                           |
| 1.0.0 | 2024-01-01 | İlk sürüm                                                |

## Yükseltme

### 2.x'ten 3.0'a

Sürüm 3.0 yıkıcı değişiklikler içerir:

1. **CLI Değişiklikleri**: Sihirbaz modu artık varsayılan. İnteraktif olmayan mod için `--cli` kullanın
2. **API Değişiklikleri**: Programatik API yeniden tasarlandı
3. **Yapılandırma**: Bazı yapılandırma seçenekleri değişti

Geçiş rehberi yakında.

## Yol Haritası

### Yaklaşan Özellikler

- **Plugin Marketi**: Eklentileri keşfedin ve paylaşın
- **Bulut Senkronizasyon**: Yapılandırmaları cihazlar arasında senkronize edin
- **Takım Özellikleri**: Paylaşılan yapılandırmalar ve analiz
- **VS Code Eklentisi**: Native IDE entegrasyonu
- **Performans Paneli**: Görsel performans metrikleri

### Katkıda Bulunma

Katkılarınızı bekliyoruz! Başlamak için [Katkı Rehberi](https://github.com/hakkisagdic/ctxman/blob/main/CONTRIBUTING-tr.md)'ne bakın.

### Destek

- **Dokümantasyon**: [Başlangıç](/tr/getting-started)
- **Sorunlar**: [GitHub Issues](https://github.com/hakkisagdic/ctxman/issues)
- **Tartışmalar**: [GitHub Discussions](https://github.com/hakkisagdic/ctxman/discussions)

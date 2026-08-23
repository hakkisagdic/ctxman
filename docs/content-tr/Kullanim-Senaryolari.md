# Kullanım Senaryoları

<cite>
**Bu Dokümanda Referans Verilen Dosyalar**
- [README.md](file://README.md)
- [ctxman.js](file://ctxman.js)
- [index.js](file://index.js)
- [bin/cli.js](file://bin/cli.js)
</cite>

## İçindekiler

1. [LLM Context Optimizasyonu](#llm-context-optimizasyonu)
2. [Kod Tabanı Analizi](#kod-tabanı-analizi)
3. [CI/CD Entegrasyonu](#cicd-entegrasyonu)
4. [Yaygın Zorluklar ve Çözümler](#yaygın-zorluklar-ve-çözümler)
5. [En İyi Uygulamalar ve Performans Değerlendirmeleri](#en-iyi-uygulamalar-ve-performans-değerlendirmeleri)

## LLM Context Optimizasyonu

ctxman aracı, odaklanmış context dosyaları oluşturarak ve gerekli olmayan kodu filtreleyerek AI asistanları için token bütçelerinin verimli yönetimini sağlar. İki temel operasyon modunu destekler: EXCLUDE modu (`.contextignore` aracılığıyla) ve INCLUDE modu (`.contextinclude` aracılığıyla), ikincisi öncelik alır. Bu ikili filtreleme sistemi, hangi dosyaların analize dahil edileceği üzerinde kesin kontrol sağlar ve geliştiricilerin yalnızca temel uygulama mantığına odaklanmalarına izin verir.

LLM context export'u için araç iki format sağlar: ultra-compact format (~2.3k karakter) ve detailed format (~8.6k karakter). Compact format, programatik işleme ve AI tüketimi için ideal yapılandırılmış JSON çıktısı oluştururken, detailed format dosya kategorileri ve önem skorları gibi ek metadata içerir. `--context-clipboard` veya `--context-export` seçenekleri kullanıldığında, araç token sayıları olmadan temiz bir dizin yapısı çıktısı verir, sık AI etkileşimleri için uygundur.

Method seviyesinde filtreleme, `.methodinclude` ve `.methodignore` konfigürasyon dosyaları aracılığıyla context optimizasyonunu daha da geliştirir. Bunlar, geliştiricilerin adlandırma desenlerine dayalı olarak belirli methodları dahil etmesine veya hariç tutmasına izin vererek son derece hedeflenmiş analizi mümkün kılar. Örneğin, `.methodinclude`'da `*Handler`, `*Validator` veya `TokenCalculator.*` belirtmek context'i kritik iş mantığı bileşenlerine odaklar.

**Bölüm kaynakları**

- [README.md](file://README.md#L1-L891)
- [ctxman.js](file://ctxman.js#L1-L865)

## Kod Tabanı Analizi

ctxman aracı, kod tabanı genelinde token dağılımı hakkında kapsamlı içgörüler sağlar, büyük dosya ve methodları tanımlar ve karmaşıklığı zaman içinde izler. tiktoken aracılığıyla kesin token sayımı kullanarak (GPT-4 uyumlu), optimal kod sağlığını korumaya yardımcı olan doğru metrikler sunar. tiktoken yokluğunda, araç ~%95 doğrulukla akıllı tahmine geri döner.

Temel analitik özellikler şunları içerir:

- **Dosya türüne göre token dağılımı**: Uzantı başına tokenlerin detaylı dökümü
- **En büyük dosyaların tanımlanması**: Token sayısına göre sıralanmış ilk 5 en büyük dosya
- **Dizin seviyesinde istatistikler**: Üst düzey dizinlere göre toplanmış token kullanımı
- **Method seviyesinde analiz**: JavaScript/TypeScript dosyalarından bireysel methodların çıkarılması ve analizi

Araç, analiz edilen toplam dosyaları, toplam tokenleri, dosya başına ortalama tokenleri ve `.gitignore` veya calculator kuralları nedeniyle göz ardı edilen dosyaları gösteren detaylı bir rapor oluşturur. Bu bilgi, proje karmaşıklığını anlamak ve potansiyel refactoring fırsatlarını belirlemek için kritiktir. `--save-report` seçeneği bu verileri `token-analysis-report.json`'a export eder, geçmiş izleme ve trend analizini mümkün kılar.

**Bölüm kaynakları**

- [README.md](file://README.md#L1-L891)
- [ctxman.js](file://ctxman.js#L1-L865)

## CI/CD Entegrasyonu

ctxman aracı, otomatik kod boyutu izleme, kalite kapıları ve dokümantasyon oluşturma için CI/CD pipeline'larına sorunsuzca entegre edilebilir. Komut satırı arayüzü, interactive olmayan yürütmeyi destekler, pre-commit hook'larında, günlük izleme scriptlerinde ve sürekli entegrasyon iş akışlarında kullanım için uygundur.

Yaygın entegrasyon desenleri şunları içerir:

- **Pre-commit hook'ları**: AI incelemesi için yalnızca gerekli kodun dikkate alındığından emin olmak için commit'lerden önce `ctxman --context-clipboard` çalıştırma
- **Günlük izleme scriptleri**: Trend takibi için günlük analiz raporları oluşturmak üzere `ctxman --save-report` çalıştırma
- **Kalite kapıları**: Scriptable çıktı kullanarak pipeline'larda token bütçesi kontrollerini uygulama (örneğin, maksimum token limitlerini uygulamak için JSON çıktısını parse etme)
- **Otomatik dokümantasyon**: Mevcut kod tabanı yapısını yansıtan güncel context dosyaları oluşturma

Interactive export seçimi özelliği, kullanıcılardan detaylı JSON raporu kaydetme, LLM context dosyası oluşturma, context'i panoya kopyalama veya export'u atlama arasında seçim yapmalarını ister—farklı kullanım senaryolarında esneklik sağlar.

**Bölüm kaynakları**

- [README.md](file://README.md#L1-L891)
- [bin/cli.js](file://bin/cli.js#L1-L67)

## Yaygın Zorluklar ve Çözümler

ctxman aracını kullanırken, özellikle konfigürasyon ve filtreleme davranışı etrafında birkaç yaygın zorluk ortaya çıkar:

**Include vs Exclude Mod Karışıklığı**: `.contextinclude`'ın varlığı `.contextignore` üzerinde öncelik alır. Beklenmeyen dosyalar dahil ediliyorsa veya hariç tutuluyorsa, hangi konfigürasyon dosyasının mevcut olduğunu doğrulayın ve istenmeyen olanı kaldırın.

**Desen Eşleştirme Sorunları**: Desen dosyalarında satır içi yorumların bulunmadığından emin olun, çünkü bunlar parse etmeyi engelleyebilir. Doğru glob desenlerini kullanın (`docs/` yerine `docs/**`) ve verbose mod ile konfigürasyonları test ederek dahil etme/hariç tutma nedenlerini görün.

**Token Sayımı Tutarsızlıkları**: Token sayıları çok yüksek veya düşük görünüyorsa, önemli dosyaların `.gitignore` veya calculator kuralları tarafından hariç tutulup tutulmadığını kontrol edin. Hangi dosyaların işlendiğini incelemek için `--verbose` kullanın.

**Eksik Beklenen Dosyalar**: Dosyalar `.gitignore` kuralları (her zaman saygı gösterilir) veya yanlış desen sözdizimi nedeniyle hariç tutulabilir. Dosyaların metin dosyaları olarak tanındığını doğrulayın ve hariç tutma nedenlerini belirlemek için verbose modunu kullanın.

**Pano Fonksiyonelliği Başarısızlıkları**: Linux sistemlerinde, pano işlemleri için `xclip` veya `xsel`'in yüklü olduğundan emin olun. Araç, biri başarısız olursa otomatik olarak her iki yardımcı programı dener.

**Bölüm kaynakları**

- [README.md](file://README.md#L1-L891)
- [ctxman.js](file://ctxman.js#L1-L865)

## En İyi Uygulamalar ve Performans Değerlendirmeleri

ctxman aracını kullanırken verimliliği maksimize etmek için şu en iyi uygulamaları izleyin:

**Konfigürasyon Yönetimi**: Özellikle büyük repolarda analiz kapsamı üzerinde kesin kontrol için `.contextinclude` kullanın. Desenleri basit tutun ve bunları aşamalı olarak test edin.

**Performans Optimizasyonu**: Araç performans için optimize edilmiştir, ancak çok büyük kod tabanlarını analiz etmek, işleme yükünü azaltmak için method seviyesinde filtrelemeden faydalanabilir. Method seviyesinde analizi yalnızca gerekli olduğunda etkinleştirin.

**Kesin Token Sayımı**: GPT-4 uyumlu kesin token sayımı için `tiktoken` paketini yükleyin (`npm install tiktoken`). Onsuz, araç ~%95 doğrulukla tahmin kullanır.

**Düzenli İzleme**: Kod tabanı büyümesi ve karmaşıklık eğilimleri hakkında farkındalığı sürdürmek için aracı pre-commit hook'ları veya planlı scriptler aracılığıyla düzenli geliştirme iş akışlarına entegre edin.

**Çıktı Kullanımı**: Hem compact hem de detailed çıktı formatlarını uygun şekilde kullanın—AI etkileşimleri için compact JSON ve mimari planlama ve adaptasyon için detailed raporları kullanın.

**Method Seviyesinde Filtreleme**: Hata ayıklama veya kod incelemeleri sırasında temel iş mantığına odaklanmak, bilişsel yükü azaltmak ve analiz alaka düzeyini artırmak için `.methodinclude` ve `.methodignore` dosyalarını kullanın.

**Bölüm kaynakları**

- [README.md](file://README.md#L1-L891)
- [ctxman.js](file://ctxman.js#L1-L865)

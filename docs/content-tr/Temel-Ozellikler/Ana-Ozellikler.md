# Temel Özellikler

<cite>
**Bu Belgedeki Referans Dosyalar**
- [ctxman.js](file://ctxman.js) - *Son commit'te güncellendi*
- [README.md](file://README.md) - *Son commit'te güncellendi*
- [index.js](file://index.js)
- [lib/formatters/gitingest-formatter.js](file://lib/formatters/gitingest-formatter.js) - *Son commit'te eklendi*
</cite>

## İçindekiler

1. [Dosya Seviyesi Analiz](#dosya-seviyesi-analiz)
2. [Method Seviyesi Analiz](#method-seviyesi-analiz)
3. [Token Sayma](#token-sayma)
4. [Özellik Entegrasyonu](#özellik-entegrasyonu)
5. [Yaygın Sorunlar ve Performans](#yaygın-sorunlar-ve-performans)

## Dosya Seviyesi Analiz

ctxman aracı, hangi dosyaların token hesaplama sürecine dahil edilmesi gerektiğini belirlemek için birden fazla filtreleme mekanizmasını birleştiren kapsamlı bir dosya seviyesi analiz sistemi uygular. Araç, proje kökünden başlayarak tüm dizin yapısını tarayarak, hariç tutma kurallarına saygı göstererek özyinelemeli olarak dizinleri gezer.

Dosya tarama işlemi, `TokenCalculator` sınıfının `scanDirectory` methodunda gerçekleştirilir ve projedeki her dosya ve dizini inceler. Bu işlem sırasında araç, hem `.gitignore` kalıplarına hem de özel yapılandırma dosyalarına saygı gösteren hiyerarşik bir filtreleme sistemi uygular. Dosyalar, yalnızca tüm filtreleme kriterlerinden geçerlerse ve `isTextFile` methodu aracılığıyla metin dosyaları olarak tanımlanırlarsa analize dahil edilir. Bu method, dosya uzantılarını ve temel adlarını önceden tanımlanmış metin tabanlı formatlar listesine karşı kontrol eder.

Filtreleme sistemi, yapılandırma dosyalarını belirli bir sırayla önceliklendirir: `.gitignore` kurallarına her zaman saygı gösterilir, ardından `.contextinclude` gelir (INCLUDE modunda önceliğe sahiptir) ve sonra `.contextignore` gelir (include dosyası olmadığında EXCLUDE modunda kullanılır). Bu çok katmanlı yaklaşım, geliştiricilerin hangi dosyaların analiz edileceğini hassas bir şekilde kontrol etmelerini sağlayarak, dokümantasyon, yapılandırma ve test dosyalarını hariç tutarken temel uygulama mantığının odaklanmış incelemesine olanak tanır.

**Bölüm kaynakları**

- [ctxman.js](file://ctxman.js#L376-L406)
- [ctxman.js](file://ctxman.js#L288-L315)
- [README.md](file://README.md#L294-L356)

## Method Seviyesi Analiz

ctxman aracı, JavaScript ve TypeScript dosyalarında kod dosyalarındaki bireysel functionların granüler incelemesini sağlayan sofistike method seviyesi analiz yetenekleri sunar. Bu özellik, yapılandırılabilir kurallara göre methodları çıkarmak ve filtrelemek için birlikte çalışan `MethodAnalyzer` ve `MethodFilterParser` sınıfları aracılığıyla gerçekleştirilir.

`MethodAnalyzer` sınıfı, geleneksel function bildirimleri, object method sözdizimi, arrow functionlar ve async functionlar dahil olmak üzere çeşitli JavaScript function kalıplarını tanımlamak için bir dizi regular expression kullanır. `--method-level` flag'i aracılığıyla method seviyesi analiz etkinleştirildiğinde, araç uygun kod dosyalarından tüm methodları çıkarır ve method adı ve satır numarası gibi metadata'yı yakalar. `extractMethodContent` methodu daha sonra bireysel token sayımı için tam method gövdesini izole eder.

Method filtreleme, `.methodinclude` ve `.methodignore` yapılandırma dosyaları tarafından kontrol edilir ve geliştiricilerin pattern matching kullanarak belirli methodları dahil etmelerine veya hariç tutmalarına olanak tanır. `MethodFilterParser` sınıfı bu dosyaları işler ve glob kalıplarını verimli eşleştirme için regular expressionlara dönüştürür. Bir include dosyası mevcut olduğunda, yalnızca belirtilen kalıplarla eşleşen methodlar dahil edilir; aksi takdirde araç, ignore dosyasındaki kalıplarla eşleşen methodları hariç tutar. Bu sistem, tam eşleşmeler, wildcardlar, sınıfa özgü methodlar (`Class.*` sözdizimini kullanarak) ve dosyaya özgü methodlar (`file.method` sözdizimini kullanarak) dahil olmak üzere çeşitli pattern türlerini destekler.

**Bölüm kaynakları**

- [ctxman.js](file://ctxman.js#L14-L67)
- [ctxman.js](file://ctxman.js#L69-L109)
- [ctxman.js](file://ctxman.js#L357-L377)
- [README.md](file://README.md#L544-L610)

## Token Sayma

ctxman aracı, güvenilir bir yedek mekanizma sağlarken doğruluğa öncelik veren ikili bir token sayma yaklaşımı kullanır. Birincil method, GPT-4 uyumlu tam token sayımları sağlamak için `tiktoken` kütüphanesini kullanır; bu, bir LLM'nin context window'una ne kadar kodun sığabileceğini doğru bir şekilde tahmin etmek için önemlidir. `tiktoken` paketi yüklendiğinde, araç metni kodlamak ve tokenleri hassas bir şekilde saymak için `cl100k_base` encoding'ini (GPT-4, ChatGPT-4 ve text-embedding-ada-002 tarafından kullanılır) kullanır.

Token sayma işlemi, `TokenCalculator` sınıfının `calculateTokens` methodunda gerçekleştirilir. Bu method önce `tiktoken` kullanmaya çalışır ve kütüphane mevcut değilse veya bir hata oluşursa tahmini hesaplamaya geçer. Tahmin mekanizması, farklı dosya türleri için farklı oranlar kullanarak karakter tabanlı bir yaklaşım kullanır, çünkü farklı dosya formatları token başına farklı ortalama karakterlere sahiptir. Örneğin, JavaScript ve TypeScript dosyaları token başına 3.2 karakter oranı kullanırken, Markdown dosyaları 4.0 ve JSON dosyaları 2.5 kullanır. Bu tahmin, tam sayıma kıyasla yaklaşık %95 doğruluk sağlar.

Araç ayrıca dosya başına, uzantı başına ve dizin başına sayımlar dahil olmak üzere birden fazla seviyede token istatistiklerini izleyerek codebase bileşimi hakkında ayrıntılı bilgiler sağlar. Method seviyesi analiz etkinleştirildiğinde, araç ayrıca bireysel methodlar için tokenleri sayarak, geliştiricilerin yeniden düzenleme gerektirebilecek özellikle büyük veya karmaşık functionları belirlemelerine olanak tanır.

**Bölüm kaynakları**

- [ctxman.js](file://ctxman.js#L253-L286)
- [ctxman.js](file://ctxman.js#L288-L315)
- [README.md](file://README.md#L356)

## Özellik Entegrasyonu

ctxman aracının temel özellikleri, dosya seviyesi analiz, method seviyesi analiz ve token sayımını uyumlu bir iş akışında entegre eden `TokenCalculator` sınıfı aracılığıyla düzenlenir. `run` methodu, dizin taramasından nihai raporlamaya kadar tüm analiz sürecini koordine eden ana giriş noktası olarak hizmet eder.

Entegrasyon, çeşitli bileşenlerin başlatılmasıyla başlar: dosya filtreleme için `GitIgnoreParser`, method çıkarma için (etkinleştirildiğinde) `MethodAnalyzer` ve `MethodFilterParser` ve token sayma sistemi. Araç daha sonra dizin yapısını tarar ve hangi dosyaların analiz edileceğini belirlemek için filtreleme kurallarını uygular. Dahil edilen her dosya için içeriği okur ve tokenleri hesaplar, `methodLevel` seçeneği etkinleştirildiğinde isteğe bağlı olarak bireysel methodları çıkarır ve analiz eder.

Sonuçlar, çeşitli ayrıntı düzeylerinde dosyaları, tokenleri, byte'ları ve satırları izleyen kapsamlı istatistiklerde toplanır. Araç, kullanım durumuna bağlı olarak farklı çıktı formatları oluşturabilir: LLM context optimizasyonu için kompakt format, istendiğinde ayrıntılı method seviyesi context veya analiz ve izleme için kapsamlı bir JSON raporu. `generateLLMContext` methodu, bir dosyaya dışa aktarılabilen veya panoya kopyalanabilen yapılandırılmış çıktı oluşturarak codebase context'ini AI asistanlarıyla paylaşmayı kolaylaştırır.

**Bölüm kaynakları**

- [ctxman.js](file://ctxman.js#L213-L251)
- [ctxman.js](file://ctxman.js#L498-L539)
- [ctxman.js](file://ctxman.js#L774-L813)

## Yaygın Sorunlar ve Performans

ctxman aracı, kod analizinde ortaya çıkan birkaç yaygın sorunu, özellikle pattern matching doğruluğu ve token sayma hassasiyeti etrafında ele alır. Yaygın sorunlardan biri, yapılandırma dosyalarında sözdizimi hataları olduğunda veya negation kalıpları (`!pattern`) düzgün anlaşılmadığında ortaya çıkabilen pattern matching hatalarıdır. Araç, bu sorunları teşhis etmeye yardımcı olmak için ayrıntılı çıktı sağlar ve hangi modun aktif olduğunu (INCLUDE veya EXCLUDE) ve her yapılandırma dosyasından kaç kuralın yüklendiğini gösterir.

Büyük codebase'ler için performans, birkaç mekanizma aracılığıyla optimize edilir. Araç, dosya içeriğini işlemeden önce filtreleme kurallarını kontrol ederek gereksiz dosya okumalarından kaçınır. Ayrıca, başlatma sırasında kalıpları bir kez derleyerek method çıkarma ve pattern matching için verimli regular expressionlar kullanır. Dizin tarama işlemi, varsayılan olarak `node_modules`, `.git` ve `dist` gibi yaygın hariç tutma dizinlerini atlayarak dosya sistemi işlemlerinin sayısını azaltır.

Yanlış token sayımları, `tiktoken` kütüphanesi yüklü olmadığında, aracı tahmini hesaplamaya güvenmeye zorladığında ortaya çıkabilir. Tahmin genellikle doğru olsa da (~%95 tam sayımlara kıyasla), kodun belirli özelliklerine bağlı olarak değişebilir. Sıkı token limitleriyle çalışan geliştiriciler, hassas sayım için `tiktoken` yüklemelidir. Araç ayrıca, token kullanımını dosya türüne ve dizine göre ayıran ayrıntılı raporlama sağlar ve genel sayımı çarpıtabilecek beklenmedik büyük dosyaları veya dizinleri belirlemeye yardımcı olur.

**Bölüm kaynakları**

- [ctxman.js](file://ctxman.js#L253-L286)
- [ctxman.js](file://ctxman.js#L376-L406)
- [README.md](file://README.md#L544-L610)

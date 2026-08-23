# Dosya Seviyesi Analiz

<cite>
**Bu Belgedeki Referans Dosyalar**
- [ctxman.js](file://ctxman.js)
</cite>

## İçindekiler

1. [Dosya Seviyesi Analiz](#dosya-seviyesi-analiz)
2. [Dizin Tarama ve Filtreleme](#dizin-tarama-ve-filtreleme)
3. [GitIgnore İşleme](#gitignore-i̇şleme)
4. [Metin Dosyası Algılama](#metin-dosyası-algılama)
5. [Dosya Filtreleme ve Token Sayma İlişkisi](#dosya-filtreleme-ve-token-sayma-i̇lişkisi)
6. [İstatistik Takibi](#i̇statistik-takibi)
7. [Yaygın Sorunlar ve Optimizasyon](#yaygın-sorunlar-ve-optimizasyon)

## Dizin Tarama ve Filtreleme

TokenCalculator sınıfı, birden fazla ignore kuralına saygı göstererek özyinelemeli dizin taraması uygular. scanDirectory methodu, belirtilen bir dizinden başlayarak dosya sistemini gezer ve hangi dosyaların analize dahil edilmesi gerektiğini belirlemek için her seviyede filtreleme mantığını uygular.

Tarama işlemi, mevcut dizindeki tüm öğeleri okuyarak ve bunları sırayla işleyerek başlar. Her öğe için sistem önce hem tam yolu hem de proje kökünden göreli yolu oluşturur. Daha sonra GitIgnoreParser instance'ının isIgnored methodunu çağırarak dosyanın veya dizinin ignore edilip edilmeyeceğini kontrol eder. Öğe ignore edilirse, istatistiklerde uygun sayacı artırır ve bir sonraki öğeye devam eder.

Ignore edilmeyen öğeler için sistem, öğenin bir dosya mı yoksa dizin mi olduğunu belirler. Dizin gezinmesi, node_modules, .git, coverage, dist ve build gibi yaygın geliştirme dizinlerini hariç tutarak belirli dizinlerle sınırlıdır. Bu, analizin gereksiz dosyaları işlemesini önler ve performansı artırır. Bir dizin hariç tutulmadığında, scanDirectory methodu o dizinin içeriğini işlemek için kendisini özyinelemeli olarak çağırır.

Ignore kontrollerinden geçen metin dosyaları, dizindeki tüm öğeler işlendikten sonra döndürülen sonuç dizisine eklenir. Bu özyinelemeli yaklaşım, dizin hiyerarşisinin her seviyesinde verimli filtrelemeyi korurken dosya sisteminin kapsamlı kapsanmasını sağlar.

**Bölüm kaynakları**

- [ctxman.js](file://ctxman.js#L385-L412)

## GitIgnore İşleme

GitIgnoreParser sınıfı, kural değerlendirmesi için öncelik tabanlı bir sistem uygulayarak birden fazla kaynaktan ignore ve include kalıplarının işlenmesini yönetir. Sınıf üç tür yapılandırma dosyasını işler: .gitignore, .contextignore ve .contextinclude, .contextinclude en yüksek önceliğe sahiptir.

Başlatma sırasında, GitIgnoreParser belirtilen yapılandırma dosyalarından kalıpları yükler. Hem .contextinclude hem de .contextignore mevcut olduğunda, include dosyası öncelik alır ve yalnızca include kalıplarıyla eşleşen dosyaların işlendiği "include-only" modunu uygular. Bu öncelik sistemi, kullanıcıların hariç tutma tabanlı filtreleme (çoğu dosyanın varsayılan olarak dahil edildiği) ile dahil etme tabanlı filtreleme (yalnızca açıkça belirtilen dosyaların dahil edildiği) arasında geçiş yapmalarına olanak tanır.

Pattern işleme, verimli eşleştirme için glob tarzı kalıpları regular expressionlara dönüştürmeyi içerir. convertToRegex methodu, dizin işaretçileri (/), negation (!), wildcardlar (*) ve özyinelemeli wildcardlar (**) dahil olmak üzere çeşitli pattern özelliklerini ele alır. Dizin kalıpları özel olarak ele alınır ve hem dizinin kendisiyle hem de içindeki tüm dosyalarla eşleşir. Negation kalıpları, daha geniş ignore kurallarına belirli istisnalara izin vererek filtreleme işlemi üzerinde ince ayarlı kontrol sağlar.

isIgnored methodu temel filtreleme mantığını uygular, önce .gitignore kurallarını kontrol eder, ardından include veya exclude modunun aktif olup olmadığına bağlı olarak calculator'a özgü kuralları uygular. Include modunda, bir dosya herhangi bir include kalıbıyla eşleşmiyorsa (negationlar hesaba katıldıktan sonra) ignore edilmiş olarak kabul edilirken, exclude modunda bir dosya herhangi bir exclude kalıbıyla eşleşirse ignore edilir. Bu iki katmanlı yaklaşım, gelişmiş filtreleme yetenekleri sağlarken mevcut .gitignore kurallarıyla uyumluluğu sağlar.

**Bölüm kaynakları**

- [ctxman.js](file://ctxman.js#L124-L229)

## Metin Dosyası Algılama

isTextFile methodu, bir dosyanın uzantısına ve temel adına göre analiz edilip edilmeyeceğini belirler. Bu filtreleme mekanizması, yalnızca metin tabanlı dosyaların token sayımı için işlenmesini sağlar, binary dosyalardan ve LLM context oluşturma için uygun olmayacak diğer metin olmayan içerikten kaçınır.

Method, metin dosyalarını tanımlamak için iki kriter kullanır: dosya uzantısı ve basename kalıpları. Uzantılar için, kaynak kod dosyaları (.js, .ts, .py, .java, vb.), markup dilleri (.html, .xml, .svg), yapılandırma formatları (.json, .yml, .toml) ve dokümantasyon formatları (.md, .txt) dahil olmak üzere yaygın metin tabanlı dosya türlerinin kapsamlı bir setini tutar. Bu uzantılara sahip dosyalar, adlarından bağımsız olarak otomatik olarak metin dosyaları olarak kabul edilir.

Uzantı tabanlı algılamaya ek olarak, method geliştirme projelerinde yaygın olarak görünen belirli basename kalıplarını kontrol eder. Bunlar, standart uzantılara sahip olmayabilecek ancak önemli metinsel içerik içeren Dockerfile, Makefile, LICENSE, README ve CHANGELOG gibi dosyaları içerir. Method, dosya adı içinde bu kalıplar için büyük/küçük harf duyarsız bir arama yapar ve readme.md, LICENSE.txt veya CHANGELOG gibi varyasyonlara izin verir.

Bu çift kriterli yaklaşım, hem geleneksel adlandırma kalıplarını hem de geliştirme iş akışlarındaki yaygın istisnaları barındıran esnek dosya algılama sağlar. Uzantı ve basename analizini birleştirerek sistem, çeşitli proje yapıları ve adlandırma kurallarında metin dosyalarını doğru bir şekilde tanımlayabilir.

**Bölüm kaynakları**

- [ctxman.js](file://ctxman.js#L306-L321)

## Dosya Filtreleme ve Token Sayma İlişkisi

Dosya filtreleme, analiz sürecine hangi dosyaların dahil edildiğini belirleyerek token sayımını doğrudan etkiler. Filtreleme hattı, dosyaların tokenleri sayılmadan önce geçmesi gereken bir dizi kapı olarak çalışır. Yalnızca tüm filtreleme aşamalarını atlatan dosyalar token hesaplaması için işlenir ve nihai token sayısının yalnızca codebase'in istenen alt kümesini yansıtmasını sağlar.

Filtreleme işlemi belirli bir sırada gerçekleşir: önce .gitignore kuralları uygulanır, ardından calculator'a özgü kurallar (.contextinclude veya .contextignore) ve son olarak metin dosyası kontrolü yapılır. Bu dizi, açıkça alakasız dosyaların (node_modules içindekiler gibi) erken hariç tutulmasını sağlar ve gereksiz işlemlerden kaçınarak performansı artırır. Tüm filtreleri geçen dosyalar daha sonra tiktoken kütüphanesini kullanarak tam sayım için veya tiktoken mevcut olmadığında bir tahmin algoritması kullanarak token sayılarını belirlemek üzere analiz edilir.

Filtreleme ve token sayımı arasındaki ilişki, hem dahil edilen hem de hariç tutulan dosyalar hakkında ayrıntılı istatistikler sağlayan aracın çıktısında yansıtılır. Bu şeffaflık, kullanıcıların filtreleme kararlarının nihai token sayısını tam olarak nasıl etkilediğini anlamalarına ve yapılandırma dosyalarını buna göre ayarlamalarına olanak tanır. Sistem ayrıca .gitignore kuralları nedeniyle ignore edilen dosyalarla calculator kuralları tarafından filtrelenen dosyaları ayırt eder ve hangi yapılandırma dosyalarının analiz kapsamını şekillendirmede en etkili olduğuna dair fikir verir.

**Bölüm kaynakları**

- [ctxman.js](file://ctxman.js#L385-L412)
- [ctxman.js](file://ctxman.js#L124-L229)
- [ctxman.js](file://ctxman.js#L306-L321)

## İstatistik Takibi

TokenCalculator sınıfı, birden fazla boyutta hem dahil edilen hem de hariç tutulan dosyaları izleyerek analiz süreci hakkında kapsamlı istatistikler tutar. İstatistikler, toplam dosyalar, tokenler, byte'lar, satırlar ve çeşitli kategorizasyonlar için sayaçlarla başlatılan stats nesnesinde saklanır.

Dosyalar işlenirken, updateStats methodu uygun sayaçları artırır ve uzantıya özgü ve dizine özgü istatistikleri günceller. Her dosya, genel toplamların yanı sıra byExtension ve byDirectory ayrımlarını da doldurarak codebase bileşiminin ayrıntılı analizine olanak tanır. largestFiles dizisi, token sayısına göre en önemli dosyaların kaydını tutar ve potansiyel optimizasyon hedeflerinin belirlenmesini sağlar.

Sistem, ignore edilen dosyaları ayrı olarak izler ve .gitignore kuralları tarafından hariç tutulanlarla calculator kuralları tarafından filtrelenenler arasında ayrım yapar. Bu ayrım, farklı filtreleme stratejilerinin etkinliği hakkında değerli geri bildirim sağlar ve kullanıcıların yapılandırma seçimlerinin etkisini anlamalarına yardımcı olur. countIgnoredFiles methodu, ignore edilen dizinler içindeki dosyaları özyinelemeli olarak sayar ve tüm dizin ağaçları hariç tutulduğunda bile doğru istatistikler sağlar.

Bu istatistikler, özet metrikler, uzantı ayrımları ve en büyük dosya ve dizinlerin sıralamasını içeren nihai analiz raporunu oluşturmak için kullanılır. Bu kapsamlı raporlama, kullanıcıların codebase yapıları ve filtreleme yapılandırmaları hakkında bilinçli kararlar almalarını sağlar.

**Bölüm kaynakları**

- [ctxman.js](file://ctxman.js#L455-L489)
- [ctxman.js](file://ctxman.js#L715-L743)
- [ctxman.js](file://ctxman.js#L673-L696)

## Yaygın Sorunlar ve Optimizasyon

Dosya seviyesi analiz yapılandırılırken, öncelikle yanlış yapılandırılmış ignore kalıplarıyla veya büyük dizinlerle performans darboğazlarıyla ilgili birkaç yaygın sorun ortaya çıkabilir. Sık karşılaşılan sorunlardan biri, negation kalıplarının daha genel kalıplardan sonra yerleştirilmesi ve bunların etkisiz olmasına neden olması gibi include/exclude kurallarının yanlış sıralanmasıdır. Kullanıcılar, istenen filtreleme davranışını elde etmek için negation kalıplarının (! ile başlayanlar) yapılandırma dosyalarında uygun şekilde konumlandırıldığından emin olmalıdır.

Bir diğer yaygın sorun, gerekli dosyaları hariç tutan veya çok fazla alakasız dosya içeren aşırı geniş kalıpların kullanılmasıdır. Örneğin, **/*.js kullanmak, LLM context'inden hariç tutulması gereken test dosyalarını veya oluşturulan kodu içerebilir. Tersine, aşırı spesifik kalıplar önemli dosyaları kaçırabilir. Kullanıcılar, kalıplarını dikkatlice gözden geçirmeli ve beklenen dosyaların dahil edildiğini veya hariç tutulduğunu doğrulamak için aracın ayrıntılı çıktısını kullanmalıdır.

Performans darboğazları, çok büyük dizinler analiz edilirken veya filtreleme yapılandırması kapsamlı pattern matching gerektirdiğinde ortaya çıkabilir. Performansı optimize etmek için kullanıcılar, analiz kapsamını yalnızca temel dosyalarla sınırlamak için hassas include kuralları kullanmalıdır. Geniş hariç tutmalarla yalnızca .contextignore'a güvenmek yerine belirli kalıplarla .contextinclude kullanmak, işlenmesi gereken dosya sayısını azaltarak performansı önemli ölçüde artırabilir.

Ek optimizasyon stratejileri, mümkün olduğunda özyinelemeli wildcardlardan (**/) kaçınmayı içerir, çünkü bunlar daha kapsamlı dosya sistemi geçişi gerektirir ve en sık eşleşen kalıpların yapılandırma dosyalarında ilk sırada listelenmesini sağlayarak gereken pattern karşılaştırmalarının sayısını en aza indirir. Aracın istatistiklerine dayalı olarak filtreleme yapılandırmasını düzenli olarak gözden geçirmek ve iyileştirmek, optimal performans ve doğruluğu korumaya yardımcı olabilir.

**Bölüm kaynakları**

- [ctxman.js](file://ctxman.js#L385-L412)
- [ctxman.js](file://ctxman.js#L124-L229)
- [ctxman.js](file://ctxman.js#L306-L321)

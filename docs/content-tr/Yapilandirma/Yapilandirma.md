# Yapilandirma

<cite>
**Bu Dokümanda Referans Verilen Dosyalar**
- [README.md](file://README.md) - *Method filtreleme örnekleri ile güncellendi*
- [ctxman.js](file://ctxman.js) - *Method seviyesi analiz desteği ile ana orkestratör*
- [lib/parsers/method-filter-parser.js](file://lib/parsers/method-filter-parser.js) - *6f5fea3204f18ec9d0802a00b400af1bb823e411 commit'inde eklendi*
- [lib/utils/config-utils.js](file://lib/utils/config-utils.js) - *Method filtre başlatmasını desteklemek için değiştirildi*
</cite>

## Güncelleme Özeti

**Yapılan Değişiklikler**

- Method Filtreleme Sistemi bölümü yeni dosyalardan uygulama detayları ile güncellendi
- Pattern Syntax Rehberi, gerçek kod uygulamasına dayanarak güncellendi
- Yapılandırma Örnekleri, doğru method filtreleme senaryoları ile geliştirildi
- Method filtreleme mantığı hakkında eski bilgiler düzeltildi
- Gerçek analiz edilen kod dosyalarını yansıtan yeni bölüm kaynakları eklendi

## İçindekiler

1. [Dosya Filtreleme Sistemi](#dosya-filtreleme-sistemi)
2. [Method Filtreleme Sistemi](#method-filtreleme-sistemi)
3. [Pattern Syntax Rehberi](#pattern-syntax-rehberi)
4. [Yapilandirma Örnekleri](#yapilandirma-örnekleri)
5. [Yaygın Yapilandirma Sorunları](#yaygın-yapilandirma-sorunları)
6. [En İyi Uygulamalar](#en-iyi-uygulamalar)

## Dosya Filtreleme Sistemi

ctxman aracı, token analizine hangi dosyaların dahil edileceği üzerinde hassas kontrol sağlayan çift modlu bir dosya filtreleme sistemi uygular. Bu sistem iki tamamlayıcı yapilandirma dosyası üzerinden çalışır: EXCLUDE modu için `.contextignore` ve INCLUDE modu için `.contextinclude`.

Filtreleme sistemi, `.contextinclude`'un `.contextignore` üzerinde önceliğe sahip olduğu katı bir öncelik hiyerarşisini takip eder. Her iki dosya da mevcut olduğunda, araç INCLUDE modunda çalışır ve `.contextignore` dosyasını tamamen göz ardı eder. Bu öncelik, kullanıcıların hassas dosya seçimi ile odaklanmış analiz setleri oluşturabilmesini sağlarken, hariç tutma tabanlı filtrelemeye geri dönebilme yeteneğini korur.

EXCLUDE modunda (yalnızca `.contextignore` mevcut olduğunda), araç `.contextignore` dosyasındaki pattern'lerle eşleşenler dışındaki tüm dosyaları dahil eder. Bu, geleneksel gitignore tarzı hariç tutma mantığını takip eder ve `.contextinclude` dosyası mevcut olmadığında varsayılan moddur. `.contextignore` dosyası, dokümantasyon dosyalarını (`.md`, `.txt`), yapilandirma dosyalarını (`.json`, `.yml`), altyapı ve dağıtım dosyalarını, test dizinlerini, build artifact'lerini ve `utility-mcp/src/workflows/**` ve `utility-mcp/src/testing/**` gibi belirli kod yollarını hariç tutacak şekilde önceden yapılandırılmıştır.

INCLUDE modunda (`.contextinclude` mevcut olduğunda), araç yalnızca `.contextinclude` dosyasındaki pattern'lerle eşleşen dosyaları dahil eder, `.contextignore`'daki herhangi bir kuraldan bağımsız olarak. Bu mod, belirli dosya seçimi için daha hassas kontrol sağlar ve odaklanmış analiz setleri oluşturmak için idealdir. Varsayılan `.contextinclude` yapılandırması, `utility-mcp/src/**/*.js`'den core JavaScript dosyalarını dahil ederken, workflows ve testing utilities gibi belirli alt dizinleri hariç tutmak için negasyon pattern'leri kullanır.

Tam yapilandirma dosyası öncelik sırası şöyledir: 1) `.gitignore` (her zaman saygı gösterilir), 2) `.contextinclude` (en yüksek öncelik), 3) `.contextignore` (include dosyası olmadığında fallback). Bu katmanlı yaklaşım, standart git hariç tutmalarının her zaman uygulanmasını sağlarken, esnek, projeye özel filtreleme seçenekleri sunar.

**Bölüm kaynakları**

- [README.md](file://README.md#L121-L150)
- [README.md](file://README.md#L294-L356)
- [ctxman.js](file://ctxman.js#L128-L151)

## Method Filtreleme Sistemi

ctxman aracı, `.methodinclude` ve `.methodignore` yapilandirma dosyaları aracılığıyla gelişmiş method seviyesinde filtreleme yetenekleri sağlar. Bu dosyalar, hangi methodların analiz edileceği ve çıktıya dahil edileceği üzerinde ayrıntılı kontrol sağlamak için `--method-level` komut satırı seçeneği ile birlikte çalışır.

Method filtreleme, dosya filtrelemeye benzer bir prensiple çalışır, ancak kod yapısına özgü ek pattern eşleştirme yetenekleri ile. Method seviyesinde analiz etkinleştirildiğinde, araç JavaScript dosyalarını ayrıştırarak function declaration'ları, method assignment'ları ve arrow function'ları eşleştiren regular expression pattern'leri kullanarak methodları tanımlar. Tanımlanan methodlar daha sonra method yapilandirma dosyalarında tanımlanan kurallara göre filtrelenir.

`.methodinclude` dosyası, analize hangi methodların dahil edilmesi gerektiğini belirtir. Bu dosya mevcut olduğunda, araç methodlar için INCLUDE modunda çalışır, yani yalnızca belirtilen pattern'lerle eşleşen methodlar dahil edilir. `.methodignore` dosyası, EXCLUDE modunda (`.methodinclude` dosyası olmadığında) çalışırken analizden hangi methodların hariç tutulması gerektiğini belirtir.

Method filtreleme sistemi birkaç pattern türünü destekler: tam method isimleri (örn. `calculateTokens`), `*` kullanan wildcard pattern'ler (örn. "Handler" ile biten tüm methodları eşleştirmek için `*Handler`), `Class.*` sözdizimini kullanan class'a özgü methodlar (örn. TokenCalculator class'ındaki tüm methodları dahil etmek için `TokenCalculator.*`), ve `file.method` sözdizimini kullanan dosyaya özgü methodlar (örn. belirli bir dosyadaki belirli bir methodu hedeflemek için `server.handleRequest`).

Filtreleme mantığı, yapilandirma dosyalarını yükleyen, pattern'leri regular expression'lara ayrıştıran ve her methodu bu pattern'lere karşı değerlendiren `MethodFilterParser` class'ında uygulanır. INCLUDE modu için, bir method `.methodinclude` dosyasındaki herhangi bir pattern ile eşleşirse dahil edilir. EXCLUDE modu için, bir method yalnızca `.methodignore` dosyasındaki herhangi bir pattern ile eşleşmiyorsa dahil edilir. Sistem ayrıca, daha geniş dahil etme kurallarından belirli methodları hariç tutmak için `!` ile öneklenmiş negasyon pattern'lerini destekler.

**Bölüm kaynakları**

- [README.md](file://README.md#L544-L610)
- [ctxman.js](file://ctxman.js#L69-L96)
- [lib/parsers/method-filter-parser.js](file://lib/parsers/method-filter-parser.js#L7-L47)
- [lib/utils/config-utils.js](file://lib/utils/config-utils.js#L29-L50)

## Pattern Syntax Rehberi

ctxman aracı, hem dosya hem de method filtreleme için kapsamlı bir pattern sözdizimi destekler ve esnek ve hassas yapilandirma sağlar. Pattern sistemi, kullanıcıların gelişmiş filtreleme kuralları oluşturmasına olanak tanıyan wildcard'lar, negasyon ve özel hedefleme mekanizmalarını içerir.

Dosya pattern'leri için, araç şu sözdizimi öğelerini destekler: dizinler arası recursive eşleştirme için `**`, tek seviye wildcard eşleştirme için `*` ve negasyon için `!`. `**` wildcard'ı, sıfır veya daha fazla dizini eşleştirir ve `**/*.md` gibi pattern'lerin herhangi bir dizindeki markdown dosyalarını eşleştirmesine olanak tanır. `*` wildcard'ı, tek bir dizin seviyesindeki herhangi bir karakter dizisini eşleştirir, örneğin mevcut dizindeki tüm JavaScript dosyalarını eşleştirmek için `*.js`. Dizin pattern'leri, dizinleri özellikle hedeflemek için sondaki slash ile bitmelidir (örn. `docs/`).

Method pattern'leri, koda özgü filtreleme için ek sözdizimini destekler. Standart wildcard'lar ve negasyona ek olarak, method pattern'leri belirli bir class içindeki tüm methodları içeren `Class.*` sözdizimini kullanarak class seviyesinde filtrelemeyi destekler. Dosyaya özgü method hedefleme, `file.method` sözdizimi ile elde edilir ve belirli dosyalardaki bireysel methodlar üzerinde hassas kontrol sağlar. Pattern eşleştirme varsayılan olarak büyük/küçük harf duyarsızdır ve yapilandirma dosyalarına `#` karakteri ile başlayan satırlarda yorumlar dahil edilebilir.

Pattern değerlendirme belirli kurallara uyar: pattern'ler sırayla işlenir ve özellikle negasyon kullanılırken sonraki pattern'ler önceki pattern'leri geçersiz kılabilir. Daha geniş bir dahil etme pattern'inden sonra bir negasyon pattern'i (`!` ile öneklenmiş) göründüğünde, aksi takdirde dahil edilecek dosyaları veya methodları hariç tutar. Örneğin, `src/**/*.js` pattern dizisi ve ardından `!src/**/*.test.js`, src dizinindeki `.test.js` uzantılı olanlar hariç tüm JavaScript dosyalarını dahil eder.

Pattern satırları içinde satır içi yorumların desteklenmediğini unutmamak önemlidir; yorumlar ayrı satırlarda olmalıdır. Pattern sözdizimi dikkatle doğrulanmalıdır, çünkü yanlış pattern'ler beklenmedik dosya dahil edilmelerine veya hariç tutulmalara yol açabilir. Araç, hangi modun etkin olduğunu gösteren ve pattern eşleştirme sorunlarını teşhis etmeye yardımcı olabilecek verbose çıktı sağlar.

**Bölüm kaynakları**

- [README.md](file://README.md#L544-L610)
- [README.md](file://README.md#L418)
- [ctxman.js](file://ctxman.js#L153-L173)
- [lib/parsers/method-filter-parser.js](file://lib/parsers/method-filter-parser.js#L25-L35)

## Yapilandirma Örnekleri

ctxman aracı, core uygulama mantığına nasıl odaklanılacağını veya test dosyalarının etkili bir şekilde nasıl hariç tutulacağını gösteren pratik yapilandirma örnekleri sağlar. Bu örnekler, farklı kullanım durumları için hem EXCLUDE hem de INCLUDE modu yapılandırmalarını gösterir.

EXCLUDE modu için, kullanıcılar analiz kapsamını genişletmek veya kısıtlamak için `.contextignore` dosyasını değiştirebilir. Normalde hariç tutulan dokümantasyon dosyalarını dahil etmek için, kullanıcılar `.contextignore` dosyasından `**/*.md` satırını yorumlayabilir veya kaldırabilir. Belirli büyük dosyaları veya dizinleri hariç tutmak için, `your-large-file.js` veya `specific-directory/**` gibi ek pattern'ler eklenebilir. Varsayılan `.contextignore` yapılandırması, dokümantasyon, yapilandirma dosyaları, altyapı kodu, workflow'lar ve testing utilities'i hariç tutarak core uygulama mantığına odaklanır.

INCLUDE modu için, kullanıcılar tam olarak hangi dosyaların analiz edilmesi gerektiğini belirtmek için bir `.contextinclude` dosyası oluşturur. Yaygın bir pattern, bir kaynak dizinindeki tüm JavaScript dosyalarını dahil ederken negasyon kullanarak belirli alt dizinleri hariç tutmaktır. Örneğin:

```
# src'deki tüm JS dosyalarını dahil et
src/**/*.js
# Legacy kodu hariç tut
!src/legacy/**
# Test dosyalarını hariç tut
!src/**/*.test.js
```

Bu yapilandirma, legacy alt dizinindeki veya `.test.js` uzantılı olanlar hariç src dizinindeki tüm JavaScript dosyalarını dahil eder. Başka bir örnek, belirli giriş noktalarını ve kaynak dosyalarını dahil ederek core business logic'e odaklanır:

```
# Ana giriş noktasını dahil et
utility-mcp/index.js
# workflows ve testing hariç tüm src JavaScript dosyalarını dahil et
utility-mcp/src/**/*.js
!utility-mcp/src/workflows/**
!utility-mcp/src/testing/**
```

Method seviyesinde filtreleme için, `.methodinclude` dosyası core business logic methodlarına odaklanacak şekilde yapılandırılabilir. Örnekler:

```
# Core business logic methodları
calculateTokens
generateLLMContext
analyzeFile
handleRequest
validateInput
processData

# Method kategorileri için pattern eşleştirme
*Handler          # 'Handler' ile biten tüm methodlar
*Validator        # 'Validator' ile biten tüm methodlar
*Manager          # 'Manager' ile biten tüm methodlar
TokenCalculator.* # TokenCalculator class'ındaki tüm methodlar
```

Tersine, `.methodignore` dosyası utility ve debug methodlarını hariç tutabilir:

```
# Utility ve debug methodlarını hariç tut
console
*test*
*debug*
*helper*
print*
main

# Dosyaya özgü hariç tutmalar
server.printStatus
utils.debugLog
```

**Bölüm kaynakları**

- [README.md](file://README.md#L294-L356)
- [README.md](file://README.md#L544-L610)
- [lib/parsers/method-filter-parser.js](file://lib/parsers/method-filter-parser.js#L37-L45)

## Yaygın Yapilandirma Sorunları

ctxman aracı kullanıcıları, pattern sözdizimi, dosya dahil etme/hariç tutma davranışı ve farklı filtre dosyaları arasındaki etkileşimle ilgili birkaç yaygın yapilandirma sorunuyla karşılaşabilir. Bu sorunları ve çözümlerini anlamak etkili yapilandirma için gereklidir.

Sık karşılaşılan bir sorun, özellikle wildcard kullanımı ile ilgili pattern sözdizimi hatalarıdır. Kullanıcılar bazen `*` (tek seviye wildcard) ile `**` (recursive wildcard) arasında karışıklık yaşar ve beklenmeyen sonuçlara yol açar. Örneğin, `docs/*.md` kullanımı yalnızca docs dizinindeki markdown dosyalarını eşleştirirken, `docs/**/*.md` docs ve tüm alt dizinlerindeki markdown dosyalarını eşleştirir. Başka bir yaygın sözdizimi sorunu, negasyon pattern'lerinin yerleşimidir; negasyon pattern'leri etkili olabilmeleri için değiştirdikleri pattern'lerden sonra gelmelidir.

Beklenmeyen dosya dahil edilmeleri veya hariç tutmaları genellikle yapilandirma dosyaları arasındaki öncelik hiyerarşisinden kaynaklanır. `.contextinclude` `.contextignore` üzerinde önceliğe sahip olduğundan, kullanıcılar `.contextignore`'dan pattern'leri kaldırmanın analiz sonuçlarını değiştirmediğinde şaşırabilirler. Bu gibi durumlarda, `.contextinclude` dosyası muhtemelen aktiftir ve filtreleme davranışını kontrol ediyor demektir. Kullanıcılar `.contextinclude`'un varlığını kontrol etmeli ve ya onu değiştirmeli ya da EXCLUDE moduna dönmek için kaldırmalıdır.

Farklı filtre dosyaları arasındaki etkileşim de karışıklığa neden olabilir. Araç, kendi yapilandirma dosyalarına ek olarak `.gitignore` kurallarına saygı gösterir, yani `.gitignore` tarafından hariç tutulan dosyalar calculator kurallarından bağımsız olarak analiz edilmez. Bu katmanlı hariç tutma, belirli dosyaların analizden neden eksik olduğunu anlamayı zorlaştırabilir. Verbose mod kullanımı, hangi modun etkin olduğunu göstererek ve filtreleme sürecine içgörü sağlayarak bu sorunları teşhis etmeye yardımcı olabilir.

Diğer yaygın sorunlar arasında dizin pattern'lerini uygun sözdizimi olmadan kullanma (pattern'ler `docs/` yerine `docs/**` kullanmalıdır), pattern dosyalarında satır içi yorumlar bulundurma (yorumlar `#` ile başlayan ayrı satırlarda olmalıdır) ve method pattern'lerinde dosya uzantılarını hesaba katmama sayılabilir. Kullanıcılar ayrıca escape edilmesi gereken özel regex karakterleri içeren pattern'lerle karşılaşabilirler, ancak araç pattern dönüşümünde çoğu özel karakteri otomatik olarak işler.

**Bölüm kaynakları**

- [README.md](file://README.md#L418)
- [README.md](file://README.md#L378-L408)
- [ctxman.js](file://ctxman.js#L175-L211)

## En İyi Uygulamalar

Farklı kullanım durumları için etkili filtre yapılandırmaları oluşturmak amacıyla, kullanıcılar ctxman aracının filtreleme sisteminin tüm yeteneklerinden yararlanan birkaç en iyi uygulamayı takip etmelidir.

Genel geliştirme iş akışları için, maksimum hassasiyet için `.contextinclude` ile INCLUDE modunu kullanın. Geniş dahil etme pattern'leri ile başlayın ve belirli dosyaları veya dizinleri hariç tutmak için negasyon kullanın. Örneğin, kaynak dizinindeki tüm JavaScript dosyalarını `src/**/*.js` ile dahil edin ve ardından test dosyalarını `!src/**/*.test.js` ve legacy kodu `!src/legacy/**` ile hariç tutun. Bu yaklaşım, neyin hariç tutulduğu üzerinde kontrolü korurken kapsamlı kapsam sağlar.

Core uygulama mantığına odaklanırken, özellikle giriş noktalarını ve core modülleri hedefleyen bir `.contextinclude` dosyası oluşturun. Ana uygulama dosyalarını açıkça dahil edin ve ilgili bileşenleri yakalamak için pattern eşleştirme kullanın. Method seviyesinde analiz için, temel işlevselliğin kapsamlı kapsanmasını sağlamak amacıyla kritik business logic için tam method isimleri ile method kategorileri için pattern eşleştirme (örn. `*Handler`, `*Validator`) birleştirin.

Test ve debugging senaryoları için, belirli bileşenleri izole etmek için method seviyesinde filtreleme kullanın. Debug edilen methodlara odaklanan bir `.methodinclude` dosyası oluşturun, ilgili işlevselliği yakalamak için hem tam isimler hem de pattern eşleştirme kullanarak. Tersine, analizi kirletebilecek utility methodlarından, logging'den ve debugging function'larından gürültüyü hariç tutmak için `.methodignore` kullanın.

Her zaman verbose mod kullanarak yapılandırmaları doğrulayın, bu hangi filtreleme modunun etkin olduğunu gösterir ve dahil edilen ve hariç tutulan dosyalar hakkında ayrıntılı bilgi sağlar. Bu şeffaflık, yapilandirma sorunlarını belirlemeye yardımcı olur ve analiz kapsamının beklentilerle eşleşmesini sağlar. Sorun giderme sırasında, sorunları izole etmek için yapılandırmaları geçici olarak basitleştirin, temel pattern'lerle başlayın ve kademeli olarak karmaşıklık ekleyin.

Yapilandirma dosyalarını her pattern'in amacını açıklayan net yorumlarla düzenleyin. İlgili pattern'leri birlikte gruplandırın ve dahil etme ve hariç tutmaların ardındaki mantığı belgelemek için yorumlar kullanın. Bu dokümantasyon, yapılandırmaları zaman içinde sürdürmeye yardımcı olur ve diğer ekip üyeleri için anlaşılmasını kolaylaştırır.

Son olarak, farklı filtreleme yaklaşımlarının performans etkilerini göz önünde bulundurun. INCLUDE modu hassas kontrol sağlarken, kod tabanı geliştikçe dikkatli bakım gerektirir. EXCLUDE modu, istikrarlı proje yapıları için daha sürdürülebilir olabilir ancak yeni dizinler eklendikçe istenmeyen dosyaları dahil etme riski taşır. Projenin analiz ihtiyaçlarını karşılamaya devam ettiklerinden emin olmak için filtre yapılandırmalarını düzenli olarak gözden geçirin ve güncelleyin.

**Bölüm kaynakları**

- [README.md](file://README.md#L30-L103)
- [README.md](file://README.md#L253-L293)
- [ctxman.js](file://ctxman.js#L408-L447)
- [lib/parsers/method-filter-parser.js](file://lib/parsers/method-filter-parser.js#L7-L47)

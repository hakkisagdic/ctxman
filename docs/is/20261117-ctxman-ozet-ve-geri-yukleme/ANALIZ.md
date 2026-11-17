# 20261117-ctxman-ozet-ve-geri-yukleme: ctxman digest ve sıkıştırma sonrası geri yükleme

## Bugün ne var
- ctxman bir KOD TABANINI token bütçesine paketler (`lib/pack`, `lib/task`, MCP sunucusu `lib/api/mcp/server.js`).
  Konuşma, kanca (hook), transcript veya sıkıştırma (compaction) kodu yok.
- CLI: `bin/cli.js` alt komutları `bin/cm-*.js` dosyalarına dağıtır (`runSubcommand`); `bin/cm-mcp.js` istemci kurulumu yapar.
- `lib/` altında `digest` veya `hook` alanı yok. Testler `test/*.test.js` (vitest), yerel kapı: lint:strict, format:check, `npm test`.
- rtk (denemede, 17 Kasım): araç çıktısını kısaltır; posthook denemesi başarısız (%3,5 tasarruf, ortadaki hata gizlenebildi,
  Read sıkışmadı). Digest bunu tekrarlamaz: yalnız İŞ/AJAN SONUCU içindir, araç çıktısına dokunmaz.

## Ne değişecek
Yeni alan `lib/context/` (genel, sahibe özgü hiçbir şey yok), CLI `bin/cm-digest.js`, `bin/cm-hook.js`, belgeler.
- C-02 `ctxman digest`: `write` (stdin veya dosya -> `<store>/<id>.md`, dizin 700, dosya 600; çıktıda en çok 5 satır
  `done/result/open/needs` + `path` + `id`; özet alanları yazan verir, yoksa ilk satırlardan türetilir),
  `read <id|yol> [--lines A-B] [--grep DESEN]` (kaçış yok: yol store içinde kalır, `..` reddedilir),
  `list`. Aynı işlev MCP aracı `digest_read` olarak da açılır (mevcut sunucuya küçük ekleme).
- C-01 `ctxman hook session-start --source compact` ve `ctxman hook pre-compact`: kanca JSON'u stdin'den,
  `session_id` ile kapı kontrolü; PreCompact özeti `<store>/compact/<session>.md` yazar; session-start bunu ve
  SAĞLAYICILARI okuyup en çok 60 satırlık blok basar.
- Sağlayıcı: ayar dosyasında (`ctxman-context.json`, kullanıcı dizini) `{name, command|files, maxLines, timeoutMs}`.
  Komut sağlayıcısı kabuksuz (argv dizisi) çalışır; dosya sağlayıcısı yalnız listelenen dosyaları okur, `maxLines` ile keser.
  Bir sağlayıcı hata/zaman aşımı verirse tek satır (`provider X: failed`) basılır, oturum bloklanmaz, çıkış kodu 0.
  Gönderilen: arayüz (`lib/context/providers.js`), `docs/CONTEXT-PROVIDERS.md`, bir genel örnek (`examples/context-provider/`: dosya
  listesi + küçük betik). Bu Mac'e özgü sağlayıcı kapsam DIŞI (admin yazar).
- Kapı (yalnız PROPOSAL kapısı): `<ctx-dir>/OFF` varsa veya `session_id` `<ctx-dir>/sessions.txt` içinde değilse çıktı yok, çıkış 0.
  `ctx-dir` ortam değişkeni veya `--ctx-dir` ile verilir; varsayılan kullanıcı ayar dizini, yol koda gömülmez.
- Sonuç dosyasına (`docs/is/<id>/SONUC.md`) admin'in elle kaydedeceği tam kanca girdileri (PreCompact, SessionStart matcher `compact`) yazılır;
  gerçek `~/.claude/settings.json`'a dokunulmaz. Ağ yok.

## Kabul kontrolleri
- K1. Verilen: 400 satırlık sonuç dosyası. Ne zaman: `ctxman digest write --id t1 < f` çalışır. O zaman: stdout en çok
  5 özet satırı + `path:` + `id:` içerir; `<store>/t1.md` 400 satırın tamamıdır (`wc -l`, `diff`).
- K2. Ne zaman `digest read t1 --lines 120-130` ve `digest read t1 --grep HATA`: yalnız o satırlar (satır no ile) döner; yol ile okuma da aynı; `digest read ../x` reddedilir (çıkış != 0).
- K3. Verilen: örnek sağlayıcı ayarı (2 dosya, biri 200 satır, maxLines 20). Ne zaman: `echo '{"session_id":"s1","source":"compact"}' | ctxman hook session-start --source compact`
  (s1 izin listesinde). O zaman: çıktı <= 60 satır; listelenmeyen hiçbir dosyanın içeriği yok; sağlayıcı başına kesim işaretli.
- K4. Verilen: `OFF` dosyası var veya session_id listede yok. Ne zaman: iki kanca çalışır. O zaman: çıktı boş, çıkış 0, store'a yazım yok.
- K5. Verilen: bir sağlayıcı komutu hata verir, biri 10 sn uyur (timeoutMs 500). O zaman: blokta her biri için tek satır, diğer sağlayıcılar yine basılır, çıkış 0, toplam süre < 3 sn.
- K6. Ne zaman: `hook pre-compact` açık iş ve bekleyen soru satırlarını içeren girdiyle çalışır, sonra session-start. O zaman: özet dosyası 600 izinli ve session-start bloğunda o satırlar geri gelir.
- K7. Ağ: kanca ve digest çalışırken `lsof -i` (veya kodda `http`/`net` içe aktarması yok: `grep -rn "node:http\|fetch(" lib/context bin/cm-digest.js bin/cm-hook.js` boş).
- K8. Açık depoda sır yok: `lib/context`, test, fixture, belgelerde mutlak kullanıcı yolu, makine adı, e-posta, anahtar adı taraması boş.
- K9. Sonuç dosyası: tam iki kanca girdisi JSON olarak okunur, `jq` ile geçerli çıkar.

## Riskler
- Kişisel/gizli veri: digest dosyası iş sonucunun tamamını diske yazar (sır içerebilir): 700/600 izin, isteğe bağlı mevcut redaksiyonun kullanımı, belgede uyarı. Sağlayıcı yalnız yapılandırılanı okur.
- Erişim: kanca tüm oturumlarda kayıtlı; kapı (OFF + izin listesi) olmazsa başka oturumlar etkilenir: K4 zorunlu.
- Yol kaçışı (`digest read`) ve sağlayıcı komut enjeksiyonu: argv dizisi, kabuk yok, store dışı yol reddi.
- Kanca hatası oturumu bozmamalı: her yolda çıkış 0 ve en çok bir satır hata.
- Mevcut özellik: `ctxman mcp` araç listesi ve `index.d.ts`/api-surface testi bozulabilir (regresyon: `test/api-surface.test.js`, MCP testleri, `ctxman --help`).
- CI GitHub'da elle kapalı: yerel kapı tek kapı; tam paket makine yuvası ister.
- Para ve migrasyon yok.

## Kararlar
- Alan adı genel `context`; admin'e özgü yol/ad/anahtar yok. Sahibin verisi yalnız yerelde.
- Digest rtk'nin yerine geçmez; araç çıktısı kapsam dışı (rtk posthook denemesi başarısız, o konu ayrı).
- Özet alanları yazanın sorumluluğu; otomatik özetleme (LLM/ağ) yok, yalnız kural tabanlı geri dönüş.
- Bağımlılık eklenmez (yalnız node yerleşikleri). Sağlayıcı kabuksuz; `sh -c` yok.
- 60 satır sert üst sınır, toplam bayt sınırı da (varsayılan 8 KB).
- İki dilim: dilim 1 digest (C-02), dilim 2 hook + sağlayıcı (C-01); ortak `lib/context/gate.js`, `store.js`.
- CHANGELOG ve README (EN/TR) kısa bölüm; test fixture'ları uydurma.

## Sahibe sorular
Yok. Her şey KARAR.md ve görev metninde karara bağlı.

## Boyut
L: yeni alan, iki geliştirici dilimi, testlerle birlikte ~700+ satır beklenir. Risk: kişisel veri (iş sonucu dosyaları) ve erişim (kapı) etiketli; gözden geçiren ve yedek gerekir.

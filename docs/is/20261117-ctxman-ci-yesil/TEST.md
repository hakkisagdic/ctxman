# TEST: ctxman-ci-yesil

Sonuç: KALDI

| Kontrol | Sonuç | Kanıt |
| --- | --- | --- |
| `npm audit --omit=dev --audit-level=moderate` temiz | kaldı | hono <=4.13.15 ve @hono/node-server 2.0.0-2.1.5 hâlâ 2 orta bulgu; package-lock.json değişmedi (diff 0 satır) |
| Belgelerde "Tamamlandı" iddiaları düzeltildi | geçti | RAKIP_ANALIZI satır 7 ve bölüm 4, UNBLOCKED_ANALYSIS 4 satır "Partly", GELISTIRME_LISTESI "kodda uygulandı"; okundu, abartı yok |
| Prettier (`format:check`) | kaldı | 3 değişen belge uyarı veriyor; origin/main'deki hâlleri geçiyordu |
| ESLint | geçti | `npm run lint`: No issues found |
| Test silindi/gevşetildi | geçti | diff yalnız 3 .md dosyası, JS/test yok |
| Gizli bilgi (e-posta, özel yol, anahtar) | geçti | dal diff'inde yok |
| Davranış değişikliği | geçti | yok (yalnız belge) |
| 9aed92f (yayımlanmamış commit) okuması | geçti | uydurma fixture'lar; anahtar, özel yol yok. Not: commit yazar meta verisinde gerçek e-posta var (git author, zaten diğer commitlerde de var) |
| Tam test | yürütülmedi | yalnız belge değişti; ağır slot alınmadı |

## Kalanlar

1. Audit: beklenen çıkış 0, gözlenen 1. Düzeltme `npm audit fix --omit=dev` ile package-lock.json'da hono ve @hono/node-server yükseltmesi (ağ gerekir); lockfile diff yalnız bu paketlerle sınırlı kalmalı.
2. Prettier: beklenen `format:check` temiz, gözlenen 3 belgede uyarı. `npx prettier --write` ile 3 belge (docs/GELISTIRME_LISTESI.md, docs/RAKIP_ANALIZI.md, docs/UNBLOCKED_ANALYSIS.md) düzeltilmeli.
3. engines: package.json `>=22.0.0`; Node 22 ve 24'e izin veriyor, sorun yok.

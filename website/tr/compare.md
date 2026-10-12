---
aside: false
sidebar: false
title: Karşılaştırma
description: ctxman'in açık kaynak bağlam paketleyicileri ve kurumsal kod bağlamı platformlarıyla kaynaklı karşılaştırması.
---

<script setup>
import CompareMatrix from '../.vitepress/components/CompareMatrix.vue';
import landscape from '../.vitepress/data/landscape.json';
</script>

# ctxman ve diğerleri

Kodu dil modellerine hazırlayan iki tür araç var. **Bağlam paketleyicileri** (Repomix, Gitingest,
code2prompt, Aider'ın repo haritası) makinenizde çalışır ve bir repoyu modelin okuyabileceği metne
dönüştürür. **Kod bağlamı platformları** (Sourcegraph, GitHub Copilot, Augment Code, Unblocked)
kodu, çoğu zaman ticket, sohbet ve wiki içerikleriyle birlikte bir sunucuda indeksler ve hem kendi
asistanlarına hem de MCP üzerinden diğer ajanlara sunar.

ctxman, ekiplerin platformlardan beklediği denetimleri sunan bir bağlam paketleyicisidir: token
bütçeleri, politika dosyası ve denetim kaydı, PR ve geçmiş bağlamı ve bir MCP sunucusu; hesap veya
sunucu gerektirmeden.

<CompareMatrix lang="tr" />

## ctxman'i ayıranlar

- **Doğrulanabilir token sayıları.** Her dosyanın ve fonksiyonun, hedeflediğiniz modelin
  kodlamasıyla sayılmış bir token değeri var; `ctxman count --api` Claude için birebir sayıyı
  Anthropic'ten alır. İncelediğimiz kurumsal ürünlerin hiçbiri kullanıcıya görünen token sayılarını
  belgelemiyor.
- **Umut değil, bütçe.** `ctxman pack --budget` ve `ctxman map --tokens`, bir token bütçesini en üst
  sıradaki dosya ve fonksiyonlarla doldurur ve asla aşmaz; `--max-tokens` bunu bir CI kontrolüne
  dönüştürür.
- **Kod neden böyle?** `ctxman why dosya:fonksiyon`, bir fonksiyonun ardındaki commit'leri,
  referans verilen issue'ları, sahipleri, birlikte değişen dosyaları ve tasarım notlarını git'ten ve
  repodan toplar. Unblocked gibi platformlar bunu kendi sunucularında Slack, Jira ve Confluence ile
  yapar; ctxman makinede kalır ve git ile reponun kaydettiklerini kapsar.
- **Sunucusuz yönetişim.** Repodaki bir politika dosyası (veya kurumun `CTXMAN_POLICY` ile
  belirlediği bir dosya); CLI, API ve MCP sunucusu için yolları engeller, maskelemeyi zorunlu kılar
  ve dışa aktarma boyutunu sınırlar. Her dışa aktarma bir denetim kaydına yazılır.

## ctxman'in yapmadıkları

ctxman'de barındırılan bir indeks, tek oturum açma (SSO) veya roller yoktur; ticket, sohbet veya
wiki okumaz. Bir kurumun tüm repoları ve tartışmaları üzerinde, kullanıcı başına yetkilerle yanıt
gerekiyorsa Sourcegraph veya Unblocked gibi bir platform bunun için tasarlanmıştır; ctxman yine de
oraya göndereceğiniz bağlamı hazırlayabilir.

Tablo, her ürünün {{ landscape.checked }} itibarıyla belgelediklerini gösterir. Düzeltmelerinizi
[bir issue]({{ landscape.roadmapUrl }}) üzerinden iletebilirsiniz.

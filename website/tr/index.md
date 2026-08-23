---
layout: home
title: Ctxman - AI Geliştirme Platformu
description: Plugin mimarisi, Git entegrasyonu, REST API ve izleme modu ile AI Geliştirme Platformu. 14+ programlama dili desteği ile yöntem düzeyinde filtreleme ve LLM optimizasyonu.

hero:
  name: Ctxman
  text: AI Geliştirme Platformu
  tagline: Plugin mimarisi, Git entegrasyonu, REST API ve izleme modu. 14+ programlama dili desteği ile LLM optimizasyonu.
  image:
    src: /logo.svg
    alt: Ctxman Logo
  actions:
    - theme: brand
      text: Başlangıç
      link: /tr/getting-started
    - theme: alt
      text: GitHub'da Gör
      link: https://github.com/hakkisagdic/ctxman
    - theme: alt
      text: İnteraktif Demo
      link: /tr/demo

features:
  - icon: 🔌
    title: Plugin Mimarisi
    details: Diller ve dışa aktarıcılar için modüler, genişletilebilir sistem. Her kullanım durumu için özel eklentiler oluşturun.
  - icon: 🔀
    title: Git Entegrasyonu
    details: Sadece değişen dosyaları analiz edin, diff analizi, yazar takibi. Kod inceleme iş akışları için mükemmel.
  - icon: 👁️
    title: İzleme Modu
    details: Gerçek zamanlı dosya izleme ve otomatik analiz. Kod yazarken değişiklikleri anında görün.
  - icon: 🌐
    title: REST API
    details: 6 uç nokta ile programatik erişim için HTTP sunucusu. Herhangi bir araç veya iş akışıyla entegre edin.
  - icon: ⚡
    title: Yüksek Performans
    details: Önbellek sistemi, paralel işleme ile 5-10 kat daha hızlı analiz. Büyük kod tabanlarını kolayca yönetin.
  - icon: 🎯
    title: Yöntem Düzeyinde Analiz
    details: Fonksiyon/yöntem başına token analizi. Kodunuz hakkında ayrıntılı içgörüler elde edin.
  - icon: 🌍
    title: 14+ Dil Desteği
    details: JavaScript, TypeScript, Python, PHP, Ruby, Java, Kotlin, C#, Go, Rust, Swift, C/C++, Scala.
  - icon: 📊
    title: TOON Formatı
    details: Optimize edilmiş çıktı formatı ile %40-50 token azaltma. LLM kullanım maliyetlerinden tasarruf edin.
---

<script setup>
import GitHubStars from '../.vitepress/components/GitHubStars.vue'
</script>

<div class="home-content">
  <div class="hero-badges">
    <GitHubStars />
    <a href="https://www.npmjs.com/package/ctxman" target="_blank" rel="noopener">
      <img src="https://badge.fury.io/js/ctxman.svg" alt="npm versiyon" />
    </a>
    <a href="https://github.com/hakkisagdic/ctxman/blob/main/LICENSE" target="_blank" rel="noopener">
      <img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="Lisans: MIT" />
    </a>
  </div>

  <div class="quick-install">
    <h3>Hızlı Kurulum</h3>
    <div class="code-block">
      <code>npm install -g ctxman</code>
    </div>
  </div>
</div>

<style>
.home-content {
  text-align: center;
  padding: 2rem 0;
}

.hero-badges {
  display: flex;
  gap: 0.5rem;
  justify-content: center;
  flex-wrap: wrap;
  margin-bottom: 2rem;
}

.quick-install {
  margin: 2rem 0;
}

.quick-install h3 {
  font-size: 1.2rem;
  margin-bottom: 1rem;
}

.code-block {
  display: inline-block;
  background: var(--vp-code-block-bg);
  padding: 1rem 2rem;
  border-radius: 8px;
  font-family: var(--vp-font-family-mono);
}

.code-block code {
  font-size: 1rem;
}
</style>

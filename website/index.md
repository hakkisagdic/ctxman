---
layout: home
title: Ctxman - AI Development Platform
description: AI Development Platform with plugin architecture, Git integration, REST API, and watch mode. Supporting 14+ programming languages with method-level filtering and LLM optimization.

hero:
  name: Ctxman
  text: AI Development Platform
  tagline: Plugin architecture, Git integration, REST API, and watch mode. Supporting 14+ programming languages with LLM optimization.
  image:
    src: /logo.svg
    alt: Ctxman Logo
  actions:
    - theme: brand
      text: Get Started
      link: /getting-started
    - theme: alt
      text: View on GitHub
      link: https://github.com/hakkisagdic/ctxman
    - theme: alt
      text: Interactive Demo
      link: /demo

features:
  - icon: 🔌
    title: Plugin Architecture
    details: Modular, extensible system for languages and exporters. Create custom plugins for any use case.
  - icon: 🔀
    title: Git Integration
    details: Analyze only changed files, diff analysis, author tracking. Perfect for code review workflows.
  - icon: 👁️
    title: Watch Mode
    details: Real-time file monitoring and auto-analysis. See changes instantly as you code.
  - icon: 🌐
    title: REST API
    details: HTTP server for programmatic access with 6 endpoints. Integrate with any tool or workflow.
  - icon: ⚡
    title: High Performance
    details: Scans ~2,000 files in under 100 ms and counts 2.6M tokens in about 6 seconds. Watch mode re-analyzes only what changed.
  - icon: 🎯
    title: Method-Level Analysis
    details: Analyze tokens per function/method. Get granular insights into your code.
  - icon: 🌍
    title: 14+ Languages
    details: JavaScript, TypeScript, Python, PHP, Ruby, Java, Kotlin, C#, Go, Rust, Swift, C/C++, Scala.
  - icon: 📊
    title: TOON Format
    details: 40-50% token reduction with optimized output format. Save costs on LLM usage.
---

<script setup>
import GitHubStars from './.vitepress/components/GitHubStars.vue'
</script>

<div class="home-content">
  <div class="hero-badges">
    <GitHubStars />
    <a href="https://www.npmjs.com/package/ctxman" target="_blank" rel="noopener">
      <img src="https://badge.fury.io/js/ctxman.svg" alt="npm version" />
    </a>
    <a href="https://github.com/hakkisagdic/ctxman/blob/main/LICENSE" target="_blank" rel="noopener">
      <img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT" />
    </a>
  </div>

  <div class="quick-install">
    <h3>Quick Install</h3>
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

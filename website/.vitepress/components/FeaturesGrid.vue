<script setup>
import { ref } from 'vue';

const features = ref([
  {
    icon: '🔌',
    title: 'Plugin Architecture',
    description:
      'Modular, extensible system for languages and exporters. Create custom plugins for any use case.',
    link: '/features#plugin-architecture',
  },
  {
    icon: '🔀',
    title: 'Git Integration',
    description:
      'Analyze only changed files, diff analysis, author tracking. Perfect for code review workflows.',
    link: '/features#git-integration',
  },
  {
    icon: '👁️',
    title: 'Watch Mode',
    description: 'Real-time file monitoring and auto-analysis. See changes instantly as you code.',
    link: '/features#watch-mode',
  },
  {
    icon: '🌐',
    title: 'REST API',
    description:
      'HTTP server for programmatic access with 6 endpoints. Integrate with any tool or workflow.',
    link: '/features#rest-api',
  },
  {
    icon: '⚡',
    title: 'High Performance',
    description:
      'Caching system, parallel processing for 5-10x faster analysis. Handle large codebases easily.',
    link: '/features#performance',
  },
  {
    icon: '🎯',
    title: 'Method-Level Analysis',
    description: 'Analyze tokens per function/method. Get granular insights into your code.',
    link: '/features#method-level',
  },
  {
    icon: '🌍',
    title: '14+ Languages',
    description:
      'JavaScript, TypeScript, Python, PHP, Ruby, Java, Kotlin, C#, Go, Rust, Swift, C/C++, Scala.',
    link: '/features#languages',
  },
  {
    icon: '📊',
    title: 'TOON Format',
    description: '40-50% token reduction with optimized output format. Save costs on LLM usage.',
    link: '/features#toon-format',
  },
]);
</script>

<template>
  <div class="features-grid">
    <a v-for="feature in features" :key="feature.title" :href="feature.link" class="feature-card">
      <div class="feature-icon">{{ feature.icon }}</div>
      <h3 class="feature-title">{{ feature.title }}</h3>
      <p class="feature-description">{{ feature.description }}</p>
    </a>
  </div>
</template>

<style scoped>
.feature-card {
  text-decoration: none;
  color: inherit;
  display: block;
}
</style>

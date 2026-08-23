<script setup>
import { ref } from 'vue';

const props = defineProps({
  title: {
    type: String,
    default: 'Ctxman',
  },
  tagline: {
    type: String,
    default: 'AI Development Platform',
  },
  description: {
    type: String,
    default: '',
  },
});
</script>

<template>
  <div class="hero-section">
    <h1 class="hero-title">{{ title }}</h1>
    <p class="hero-tagline">{{ tagline }}</p>
    <p v-if="description" class="hero-description">{{ description }}</p>
    <div class="hero-actions">
      <slot name="actions"></slot>
    </div>
    <div class="hero-badges">
      <slot name="badges"></slot>
    </div>
  </div>
</template>

<style scoped>
.hero-section {
  text-align: center;
  padding: 3rem 0;
}

.hero-title {
  font-size: 3rem;
  font-weight: 700;
  line-height: 1.2;
  margin-bottom: 1rem;
  background: linear-gradient(120deg, #84fab0 0%, #8fd3f4 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.hero-tagline {
  font-size: 1.5rem;
  color: var(--vp-c-text-1);
  margin-bottom: 1rem;
}

.hero-description {
  font-size: 1.1rem;
  color: var(--vp-c-text-2);
  max-width: 600px;
  margin: 0 auto 2rem;
}

.hero-actions {
  display: flex;
  gap: 1rem;
  justify-content: center;
  flex-wrap: wrap;
  margin-bottom: 2rem;
}

.hero-badges {
  display: flex;
  gap: 0.5rem;
  justify-content: center;
  flex-wrap: wrap;
}

@media (max-width: 768px) {
  .hero-title {
    font-size: 2rem;
  }

  .hero-tagline {
    font-size: 1.2rem;
  }

  .hero-description {
    font-size: 1rem;
  }

  .hero-actions {
    flex-direction: column;
    align-items: center;
  }
}
</style>

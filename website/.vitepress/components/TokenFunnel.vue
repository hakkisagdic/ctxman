<script setup>
import { computed } from 'vue';
import showcase from '../data/showcase.json';

const props = defineProps({
  lang: { type: String, default: 'en' },
});

const text = {
  en: {
    steps: ['Everything in git', '+ .contextignore', '+ .contextinclude'],
    notes: ['no configuration', 'build output and lockfiles out', 'source only'],
    files: 'files',
    tokens: 'tokens',
    fits: 'fits Claude Sonnet 4.5 (200K)',
  },
  tr: {
    steps: ["Git'teki her şey", '+ .contextignore', '+ .contextinclude'],
    notes: ['yapılandırma yok', 'derleme çıktıları ve lock dosyaları hariç', 'yalnız kaynak kod'],
    files: 'dosya',
    tokens: 'token',
    fits: "Claude Sonnet 4.5'e sığar (200K)",
  },
};

const t = computed(() => text[props.lang] ?? text.en);
const locale = computed(() => (props.lang === 'tr' ? 'tr-TR' : 'en-US'));

const rows = computed(() => {
  const { raw, contextignore, contextinclude } = showcase.examples;
  const max = raw.tokens;
  return [raw, contextignore, contextinclude].map((step, i) => ({
    label: t.value.steps[i],
    note: t.value.notes[i],
    files: step.files,
    tokens: step.tokens,
    width: Math.max(4, Math.round((step.tokens / max) * 100)),
    fits: i === 2 && step.tokens <= 200000,
  }));
});

const format = (value) => value.toLocaleString(locale.value);
</script>

<template>
  <ol class="funnel">
    <li v-for="row in rows" :key="row.label" class="row">
      <div class="head">
        <span class="label">{{ row.label }}</span>
        <span class="note">{{ row.note }}</span>
      </div>
      <div class="track" aria-hidden="true">
        <span class="bar" :class="{ fits: row.fits }" :style="{ width: `${row.width}%` }"></span>
      </div>
      <div class="numbers">
        <strong>{{ format(row.tokens) }}</strong> {{ t.tokens }} · {{ format(row.files) }}
        {{ t.files }}
        <span v-if="row.fits" class="fits-badge">✓ {{ t.fits }}</span>
      </div>
    </li>
  </ol>
</template>

<style scoped>
.funnel {
  display: grid;
  gap: 1.1rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.25rem 0.6rem;
  margin-bottom: 0.4rem;
}

.label {
  font: 600 0.9rem/1.4 var(--vp-font-family-mono);
  color: var(--vp-c-text-1);
}

.note {
  font-size: 0.8rem;
  color: var(--vp-c-text-2);
}

.track {
  height: 10px;
  border-radius: 999px;
  background: var(--vp-c-default-soft);
  overflow: hidden;
}

.bar {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #8b93ff, #646cff);
  transform-origin: left;
  animation: grow 0.9s cubic-bezier(0.2, 0.7, 0.2, 1) both;
}

.bar.fits {
  background: linear-gradient(90deg, #34d399, #10b981);
}

.numbers {
  margin-top: 0.4rem;
  font-size: 0.82rem;
  color: var(--vp-c-text-2);
}

.numbers strong {
  color: var(--vp-c-text-1);
  font-variant-numeric: tabular-nums;
}

.fits-badge {
  display: inline-block;
  margin-left: 0.4rem;
  padding: 0 0.5rem;
  border-radius: 999px;
  background: rgba(16, 185, 129, 0.14);
  color: #059669;
  font-size: 0.75rem;
  font-weight: 600;
  line-height: 1.6;
}

.dark .fits-badge {
  color: #34d399;
}

@keyframes grow {
  from {
    transform: scaleX(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .bar {
    animation: none;
  }
}
</style>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import showcase from '../data/showcase.json';

const props = defineProps({
  lang: { type: String, default: 'en' },
});

const text = {
  en: {
    title: 'Fit a real repository into a context window',
    window: 'Context window',
    tokens: 'tokens',
    of: 'of the window',
    fits: 'fits',
    over: '× the window',
    next: 'Next step',
    restart: 'Start over',
    source: `ctxman on its own repository, commit ${showcase.meta.commit}, exact tiktoken counts`,
    steps: [
      ['Everything in git', 'no configuration'],
      ['+ .contextignore', 'build output and lockfiles out'],
      ['+ .contextinclude', 'source code only'],
      ['+ method map', 'signatures with lines and token counts'],
      ['+ TOON', 'the same map, compact encoding'],
    ],
  },
  tr: {
    title: 'Gerçek bir repoyu bağlam penceresine sığdırın',
    window: 'Bağlam penceresi',
    tokens: 'token',
    of: 'pencerenin',
    fits: 'sığar',
    over: '× pencere',
    next: 'Sonraki adım',
    restart: 'Baştan başla',
    source: `ctxman kendi reposunda, ${showcase.meta.commit} commit'i, tiktoken ile birebir sayım`,
    steps: [
      ["Git'teki her şey", 'yapılandırma yok'],
      ['+ .contextignore', 'derleme çıktıları ve lock dosyaları hariç'],
      ['+ .contextinclude', 'yalnız kaynak kod'],
      ['+ metot haritası', 'satır ve token sayısıyla imzalar'],
      ['+ TOON', 'aynı harita, kompakt kodlama'],
    ],
  },
};

const t = computed(() => text[props.lang] ?? text.en);
const locale = computed(() => (props.lang === 'tr' ? 'tr-TR' : 'en-US'));
const format = (value) => Math.round(value).toLocaleString(locale.value);

const { raw, contextignore, contextinclude, formats } = showcase.examples;
const STEPS = [
  { tokens: raw.tokens, command: 'ctxman --cli' },
  { tokens: contextignore.tokens, command: 'ctxman --cli', file: '.contextignore' },
  { tokens: contextinclude.tokens, command: 'ctxman --cli', file: '.contextinclude' },
  { tokens: formats.methods.json, command: 'ctxman --cli -m --context-export' },
  { tokens: formats.methods.toon, command: 'ctxman --cli -m --context-export -o toon' },
];
const WINDOWS = [
  { label: '32K', tokens: 32000 },
  { label: '128K', tokens: 128000 },
  { label: '200K', tokens: 200000 },
  { label: '1M', tokens: 1000000 },
];

const step = ref(0);
const windowSize = ref(200000);
const current = computed(() => STEPS[step.value]);
const fits = computed(() => current.value.tokens <= windowSize.value);
const ratio = computed(() => current.value.tokens / windowSize.value);

// Both bars share one scale: the larger of the window and the repository
const scale = computed(() => Math.max(windowSize.value, current.value.tokens));
const barWidth = computed(() => Math.max(0.6, (current.value.tokens / scale.value) * 100));
const frameWidth = computed(() => (windowSize.value / scale.value) * 100);

const verdict = computed(() =>
  fits.value
    ? `${Math.max(1, Math.round(ratio.value * 100))}% ${t.value.of} · ${t.value.fits}`
    : `${ratio.value >= 10 ? Math.round(ratio.value) : ratio.value.toFixed(1)}${t.value.over}`
);

// Animated counter between steps
const shown = ref(STEPS[0].tokens);
let frame = 0;
watch(
  () => current.value.tokens,
  (to) => {
    cancelAnimationFrame(frame);
    const from = shown.value;
    const start = performance.now();
    const tick = (now) => {
      const p = Math.min(1, (now - start) / 600);
      shown.value = from + (to - from) * (1 - Math.pow(1 - p, 3));
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
  }
);

// Plays through the steps once when the demo scrolls into view; any click takes over
const root = ref(null);
let timer = 0;
let observer = null;
const stopAutoplay = () => clearInterval(timer);
function autoplay() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  timer = setInterval(() => {
    if (step.value >= STEPS.length - 1) return stopAutoplay();
    step.value++;
  }, 1500);
}

onMounted(() => {
  observer = new IntersectionObserver(
    ([entry]) => {
      if (entry.isIntersecting) {
        autoplay();
        observer.disconnect();
      }
    },
    { threshold: 0.5 }
  );
  observer.observe(root.value);
});

onBeforeUnmount(() => {
  stopAutoplay();
  observer?.disconnect();
  cancelAnimationFrame(frame);
});

function choose(index) {
  stopAutoplay();
  step.value = index;
}

function advance() {
  choose(step.value >= STEPS.length - 1 ? 0 : step.value + 1);
}

function setWindow(tokens) {
  stopAutoplay();
  windowSize.value = tokens;
}
</script>

<template>
  <section ref="root" class="demo" :aria-label="t.title">
    <header class="demo-head">
      <p class="demo-title">{{ t.title }}</p>
      <div class="windows" role="radiogroup" :aria-label="t.window">
        <button
          v-for="w in WINDOWS"
          :key="w.label"
          type="button"
          role="radio"
          :aria-checked="windowSize === w.tokens"
          :class="{ active: windowSize === w.tokens }"
          @click="setWindow(w.tokens)"
        >
          {{ w.label }}
        </button>
      </div>
    </header>

    <div class="readout" aria-live="polite">
      <span class="count">{{ format(shown) }}</span>
      <span class="unit">{{ t.tokens }}</span>
      <span class="verdict" :class="{ ok: fits }">{{ verdict }}</span>
    </div>

    <div class="track" aria-hidden="true">
      <span class="frame" :style="{ width: `${frameWidth}%` }"></span>
      <span class="bar" :class="{ ok: fits }" :style="{ width: `${barWidth}%` }"></span>
    </div>
    <p class="legend">
      <span class="key frame-key" aria-hidden="true"></span>{{ t.window }}: {{ format(windowSize) }}
      {{ t.tokens }}
    </p>

    <ol class="steps">
      <li v-for="(s, i) in t.steps" :key="s[0]">
        <button
          type="button"
          :class="{ active: i === step, done: i < step }"
          :aria-current="i === step ? 'step' : undefined"
          @click="choose(i)"
        >
          <span class="step-no" aria-hidden="true">{{ i + 1 }}</span>
          <span class="step-text">
            <span class="step-name">{{ s[0] }}</span>
            <span class="step-note">{{ s[1] }}</span>
          </span>
          <span class="step-tokens">{{ format(STEPS[i].tokens) }}</span>
        </button>
      </li>
    </ol>

    <footer class="demo-foot">
      <code class="cmd"
        ><span class="sigil">$</span> {{ current.command
        }}<span v-if="current.file" class="with"> # + {{ current.file }}</span></code
      >
      <button type="button" class="next" @click="advance">
        {{ step >= STEPS.length - 1 ? t.restart : t.next }} →
      </button>
    </footer>
    <p class="source">{{ t.source }}</p>
  </section>
</template>

<style scoped>
.demo {
  --ok: #10b981;
  --over: #f43f5e;
  padding: clamp(1.1rem, 3vw, 1.75rem);
  border: 1px solid var(--vp-c-divider);
  border-radius: 20px;
  background: var(--vp-c-bg-soft);
  box-shadow: 0 24px 60px -36px rgba(39, 43, 92, 0.45);
}

.demo-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.demo-title {
  margin: 0;
  font: 600 0.75rem/1.4 var(--vp-font-family-mono);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--vp-c-text-2);
}

.windows {
  display: inline-flex;
  padding: 3px;
  border-radius: 999px;
  background: var(--vp-c-default-soft);
}

.windows button {
  padding: 0.2rem 0.7rem;
  border-radius: 999px;
  color: var(--vp-c-text-2);
  font: 600 0.78rem/1.5 var(--vp-font-family-mono);
  transition:
    background 0.2s,
    color 0.2s;
}

.windows button.active {
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
}

.readout {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.35rem 0.6rem;
  margin-top: 1.1rem;
}

.count {
  font-size: clamp(2rem, 5vw, 2.75rem);
  font-weight: 800;
  letter-spacing: -0.03em;
  font-variant-numeric: tabular-nums;
  color: var(--vp-c-text-1);
}

.unit {
  color: var(--vp-c-text-2);
  font-size: 0.95rem;
}

.verdict {
  margin-left: auto;
  padding: 0.15rem 0.65rem;
  border-radius: 999px;
  background: rgba(244, 63, 94, 0.12);
  color: #e11d48;
  font: 700 0.8rem/1.6 var(--vp-font-family-mono);
}

.verdict.ok {
  background: rgba(16, 185, 129, 0.14);
  color: #059669;
}

.dark .verdict {
  color: #fb7185;
}

.dark .verdict.ok {
  color: #34d399;
}

.track {
  position: relative;
  height: 46px;
  margin-top: 0.9rem;
  border-radius: 12px;
  background: var(--vp-c-default-soft);
  overflow: hidden;
}

.frame {
  position: absolute;
  inset: 0 auto 0 0;
  border: 2px dashed var(--vp-c-text-3);
  border-radius: 12px;
  transition: width 0.6s cubic-bezier(0.2, 0.7, 0.2, 1);
  z-index: 2;
  pointer-events: none;
}

.legend {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  margin: 0.45rem 0 0;
  font: 600 0.72rem/1.4 var(--vp-font-family-mono);
  color: var(--vp-c-text-2);
}

.key {
  width: 14px;
  height: 10px;
  border: 2px dashed var(--vp-c-text-3);
  border-radius: 3px;
}

.bar {
  position: absolute;
  inset: 8px auto 8px 0;
  border-radius: 0 8px 8px 0;
  background: repeating-linear-gradient(
    135deg,
    var(--over) 0 10px,
    color-mix(in srgb, var(--over) 75%, transparent) 10px 20px
  );
  transition:
    width 0.6s cubic-bezier(0.2, 0.7, 0.2, 1),
    background 0.3s;
}

.bar.ok {
  background: linear-gradient(90deg, #34d399, var(--ok));
}

.steps {
  display: grid;
  gap: 0.35rem;
  margin: 1rem 0 0;
  padding: 0;
  list-style: none;
}

.steps button {
  display: grid;
  grid-template-columns: 1.4rem minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.1rem 0.6rem;
  width: 100%;
  padding: 0.5rem 0.75rem;
  border: 1px solid transparent;
  border-radius: 10px;
  text-align: left;
  transition:
    border-color 0.2s,
    background 0.2s;
}

.steps button:hover,
.steps button:focus-visible {
  border-color: var(--vp-c-divider);
  background: var(--vp-c-bg);
}

.steps button.active {
  border-color: var(--vp-c-brand-1);
  background: var(--vp-c-bg);
  box-shadow: 0 0 0 3px var(--vp-c-brand-soft);
}

.step-no {
  display: grid;
  place-items: center;
  width: 1.4rem;
  height: 1.4rem;
  border-radius: 50%;
  background: var(--vp-c-default-soft);
  font: 700 0.7rem/1 var(--vp-font-family-mono);
  color: var(--vp-c-text-2);
}

.steps button.done .step-no,
.steps button.active .step-no {
  background: var(--vp-c-brand-1);
  color: var(--vp-c-white);
}

.step-text {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0 0.5rem;
  min-width: 0;
}

.step-name {
  font: 600 0.82rem/1.4 var(--vp-font-family-mono);
  color: var(--vp-c-text-1);
}

.step-note {
  font-size: 0.76rem;
  line-height: 1.4;
  color: var(--vp-c-text-2);
}

.step-tokens {
  font: 600 0.8rem/1.4 var(--vp-font-family-mono);
  font-variant-numeric: tabular-nums;
  color: var(--vp-c-text-2);
}

.steps button.active .step-tokens {
  color: var(--vp-c-brand-1);
}

.demo-foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
  margin-top: 1rem;
}

.cmd {
  flex: 1;
  min-width: 0;
  padding: 0.55rem 0.8rem;
  border-radius: 10px;
  background: #0f1117;
  color: #e5e9f2;
  font: 0.8rem/1.5 var(--vp-font-family-mono);
  white-space: nowrap;
  overflow-x: auto;
}

.sigil {
  color: #8b93ff;
  user-select: none;
}

.with {
  color: #7d869a;
}

.next {
  flex: none;
  padding: 0.5rem 0.95rem;
  border-radius: 999px;
  background: var(--vp-c-brand-1);
  color: var(--vp-c-white);
  font-size: 0.85rem;
  font-weight: 600;
  transition: background 0.2s;
}

.next:hover,
.next:focus-visible {
  background: var(--vp-c-brand-2);
}

.source {
  margin: 0.75rem 0 0;
  font-size: 0.75rem;
  color: var(--vp-c-text-3);
}

@media (max-width: 720px) {
  .verdict {
    margin-left: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .frame,
  .bar {
    transition: none;
  }
}
</style>

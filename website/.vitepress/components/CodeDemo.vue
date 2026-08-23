<script setup>
import { ref, computed } from 'vue';

const props = defineProps({
  code: {
    type: String,
    default: '',
  },
  language: {
    type: String,
    default: 'javascript',
  },
  title: {
    type: String,
    default: 'Terminal',
  },
});

const copied = ref(false);

const copyCode = async () => {
  await navigator.clipboard.writeText(props.code);
  copied.value = true;
  setTimeout(() => {
    copied.value = false;
  }, 2000);
};
</script>

<template>
  <div class="code-demo">
    <div class="code-demo-header">
      <span class="code-demo-dot red"></span>
      <span class="code-demo-dot yellow"></span>
      <span class="code-demo-dot green"></span>
      <span class="code-demo-title">{{ title }}</span>
      <button class="copy-button" @click="copyCode" :title="copied ? 'Copied!' : 'Copy code'">
        <svg
          v-if="!copied"
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>
        <svg
          v-else
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      </button>
    </div>
    <div class="code-demo-content">
      <pre><code :class="`language-${language}`">{{ code }}</code></pre>
    </div>
  </div>
</template>

<style scoped>
.code-demo-title {
  flex: 1;
  margin-left: 0.5rem;
  font-size: 0.85rem;
  color: var(--vp-c-text-2);
}

.copy-button {
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 0.25rem;
  color: var(--vp-c-text-2);
  transition: color 0.2s;
}

.copy-button:hover {
  color: var(--vp-c-text-1);
}

pre {
  margin: 0;
  padding: 0;
  background: transparent;
  overflow-x: auto;
}

code {
  font-family: var(--vp-font-family-mono);
  font-size: 0.9rem;
  line-height: 1.6;
}
</style>

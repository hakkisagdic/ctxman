<script setup>
import { ref } from 'vue';

const props = defineProps({
  // Shown in the title bar: a file name or what the session is
  title: { type: String, default: '' },
  // A shell command, shown with a prompt and copied by the copy button
  command: { type: String, default: '' },
  output: { type: String, default: '' },
  copyLabel: { type: String, default: 'Copy' },
  copiedLabel: { type: String, default: 'Copied' },
});

const copied = ref(false);

async function copy() {
  try {
    await navigator.clipboard.writeText(props.command || props.output);
    copied.value = true;
    setTimeout(() => (copied.value = false), 1600);
  } catch {
    // Clipboard blocked (permissions, insecure context): the text stays selectable
  }
}
</script>

<template>
  <figure class="terminal">
    <figcaption class="terminal-bar">
      <span class="dots" aria-hidden="true"><i></i><i></i><i></i></span>
      <span class="title">{{ title }}</span>
      <button type="button" class="copy" @click="copy">
        {{ copied ? copiedLabel : copyLabel }}
      </button>
    </figcaption>
    <pre
      class="terminal-body"
    ><code><span v-if="command" class="prompt"><span class="sigil">$</span> {{ command }}
</span>{{ output }}</code></pre>
  </figure>
</template>

<style scoped>
.terminal {
  margin: 1.25rem 0;
  border-radius: 12px;
  overflow: hidden;
  background: #0f1117;
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 12px 32px -16px rgba(15, 17, 23, 0.45);
}

.terminal-bar {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.55rem 0.9rem;
  background: #171a23;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.dots {
  display: inline-flex;
  gap: 6px;
}

.dots i {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #3a3f4b;
}

.title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #9aa3b5;
  font: 500 0.78rem/1.4 var(--vp-font-family-mono);
}

.copy {
  flex: none;
  padding: 0.15rem 0.6rem;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 6px;
  color: #c9d1e3;
  font-size: 0.75rem;
  line-height: 1.5;
  transition:
    border-color 0.2s,
    color 0.2s;
}

.copy:hover,
.copy:focus-visible {
  border-color: #8b93ff;
  color: #fff;
}

.terminal-body {
  margin: 0;
  padding: 1rem 1.1rem 1.1rem;
  overflow-x: auto;
  color: #d6dbe7;
  font: 0.8rem/1.6 var(--vp-font-family-mono);
  white-space: pre;
}

.prompt {
  color: #f2f4f8;
}

.sigil {
  color: #8b93ff;
  user-select: none;
}

@media (max-width: 640px) {
  .terminal {
    border-radius: 10px;
  }

  .terminal-body {
    font-size: 0.72rem;
  }
}
</style>

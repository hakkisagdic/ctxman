<!-- CodeViewer.vue - Syntax highlighted code display -->
<template>
  <div class="code-viewer">
    <div class="viewer-header">
      <span class="file-path">{{ filePath }}</span>
      <div class="actions">
        <button @click="copyCode" class="btn-icon" title="Copy">📋</button>
        <button @click="$emit('close')" class="btn-icon" title="Close">✕</button>
      </div>
    </div>

    <div class="code-content">
      <pre><code>{{ code }}</code></pre>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';

const props = defineProps({
  filePath: String,
  code: String,
});

const emit = defineEmits(['close']);

async function copyCode() {
  try {
    await navigator.clipboard.writeText(props.code);
    // TODO: Show toast notification
  } catch (error) {
    console.error('Failed to copy:', error);
  }
}
</script>

<style scoped>
.code-viewer {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #1e1e1e;
  border-radius: 4px;
  overflow: hidden;
}

.viewer-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 1rem;
  background: #252526;
  border-bottom: 1px solid #3e3e42;
}

.file-path {
  font-size: 0.9rem;
  color: #888;
  font-family: 'Monaco', 'Courier New', monospace;
}

.actions {
  display: flex;
  gap: 0.5rem;
}

.btn-icon {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 1rem;
  padding: 0.25rem;
  opacity: 0.7;
  transition: opacity 0.2s;
  color: #e0e0e0;
}

.btn-icon:hover {
  opacity: 1;
}

.code-content {
  flex: 1;
  overflow: auto;
  padding: 1rem;
}

pre {
  margin: 0;
  font-family: 'Monaco', 'Courier New', monospace;
  font-size: 0.9rem;
  line-height: 1.5;
}

code {
  color: #d4d4d4;
}
</style>

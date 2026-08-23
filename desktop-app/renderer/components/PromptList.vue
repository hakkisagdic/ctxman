<!-- PromptList.vue - MCP Prompts display -->
<template>
  <div class="prompt-list">
    <div class="list-header">
      <h3>💡 MCP Prompts</h3>
      <button @click="refresh" class="btn-icon" :disabled="loading">
        {{ loading ? '⏳' : '🔄' }}
      </button>
    </div>

    <div v-if="loading && !prompts.length" class="loading">Loading prompts...</div>

    <div v-else-if="prompts.length" class="prompts">
      <div
        v-for="prompt in prompts"
        :key="prompt.name"
        class="prompt-card"
        @click="selectPrompt(prompt)"
      >
        <div class="prompt-header">
          <h4>{{ prompt.title || prompt.name }}</h4>
          <span class="prompt-badge">{{ prompt.arguments.length }} args</span>
        </div>
        <p class="prompt-description">{{ prompt.description }}</p>

        <div v-if="prompt.arguments.length" class="prompt-args">
          <div v-for="arg in prompt.arguments.slice(0, 3)" :key="arg.name" class="arg-tag">
            <span class="arg-name">{{ arg.name }}</span>
            <span v-if="arg.required" class="arg-required">*</span>
          </div>
          <span v-if="prompt.arguments.length > 3" class="more-args">
            +{{ prompt.arguments.length - 3 }} more
          </span>
        </div>
      </div>
    </div>

    <div v-else class="empty-state">
      <p>No prompts available</p>
      <button @click="refresh" class="btn-primary">Load Prompts</button>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';

const emit = defineEmits(['select']);

const prompts = ref([]);
const loading = ref(false);

async function refresh() {
  loading.value = true;
  try {
    const result = await window.api.mcp.listPrompts();
    prompts.value = result.prompts || [];
  } catch (error) {
    console.error('Failed to load prompts:', error);
  } finally {
    loading.value = false;
  }
}

function selectPrompt(prompt) {
  emit('select', prompt);
}

defineExpose({ refresh });
</script>

<style scoped>
.prompt-list {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  border-bottom: 1px solid #3e3e42;
}

.list-header h3 {
  margin: 0;
}

.btn-icon {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 1.2rem;
  padding: 0.25rem;
  opacity: 0.7;
  transition: opacity 0.2s;
}

.btn-icon:hover:not(:disabled) {
  opacity: 1;
}

.prompts {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
  display: grid;
  gap: 1rem;
}

.prompt-card {
  padding: 1.5rem;
  background: #252526;
  border-radius: 4px;
  border-left: 3px solid #8b5cf6;
  cursor: pointer;
  transition: all 0.2s;
}

.prompt-card:hover {
  background: #2a2d2e;
  transform: translateX(4px);
}

.prompt-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
}

.prompt-header h4 {
  margin: 0;
  font-size: 1.1rem;
}

.prompt-badge {
  background: #3e3e42;
  padding: 0.25rem 0.75rem;
  border-radius: 12px;
  font-size: 0.8rem;
  color: #aaa;
}

.prompt-description {
  margin: 0 0 1rem 0;
  color: #aaa;
  line-height: 1.5;
}

.prompt-args {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
}

.arg-tag {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.75rem;
  background: #1e1e1e;
  border-radius: 4px;
  font-size: 0.85rem;
  font-family: monospace;
}

.arg-name {
  color: #89d185;
}

.arg-required {
  color: #f48771;
  font-weight: bold;
}

.more-args {
  font-size: 0.85rem;
  color: #888;
  font-style: italic;
}

.loading,
.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  color: #888;
}

.btn-primary {
  padding: 0.75rem 1.5rem;
  background: #0e639c;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.btn-primary:hover {
  opacity: 0.8;
}
</style>

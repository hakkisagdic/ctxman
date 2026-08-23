<!-- ResourceList.vue - MCP Resources display -->
<template>
  <div class="resource-list">
    <div class="list-header">
      <h3>📦 MCP Resources</h3>
      <button @click="refresh" class="btn-icon" :disabled="loading">
        {{ loading ? '⏳' : '🔄' }}
      </button>
    </div>

    <div v-if="loading && !resources.length" class="loading">Loading resources...</div>

    <div v-else-if="resources.length" class="resources">
      <div
        v-for="resource in resources"
        :key="resource.uri"
        class="resource-card"
        @click="selectResource(resource)"
      >
        <div class="resource-icon">
          {{ getResourceIcon(resource.uri) }}
        </div>
        <div class="resource-info">
          <div class="resource-name">{{ resource.name || 'Unnamed' }}</div>
          <div class="resource-uri">{{ resource.uri }}</div>
          <div v-if="resource.description" class="resource-description">
            {{ resource.description }}
          </div>
        </div>
      </div>
    </div>

    <div v-else class="empty-state">
      <p>No resources available</p>
      <button @click="refresh" class="btn-primary">Load Resources</button>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';

const emit = defineEmits(['select']);

const resources = ref([]);
const loading = ref(false);

async function refresh() {
  loading.value = true;
  try {
    const result = await window.api.mcp.listResources();
    resources.value = result.resources || [];
  } catch (error) {
    console.error('Failed to load resources:', error);
  } finally {
    loading.value = false;
  }
}

function selectResource(resource) {
  emit('select', resource);
}

function getResourceIcon(uri) {
  if (uri.startsWith('file://')) return '📄';
  if (uri.startsWith('analysis://')) return '📊';
  if (uri.startsWith('context://')) return '📝';
  return '📦';
}

defineExpose({ refresh });
</script>

<style scoped>
.resource-list {
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

.btn-icon:disabled {
  cursor: not-allowed;
  opacity: 0.3;
}

.resources {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
  display: grid;
  gap: 1rem;
}

.resource-card {
  display: flex;
  gap: 1rem;
  padding: 1rem;
  background: #252526;
  border-radius: 4px;
  border-left: 3px solid #0e639c;
  cursor: pointer;
  transition: all 0.2s;
}

.resource-card:hover {
  background: #2a2d2e;
  transform: translateX(4px);
}

.resource-icon {
  font-size: 2rem;
}

.resource-info {
  flex: 1;
  min-width: 0;
}

.resource-name {
  font-weight: 500;
  margin-bottom: 0.25rem;
}

.resource-uri {
  font-size: 0.85rem;
  color: #888;
  font-family: monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.resource-description {
  margin-top: 0.5rem;
  font-size: 0.9rem;
  color: #aaa;
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

<!-- FileBrowser.vue - File tree component -->
<template>
  <div class="file-browser">
    <div class="browser-header">
      <h3>📁 Files</h3>
      <button @click="refresh" class="btn-icon" title="Refresh">🔄</button>
    </div>

    <div v-if="loading" class="loading">Loading files...</div>

    <div v-else-if="files.length" class="file-tree">
      <FileTreeNode
        v-for="file in rootFiles"
        :key="file.path"
        :node="file"
        :depth="0"
        @select="$emit('select', $event)"
      />
    </div>

    <div v-else class="empty-state">
      <p>No files found</p>
      <button @click="$emit('select-directory')" class="btn-primary">Select Directory</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import FileTreeNode from './FileTreeNode.vue';

const props = defineProps({
  projectPath: String,
});

const emit = defineEmits(['select', 'select-directory']);

const files = ref([]);
const loading = ref(false);

const rootFiles = computed(() => {
  // Build tree structure
  const tree = {};

  files.value.forEach((file) => {
    const parts = file.relativePath.split('/');
    let current = tree;

    parts.forEach((part, index) => {
      if (!current[part]) {
        current[part] = {
          name: part,
          path: file.path,
          relativePath: parts.slice(0, index + 1).join('/'),
          isDirectory: index < parts.length - 1,
          children: {},
        };
      }
      current = current[part].children;
    });
  });

  return Object.values(tree);
});

async function refresh() {
  if (!props.projectPath) return;

  loading.value = true;
  try {
    const result = await window.api.cli.scanFiles(props.projectPath);
    if (result.success) {
      files.value = result.data.files || [];
    }
  } catch (error) {
    console.error('Failed to scan files:', error);
  } finally {
    loading.value = false;
  }
}

defineExpose({ refresh });
</script>

<style scoped>
.file-browser {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #252526;
  border-radius: 4px;
}

.browser-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  border-bottom: 1px solid #3e3e42;
}

.browser-header h3 {
  margin: 0;
  font-size: 1rem;
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

.btn-icon:hover {
  opacity: 1;
}

.file-tree {
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem;
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
  transition: opacity 0.2s;
}

.btn-primary:hover {
  opacity: 0.8;
}
</style>

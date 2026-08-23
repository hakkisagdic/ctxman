<!-- FileTreeNode.vue - Recursive file tree node -->
<template>
  <div class="tree-node">
    <div
      :class="['node-header', { selected: isSelected }]"
      :style="{ paddingLeft: `${depth * 1}rem` }"
      @click="toggle"
    >
      <span class="node-icon">
        {{ node.isDirectory ? (expanded ? '📂' : '📁') : '📄' }}
      </span>
      <span class="node-name">{{ node.name }}</span>
    </div>

    <div v-if="node.isDirectory && expanded" class="node-children">
      <FileTreeNode
        v-for="child in children"
        :key="child.path"
        :node="child"
        :depth="depth + 1"
        @select="$emit('select', $event)"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';

const props = defineProps({
  node: Object,
  depth: {
    type: Number,
    default: 0,
  },
});

const emit = defineEmits(['select']);

const expanded = ref(false);
const isSelected = ref(false);

const children = computed(() => {
  return Object.values(props.node.children || {});
});

function toggle() {
  if (props.node.isDirectory) {
    expanded.value = !expanded.value;
  } else {
    emit('select', props.node);
    isSelected.value = true;
  }
}
</script>

<style scoped>
.tree-node {
  user-select: none;
}

.node-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem;
  cursor: pointer;
  border-radius: 4px;
  transition: background 0.2s;
}

.node-header:hover {
  background: #2a2d2e;
}

.node-header.selected {
  background: #094771;
}

.node-icon {
  font-size: 1rem;
}

.node-name {
  font-size: 0.9rem;
  color: #e0e0e0;
}

.node-children {
  margin-left: 0;
}
</style>

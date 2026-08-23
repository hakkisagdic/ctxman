<!-- StatsPanel.vue - Analysis statistics display -->
<template>
  <div class="stats-panel">
    <div class="stats-header">
      <h3>Analysis Report</h3>
      <button @click="exportReport" class="btn-export" :disabled="!stats">💾 Export</button>
    </div>

    <div v-if="stats" class="stats-grid">
      <div class="stat-card">
        <div class="stat-value">{{ stats.totalFiles?.toLocaleString() || 0 }}</div>
        <div class="stat-label">Total Files</div>
      </div>

      <div class="stat-card">
        <div class="stat-value">{{ stats.totalLines?.toLocaleString() || 0 }}</div>
        <div class="stat-label">Total Lines</div>
      </div>

      <div class="stat-card">
        <div class="stat-value">{{ stats.totalTokens?.toLocaleString() || 0 }}</div>
        <div class="stat-label">Total Tokens</div>
      </div>

      <div class="stat-card">
        <div class="stat-value">{{ formatBytes(stats.totalBytes || 0) }}</div>
        <div class="stat-label">Total Size</div>
      </div>
    </div>

    <div v-if="stats?.byLanguage" class="language-breakdown">
      <h4>Languages</h4>
      <div class="language-list">
        <div v-for="(data, lang) in stats.byLanguage" :key="lang" class="language-item">
          <span class="language-name">{{ lang }}</span>
          <span class="language-count">{{ data.files }} files</span>
        </div>
      </div>
    </div>

    <div v-if="!stats" class="empty-state">
      <p>No analysis data available</p>
      <p class="hint">Run analysis to see statistics</p>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  stats: Object,
});

async function exportReport() {
  if (!props.stats) return;

  const content = JSON.stringify(props.stats, null, 2);
  const result = await window.api.fs.saveFile(content, 'analysis-report.json');

  if (result.success) {
    console.log('Report saved to:', result.filePath);
    // TODO: Show toast notification
  }
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}
</script>

<style scoped>
.stats-panel {
  padding: 1.5rem;
  background: #252526;
  border-radius: 4px;
}

.stats-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
}

.stats-header h3 {
  margin: 0;
}

.btn-export {
  background: #3e3e42;
  border: 1px solid #555;
  color: #e0e0e0;
  padding: 0.25rem 0.75rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.9rem;
}

.btn-export:hover:not(:disabled) {
  background: #4e4e52;
}

.btn-export:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.stats-panel h3 {
  margin: 0 0 1.5rem 0;
  font-size: 1.1rem;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 1rem;
  margin-bottom: 2rem;
}

.stat-card {
  padding: 1rem;
  background: #1e1e1e;
  border-radius: 4px;
  border-left: 3px solid #0e639c;
}

.stat-value {
  font-size: 1.8rem;
  font-weight: bold;
  color: #89d185;
  margin-bottom: 0.5rem;
}

.stat-label {
  font-size: 0.9rem;
  color: #888;
}

.language-breakdown h4 {
  margin: 0 0 1rem 0;
  font-size: 1rem;
  color: #888;
}

.language-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.language-item {
  display: flex;
  justify-content: space-between;
  padding: 0.75rem;
  background: #1e1e1e;
  border-radius: 4px;
}

.language-name {
  font-weight: 500;
}

.language-count {
  color: #888;
  font-size: 0.9rem;
}

.empty-state {
  text-align: center;
  padding: 3rem 1rem;
  color: #888;
}

.hint {
  margin-top: 0.5rem;
  font-size: 0.9rem;
}
</style>

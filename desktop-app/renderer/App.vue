<template>
  <div class="app">
    <header class="header">
      <div class="header-left">
        <h1>🚀 Ctxman</h1>
        <span class="version">v3.3.0</span>
      </div>
      <div class="header-right">
        <span :class="['status', { connected: mcpConnected }]">
          {{ mcpConnected ? '🟢 MCP Connected' : '🔴 MCP Disconnected' }}
        </span>
      </div>
    </header>

    <main class="main">
      <!-- Sidebar Navigation -->
      <div class="sidebar">
        <div class="project-selector">
          <button @click="selectProject" class="btn-select-project">
            📁 {{ projectPath ? 'Change Project' : 'Select Project' }}
          </button>
          <div v-if="projectPath" class="project-path">
            {{ truncatePath(projectPath) }}
          </div>
        </div>

        <nav class="nav">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            :class="['nav-btn', { active: activeTab === tab.id }]"
            @click="activeTab = tab.id"
          >
            {{ tab.icon }} {{ tab.label }}
          </button>
        </nav>
      </div>

      <!-- Main Content Area -->
      <div class="content">
        <!-- Project Tab -->
        <div v-if="activeTab === 'project'" class="tab-content">
          <div class="split-view">
            <div class="left-panel">
              <FileBrowser
                ref="fileBrowser"
                v-if="projectPath"
                :key="refreshKey"
                :root-path="projectPath"
                @select="handleFileSelect"
                @select-directory="selectProject"
              />
            </div>

            <div class="right-panel">
              <div class="action-bar">
                <button
                  @click="analyzeProject"
                  :disabled="!projectPath || analyzing"
                  class="btn-primary"
                >
                  {{ analyzing ? '⏳ Analyzing...' : '🔍 Analyze Project' }}
                </button>
              </div>

              <StatsPanel v-if="analysis" :stats="analysis.stats" />

              <CodeViewer
                v-if="selectedFile"
                :file-path="selectedFile.relativePath"
                :code="selectedFile.code"
                @close="selectedFile = null"
              />
            </div>
          </div>
        </div>

        <!-- Resources Tab -->
        <div v-if="activeTab === 'resources'" class="tab-content">
          <ResourceList ref="resourceList" @select="handleResourceSelect" />
        </div>

        <!-- Prompts Tab -->
        <div v-if="activeTab === 'prompts'" class="tab-content">
          <PromptList v-if="!selectedPrompt" ref="promptList" @select="handlePromptSelect" />
          <PromptTemplate v-else :prompt="selectedPrompt" @back="selectedPrompt = null" />
        </div>

        <!-- Context Wizard Tab -->
        <div v-if="activeTab === 'context'" class="tab-content">
          <ContextWizard @generate="handleContextGeneration" @cancel="activeTab = 'project'" />
        </div>

        <!-- Settings Tab -->
        <div v-if="activeTab === 'settings'" class="tab-content">
          <div class="settings-panel">
            <h2>⚙️ Settings</h2>

            <div class="settings-section">
              <h3>MCP Server</h3>
              <label class="setting-item">
                <input type="checkbox" v-model="settings.autoConnect" />
                <span>Auto-connect to MCP Server on startup</span>
              </label>
              <button @click="toggleMcpConnection" class="btn-secondary">
                {{ mcpConnected ? 'Disconnect MCP' : 'Connect MCP' }}
              </button>
            </div>

            <div class="settings-section">
              <h3>Analysis</h3>
              <label class="setting-item">
                <input type="checkbox" v-model="settings.methodLevel" />
                <span>Enable method-level analysis</span>
              </label>
              <label class="setting-item">
                <input type="checkbox" v-model="settings.verbose" />
                <span>Verbose logging</span>
              </label>
            </div>

            <div class="settings-section">
              <h3>UI</h3>
              <label class="setting-item">
                <input type="checkbox" v-model="settings.autoRefresh" />
                <span>Auto-refresh file tree on changes</span>
              </label>
            </div>
          </div>
        </div>
      </div>
    </main>

    <footer class="footer">
      <span class="footer-item"> {{ stats.filesAnalyzed }} files analyzed </span>
      <span class="footer-item"> {{ stats.totalTokens.toLocaleString() }} tokens </span>
      <span class="footer-item"> Ctxman Desktop v3.3.0 </span>
    </footer>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import FileBrowser from './components/FileBrowser.vue';
import CodeViewer from './components/CodeViewer.vue';
import StatsPanel from './components/StatsPanel.vue';
import ResourceList from './components/ResourceList.vue';
import PromptList from './components/PromptList.vue';
import PromptTemplate from './components/PromptTemplate.vue';
import ContextWizard from './components/ContextWizard.vue';

const activeTab = ref('project');
const projectPath = ref(null);
const analysis = ref(null);
const analyzing = ref(false);
const selectedFile = ref(null);
const selectedPrompt = ref(null);
const mcpConnected = ref(false);

const settings = reactive({
  autoConnect: true,
  methodLevel: false,
  verbose: false,
  autoRefresh: true,
});

const stats = reactive({
  filesAnalyzed: 0,
  totalTokens: 0,
});

const tabs = [
  { id: 'project', label: 'Project', icon: '📁' },
  { id: 'context', label: 'Context', icon: '🧙' },
  { id: 'resources', label: 'Resources', icon: '📦' },
  { id: 'prompts', label: 'Prompts', icon: '💡' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
];

// Refs to child components
const fileBrowser = ref(null);
const resourceList = ref(null);
const promptList = ref(null);

// Lifecycle
onMounted(async () => {
  if (settings.autoConnect) {
    await connectMcp();
  }
});

const refreshKey = ref(0);

function refreshFileBrowser() {
  refreshKey.value++;
}

// Project Management
async function selectProject() {
  const path = await window.api.fs.selectDirectory();
  if (path) {
    projectPath.value = path;
    // Reset state
    analysis.value = null;
    selectedFile.value = null;

    // Start watcher
    await window.api.watcher.start(path);

    // Initial refresh
    refreshFileBrowser();
  }
}

async function analyzeProject() {
  if (!projectPath.value || analyzing.value) return;

  analyzing.value = true;
  try {
    const result = await window.api.cli.analyze(projectPath.value, {
      methodLevel: settings.methodLevel,
      verbose: settings.verbose,
    });

    if (result.success) {
      analysis.value = result.data;
      stats.filesAnalyzed = result.data.stats?.totalFiles || 0;
      stats.totalTokens = result.data.stats?.totalTokens || 0;
    } else {
      console.error('Analysis failed:', result.error);
    }
  } catch (error) {
    console.error('Analysis error:', error);
  } finally {
    analyzing.value = false;
  }
}

// File Handling
async function handleFileSelect(file) {
  try {
    const code = await window.api.fs.readFile(file.path);
    selectedFile.value = {
      ...file,
      code,
    };
  } catch (error) {
    console.error('Failed to read file:', error);
  }
}

// Resource Handling
function handleResourceSelect(resource) {
  console.log('Selected resource:', resource);
  // TODO: Display resource content
}

// Prompt Handling
function handlePromptSelect(prompt) {
  console.log('Selected prompt:', prompt);
  selectedPrompt.value = prompt;
}

// Context Wizard Handling
async function handleContextGeneration(config) {
  console.log('Generating context with config:', config);

  try {
    const result = await window.api.cli.generateContext(projectPath.value, {
      template: config.format === 'toon' ? 'toon' : undefined,
      maxTokens: config.maxTokens,
    });

    if (result.success) {
      // Show success notification or switch to result view
      console.log('Context generated:', result.data);
      // For now, just log it. In real app, we'd show it.
    }
  } catch (error) {
    console.error('Context generation failed:', error);
  }
}

// Shortcuts
window.api.shortcuts.onOpenProject(() => {
  selectProject();
});

window.api.shortcuts.onRefresh(() => {
  if (projectPath.value) {
    refreshFileBrowser();
  }
});

// MCP Connection
async function connectMcp() {
  try {
    await window.api.mcp.connect({ cwd: projectPath.value || process.cwd() });
    mcpConnected.value = true;

    // Auto-load resources and prompts
    if (resourceList.value) await resourceList.value.refresh();
    if (promptList.value) await promptList.value.refresh();
  } catch (error) {
    console.error('MCP connection failed:', error);
    mcpConnected.value = false;
  }
}

async function disconnectMcp() {
  try {
    await window.api.mcp.disconnect();
    mcpConnected.value = false;
  } catch (error) {
    console.error('MCP disconnection failed:', error);
  }
}

async function toggleMcpConnection() {
  if (mcpConnected.value) {
    await disconnectMcp();
  } else {
    await connectMcp();
  }
}

// Utilities
function truncatePath(path) {
  if (!path) return '';
  const parts = path.split('/');
  if (parts.length > 3) {
    return `.../${parts.slice(-3).join('/')}`;
  }
  return path;
}
</script>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #1e1e1e;
  color: #e0e0e0;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 2rem;
  background: #252526;
  border-bottom: 1px solid #3e3e42;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.header h1 {
  margin: 0;
  font-size: 1.5rem;
}

.version {
  color: #888;
  font-size: 0.9rem;
}

.status {
  font-size: 0.9rem;
  color: #f48771;
}

.status.connected {
  color: #89d185;
}

.main {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.sidebar {
  width: 250px;
  background: #252526;
  border-right: 1px solid #3e3e42;
  display: flex;
  flex-direction: column;
}

.project-selector {
  padding: 1rem;
  border-bottom: 1px solid #3e3e42;
}

.btn-select-project {
  width: 100%;
  padding: 0.75rem;
  background: #0e639c;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.9rem;
}

.btn-select-project:hover {
  opacity: 0.8;
}

.project-path {
  margin-top: 0.5rem;
  font-size: 0.8rem;
  color: #888;
  word-break: break-all;
}

.nav {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 1rem 0;
}

.nav-btn {
  padding: 0.75rem 1rem;
  background: transparent;
  border: none;
  color: #e0e0e0;
  text-align: left;
  cursor: pointer;
  transition: background 0.2s;
  font-size: 0.95rem;
}

.nav-btn:hover {
  background: #2a2d2e;
}

.nav-btn.active {
  background: #094771;
  border-left: 3px solid #0e639c;
}

.content {
  flex: 1;
  overflow: hidden;
}

.tab-content {
  height: 100%;
  padding: 2rem;
  overflow-y: auto;
}

.split-view {
  display: grid;
  grid-template-columns: 300px 1fr;
  gap: 2rem;
  height: 100%;
}

.left-panel,
.right-panel {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  min-height: 0;
}

.action-bar {
  display: flex;
  gap: 1rem;
}

.btn-primary,
.btn-secondary {
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 1rem;
  transition: opacity 0.2s;
}

.btn-primary {
  background: #0e639c;
  color: white;
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-secondary {
  background: #3e3e42;
  color: #e0e0e0;
}

.btn-primary:hover:not(:disabled),
.btn-secondary:hover {
  opacity: 0.8;
}

.settings-panel {
  max-width: 600px;
}

.settings-panel h2 {
  margin-top: 0;
}

.settings-section {
  margin-bottom: 2rem;
  padding: 1.5rem;
  background: #252526;
  border-radius: 4px;
}

.settings-section h3 {
  margin-top: 0;
  margin-bottom: 1rem;
  font-size: 1rem;
  color: #888;
}

.setting-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 0;
  cursor: pointer;
}

.setting-item input[type='checkbox'] {
  width: 18px;
  height: 18px;
  cursor: pointer;
}

.footer {
  display: flex;
  justify-content: space-between;
  padding: 0.5rem 2rem;
  background: #252526;
  border-top: 1px solid #3e3e42;
  font-size: 0.85rem;
  color: #888;
}

.footer-item {
  display: flex;
  align-items: center;
}
</style>

<!-- ContextWizard.vue - Step-by-step context builder -->
<template>
  <div class="context-wizard">
    <div class="wizard-header">
      <h3>🧙 Context Wizard</h3>
      <div class="steps">
        <div
          v-for="(step, index) in steps"
          :key="step.id"
          :class="['step', { active: currentStep === index, completed: currentStep > index }]"
        >
          <div class="step-number">{{ index + 1 }}</div>
          <span class="step-label">{{ step.label }}</span>
        </div>
      </div>
    </div>

    <div class="wizard-body">
      <!-- Step 1: Select Files -->
      <div v-if="currentStep === 0" class="wizard-step">
        <h4>Select Files to Include</h4>
        <p class="step-desc">Choose which files should be part of the context.</p>
        <div class="file-selector">
          <!-- Reusing FileBrowser in selection mode would be ideal here -->
          <div class="placeholder-selector">
            <p>File selection component goes here</p>
            <p class="hint">(Using all files in project for now)</p>
          </div>
        </div>
      </div>

      <!-- Step 2: Choose Format -->
      <div v-if="currentStep === 1" class="wizard-step">
        <h4>Choose Output Format</h4>
        <div class="format-options">
          <label class="format-card">
            <input type="radio" v-model="config.format" value="xml" />
            <div class="format-info">
              <span class="format-name">XML</span>
              <span class="format-desc">Standard XML format with metadata</span>
            </div>
          </label>
          <label class="format-card">
            <input type="radio" v-model="config.format" value="markdown" />
            <div class="format-info">
              <span class="format-name">Markdown</span>
              <span class="format-desc">Clean markdown with code blocks</span>
            </div>
          </label>
          <label class="format-card">
            <input type="radio" v-model="config.format" value="toon" />
            <div class="format-info">
              <span class="format-name">TOON</span>
              <span class="format-desc">Optimized for LLMs (token reduction)</span>
            </div>
          </label>
        </div>
      </div>

      <!-- Step 3: Optimization -->
      <div v-if="currentStep === 2" class="wizard-step">
        <h4>Optimization Settings</h4>
        <div class="settings-form">
          <label class="setting-row">
            <span>Target LLM</span>
            <select v-model="config.targetLlm" class="form-select">
              <option value="gpt-4">GPT-4</option>
              <option value="claude-3-opus">Claude 3 Opus</option>
              <option value="claude-3.5-sonnet">Claude 3.5 Sonnet</option>
              <option value="gemini-pro">Gemini Pro</option>
            </select>
          </label>

          <label class="setting-row">
            <span>Max Tokens</span>
            <input type="number" v-model="config.maxTokens" class="form-input" />
          </label>

          <label class="setting-row">
            <input type="checkbox" v-model="config.removeComments" />
            <span>Remove Comments</span>
          </label>

          <label class="setting-row">
            <input type="checkbox" v-model="config.removeEmptyLines" />
            <span>Remove Empty Lines</span>
          </label>
        </div>
      </div>

      <!-- Step 4: Review & Generate -->
      <div v-if="currentStep === 3" class="wizard-step">
        <h4>Review & Generate</h4>
        <div class="review-summary">
          <div class="summary-item">
            <span class="label">Format:</span>
            <span class="value">{{ config.format.toUpperCase() }}</span>
          </div>
          <div class="summary-item">
            <span class="label">Target LLM:</span>
            <span class="value">{{ config.targetLlm }}</span>
          </div>
          <div class="summary-item">
            <span class="label">Optimization:</span>
            <span class="value">
              {{ config.removeComments ? 'No Comments' : 'Keep Comments' }},
              {{ config.removeEmptyLines ? 'Compact' : 'Normal' }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <div class="wizard-footer">
      <button @click="prevStep" class="btn-secondary" :disabled="currentStep === 0">Back</button>

      <button v-if="currentStep < steps.length - 1" @click="nextStep" class="btn-primary">
        Next
      </button>

      <button v-else @click="generate" class="btn-success" :disabled="generating">
        {{ generating ? 'Generating...' : 'Generate Context' }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue';

const emit = defineEmits(['generate', 'cancel']);

const steps = [
  { id: 'files', label: 'Files' },
  { id: 'format', label: 'Format' },
  { id: 'optimize', label: 'Optimize' },
  { id: 'generate', label: 'Generate' },
];

const currentStep = ref(0);
const generating = ref(false);

const config = reactive({
  files: [],
  format: 'xml',
  targetLlm: 'claude-3.5-sonnet',
  maxTokens: 100000,
  removeComments: false,
  removeEmptyLines: false,
});

function nextStep() {
  if (currentStep.value < steps.length - 1) {
    currentStep.value++;
  }
}

function prevStep() {
  if (currentStep.value > 0) {
    currentStep.value--;
  }
}

async function generate() {
  generating.value = true;
  try {
    // Simulate generation for now
    // In real implementation, this would call window.api.cli.generateContext
    await new Promise((resolve) => setTimeout(resolve, 1500));
    emit('generate', config);
  } finally {
    generating.value = false;
  }
}
</script>

<style scoped>
.context-wizard {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #1e1e1e;
}

.wizard-header {
  padding: 1.5rem;
  background: #252526;
  border-bottom: 1px solid #3e3e42;
}

.wizard-header h3 {
  margin: 0 0 1.5rem 0;
  text-align: center;
}

.steps {
  display: flex;
  justify-content: center;
  gap: 2rem;
}

.step {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  opacity: 0.5;
  transition: opacity 0.3s;
}

.step.active,
.step.completed {
  opacity: 1;
}

.step-number {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: #3e3e42;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
}

.step.active .step-number {
  background: #0e639c;
  color: white;
}

.step.completed .step-number {
  background: #89d185;
  color: #1e1e1e;
}

.step-label {
  font-size: 0.85rem;
}

.wizard-body {
  flex: 1;
  padding: 2rem;
  overflow-y: auto;
  max-width: 600px;
  margin: 0 auto;
  width: 100%;
}

.wizard-step h4 {
  margin-top: 0;
  margin-bottom: 1.5rem;
  font-size: 1.2rem;
}

.step-desc {
  color: #888;
  margin-bottom: 1.5rem;
}

.format-options {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.format-card {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  background: #252526;
  border: 1px solid #3e3e42;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.format-card:hover {
  border-color: #0e639c;
}

.format-info {
  display: flex;
  flex-direction: column;
}

.format-name {
  font-weight: bold;
}

.format-desc {
  font-size: 0.85rem;
  color: #888;
}

.settings-form {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.setting-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.form-select,
.form-input {
  padding: 0.5rem;
  background: #252526;
  border: 1px solid #3e3e42;
  border-radius: 4px;
  color: #e0e0e0;
  min-width: 200px;
}

.review-summary {
  background: #252526;
  padding: 1.5rem;
  border-radius: 4px;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.summary-item {
  display: flex;
  justify-content: space-between;
  border-bottom: 1px solid #3e3e42;
  padding-bottom: 0.5rem;
}

.summary-item:last-child {
  border-bottom: none;
}

.label {
  color: #888;
}

.value {
  font-weight: 500;
}

.wizard-footer {
  padding: 1.5rem;
  background: #252526;
  border-top: 1px solid #3e3e42;
  display: flex;
  justify-content: space-between;
}

.btn-primary,
.btn-secondary,
.btn-success {
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

.btn-secondary {
  background: #3e3e42;
  color: #e0e0e0;
}

.btn-success {
  background: #89d185;
  color: #1e1e1e;
  font-weight: bold;
}

.btn-primary:hover,
.btn-secondary:hover,
.btn-success:hover {
  opacity: 0.8;
}

.btn-secondary:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}
</style>

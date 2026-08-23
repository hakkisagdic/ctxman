<!-- PromptTemplate.vue - Parameterized prompt execution -->
<template>
  <div class="prompt-template">
    <div class="template-header">
      <button @click="$emit('back')" class="btn-back">← Back</button>
      <h3>{{ prompt.title || prompt.name }}</h3>
    </div>

    <div class="template-body">
      <p class="description">{{ prompt.description }}</p>

      <form @submit.prevent="executePrompt" class="prompt-form">
        <div v-for="arg in prompt.arguments" :key="arg.name" class="form-group">
          <label :for="arg.name">
            {{ arg.name }}
            <span v-if="arg.required" class="required">*</span>
          </label>

          <input
            v-if="!arg.type || arg.type === 'string'"
            type="text"
            :id="arg.name"
            v-model="formData[arg.name]"
            :placeholder="arg.description"
            :required="arg.required"
            class="form-input"
          />

          <textarea
            v-else-if="arg.type === 'text'"
            :id="arg.name"
            v-model="formData[arg.name]"
            :placeholder="arg.description"
            :required="arg.required"
            class="form-textarea"
            rows="4"
          ></textarea>
        </div>

        <div class="form-actions">
          <button type="submit" class="btn-primary" :disabled="executing">
            {{ executing ? 'Executing...' : 'Run Prompt' }}
          </button>
        </div>
      </form>

      <div v-if="result" class="execution-result">
        <h4>Result</h4>
        <div class="result-content">
          <pre>{{ result }}</pre>
        </div>
        <div class="result-actions">
          <button @click="copyResult" class="btn-secondary">Copy to Clipboard</button>
          <button @click="saveResult" class="btn-secondary">Save as File</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue';

const props = defineProps({
  prompt: Object,
});

const emit = defineEmits(['back']);

const formData = reactive({});
const executing = ref(false);
const result = ref(null);

// Initialize form data
props.prompt.arguments.forEach((arg) => {
  formData[arg.name] = '';
});

async function executePrompt() {
  executing.value = true;
  result.value = null;

  try {
    const response = await window.api.mcp.getPrompt(props.prompt.name, formData);

    // Handle different response formats
    if (response.messages && response.messages.length > 0) {
      result.value = response.messages[0].content.text;
    } else {
      result.value = JSON.stringify(response, null, 2);
    }
  } catch (error) {
    console.error('Prompt execution failed:', error);
    result.value = `Error: ${error.message}`;
  } finally {
    executing.value = false;
  }
}

async function copyResult() {
  if (!result.value) return;
  await navigator.clipboard.writeText(result.value);
}

async function saveResult() {
  // TODO: Implement file saving
  console.log('Save result not implemented yet');
}
</script>

<style scoped>
.prompt-template {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #1e1e1e;
}

.template-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  border-bottom: 1px solid #3e3e42;
  background: #252526;
}

.template-header h3 {
  margin: 0;
}

.btn-back {
  background: none;
  border: none;
  color: #0e639c;
  cursor: pointer;
  font-size: 1rem;
  padding: 0.5rem;
}

.btn-back:hover {
  text-decoration: underline;
}

.template-body {
  flex: 1;
  overflow-y: auto;
  padding: 2rem;
  max-width: 800px;
  margin: 0 auto;
  width: 100%;
}

.description {
  color: #aaa;
  margin-bottom: 2rem;
  font-size: 1.1rem;
  line-height: 1.6;
}

.prompt-form {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  margin-bottom: 2rem;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.form-group label {
  font-weight: 500;
  color: #e0e0e0;
}

.required {
  color: #f48771;
  margin-left: 0.25rem;
}

.form-input,
.form-textarea {
  padding: 0.75rem;
  background: #252526;
  border: 1px solid #3e3e42;
  border-radius: 4px;
  color: #e0e0e0;
  font-size: 1rem;
}

.form-input:focus,
.form-textarea:focus {
  border-color: #0e639c;
  outline: none;
}

.form-actions {
  margin-top: 1rem;
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
  margin-right: 0.5rem;
}

.btn-primary:hover:not(:disabled),
.btn-secondary:hover {
  opacity: 0.8;
}

.execution-result {
  margin-top: 2rem;
  padding-top: 2rem;
  border-top: 1px solid #3e3e42;
}

.result-content {
  background: #252526;
  padding: 1rem;
  border-radius: 4px;
  margin: 1rem 0;
  overflow-x: auto;
}

.result-content pre {
  margin: 0;
  white-space: pre-wrap;
  font-family: 'Monaco', 'Courier New', monospace;
}
</style>

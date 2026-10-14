<script setup>
import { ref, computed } from 'vue';

const selectedLanguage = ref('javascript');
const showOutput = ref(false);
const processing = ref(false);

const languages = [
  { id: 'javascript', name: 'JavaScript', ext: '.js' },
  { id: 'typescript', name: 'TypeScript', ext: '.ts' },
  { id: 'python', name: 'Python', ext: '.py' },
  { id: 'rust', name: 'Rust', ext: '.rs' },
];

const sampleCode = computed(() => {
  const samples = {
    javascript: `// Example JavaScript code
function calculateSum(arr) {
  return arr.reduce((sum, num) => sum + num, 0);
}

const numbers = [1, 2, 3, 4, 5];
console.log(calculateSum(numbers));`,
    typescript: `// Example TypeScript code
interface User {
  id: number;
  name: string;
  email: string;
}

function getUser(id: number): User | null {
  // Fetch user from database
  return { id, name: "John", email: "john@example.com" };
}`,
    python: `# Example Python code
def calculate_average(numbers):
    if not numbers:
        return 0
    return sum(numbers) / len(numbers)

numbers = [1, 2, 3, 4, 5]
print(f"Average: {calculate_average(numbers)}")`,
    rust: `// Example Rust code
fn calculate_sum(arr: &[i32]) -> i32 {
    arr.iter().sum()
}

fn main() {
    let numbers = vec![1, 2, 3, 4, 5];
    println!("Sum: {}", calculate_sum(&numbers));
}`,
  };
  return samples[selectedLanguage.value];
});

const mockOutput = computed(() => {
  return `📊 Analysis Results
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📁 File: example${languages.find((l) => l.id === selectedLanguage.value)?.ext}
📝 Lines of Code: 8
🎯 Tokens (cl100k_base): ~245

Function Analysis:
  • calculateSum - 45 tokens
  • Main logic - 78 tokens

📈 Summary:
  • Total files: 1
  • Total tokens: 245
  • Language: ${selectedLanguage.value}
`;
});

const runAnalysis = () => {
  processing.value = true;
  setTimeout(() => {
    processing.value = false;
    showOutput.value = true;
  }, 1500);
};

const reset = () => {
  showOutput.value = false;
};
</script>

<template>
  <div class="interactive-demo">
    <div class="interactive-demo-header">
      <span class="interactive-demo-title">🧪 Try Ctxman</span>
      <div class="interactive-demo-controls">
        <select v-model="selectedLanguage" class="language-select" @change="reset">
          <option v-for="lang in languages" :key="lang.id" :value="lang.id">
            {{ lang.name }}
          </option>
        </select>
        <button class="run-button" @click="runAnalysis" :disabled="processing">
          {{ processing ? 'Analyzing...' : '▶ Run Analysis' }}
        </button>
      </div>
    </div>

    <div class="interactive-demo-content">
      <div class="code-section">
        <div class="code-label">Input Code:</div>
        <pre class="code-block"><code>{{ sampleCode }}</code></pre>
      </div>

      <div v-if="showOutput" class="output-section">
        <div class="code-label">Output:</div>
        <pre class="output-block"><code>{{ mockOutput }}</code></pre>
      </div>
    </div>
  </div>
</template>

<style scoped>
.interactive-demo {
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  overflow: hidden;
  margin: 1.5rem 0;
}

.interactive-demo-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  border-bottom: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg);
}

.interactive-demo-title {
  font-weight: 600;
  font-size: 1.1rem;
}

.interactive-demo-controls {
  display: flex;
  gap: 0.5rem;
}

.language-select {
  padding: 0.5rem 1rem;
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  color: var(--vp-c-text-1);
  cursor: pointer;
}

.run-button {
  padding: 0.5rem 1rem;
  background: var(--vp-c-brand-1);
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
  transition: background 0.2s;
}

.run-button:hover:not(:disabled) {
  background: var(--vp-c-brand-2);
}

.run-button:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.interactive-demo-content {
  padding: 1rem;
}

.code-section,
.output-section {
  margin-bottom: 1rem;
}

.code-label {
  font-size: 0.85rem;
  color: var(--vp-c-text-2);
  margin-bottom: 0.5rem;
}

.code-block,
.output-block {
  background: var(--vp-code-block-bg);
  border-radius: 6px;
  padding: 1rem;
  overflow-x: auto;
  font-size: 0.9rem;
  line-height: 1.6;
}

.output-block {
  background: #1a1a2e;
  color: #42b883;
  border: 1px solid var(--vp-c-divider);
}

@media (max-width: 640px) {
  .interactive-demo-header {
    flex-direction: column;
    gap: 1rem;
  }

  .interactive-demo-controls {
    width: 100%;
    justify-content: stretch;
  }

  .language-select,
  .run-button {
    flex: 1;
  }
}
</style>

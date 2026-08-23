<script setup>
const props = defineProps({
  steps: {
    type: Array,
    default: () => [
      {
        title: 'Install Ctxman',
        description: 'Run npm install -g ctxman to install globally',
      },
      {
        title: 'Navigate to your project',
        description: 'cd into your project directory',
      },
      {
        title: 'Run analysis',
        description: 'Execute ctxman to start the interactive wizard',
      },
    ],
  },
});
</script>

<template>
  <div class="quick-start">
    <div class="quick-start-steps">
      <div v-for="(step, index) in steps" :key="index" class="quick-start-step">
        <h4 class="quick-start-step-title">{{ step.title }}</h4>
        <p class="quick-start-step-description">{{ step.description }}</p>
        <slot :name="`step-${index}`"></slot>
      </div>
    </div>
  </div>
</template>

<style scoped>
.quick-start {
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  padding: 2rem;
  margin: 2rem 0;
}

.quick-start-steps {
  counter-reset: step;
}

.quick-start-step {
  position: relative;
  padding-left: 3rem;
  margin-bottom: 1.5rem;
}

.quick-start-step:last-child {
  margin-bottom: 0;
}

.quick-start-step::before {
  counter-increment: step;
  content: counter(step);
  position: absolute;
  left: 0;
  top: 0;
  width: 2rem;
  height: 2rem;
  background: var(--vp-c-brand-1);
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 0.9rem;
}

.quick-start-step-title {
  font-weight: 600;
  margin-bottom: 0.25rem;
  color: var(--vp-c-text-1);
}

.quick-start-step-description {
  color: var(--vp-c-text-2);
  font-size: 0.95rem;
  margin: 0;
}

@media (max-width: 480px) {
  .quick-start {
    padding: 1.5rem;
  }

  .quick-start-step {
    padding-left: 2.5rem;
  }

  .quick-start-step::before {
    width: 1.5rem;
    height: 1.5rem;
    font-size: 0.8rem;
  }
}
</style>

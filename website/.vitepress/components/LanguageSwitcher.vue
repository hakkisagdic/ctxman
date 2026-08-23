<script setup>
import { ref, computed, onMounted } from 'vue';

const isOpen = ref(false);
const currentLang = ref('en');

const languages = [
  { code: 'en', name: 'English', path: '/' },
  { code: 'tr', name: 'Türkçe', path: '/tr/' },
];

const currentLanguage = computed(() => {
  return languages.find((l) => l.code === currentLang.value) || languages[0];
});

const toggleDropdown = () => {
  isOpen.value = !isOpen.value;
};

const switchLanguage = (lang) => {
  if (lang.code !== currentLang.value) {
    // Navigate to the new language path
    const currentPath = window.location.pathname;
    const newPath = currentPath.replace(/^\/(tr\/)?/, lang.path);
    window.location.href = newPath;
  }
  isOpen.value = false;
};

onMounted(() => {
  // Detect current language from URL
  const path = window.location.pathname;
  if (path.startsWith('/tr/') || path === '/tr') {
    currentLang.value = 'tr';
  }
});
</script>

<template>
  <div class="language-switcher" v-click-outside="() => (isOpen = false)">
    <button class="language-switcher-button" @click="toggleDropdown">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="2" y1="12" x2="22" y2="12"></line>
        <path
          d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"
        ></path>
      </svg>
      <span>{{ currentLanguage.name }}</span>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <polyline :points="isOpen ? '18 15 12 9 6 15' : '6 9 12 15 18 9'"></polyline>
      </svg>
    </button>

    <div v-if="isOpen" class="language-switcher-dropdown">
      <button
        v-for="lang in languages"
        :key="lang.code"
        class="language-switcher-option"
        :class="{ active: lang.code === currentLang.value }"
        @click="switchLanguage(lang)"
      >
        {{ lang.name }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.language-switcher {
  position: relative;
  display: inline-block;
}

.language-switcher-button {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.9rem;
  color: var(--vp-c-text-1);
  transition: all 0.2s ease;
}

.language-switcher-button:hover {
  background: var(--vp-c-brand-soft);
  border-color: var(--vp-c-brand-1);
}

.language-switcher-dropdown {
  position: absolute;
  top: calc(100% + 0.5rem);
  right: 0;
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  overflow: hidden;
  min-width: 120px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  z-index: 100;
}

.language-switcher-option {
  display: block;
  width: 100%;
  padding: 0.75rem 1rem;
  text-align: left;
  background: transparent;
  border: none;
  cursor: pointer;
  font-size: 0.9rem;
  color: var(--vp-c-text-1);
  transition: background 0.2s ease;
}

.language-switcher-option:hover {
  background: var(--vp-c-brand-soft);
}

.language-switcher-option.active {
  background: var(--vp-c-brand-1);
  color: white;
}
</style>

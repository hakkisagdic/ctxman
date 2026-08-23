import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  retries: 0,
  workers: 1, // Electron doesn't support parallel execution easily
  use: {
    trace: 'on-first-retry',
  },
});

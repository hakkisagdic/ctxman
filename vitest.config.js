import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./test/setup.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage',
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.test.js',
        'test/',
        'scripts/',
        'coverage/',
        'desktop-app/', // Excluded from root coverage, handled in workspace
      ],
    },
    include: ['test/**/*.test.js'],
    // Exclude desktop-app from root run (handled by workspace)
    exclude: ['node_modules', 'dist', '.git', 'desktop-app/**'],
    testTimeout: 10000,
  },
});

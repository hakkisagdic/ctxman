export default {
  extends: '../vitest.config.js',
  test: {
    name: 'desktop',
    environment: 'jsdom',
    include: ['test/**/*.{test,spec}.{js,mjs,jsx,tsx,vue}'],
    // Exclude E2E from unit tests (handled by Playwright)
    exclude: ['e2e/**'],
  },
};

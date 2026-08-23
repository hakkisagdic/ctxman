import { test, expect, _electron as electron } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe('Application Launch', () => {
  let electronApp;

  test.beforeAll(async () => {
    // Launch Electron app
    const appPath = path.join(
      __dirname,
      '../dist-electron/mac-arm64/Ctxman.app/Contents/MacOS/Ctxman'
    );
    electronApp = await electron.launch({
      executablePath: appPath,
      env: { ...process.env, NODE_ENV: 'test' },
    });
  });

  test.afterAll(async () => {
    if (electronApp) {
      await electronApp.close();
    }
  });

  test('shows correct window title', async () => {
    const window = await electronApp.firstWindow();
    const title = await window.title();
    expect(title).toBe('Ctxman');
  });

  test('renders header', async () => {
    const window = await electronApp.firstWindow();
    // Wait for header to appear
    await window.waitForSelector('h1');
    const headerText = await window.textContent('h1');
    expect(headerText).toContain('Ctxman');
  });
});

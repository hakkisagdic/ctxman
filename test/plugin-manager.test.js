import { describe, test, expect, __vi, beforeEach, afterEach } from 'vitest';
import { PluginManager } from '../lib/plugins/PluginManager.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMP_PLUGIN_DIR = path.join(__dirname, 'temp-plugins');

describe('PluginManager', () => {
  let pluginManager;

  beforeEach(() => {
    // Clean up temp dir
    if (fs.existsSync(TEMP_PLUGIN_DIR)) {
      fs.rmSync(TEMP_PLUGIN_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(TEMP_PLUGIN_DIR, { recursive: true });

    // Create a dummy plugin
    const pluginCode = `
            export default class TestPlugin {
                constructor() {
                    this.name = 'test-plugin';
                }
                cleanup() {}
            }
        `;
    fs.writeFileSync(path.join(TEMP_PLUGIN_DIR, 'test-plugin.js'), pluginCode);

    pluginManager = new PluginManager({
      pluginPaths: [TEMP_PLUGIN_DIR],
      autoLoad: false,
    });
  });

  afterEach(() => {
    if (fs.existsSync(TEMP_PLUGIN_DIR)) {
      fs.rmSync(TEMP_PLUGIN_DIR, { recursive: true, force: true });
    }
  });

  test('initializes correctly', () => {
    expect(pluginManager.plugins).toBeInstanceOf(Map);
    expect(pluginManager.stats.registered).toBe(0);
  });

  test('discovers plugins from directory', async () => {
    await pluginManager.discoverPlugins();
    expect(pluginManager.plugins.size).toBe(1);
    expect(pluginManager.plugins.has('test-plugin')).toBe(true);
    expect(pluginManager.stats.registered).toBe(1);
  });

  test('registers plugin programmatically', () => {
    const instance = { name: 'manual' };
    pluginManager.register('manual', instance);
    expect(pluginManager.plugins.has('manual')).toBe(true);
    expect(pluginManager.isLoaded('manual')).toBe(true);
    expect(pluginManager.get('manual')).toBe(instance);
  });

  test('loads discovered plugin', async () => {
    await pluginManager.discoverPlugins();
    const plugin = await pluginManager.load('test-plugin');

    expect(plugin).toBeDefined();
    expect(plugin.name).toBe('test-plugin');
    expect(pluginManager.isLoaded('test-plugin')).toBe(true);
    expect(pluginManager.stats.loaded).toBe(1);
  });

  test('handles loading non-existent plugin', async () => {
    await expect(pluginManager.load('non-existent')).rejects.toThrow('Plugin not found');
  });

  test('returns cached instance if already loaded', async () => {
    await pluginManager.discoverPlugins();
    const instance1 = await pluginManager.load('test-plugin');
    const instance2 = await pluginManager.load('test-plugin');
    expect(instance1).toBe(instance2);
  });

  test('unloads plugin', async () => {
    await pluginManager.discoverPlugins();
    await pluginManager.load('test-plugin');

    pluginManager.unload('test-plugin');
    expect(pluginManager.isLoaded('test-plugin')).toBe(false);
    expect(pluginManager.get('test-plugin')).toBeNull();
  });

  test('unloads all plugins', async () => {
    await pluginManager.discoverPlugins();
    await pluginManager.load('test-plugin');

    pluginManager.unloadAll();
    expect(pluginManager.isLoaded('test-plugin')).toBe(false);
  });

  test('lists plugins', async () => {
    await pluginManager.discoverPlugins();
    const list = pluginManager.list();
    expect(list).toContain('test-plugin');
  });

  test('lists loaded plugins', async () => {
    await pluginManager.discoverPlugins();
    await pluginManager.load('test-plugin');
    const list = pluginManager.listLoaded();
    expect(list).toContain('test-plugin');
  });

  test('gets plugin info', async () => {
    await pluginManager.discoverPlugins();
    const info = pluginManager.getInfo('test-plugin');
    expect(info).toHaveProperty('name', 'test-plugin');
    expect(info).toHaveProperty('loaded', false);
    expect(info).toHaveProperty('path');
  });

  test('returns null info for unknown plugin', () => {
    expect(pluginManager.getInfo('unknown')).toBeNull();
  });

  test('handles discovery errors gracefully', async () => {
    // Point to non-existent dir
    const pm = new PluginManager({
      pluginPaths: ['/non/existent/path'],
      autoLoad: false,
    });

    // Should not throw
    await pm.discoverPlugins();
    expect(pm.plugins.size).toBe(0);
  });
});

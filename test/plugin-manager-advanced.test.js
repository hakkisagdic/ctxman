import { describe, test, expect, vi, beforeEach } from 'vitest';
import PluginManager from '../lib/plugins/PluginManager.js';
import fs from 'fs';
import path from 'path';

vi.mock('fs');

describe('PluginManager Advanced Coverage', () => {
  let manager;
  const mockPluginDir = '/mock/plugins';

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new PluginManager({ pluginDir: mockPluginDir });

    // Default fs mocks
    fs.existsSync.mockReturnValue(true);
    fs.readdirSync.mockReturnValue([]);
    fs.statSync.mockReturnValue({ isDirectory: () => true });
  });

  describe('Plugin Discovery Edge Cases', () => {
    test('discoverPlugins handles directory read errors', async () => {
      fs.readdirSync.mockImplementation(() => {
        throw new Error('Read error');
      });

      await manager.discoverPlugins();
      expect(manager.plugins.size).toBe(0);
    });

    test('discoverPlugins ignores non-directory items', async () => {
      // Mock fs.readdirSync to return Dirent-like objects
      fs.readdirSync.mockReturnValue([
        { name: 'file.js', isFile: () => true, isDirectory: () => false },
        { name: 'plugin-dir', isFile: () => false, isDirectory: () => true },
      ]);

      // Mock registerPluginFromFile to spy on it
      // But it's a method on the instance, so we can spy on it
      const spy = vi.spyOn(manager, 'registerPluginFromFile').mockResolvedValue();

      await manager.discoverPlugins();

      // It should call registerPluginFromFile for file.js (if it's a file and ends with .js)
      // And it should not call it for 'plugin-dir' (as it's a directory, not a file)

      expect(spy).toHaveBeenCalledWith(expect.stringContaining('file.js'));
      expect(spy).not.toHaveBeenCalledWith(expect.stringContaining('plugin-dir'));
    });
  });

  describe('Plugin Loading Edge Cases', () => {
    test('load handles import errors', async () => {
      // Manually register a plugin with a bad path
      manager.plugins.set('bad-plugin', {
        name: 'bad-plugin',
        path: '/non/existent/path.js',
        loaded: false,
        instance: null,
      });

      await expect(manager.load('bad-plugin')).rejects.toThrow();
      expect(manager.stats.errors).toBeGreaterThan(0);
    });

    test('load throws if plugin not found', async () => {
      await expect(manager.load('unknown-plugin')).rejects.toThrow('Plugin not found');
    });
  });

  describe('Plugin Management', () => {
    test('unload returns early if plugin not loaded', () => {
      manager.unload('non-existent');
      // Should not throw

      manager.plugins.set('test', { loaded: false });
      manager.unload('test');
      // Should not throw
    });

    test('register overwrites existing plugin', () => {
      const plugin1 = { name: 'test' };
      const plugin2 = { name: 'test', updated: true };

      manager.register('test', plugin1);
      manager.register('test', plugin2);

      expect(manager.get('test')).toBe(plugin2);
    });
  });
});

import { describe, test, expect, vi, beforeEach } from 'vitest';
import PluginManager from '../lib/plugins/PluginManager.js';
import path from 'path';

vi.mock('../lib/utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  }),
}));

describe('PluginManager Final Coverage', () => {
  let manager;

  beforeEach(() => {
    manager = new PluginManager();
  });

  test('initialize with autoLoad calls discoverPlugins', async () => {
    manager = new PluginManager({ autoLoad: true });
    const spy = vi.spyOn(manager, 'discoverPlugins').mockResolvedValue();

    await manager.initialize();

    expect(spy).toHaveBeenCalled();
  });

  test('load handles plugin exporting instance', async () => {
    const pluginName = 'instance-plugin';
    const pluginPath = '/path/to/instance-plugin.js';

    manager.plugins.set(pluginName, {
      name: pluginName,
      path: pluginPath,
      loaded: false,
      instance: null,
    });

    // Mock dynamic import
    const mockInstance = { someMethod: () => {} };
    vi.doMock(pluginPath, () => ({ default: mockInstance }));

    const instance = await manager.load(pluginName);

    expect(instance).toBe(mockInstance);
    expect(manager.plugins.get(pluginName).instance).toBe(mockInstance);
  });

  test('loadMultiple loads all plugins', async () => {
    const spy = vi.spyOn(manager, 'load').mockResolvedValue('loaded');

    const results = await manager.loadMultiple(['p1', 'p2']);

    expect(spy).toHaveBeenCalledTimes(2);
    expect(results).toEqual(['loaded', 'loaded']);
  });

  test('getStats returns copy of stats', () => {
    manager.stats.loaded = 5;
    const stats = manager.getStats();

    expect(stats.loaded).toBe(5);
    expect(stats).not.toBe(manager.stats); // Should be a copy
  });
});

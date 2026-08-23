/**
 * PluginManager - Plugin System Core
 * v3.0.0 - Plugin architecture
 *
 * Responsibilities:
 * - Load and manage plugins
 * - Plugin lifecycle management
 * - Plugin dependency resolution
 * - Event-driven plugin communication
 */

import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';
import { getLogger } from '../utils/logger.js';

const logger = getLogger('PluginManager');

export class PluginManager extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      pluginPaths: ['./lib/languages', './lib/exporters', './plugins'],
      autoLoad: true,
      lazy: true, // Lazy load plugins
      ...options,
    };

    this.plugins = new Map();
    this.loaded = new Map();
    this.stats = {
      registered: 0,
      loaded: 0,
      errors: 0,
    };
  }

  /**
   * Initialize plugin manager
   */
  async initialize() {
    logger.info('Initializing plugin manager...');

    if (this.options.autoLoad) {
      await this.discoverPlugins();
    }

    this.emit('initialized');
  }

  /**
   * Discover plugins from plugin paths
   */
  async discoverPlugins() {
    for (const pluginPath of this.options.pluginPaths) {
      const fullPath = path.resolve(pluginPath);

      if (!fs.existsSync(fullPath)) {
        logger.debug(`Plugin path not found: ${pluginPath}`);
        continue;
      }

      await this.discoverFromDirectory(fullPath);
    }

    logger.info(`Discovered ${this.plugins.size} plugins`);
  }

  /**
   * Discover plugins from a directory
   * @param {string} dirPath
   */
  async discoverFromDirectory(dirPath) {
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.js')) {
          const pluginPath = path.join(dirPath, entry.name);
          await this.registerPluginFromFile(pluginPath);
        }
      }
    } catch (error) {
      logger.error(`Error discovering plugins in ${dirPath}: ${error.message}`);
    }
  }

  /**
   * Register plugin from file
   * @param {string} pluginPath
   */
  async registerPluginFromFile(pluginPath) {
    try {
      // Register without loading (lazy)
      const pluginName = path.basename(pluginPath, '.js');

      this.plugins.set(pluginName, {
        name: pluginName,
        path: pluginPath,
        loaded: false,
        instance: null,
      });

      this.stats.registered++;
      logger.debug(`Registered plugin: ${pluginName}`);
    } catch (error) {
      logger.error(`Failed to register plugin ${pluginPath}: ${error.message}`);
      this.stats.errors++;
    }
  }

  /**
   * Load a plugin
   * @param {string} pluginName
   * @returns {Promise<Plugin>}
   */
  async load(pluginName) {
    const plugin = this.plugins.get(pluginName);

    if (!plugin) {
      throw new Error(`Plugin not found: ${pluginName}`);
    }

    // Return cached instance if already loaded
    if (plugin.loaded && plugin.instance) {
      logger.debug(`Plugin already loaded: ${pluginName}`);
      return plugin.instance;
    }

    // Load plugin
    logger.info(`Loading plugin: ${pluginName}`);
    const startTime = Date.now();

    try {
      const module = await import(plugin.path);
      const PluginClass = module.default || module[Object.keys(module)[0]];

      let instance;
      if (typeof PluginClass === 'function') {
        instance = new PluginClass();
      } else {
        instance = PluginClass;
      }

      plugin.instance = instance;
      plugin.loaded = true;

      const elapsed = Date.now() - startTime;
      this.stats.loaded++;

      logger.info(`Plugin loaded: ${pluginName} (${elapsed}ms)`);
      this.emit('plugin:loaded', { name: pluginName, elapsed });

      return instance;
    } catch (error) {
      logger.error(`Failed to load plugin ${pluginName}: ${error.message}`);
      this.stats.errors++;
      this.emit('plugin:error', { name: pluginName, error });
      throw error;
    }
  }

  /**
   * Load multiple plugins
   * @param {Array<string>} pluginNames
   * @returns {Promise<Array<Plugin>>}
   */
  async loadMultiple(pluginNames) {
    const promises = pluginNames.map((name) => this.load(name));
    return Promise.all(promises);
  }

  /**
   * Get loaded plugin
   * @param {string} pluginName
   * @returns {Plugin|null}
   */
  get(pluginName) {
    const plugin = this.plugins.get(pluginName);
    return plugin?.instance || null;
  }

  /**
   * Check if plugin is loaded
   * @param {string} pluginName
   * @returns {boolean}
   */
  isLoaded(pluginName) {
    const plugin = this.plugins.get(pluginName);
    return plugin?.loaded || false;
  }

  /**
   * Unload a plugin
   * @param {string} pluginName
   */
  unload(pluginName) {
    const plugin = this.plugins.get(pluginName);

    if (!plugin || !plugin.loaded) {
      return;
    }

    // Call cleanup if available
    if (plugin.instance && typeof plugin.instance.cleanup === 'function') {
      plugin.instance.cleanup();
    }

    plugin.loaded = false;
    plugin.instance = null;
    this.stats.loaded--;

    logger.info(`Plugin unloaded: ${pluginName}`);
    this.emit('plugin:unloaded', { name: pluginName });
  }

  /**
   * Unload all plugins
   */
  unloadAll() {
    for (const [name, plugin] of this.plugins) {
      if (plugin.loaded) {
        this.unload(name);
      }
    }
  }

  /**
   * List all registered plugins
   * @returns {Array<string>}
   */
  list() {
    return Array.from(this.plugins.keys());
  }

  /**
   * List loaded plugins
   * @returns {Array<string>}
   */
  listLoaded() {
    return Array.from(this.plugins.entries())
      .filter(([, plugin]) => plugin.loaded)
      .map(([name]) => name);
  }

  /**
   * Get plugin info
   * @param {string} pluginName
   * @returns {object|null}
   */
  getInfo(pluginName) {
    const plugin = this.plugins.get(pluginName);

    if (!plugin) {
      return null;
    }

    return {
      name: plugin.name,
      loaded: plugin.loaded,
      path: plugin.path,
      hasInstance: plugin.instance !== null,
    };
  }

  /**
   * Get statistics
   * @returns {object}
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * Register plugin programmatically
   * @param {string} name
   * @param {Plugin} instance
   */
  register(name, instance) {
    this.plugins.set(name, {
      name,
      path: null,
      loaded: true,
      instance,
    });

    this.stats.registered++;
    this.stats.loaded++;

    logger.info(`Plugin registered: ${name}`);
    this.emit('plugin:registered', { name });
  }
}

export default PluginManager;

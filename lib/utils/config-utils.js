/**
 * Configuration File Utilities
 * Handles discovery and initialization of configuration files
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import MethodFilterParser from '../parsers/method-filter-parser.js';
import GitIgnoreParser from '../parsers/gitignore-parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class ConfigUtils {
  /**
   * Find configuration file in standard locations
   * @param {string} projectRoot - Project root directory
   * @param {string} filename - Config filename
   * @returns {string|undefined} Config file path or undefined
   */
  static findConfigFile(projectRoot, filename) {
    const locations = [
      path.join(__dirname, '..', '..', filename), // Package root
      path.join(projectRoot, filename), // Project root
    ];
    return locations.find((loc) => fs.existsSync(loc));
  }

  /**
   * Initialize method filter parser
   * @param {string} projectRoot - Project root directory
   * @returns {object|null} MethodFilterParser instance or null
   */
  static initMethodFilter(projectRoot) {
    const paths = {
      methodInclude: this.findConfigFile(projectRoot, '.methodinclude'),
      methodIgnore: this.findConfigFile(projectRoot, '.methodignore'),
    };

    if (!paths.methodInclude && !paths.methodIgnore) {
      return null;
    }

    return new MethodFilterParser(paths.methodInclude, paths.methodIgnore);
  }

  /**
   * Detect if method filtering is enabled
   * @param {string} projectRoot - Project root directory
   * @returns {boolean}
   */
  static detectMethodFilters(projectRoot) {
    const methodIncludePath = this.findConfigFile(projectRoot, '.methodinclude');
    const methodIgnorePath = this.findConfigFile(projectRoot, '.methodignore');
    return !!(methodIncludePath || methodIgnorePath);
  }

  /**
   * Initialize git ignore parser
   * @param {string} projectRoot - Project root directory
   * @returns {object} GitIgnoreParser instance
   */
  static initGitIgnore(projectRoot) {
    const paths = {
      contextIgnore: this.findConfigFile(projectRoot, '.contextignore'),
      contextInclude: this.findConfigFile(projectRoot, '.contextinclude'),
    };

    return new GitIgnoreParser(
      path.join(projectRoot, '.gitignore'),
      paths.contextIgnore,
      paths.contextInclude
    );
  }

  /**
   * Get all config file paths
   * @param {string} projectRoot - Project root directory
   * @returns {object} Config paths
   */
  /**
   * Load the user configuration (~/.ctxman/config.json, see docs/LOGGING-AND-UPDATES.md)
   * @returns {object|null} Parsed config, or null when missing or invalid
   */
  static loadUserConfig() {
    const home = process.env.HOME || process.env.USERPROFILE;
    if (!home) return null;

    try {
      return JSON.parse(fs.readFileSync(path.join(home, '.ctxman', 'config.json'), 'utf8'));
    } catch (_error) {
      return null;
    }
  }

  static getConfigPaths(projectRoot) {
    return {
      gitignore: path.join(projectRoot, '.gitignore'),
      contextIgnore: this.findConfigFile(projectRoot, '.contextignore'),
      contextInclude: this.findConfigFile(projectRoot, '.contextinclude'),
      methodInclude: this.findConfigFile(projectRoot, '.methodinclude'),
      methodIgnore: this.findConfigFile(projectRoot, '.methodignore'),
    };
  }
}

export default ConfigUtils;

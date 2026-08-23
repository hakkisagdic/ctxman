/**
 * LanguagePlugin - Base Class for Language Plugins
 * v3.0.0 - Plugin architecture
 *
 * All language analyzers should extend this class
 */

export class LanguagePlugin {
  constructor() {
    this.name = 'base';
    this.extensions = [];
    this.version = '1.0.0';
  }

  /**
   * Get plugin metadata
   * @returns {object}
   */
  getMetadata() {
    return {
      name: this.name,
      version: this.version,
      extensions: this.extensions,
      supportsAST: this.supportsAST(),
      supportsMethodExtraction: this.supportsMethodExtraction(),
      supportsFrameworkDetection: this.supportsFrameworkDetection(),
    };
  }

  /**
   * Check if this plugin supports AST parsing
   * @returns {boolean}
   */
  supportsAST() {
    return false;
  }

  /**
   * Check if this plugin supports method extraction
   * @returns {boolean}
   */
  supportsMethodExtraction() {
    return true;
  }

  /**
   * Check if this plugin supports framework detection
   * @returns {boolean}
   */
  supportsFrameworkDetection() {
    return false;
  }

  /**
   * Extract methods from code
   * @param {string} content - File content
   * @param {string} filePath - File path
   * @returns {Array<Method>}
   */
  extractMethods(content, filePath) {
    throw new Error('extractMethods() must be implemented by subclass');
  }

  /**
   * Detect framework (optional)
   * @param {string} content - File content
   * @returns {string|null} Framework name or null
   */
  detectFramework(content) {
    return null;
  }

  /**
   * Analyze code complexity (optional)
   * @param {string} content - Method content
   * @returns {number} Complexity score
   */
  analyzeComplexity(content) {
    // Default: Simple line count
    return content.split('\n').length;
  }

  /**
   * Validate file content
   * @param {string} content - File content
   * @returns {boolean}
   */
  validate(content) {
    return typeof content === 'string' && content.length > 0;
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    // Override if needed
  }
}

export default LanguagePlugin;

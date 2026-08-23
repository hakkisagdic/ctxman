/**
 * ExporterPlugin - Base Class for Format Exporter Plugins
 * v3.0.0 - Plugin architecture
 *
 * All format exporters should extend this class
 */

export class ExporterPlugin {
  constructor() {
    this.name = 'base';
    this.extension = '.txt';
    this.mimeType = 'text/plain';
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
      extension: this.extension,
      mimeType: this.mimeType,
      supportsChunking: this.supportsChunking(),
      supportsCompression: this.supportsCompression(),
    };
  }

  /**
   * Check if this exporter supports chunking
   * @returns {boolean}
   */
  supportsChunking() {
    return false;
  }

  /**
   * Check if this exporter supports compression
   * @returns {boolean}
   */
  supportsCompression() {
    return false;
  }

  /**
   * Encode context to this format
   * @param {Context} context
   * @param {object} options
   * @returns {string}
   */
  encode(context, options = {}) {
    throw new Error('encode() must be implemented by subclass');
  }

  /**
   * Decode this format to context
   * @param {string} content
   * @returns {Context}
   */
  decode(content) {
    throw new Error('decode() not supported for this format');
  }

  /**
   * Validate encoded output
   * @param {string} content
   * @returns {boolean}
   */
  validate(content) {
    return typeof content === 'string' && content.length > 0;
  }

  /**
   * Estimate token count of encoded output
   * @param {Context} context
   * @returns {number}
   */
  estimateTokens(context) {
    const encoded = this.encode(context);
    return Math.ceil(encoded.length / 4); // Rough estimate
  }

  /**
   * Compress output (optional)
   * @param {string} content
   * @returns {string}
   */
  compress(content) {
    return content; // Override if compression supported
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    // Override if needed
  }
}

export default ExporterPlugin;

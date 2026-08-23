/**
 * Base class for all data source plugins (e.g., GitHub, Slack, Linear)
 */
export class DataSourcePlugin {
  /**
   * @param {string} name - Unique name of the data source
   */
  constructor(name) {
    this.name = name;
  }

  /**
   * Validates if the necessary configuration (tokens, urls) is present.
   * @param {Object} config
   * @returns {Promise<boolean>}
   */
  async validateConfig(config) {
    return true;
  }

  /**
   * Collects data from the source.
   * Generator function that yields documents to be indexed.
   *
   * @param {Object} options
   * @yields {import('./Indexer').IndexableDocument}
   */
  async *collect(options = {}) {
    throw new Error('Not implemented');
  }
}

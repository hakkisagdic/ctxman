import { getLogger } from '../utils/logger.js';

const logger = getLogger('Indexer');

/**
 * @typedef {Object} IndexableDocument
 * @property {string} text - Content to embed
 * @property {string} id - Unique ID from source
 * @property {Object} metadata - Additional context (source, author, url, etc.)
 */

export class Indexer {
  /**
   * @param {import('./stores/BaseVectorStore').BaseVectorStore} vectorStore
   */
  constructor(vectorStore) {
    this.vectorStore = vectorStore;
    this.sources = new Map();
  }

  /**
   * Register a data source plugin
   * @param {import('./DataSourcePlugin').DataSourcePlugin} sourcePlugin
   */
  registerSource(sourcePlugin) {
    this.sources.set(sourcePlugin.name, sourcePlugin);
    logger.info(`Registered data source: ${sourcePlugin.name}`);
  }

  /**
   * Run indexing for a specific source or all sources
   * @param {string} [sourceName] - Optional source name to run specific indexer
   * @param {Object} options - Options passed to collect method
   */
  async index(sourceName, options = {}) {
    const sourcesToRun = sourceName
      ? [this.sources.get(sourceName)].filter(Boolean)
      : Array.from(this.sources.values());

    if (sourcesToRun.length === 0) {
      logger.warn(`No sources found to index (requested: ${sourceName || 'all'})`);
      return;
    }

    for (const source of sourcesToRun) {
      logger.info(`Starting indexing for source: ${source.name}`);
      let count = 0;
      const batch = [];
      const BATCH_SIZE = 10; // Process in small batches

      try {
        for await (const doc of source.collect(options)) {
          batch.push({
            text: doc.text,
            metadata: {
              ...doc.metadata,
              sourceId: doc.id,
              source: source.name,
              indexedAt: new Date().toISOString(),
            },
          });

          if (batch.length >= BATCH_SIZE) {
            await this.vectorStore.addDocuments([...batch]);
            count += batch.length;
            batch.length = 0; // Clear batch
            logger.debug(`Indexed ${count} documents from ${source.name}`);
          }
        }

        // Flush remaining
        if (batch.length > 0) {
          await this.vectorStore.addDocuments(batch);
          count += batch.length;
        }

        logger.info(`Completed indexing ${source.name}. Total documents: ${count}`);
      } catch (error) {
        logger.error(`Error indexing ${source.name}: ${error.message}`);
      }
    }
  }
}

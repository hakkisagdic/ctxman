/**
 * CacheManager - Caching System Module
 * v3.0.0 - Performance optimizations
 *
 * Responsibilities:
 * - Cache analysis results
 * - Invalidate on file changes (mtimeMs, byte size, analysis options, tokenizer encoding)
 * - Support multiple storage backends (memory, disk)
 * - TTL-based expiration
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getLogger } from '../utils/logger.js';

const logger = getLogger('CacheManager');

/**
 * Normalize a Date or numeric timestamp to milliseconds, or null when missing
 * @param {Date|number|undefined|null} value
 * @returns {number|null}
 */
function normalizeMtime(value) {
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  return null;
}

export class CacheManager {
  constructor(options = {}) {
    this.options = {
      enabled: true,
      strategy: 'disk', // disk, memory
      ttl: 3600, // 1 hour in seconds
      path: '.context-cache',
      maxEntries: 5000,
      maxSize: 100 * 1024 * 1024, // 100MB
      ...options,
    };

    this.memoryCache = new Map();
    this.stats = {
      hits: 0,
      misses: 0,
      writes: 0,
      evictions: 0,
      errors: 0,
    };

    // Initialize cache directory when enabled on disk
    if (this.options.enabled && this.options.strategy === 'disk') {
      this.initCacheDirectory();
    }
  }

  /**
   * Initialize cache directory
   */
  initCacheDirectory() {
    const cachePath = path.resolve(this.options.path);

    if (!fs.existsSync(cachePath)) {
      try {
        fs.mkdirSync(cachePath, { recursive: true });
        logger.info(`Cache directory created: ${cachePath}`);
      } catch (error) {
        logger.error(`Failed to create cache directory: ${error.message}`);
        this.options.enabled = false;
      }
    }
  }

  /**
   * Get cached analysis for file
   * @param {string} filePath
   * @param {number|Date} modifiedTime - File modification timestamp
   * @param {object} [meta] - Additional cache key/validation metadata
   * @param {number} [meta.size] - Current file byte size
   * @param {string} [meta.namespace] - Caller namespace ('analyzer', 'token-calculator', ...)
   * @param {string} [meta.encoding] - Tokenizer encoding ('cl100k_base', 'o200k_base', ...)
   * @param {boolean} [meta.methodLevel] - Whether method-level analysis is included
   * @param {string} [meta.extraKey] - Extra discriminator (e.g. method filter signature)
   * @returns {object|null}
   */
  get(filePath, modifiedTime, meta = {}) {
    if (!this.options.enabled) {
      return null;
    }

    const key = this.getCacheKey(filePath, meta);
    const mtimeMs = normalizeMtime(modifiedTime);
    const size = typeof meta?.size === 'number' ? meta.size : null;

    try {
      if (this.options.strategy === 'memory') {
        return this.getFromMemory(key, mtimeMs, size);
      }
      return this.getFromDisk(key, mtimeMs, size);
    } catch (error) {
      logger.error(`Cache get error: ${error.message}`);
      this.stats.errors++;
      return null;
    }
  }

  /**
   * Get from memory cache
   * @param {string} key
   * @param {number|null} modifiedTime
   * @param {number|null} size
   * @returns {object|null}
   */
  getFromMemory(key, modifiedTime, size = null) {
    const cached = this.memoryCache.get(key);

    if (!cached) {
      this.stats.misses++;
      return null;
    }

    // Check if expired or invalidated by mtime/size change
    if (this.isExpired(cached.timestamp, cached.modifiedTime, modifiedTime, cached.size, size)) {
      this.memoryCache.delete(key);
      this.stats.misses++;
      return null;
    }

    // Refresh insertion order for LRU eviction
    this.memoryCache.delete(key);
    this.memoryCache.set(key, cached);

    this.stats.hits++;
    logger.debug(`Cache hit (memory): ${key}`);
    return structuredClone(cached.data);
  }

  /**
   * Get from disk cache
   * @param {string} key
   * @param {number|null} modifiedTime
   * @param {number|null} size
   * @returns {object|null}
   */
  getFromDisk(key, modifiedTime, size = null) {
    const cacheFile = path.join(this.options.path, `${key}.json`);

    if (!fs.existsSync(cacheFile)) {
      this.stats.misses++;
      return null;
    }

    try {
      const content = fs.readFileSync(cacheFile, 'utf-8');
      const cached = JSON.parse(content);

      // Check if expired or invalidated by mtime/size change
      if (this.isExpired(cached.timestamp, cached.modifiedTime, modifiedTime, cached.size, size)) {
        try {
          fs.unlinkSync(cacheFile);
        } catch {
          // Ignore race if already removed
        }
        this.stats.misses++;
        return null;
      }

      this.stats.hits++;
      logger.debug(`Cache hit (disk): ${key}`);
      return cached.data;
    } catch (_error) {
      this.stats.misses++;
      return null;
    }
  }

  /**
   * Set cache entry
   * @param {string} filePath
   * @param {object} analysis
   * @param {number|Date} modifiedTime
   * @param {object} [meta]
   */
  set(filePath, analysis, modifiedTime, meta = {}) {
    if (!this.options.enabled) {
      return;
    }

    const key = this.getCacheKey(filePath, meta);
    const cacheEntry = {
      data: this.options.strategy === 'memory' ? structuredClone(analysis) : analysis,
      timestamp: Date.now(),
      modifiedTime: normalizeMtime(modifiedTime),
      size: typeof meta?.size === 'number' ? meta.size : null,
    };

    try {
      if (this.options.strategy === 'memory') {
        this.setInMemory(key, cacheEntry);
      } else {
        this.setOnDisk(key, cacheEntry);
      }

      this.stats.writes++;
      logger.debug(`Cache set: ${key}`);
    } catch (error) {
      logger.error(`Cache set error: ${error.message}`);
      this.stats.errors++;
    }
  }

  /**
   * Set in memory cache
   * @param {string} key
   * @param {object} cacheEntry
   */
  setInMemory(key, cacheEntry) {
    if (this.memoryCache.has(key)) {
      this.memoryCache.delete(key);
    }
    this.memoryCache.set(key, cacheEntry);

    // Check memory limit
    const limit = Number.isInteger(this.options.maxEntries) ? this.options.maxEntries : 1000;
    while (this.memoryCache.size > limit) {
      this.evictOldest();
    }
  }

  /**
   * Set on disk cache
   * @param {string} key
   * @param {object} cacheEntry
   */
  setOnDisk(key, cacheEntry) {
    const cacheDir = path.resolve(this.options.path);
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }
    const cacheFile = path.join(cacheDir, `${key}.json`);
    fs.writeFileSync(cacheFile, JSON.stringify(cacheEntry), 'utf-8');
  }

  /**
   * Check if cache entry is expired or invalidated
   * @param {number} cacheTimestamp - When cache was created
   * @param {number|null} cacheModifiedTime - File modified time when cached
   * @param {number|Date|null} currentModifiedTime - Current file modified time
   * @param {number|null} [cachedSize] - File size when cached
   * @param {number|null} [currentSize] - Current file size
   * @returns {boolean}
   */
  isExpired(
    cacheTimestamp,
    cacheModifiedTime,
    currentModifiedTime,
    cachedSize = null,
    currentSize = null
  ) {
    // Check TTL when positive
    if (this.options.ttl > 0) {
      const age = (Date.now() - cacheTimestamp) / 1000; // seconds
      if (age > this.options.ttl) {
        return true;
      }
    }

    // Any modification time mismatch (newer OR reverted to an older commit) invalidates
    const currentMs = normalizeMtime(currentModifiedTime);
    const cachedMs = normalizeMtime(cacheModifiedTime);
    if (currentMs !== null && cachedMs !== null && currentMs !== cachedMs) {
      return true;
    }

    // Byte size mismatch invalidates even within identical mtime granularity
    if (currentSize !== null && cachedSize !== null && currentSize !== cachedSize) {
      return true;
    }

    return false;
  }

  /**
   * Generate cache key from file path and analysis discriminator metadata
   * @param {string} filePath
   * @param {object} [meta]
   * @returns {string}
   */
  getCacheKey(filePath, meta = {}) {
    const hasMeta =
      meta &&
      (meta.namespace !== undefined ||
        meta.encoding !== undefined ||
        meta.methodLevel !== undefined ||
        meta.extraKey !== undefined);

    const payload = hasMeta
      ? JSON.stringify([
          path.resolve(filePath),
          meta.namespace || '',
          meta.encoding || '',
          Boolean(meta.methodLevel),
          meta.extraKey || '',
        ])
      : String(filePath);

    return crypto.createHash('sha256').update(payload).digest('hex');
  }

  /**
   * Clear all cache
   */
  clear() {
    if (this.options.strategy === 'memory') {
      this.memoryCache.clear();
    } else {
      this.clearDiskCache();
    }

    logger.info('Cache cleared');
  }

  /**
   * Clear disk cache
   */
  clearDiskCache() {
    try {
      const cachePath = path.resolve(this.options.path);

      if (fs.existsSync(cachePath)) {
        const files = fs.readdirSync(cachePath);
        for (const file of files) {
          if (file.endsWith('.json')) {
            fs.unlinkSync(path.join(cachePath, file));
          }
        }
      }
    } catch (error) {
      logger.error(`Failed to clear disk cache: ${error.message}`);
    }
  }

  /**
   * Evict oldest entry (LRU)
   */
  evictOldest() {
    let oldestKey = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.memoryCache) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestKey = key;
      }
    }

    if (oldestKey !== null) {
      this.memoryCache.delete(oldestKey);
      this.stats.evictions++;
      logger.debug(`Evicted oldest entry: ${oldestKey}`);
    }
  }

  /**
   * Get cache statistics
   * @returns {object}
   */
  getStats() {
    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRate = totalRequests > 0 ? ((this.stats.hits / totalRequests) * 100).toFixed(1) : '0';

    return {
      ...this.stats,
      totalRequests,
      hitRate: parseFloat(hitRate),
      cacheSize:
        this.options.strategy === 'memory' ? this.memoryCache.size : this.getDiskCacheSize(),
    };
  }

  /**
   * Get disk cache size
   * @returns {number}
   */
  getDiskCacheSize() {
    try {
      const cachePath = path.resolve(this.options.path);
      if (!fs.existsSync(cachePath)) return 0;

      const files = fs.readdirSync(cachePath).filter((f) => f.endsWith('.json'));
      return files.length;
    } catch (_error) {
      return 0;
    }
  }

  /**
   * Prune expired entries
   */
  prune() {
    logger.info('Pruning expired cache entries...');

    if (this.options.strategy === 'memory') {
      this.pruneMemoryCache();
    } else {
      this.pruneDiskCache();
    }
  }

  /**
   * Prune memory cache
   */
  pruneMemoryCache() {
    if (this.options.ttl <= 0) return;
    const now = Date.now();
    const ttlMs = this.options.ttl * 1000;
    let pruned = 0;

    for (const [key, entry] of this.memoryCache) {
      if (now - entry.timestamp > ttlMs) {
        this.memoryCache.delete(key);
        pruned++;
      }
    }

    logger.info(`Pruned ${pruned} expired entries from memory cache`);
  }

  /**
   * Prune disk cache
   */
  pruneDiskCache() {
    if (this.options.ttl <= 0) return;
    try {
      const cachePath = path.resolve(this.options.path);
      if (!fs.existsSync(cachePath)) return;
      const files = fs.readdirSync(cachePath);
      const now = Date.now();
      const ttlMs = this.options.ttl * 1000;
      let pruned = 0;

      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        const filePath = path.join(cachePath, file);
        const stats = fs.statSync(filePath);

        if (now - stats.mtimeMs > ttlMs) {
          fs.unlinkSync(filePath);
          pruned++;
        }
      }

      logger.info(`Pruned ${pruned} expired entries from disk cache`);
    } catch (error) {
      logger.error(`Failed to prune disk cache: ${error.message}`);
    }
  }
}

/**
 * Resolve a `cache` option value (`false`, `true`, `'memory'`, `'disk'`, options object,
 * or a `CacheManager` instance) into a `CacheManager` or `null`.
 * @param {boolean|string|object|CacheManager|null|undefined} cacheOption
 * @param {object} [defaults]
 * @returns {CacheManager|null}
 */
export function resolveCacheManager(cacheOption, defaults = {}) {
  if (!cacheOption) return null;
  if (
    cacheOption instanceof CacheManager ||
    (typeof cacheOption === 'object' &&
      typeof cacheOption.get === 'function' &&
      typeof cacheOption.set === 'function')
  ) {
    return cacheOption;
  }
  if (cacheOption === true || cacheOption === 'memory') {
    return new CacheManager({ strategy: 'memory', ...defaults });
  }
  if (cacheOption === 'disk') {
    return new CacheManager({ strategy: 'disk', ...defaults });
  }
  if (typeof cacheOption === 'object') {
    return new CacheManager({ ...defaults, ...cacheOption });
  }
  return null;
}

export default CacheManager;

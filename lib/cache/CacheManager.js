/**
 * CacheManager - Caching System Module
 * v3.0.0 - Performance optimizations
 *
 * Responsibilities:
 * - Cache analysis results
 * - Invalidate on file changes
 * - Support multiple storage backends
 * - TTL-based expiration
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getLogger } from '../utils/logger.js';

const logger = getLogger('CacheManager');

export class CacheManager {
  constructor(options = {}) {
    this.options = {
      enabled: true,
      strategy: 'disk', // disk, memory
      ttl: 3600, // 1 hour in seconds
      path: '.context-cache',
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

    // Initialize cache directory
    if (this.options.strategy === 'disk') {
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
   * @param {number} modifiedTime - File modification timestamp
   * @returns {FileAnalysis|null}
   */
  get(filePath, modifiedTime) {
    if (!this.options.enabled) {
      return null;
    }

    const key = this.getCacheKey(filePath);

    try {
      if (this.options.strategy === 'memory') {
        return this.getFromMemory(key, modifiedTime);
      } else {
        return this.getFromDisk(key, modifiedTime);
      }
    } catch (error) {
      logger.error(`Cache get error: ${error.message}`);
      this.stats.errors++;
      return null;
    }
  }

  /**
   * Get from memory cache
   * @param {string} key
   * @param {number} modifiedTime
   * @returns {FileAnalysis|null}
   */
  getFromMemory(key, modifiedTime) {
    const cached = this.memoryCache.get(key);

    if (!cached) {
      this.stats.misses++;
      return null;
    }

    // Check if expired
    if (this.isExpired(cached.timestamp, cached.modifiedTime, modifiedTime)) {
      this.memoryCache.delete(key);
      this.stats.misses++;
      return null;
    }

    this.stats.hits++;
    logger.debug(`Cache hit (memory): ${key}`);
    return cached.data;
  }

  /**
   * Get from disk cache
   * @param {string} key
   * @param {number} modifiedTime
   * @returns {FileAnalysis|null}
   */
  getFromDisk(key, modifiedTime) {
    const cacheFile = path.join(this.options.path, `${key}.json`);

    if (!fs.existsSync(cacheFile)) {
      this.stats.misses++;
      return null;
    }

    try {
      const content = fs.readFileSync(cacheFile, 'utf-8');
      const cached = JSON.parse(content);

      // Check if expired
      if (this.isExpired(cached.timestamp, cached.modifiedTime, modifiedTime)) {
        fs.unlinkSync(cacheFile);
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
   * @param {FileAnalysis} analysis
   * @param {number} modifiedTime
   */
  set(filePath, analysis, modifiedTime) {
    if (!this.options.enabled) {
      return;
    }

    const key = this.getCacheKey(filePath);
    const cacheEntry = {
      data: analysis,
      timestamp: Date.now(),
      modifiedTime: modifiedTime,
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
    this.memoryCache.set(key, cacheEntry);

    // Check memory limit
    if (this.memoryCache.size > 1000) {
      this.evictOldest();
    }
  }

  /**
   * Set on disk cache
   * @param {string} key
   * @param {object} cacheEntry
   */
  setOnDisk(key, cacheEntry) {
    const cacheFile = path.join(this.options.path, `${key}.json`);
    fs.writeFileSync(cacheFile, JSON.stringify(cacheEntry), 'utf-8');
  }

  /**
   * Check if cache entry is expired
   * @param {number} cacheTimestamp - When cache was created
   * @param {number} cacheModifiedTime - File modified time when cached
   * @param {number} currentModifiedTime - Current file modified time
   * @returns {boolean}
   */
  isExpired(cacheTimestamp, cacheModifiedTime, currentModifiedTime) {
    // Check TTL
    const age = (Date.now() - cacheTimestamp) / 1000; // seconds
    if (age > this.options.ttl) {
      return true;
    }

    // Check if file was modified
    if (currentModifiedTime > cacheModifiedTime) {
      return true;
    }

    return false;
  }

  /**
   * Generate cache key from file path
   * @param {string} filePath
   * @returns {string}
   */
  getCacheKey(filePath) {
    return crypto.createHash('md5').update(filePath).digest('hex');
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
          fs.unlinkSync(path.join(cachePath, file));
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

    if (oldestKey) {
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
    const hitRate = totalRequests > 0 ? ((this.stats.hits / totalRequests) * 100).toFixed(1) : 0;

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

      const files = fs.readdirSync(cachePath);
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
    try {
      const cachePath = path.resolve(this.options.path);
      const files = fs.readdirSync(cachePath);
      const now = Date.now();
      const ttlMs = this.options.ttl * 1000;
      let pruned = 0;

      for (const file of files) {
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

export default CacheManager;

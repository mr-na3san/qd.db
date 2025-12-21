class CacheManager {
  /**
   * Create cache manager with LRU eviction
   * @param {number} maxSize Maximum cache entries
   */
  constructor(maxSize = 1000) {
    this.maxSize = maxSize;
    this.cache = new Map();
    this.accessOrder = new Map();
    this.accessCounter = 0;
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Get value from cache
   * @param {string} key Key to retrieve
   * @returns {any} Cached value or undefined
   */
  get(key) {
    if (this.cache.has(key)) {
      this.hits++;
      this.accessOrder.set(key, ++this.accessCounter);
      return this.cache.get(key);
    }
    this.misses++;
    return undefined;
  }

  /**
   * Set value in cache
   * @param {string} key Key to store
   * @param {any} value Value to cache
   */
  set(key, value) {
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictLRU();
    }
    this.cache.set(key, value);
    this.accessOrder.set(key, ++this.accessCounter);
  }

  /**
   * Delete value from cache
   * @param {string} key Key to delete
   */
  delete(key) {
    this.cache.delete(key);
    this.accessOrder.delete(key);
  }

  /**
   * Check if key exists in cache
   * @param {string} key Key to check
   * @returns {boolean} True if key exists
   */
  has(key) {
    return this.cache.has(key);
  }

  /**
   * Clear all cache
   */
  clear() {
    this.cache.clear();
    this.accessOrder.clear();
    this.accessCounter = 0;
  }

  /**
   * Evict least recently used item
   * @private
   */
  evictLRU() {
    let minAccess = Infinity;
    let lruKey = null;

    for (const [key, access] of this.accessOrder) {
      if (access < minAccess) {
        minAccess = access;
        lruKey = key;
      }
    }

    if (lruKey) {
      this.cache.delete(lruKey);
      this.accessOrder.delete(lruKey);
    }
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache stats
   */
  getStats() {
    const total = this.hits + this.misses;
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? (this.hits / total * 100).toFixed(2) + '%' : '0%'
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.hits = 0;
    this.misses = 0;
  }
}

module.exports = CacheManager;

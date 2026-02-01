const memoryEstimationConstants = Object.freeze({
  stringOverhead: 40,
  stringCharSize: 2,
  bufferOverhead: 48,
  arrayOverhead: 64,
  objectOverhead: 128,
  numberSize: 16,
  booleanSize: 8,
  fallbackSize: 64,
  itemOverhead: 16,
  keyOverhead: 32,
  maxRecursionDepth: 10,
  maxSampleSize: 100,
  maxArraySampleSize: 100,
  maxObjectSampleSize: 50,
  averagePropSize: 48,
  fallbackRecursionSize: 2048
});

class CacheNode {
  constructor(key, value, expiresAt = null) {
    this.key = key;
    this.value = value;
    this.expiresAt = expiresAt;
    this.prev = null;
    this.next = null;
    this.size = this.estimateSize(key, value);
  }

  estimateSize(key, value) {
    const {
      stringOverhead,
      stringCharSize,
      bufferOverhead,
      arrayOverhead,
      objectOverhead,
      numberSize,
      booleanSize,
      fallbackSize
    } = memoryEstimationConstants;
    
    let size = 0;
    
    if (typeof key === 'string') {
      size += key.length * stringCharSize + stringOverhead;
    }
    
    if (Buffer.isBuffer(value)) {
      return size + value.length + bufferOverhead;
    }
    if (typeof value === 'string') {
      return size + (value.length * stringCharSize) + bufferOverhead;
    }
    if (Array.isArray(value)) {
      try {
        size += this.estimateArraySize(value, 0);
      } catch {
        size += 2048;
      }
      return size + arrayOverhead;
    }
    if (typeof value === 'object' && value !== null) {
      try {
        size += this.estimateObjectSize(value, 0);
      } catch {
        size += 2048;
      }
      return size + objectOverhead;
    }
    if (typeof value === 'number') {
      if (Number.isNaN(value) || !Number.isFinite(value)) {
        return size + numberSize;
      }
      return size + numberSize;
    }
    if (typeof value === 'boolean') {
      return size + booleanSize;
    }
    return size + fallbackSize;
  }

  estimateArraySize(arr, depth) {
    const {
      maxRecursionDepth,
      itemOverhead,
      stringCharSize,
      maxArraySampleSize,
      fallbackRecursionSize
    } = memoryEstimationConstants;
    
    if (depth > maxRecursionDepth) return fallbackRecursionSize;
    
    let size = arr.length * itemOverhead;
    const sampleSize = Math.min(arr.length, maxArraySampleSize);
    
    for (let i = 0; i < sampleSize; i++) {
      const item = arr[i];
      if (typeof item === 'string') {
        size += item.length * stringCharSize;
      } else if (typeof item === 'object' && item !== null) {
        size += this.estimateObjectSize(item, depth + 1);
      } else {
        size += itemOverhead;
      }
    }
    
    if (arr.length > maxArraySampleSize) {
      size += (arr.length - maxArraySampleSize) * itemOverhead;
    }
    return size;
  }

  estimateObjectSize(obj, depth) {
    const {
      maxRecursionDepth,
      keyOverhead,
      stringCharSize,
      itemOverhead,
      maxObjectSampleSize,
      averagePropSize,
      fallbackRecursionSize
    } = memoryEstimationConstants;
    
    if (depth > maxRecursionDepth) return fallbackRecursionSize;
    
    const keys = Object.keys(obj);
    let size = keys.length * keyOverhead;
    const sampleSize = Math.min(keys.length, maxObjectSampleSize);
    
    for (let i = 0; i < sampleSize; i++) {
      const key = keys[i];
      size += key.length * stringCharSize;
      const value = obj[key];
      if (typeof value === 'string') {
        size += value.length * stringCharSize;
      } else if (Array.isArray(value)) {
        size += this.estimateArraySize(value, depth + 1);
      } else if (typeof value === 'object' && value !== null) {
        size += this.estimateObjectSize(value, depth + 1);
      } else {
        size += itemOverhead;
      }
    }
    
    if (keys.length > maxObjectSampleSize) {
      size += (keys.length - maxObjectSampleSize) * averagePropSize;
    }
    return size;
  }

  isExpired() {
    return this.expiresAt !== null && Date.now() > this.expiresAt;
  }
}

class CacheManager {
  /**
   * Create cache manager with LRU eviction, TTL support, and memory limits
   * @param {Object} options Cache options
   * @param {number} [options.maxSize=1000] Maximum number of entries
   * @param {number} [options.ttl=0] Time to live in milliseconds (0 = no expiry)
   * @param {number} [options.maxMemoryMB=100] Maximum memory usage in MB
   */
  constructor(options = {}) {
    this.maxSize = options.maxSize || 1000;
    this.ttl = options.ttl || 0;
    this.maxMemoryBytes = (options.maxMemoryMB || 100) * 1024 * 1024;
    this.namespace = options.namespace || '';
    
    if (this.maxSize < 1) {
      throw new Error('maxSize must be positive');
    }
    if (this.ttl < 0) {
      throw new Error('ttl cannot be negative');
    }
    if (this.maxMemoryBytes < 0) {
      throw new Error('maxMemoryMB cannot be negative');
    }
    if (this.namespace && typeof this.namespace !== 'string') {
      throw new TypeError('namespace must be a string');
    }
    
    this.cache = new Map();
    this.head = new CacheNode(null, null);
    this.tail = new CacheNode(null, null);
    this.head.next = this.tail;
    this.tail.prev = this.head;
    
    this.currentMemoryBytes = 0;
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
    this.expirations = 0;
    
    if (this.ttl > 0) {
      this.startCleanupInterval();
    }
  }

  getNamespacedKey(key) {
    return this.namespace ? `${this.namespace}:${key}` : key;
  }

  /**
   * Add node to head (most recently used)
   * @private
   */
  addToHead(node) {
    node.prev = this.head;
    node.next = this.head.next;
    this.head.next.prev = node;
    this.head.next = node;
  }

  /**
   * Remove node from list
   * @private
   */
  removeNode(node) {
    node.prev.next = node.next;
    node.next.prev = node.prev;
  }

  /**
   * Move node to head
   * @private
   */
  moveToHead(node) {
    this.removeNode(node);
    this.addToHead(node);
  }

  /**
   * Remove tail node (least recently used)
   * @private
   * @returns {CacheNode} Removed node
   */
  removeTail() {
    const node = this.tail.prev;
    if (node === this.head) {
      return null;
    }
    this.removeNode(node);
    return node;
  }

  evictIfNeeded() {
    const maxEvictionAttempts = 1000;
    let attempts = 0;
    
    while (
      (this.cache.size >= this.maxSize || 
       this.currentMemoryBytes >= this.maxMemoryBytes) &&
      this.cache.size > 0 &&
      attempts < maxEvictionAttempts
    ) {
      const node = this.removeTail();
      if (node) {
        this.cache.delete(node.key);
        this.currentMemoryBytes = Math.max(0, this.currentMemoryBytes - node.size);
        this.evictions++;
        attempts++;
      } else {
        break;
      }
    }
    
    if (attempts >= maxEvictionAttempts) {
      const { defaultLogger } = require('../utils/logger');
      defaultLogger.warn('Cache eviction limit reached - single item may exceed memory limit');
    }
  }

  /**
   * Get value from cache
   * @param {string} key Key to retrieve
   * @returns {any} Cached value or undefined
   */
  get(key) {
    const node = this.cache.get(key);
    
    if (!node) {
      this.misses++;
      return undefined;
    }

    if (node.isExpired()) {
      this.delete(key);
      this.misses++;
      this.expirations++;
      return undefined;
    }

    this.hits++;
    this.moveToHead(node);
    return node.value;
  }

  /**
   * Set value in cache
   * @param {string} key Key to store
   * @param {any} value Value to cache
   * @param {number} [ttl] Time to live in milliseconds (overrides default)
   */
  set(key, value, ttl) {
    const existingNode = this.cache.get(key);
    const effectiveTTL = ttl !== undefined ? ttl : this.ttl;
    const expiresAt = effectiveTTL > 0 ? Date.now() + effectiveTTL : null;

    try {
      if (existingNode) {
        this.currentMemoryBytes -= existingNode.size;
        existingNode.value = value;
        existingNode.expiresAt = expiresAt;
        existingNode.size = Math.max(0, existingNode.estimateSize(key, value));
        this.currentMemoryBytes += existingNode.size;
        this.moveToHead(existingNode);
      } else {
        const newNode = new CacheNode(key, value, expiresAt);
        this.cache.set(key, newNode);
        this.addToHead(newNode);
        this.currentMemoryBytes += Math.max(0, newNode.size);
        this.evictIfNeeded();
      }
    } catch (error) {
      const { defaultLogger } = require('../utils/logger');
      defaultLogger.error('Cache set error:', error.message);
      throw error;
    }
  }

  /**
   * Delete value from cache
   * @param {string} key Key to delete
   * @returns {boolean} True if key was deleted
   */
  delete(key) {
    const node = this.cache.get(key);
    if (!node) {
      return false;
    }

    this.removeNode(node);
    this.cache.delete(key);
    this.currentMemoryBytes = Math.max(0, this.currentMemoryBytes - node.size);
    return true;
  }

  /**
   * Check if key exists in cache (without updating access)
   * @param {string} key Key to check
   * @returns {boolean} True if key exists and not expired
   */
  has(key) {
    const node = this.cache.get(key);
    if (!node) {
      return false;
    }
    if (node.isExpired()) {
      this.delete(key);
      this.expirations++;
      return false;
    }
    return true;
  }

  /**
   * Clear all cache
   */
  clear() {
    this.cache.clear();
    this.head.next = this.tail;
    this.tail.prev = this.head;
    this.currentMemoryBytes = 0;
  }

  startCleanupInterval() {
    const minCleanupIntervalMs = 1000;
    const maxCleanupIntervalMs = 60000;
    const ttlDivisor = 10;
    
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    let intervalMs = Math.max(this.ttl / ttlDivisor, minCleanupIntervalMs);
    intervalMs = Math.min(intervalMs, maxCleanupIntervalMs);
    
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpired();
    }, intervalMs);
    
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  /**
   * Cleanup expired entries
   * @private
   */
  cleanupExpired() {
    try {
      const now = Date.now();
      let current = this.tail.prev;
      
      while (current !== this.head) {
        const prev = current.prev;
        if (current.isExpired()) {
          this.cache.delete(current.key);
          this.removeNode(current);
          this.currentMemoryBytes = Math.max(0, this.currentMemoryBytes - current.size);
          this.expirations++;
        }
        current = prev;
      }
    } catch (error) {
      const { defaultLogger } = require('../utils/logger');
      defaultLogger.error('Cache cleanup error:', error.message);
    }
  }

  /**
   * Stop cleanup interval
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.clear();
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
      memoryMB: (this.currentMemoryBytes / 1024 / 1024).toFixed(2),
      maxMemoryMB: (this.maxMemoryBytes / 1024 / 1024).toFixed(2),
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
      expirations: this.expirations,
      hitRate: total > 0 ? (this.hits / total * 100).toFixed(2) + '%' : '0%'
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
    this.expirations = 0;
  }
}

module.exports = CacheManager;

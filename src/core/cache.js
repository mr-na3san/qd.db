class CacheNode {
  constructor(key, value, expiresAt = null) {
    this.key = key;
    this.value = value;
    this.expiresAt = expiresAt;
    this.prev = null;
    this.next = null;
    this.size = this.estimateSize(value);
  }

  estimateSize(value) {
    if (Buffer.isBuffer(value)) {
      return value.length;
    }
    if (typeof value === 'string') {
      return value.length * 2;
    }
    if (typeof value === 'object' && value !== null) {
      try {
        return JSON.stringify(value).length * 2;
      } catch {
        return 1024;
      }
    }
    return 64;
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

  /**
   * Evict entries until constraints are met
   * @private
   */
  evictIfNeeded() {
    while (
      (this.cache.size >= this.maxSize || 
       this.currentMemoryBytes >= this.maxMemoryBytes) &&
      this.cache.size > 0
    ) {
      const node = this.removeTail();
      if (node) {
        this.cache.delete(node.key);
        this.currentMemoryBytes -= node.size;
        this.evictions++;
      } else {
        break;
      }
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

    if (existingNode) {
      this.currentMemoryBytes -= existingNode.size;
      existingNode.value = value;
      existingNode.expiresAt = expiresAt;
      existingNode.size = existingNode.estimateSize(value);
      this.currentMemoryBytes += existingNode.size;
      this.moveToHead(existingNode);
    } else {
      const newNode = new CacheNode(key, value, expiresAt);
      this.cache.set(key, newNode);
      this.addToHead(newNode);
      this.currentMemoryBytes += newNode.size;
      this.evictIfNeeded();
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
    this.currentMemoryBytes -= node.size;
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

  /**
   * Start cleanup interval for expired entries
   * @private
   */
  startCleanupInterval() {
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpired();
    }, Math.max(this.ttl / 10, 1000));
  }

  /**
   * Cleanup expired entries
   * @private
   */
  cleanupExpired() {
    const now = Date.now();
    let current = this.tail.prev;
    
    while (current !== this.head) {
      const prev = current.prev;
      if (current.isExpired()) {
        this.cache.delete(current.key);
        this.removeNode(current);
        this.currentMemoryBytes -= current.size;
        this.expirations++;
      }
      current = prev;
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

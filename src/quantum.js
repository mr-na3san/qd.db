const DatabaseConnection = require('./core/database');
const CacheManager = require('./core/cache');
const BatchManager = require('./core/batch');
const operations = require('./core/operations');
const { TransactionError } = require('./utils/errors');

class QuantumDB {
  /**
   * Create new QuantumDB instance
   * @param {string} [filename='quantum.sqlite'] Database file path
   * @param {Object} [options={}] Database options
   * @param {boolean} [options.cache=true] Enable cache
   * @param {number} [options.cacheSize=1000] Cache size
   * @param {boolean} [options.batch=true] Enable batch operations
   * @param {number} [options.batchSize=100] Batch size
   * @param {number} [options.batchDelay=50] Batch delay in ms
   * @param {boolean} [options.keepConnectionOpen=true] Keep SQLite connection open
   */
  constructor(filename = 'quantum.sqlite', options = {}) {
    this.db = new DatabaseConnection(filename, {
      keepConnectionOpen: options.keepConnectionOpen ?? true,
      timeout: options.timeout ?? 5000
    });

    this.options = {
      cache: options.cache ?? true,
      cacheSize: options.cacheSize ?? 1000,
      batch: options.batch ?? true,
      batchSize: options.batchSize ?? 100,
      batchDelay: options.batchDelay ?? 50,
      ...options
    };

    this.cache = this.options.cache ? new CacheManager(this.options.cacheSize) : null;

    if (this.options.batch) {
      this.writeBatch = new BatchManager(
        async (ops) => {
          const entries = ops.map(op => ({ key: op.key, value: op.value }));
          await this.db.batchSet(entries);
        },
        this.options.batchSize,
        this.options.batchDelay
      );
    } else {
      this.writeBatch = null;
    }

    this.stats = {
      reads: 0,
      writes: 0,
      deletes: 0,
      startTime: Date.now()
    };
  }

  /**
   * Get value by key
   * @param {string} key Key to retrieve
   * @param {any} [defaultValue] Default value if key doesn't exist
   * @returns {Promise<any>} Retrieved value
   */
  async get(key, defaultValue) {
    this.stats.reads++;
    const value = await operations.get(this.db, key, this.cache);
    return value !== undefined ? value : defaultValue;
  }

  /**
   * Set value by key
   * @param {string} key Key to set
   * @param {any} value Value to store
   */
  async set(key, value) {
    this.stats.writes++;
    if (this.writeBatch) {
      return this.writeBatch.add({ key, value });
    }
    return operations.set(this.db, key, value, this.cache);
  }

  /**
   * Push value to array
   * @param {string} key Array key
   * @param {any} value Value to push
   */
  async push(key, value) {
    this.stats.writes++;
    return operations.push(this.db, key, value, this.cache);
  }

  /**
   * Remove value from array
   * @param {string} key Array key
   * @param {any} value Value to remove
   */
  async pull(key, value) {
    this.stats.writes++;
    return operations.pull(this.db, key, value, this.cache);
  }

  /**
   * Delete key
   * @param {string} key Key to delete
   */
  async delete(key) {
    this.stats.deletes++;
    return operations.deleteKey(this.db, key, this.cache);
  }

  /**
   * Delete multiple keys
   * @param {string[]} keys Keys to delete
   */
  async bulkDelete(keys) {
    this.stats.deletes += keys.length;
    return operations.bulkDelete(this.db, keys, this.cache);
  }

  /**
   * Set multiple key-value pairs
   * @param {Array<{key: string, value: any}>} entries Entries to set
   */
  async bulkSet(entries) {
    this.stats.writes += entries.length;
    return operations.bulkSet(this.db, entries, this.cache);
  }

  /**
   * Get all key-value pairs
   * @returns {Promise<Array<{key: string, value: any}>>} All entries
   */
  async getAll() {
    this.stats.reads++;
    return operations.getAll(this.db);
  }

  /**
   * Clear all data
   */
  async clear() {
    this.stats.deletes++;
    return operations.clearAll(this.db, this.cache);
  }

  /**
   * Increment numeric value
   * @param {string} key Key of numeric value
   * @param {number} [amount=1] Amount to increment
   * @returns {Promise<number>} New value
   */
  async add(key, amount = 1) {
    this.stats.writes++;
    return operations.add(this.db, key, amount, this.cache);
  }

  /**
   * Decrement numeric value
   * @param {string} key Key of numeric value
   * @param {number} [amount=1] Amount to decrement
   * @returns {Promise<number>} New value
   */
  async subtract(key, amount = 1) {
    this.stats.writes++;
    return operations.subtract(this.db, key, amount, this.cache);
  }

  /**
   * Check if key exists
   * @param {string} key Key to check
   * @returns {Promise<boolean>} True if key exists
   */
  async has(key) {
    return operations.has(this.db, key, this.cache);
  }

  /**
   * Find keys matching pattern
   * @param {RegExp} pattern Pattern to match
   * @returns {Promise<string[]>} Matching keys
   */
  async findKeys(pattern) {
    return operations.findKeys(this.db, pattern);
  }

  /**
   * Find keys starting with prefix
   * @param {string} prefix Prefix to match
   * @returns {Promise<string[]>} Matching keys
   */
  async startsWith(prefix) {
    return operations.startsWith(this.db, prefix);
  }

  /**
   * Stream all entries (for large datasets)
   * @returns {AsyncGenerator<{key: string, value: any}>} Entry generator
   */
  async *stream() {
    for await (const entry of operations.streamAll(this.db)) {
      yield entry;
    }
  }

  /**
   * Execute operations in a transaction
   * @param {Function} callback Transaction callback
   * @returns {Promise<any>} Transaction result
   */
  async transaction(callback) {
    const txOps = [];
    const txCache = new Map();

    const txProxy = {
      get: async (key) => {
        if (txCache.has(key)) return txCache.get(key);
        const value = await this.get(key);
        txCache.set(key, value);
        return value;
      },
      set: (key, value) => {
        txCache.set(key, value);
        txOps.push({ type: 'set', key, value });
      },
      delete: (key) => {
        txCache.delete(key);
        txOps.push({ type: 'delete', key });
      }
    };

    try {
      const result = await callback(txProxy);

      const setOps = txOps.filter(op => op.type === 'set');
      const deleteOps = txOps.filter(op => op.type === 'delete');

      if (setOps.length > 0) {
        await this.bulkSet(setOps.map(op => ({ key: op.key, value: op.value })));
      }

      if (deleteOps.length > 0) {
        await this.bulkDelete(deleteOps.map(op => op.key));
      }

      return result;
    } catch (error) {
      throw new TransactionError(error.message);
    }
  }

  /**
   * Flush pending batch operations
   * @returns {Promise<void>}
   */
  async flush() {
    if (this.writeBatch) {
      await this.writeBatch.flush();
    }
  }

  /**
   * Get database statistics
   * @returns {Object} Database stats
   */
  getStats() {
    const uptime = Date.now() - this.stats.startTime;
    return {
      reads: this.stats.reads,
      writes: this.stats.writes,
      deletes: this.stats.deletes,
      uptime: Math.floor(uptime / 1000) + 's',
      cache: this.cache ? this.cache.getStats() : null,
      batchQueue: this.writeBatch ? this.writeBatch.size() : 0
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      reads: 0,
      writes: 0,
      deletes: 0,
      startTime: Date.now()
    };
    if (this.cache) {
      this.cache.resetStats();
    }
  }

  /**
   * Clear cache
   */
  clearCache() {
    if (this.cache) {
      this.cache.clear();
    }
  }

  /**
   * Destroy database connection
   */
  destroy() {
    if (this.writeBatch) {
      this.writeBatch.clear();
    }
    if (this.cache) {
      this.cache.clear();
    }
    this.db.destroy();
  }
}

module.exports = QuantumDB;
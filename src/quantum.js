const DatabaseConnection = require('./core/database');
const CacheManager = require('./core/cache');
const BatchManager = require('./core/batch');
const BackupManager = require('./core/backup');
const WatcherManager = require('./core/watcher');
const QueryBuilder = require('./core/query');
const operations = require('./core/operations');
const { TransactionError } = require('./utils/errors');

const allowedOptions = new Set([
  'cache', 'cacheSize', 'cacheTTL', 'cacheMaxMemoryMB',
  'batch', 'batchSize', 'batchDelay',
  'keepConnectionOpen', 'timeout'
]);

class QuantumDB {
  /**
   * Create new QuantumDB instance
   * @param {string} [filename='quantum.sqlite'] Database file path
   * @param {Object} [options={}] Database options
   * @param {boolean} [options.cache=true] Enable cache
   * @param {number} [options.cacheSize=1000] Maximum cache entries
   * @param {number} [options.cacheTTL=0] Cache TTL in milliseconds (0 = no expiry)
   * @param {number} [options.cacheMaxMemoryMB=100] Maximum cache memory in MB
   * @param {boolean} [options.batch=true] Enable batch operations
   * @param {number} [options.batchSize=100] Maximum batch size
   * @param {number} [options.batchDelay=50] Batch delay in ms
   * @param {boolean} [options.keepConnectionOpen=true] Keep SQLite connection open
   * @param {number} [options.timeout=5000] Operation timeout in ms
   */
  constructor(filename = 'quantum.sqlite', options = {}) {
    this.validateOptions(options);

    this.db = new DatabaseConnection(filename, {
      keepConnectionOpen: options.keepConnectionOpen ?? true,
      timeout: options.timeout ?? 5000
    });

    this.options = {
      cache: options.cache ?? true,
      cacheSize: options.cacheSize ?? 1000,
      cacheTTL: options.cacheTTL ?? 0,
      cacheMaxMemoryMB: options.cacheMaxMemoryMB ?? 100,
      batch: options.batch ?? true,
      batchSize: options.batchSize ?? 100,
      batchDelay: options.batchDelay ?? 50,
      keepConnectionOpen: options.keepConnectionOpen ?? true,
      timeout: options.timeout ?? 5000
    };

    this.cache = this.options.cache 
      ? new CacheManager({
          maxSize: this.options.cacheSize,
          ttl: this.options.cacheTTL,
          maxMemoryMB: this.options.cacheMaxMemoryMB
        })
      : null;

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

    this.backupManager = new BackupManager(this.db);
    this.watcherManager = new WatcherManager();

    this.stats = {
      reads: 0,
      writes: 0,
      deletes: 0,
      startTime: Date.now()
    };
  }

  /**
   * Validate options
   * @private
   */
  validateOptions(options) {
    const unknownOptions = Object.keys(options).filter(
      key => !allowedOptions.has(key)
    );
    
    if (unknownOptions.length > 0) {
      console.warn(`[QuantumDB] Unknown options: ${unknownOptions.join(', ')}`);
    }
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
    
    const oldValue = this.cache ? this.cache.get(key) : undefined;
    
    if (this.cache) {
      this.cache.set(key, value);
    }
    
    if (this.writeBatch) {
      const promise = this.writeBatch.add({ key, value }).catch(err => {
        if (this.cache) {
          this.cache.delete(key);
        }
        throw err;
      });
      
      this.watcherManager.notify('set', key, value, oldValue);
      return promise;
    }
    
    await operations.set(this.db, key, value, this.cache);
    this.watcherManager.notify('set', key, value, oldValue);
  }

  /**
   * Push value to array
   * @param {string} key Array key
   * @param {any} value Value to push
   */
  async push(key, value) {
    this.stats.writes++;
    
    if (this.writeBatch) {
      const current = await this.get(key);
      const array = Array.isArray(current) ? current : [];
      array.push(value);
      return this.set(key, array);
    }
    
    const oldValue = await this.get(key);
    await operations.push(this.db, key, value, this.cache);
    this.watcherManager.notify('push', key, value, oldValue);
  }

  /**
   * Remove value from array
   * @param {string} key Array key
   * @param {any} value Value to remove
   */
  async pull(key, value) {
    this.stats.writes++;
    
    if (this.writeBatch) {
      const current = await this.get(key);
      if (!Array.isArray(current)) {
        const { NotArrayError } = require('./utils/errors');
        throw new NotArrayError();
      }
      const filtered = current.filter(item => item !== value);
      return this.set(key, filtered);
    }
    
    const oldValue = await this.get(key);
    await operations.pull(this.db, key, value, this.cache);
    this.watcherManager.notify('pull', key, value, oldValue);
  }

  /**
   * Delete key
   * @param {string} key Key to delete
   */
  async delete(key) {
    this.stats.deletes++;
    const oldValue = await this.get(key);
    await operations.deleteKey(this.db, key, this.cache);
    this.watcherManager.notify('delete', key, undefined, oldValue);
  }

  /**
   * Delete multiple keys
   * @param {string[]} keys Keys to delete
   */
  async bulkDelete(keys) {
    this.stats.deletes += keys.length;
    await operations.bulkDelete(this.db, keys, this.cache);
    keys.forEach(key => {
      this.watcherManager.notify('delete', key, undefined);
    });
  }

  /**
   * Set multiple key-value pairs
   * @param {Array<{key: string, value: any}>} entries Entries to set
   */
  async bulkSet(entries) {
    this.stats.writes += entries.length;
    
    if (this.cache) {
      entries.forEach(({ key, value }) => {
        this.cache.set(key, value);
      });
    }
    
    await operations.bulkSet(this.db, entries, this.cache);
    entries.forEach(({ key, value }) => {
      this.watcherManager.notify('set', key, value);
    });
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
    await operations.clearAll(this.db, this.cache);
    this.watcherManager.notify('clear', '*');
  }

  /**
   * Increment numeric value
   * @param {string} key Key of numeric value
   * @param {number} [amount=1] Amount to increment
   * @returns {Promise<number>} New value
   */
  async add(key, amount = 1) {
    this.stats.writes++;
    
    if (this.writeBatch) {
      const current = await this.get(key);
      const newValue = (current || 0) + amount;
      await this.set(key, newValue);
      return newValue;
    }
    
    const oldValue = await this.get(key);
    const newValue = await operations.add(this.db, key, amount, this.cache);
    this.watcherManager.notify('add', key, newValue, oldValue);
    return newValue;
  }

  /**
   * Decrement numeric value
   * @param {string} key Key of numeric value
   * @param {number} [amount=1] Amount to decrement
   * @returns {Promise<number>} New value
   */
  async subtract(key, amount = 1) {
    this.stats.writes++;
    
    if (this.writeBatch) {
      const current = await this.get(key);
      const newValue = (current || 0) - amount;
      await this.set(key, newValue);
      return newValue;
    }
    
    const oldValue = await this.get(key);
    const newValue = await operations.subtract(this.db, key, amount, this.cache);
    this.watcherManager.notify('subtract', key, newValue, oldValue);
    return newValue;
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
   * Execute operations in a transaction (SQLite only)
   * @param {Function} callback Transaction callback
   * @returns {Promise<any>} Transaction result
   */
  async transaction(callback) {
    if (this.db.isJSON) {
      throw new TransactionError('Transactions are only supported with SQLite backend');
    }

    if (this.writeBatch) {
      await this.writeBatch.flush();
    }

    await this.db.connect();
    const sqlDb = this.db.db;
    
    if (!sqlDb) {
      throw new TransactionError('Database connection not available');
    }

    sqlDb.prepare('BEGIN IMMEDIATE').run();
    
    const txProxy = {
      get: async (key) => {
        const stmt = sqlDb.prepare('SELECT value FROM data WHERE key = ?');
        const row = stmt.get(key);
        if (!row) return undefined;
        const Serializer = require('./utils/serializer');
        return Serializer.deserialize(row.value);
      },
      set: (key, value) => {
        const { validateKey, validateValue } = require('./utils/helpers');
        validateKey(key);
        validateValue(value);
        const Serializer = require('./utils/serializer');
        const stmt = sqlDb.prepare('INSERT OR REPLACE INTO data (key, value) VALUES (?, ?)');
        stmt.run(key, Serializer.serialize(value));
        
        if (this.cache) {
          this.cache.set(key, value);
        }
      },
      delete: (key) => {
        const { validateKey } = require('./utils/helpers');
        validateKey(key);
        const stmt = sqlDb.prepare('DELETE FROM data WHERE key = ?');
        stmt.run(key);
        
        if (this.cache) {
          this.cache.delete(key);
        }
      }
    };

    try {
      const result = await callback(txProxy);
      sqlDb.prepare('COMMIT').run();
      return result;
    } catch (error) {
      sqlDb.prepare('ROLLBACK').run();
      
      if (this.cache) {
        this.cache.clear();
      }
      
      throw new TransactionError(error.message);
    }
  }

  /**
   * Watch key pattern for changes
   * @param {string|RegExp} pattern Key pattern to watch
   * @param {Function} callback Callback function
   * @returns {number} Watcher ID
   */
  watch(pattern, callback) {
    return this.watcherManager.watch(pattern, callback);
  }

  /**
   * Remove watcher
   * @param {number} id Watcher ID
   * @returns {boolean} True if watcher was removed
   */
  unwatch(id) {
    return this.watcherManager.unwatch(id);
  }

  /**
   * Listen to database events
   * @param {string} event Event name (set, delete, push, pull, add, subtract, clear)
   * @param {Function} callback Event callback
   */
  on(event, callback) {
    this.watcherManager.on(event, callback);
  }

  /**
   * Remove event listener
   * @param {string} event Event name
   * @param {Function} callback Event callback
   */
  off(event, callback) {
    this.watcherManager.off(event, callback);
  }

  /**
   * Create backup of database
   * @param {string} backupPath Path to backup file
   * @returns {Promise<Object>} Backup metadata
   */
  async backup(backupPath) {
    if (this.writeBatch) {
      await this.writeBatch.flush();
    }
    return this.backupManager.createBackup(backupPath);
  }

  /**
   * Restore database from backup
   * @param {string} backupPath Path to backup file
   * @param {Object} [options] Restore options
   * @param {boolean} [options.merge=false] Merge with existing data
   * @returns {Promise<Object>} Restore metadata
   */
  async restore(backupPath, options) {
    if (this.writeBatch) {
      await this.writeBatch.flush();
    }
    
    const result = await this.backupManager.restore(backupPath, options);
    
    if (this.cache) {
      this.cache.clear();
    }
    
    return result;
  }

  /**
   * List available backups
   * @param {string} backupDir Directory containing backups
   * @returns {Promise<Array>} List of backup metadata
   */
  async listBackups(backupDir) {
    return this.backupManager.listBackups(backupDir);
  }

  /**
   * Warm cache with keys
   * @param {Array<string>|string} patterns Key patterns to warm
   */
  async warmCache(patterns) {
    if (!this.cache) return;

    const allData = await this.db.readData();
    const entries = Object.entries(allData);
    
    if (!patterns) {
      const toCache = entries.slice(0, this.options.cacheSize);
      toCache.forEach(([key, value]) => {
        this.cache.set(key, value);
      });
      return;
    }

    const patternsArray = Array.isArray(patterns) ? patterns : [patterns];
    const matchers = patternsArray.map(p => {
      if (typeof p === 'string' && p.includes('*')) {
        const regexPattern = p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
        return new RegExp(`^${regexPattern}$`);
      }
      return p;
    });

    for (const [key, value] of entries) {
      for (const matcher of matchers) {
        if (typeof matcher === 'string') {
          if (key === matcher || key.startsWith(matcher)) {
            this.cache.set(key, value);
            break;
          }
        } else if (matcher instanceof RegExp) {
          if (matcher.test(key)) {
            this.cache.set(key, value);
            break;
          }
        }
      }
    }
  }

  /**
   * Create query builder
   * @returns {QueryBuilder} Query builder instance
   */
  query() {
    return new QueryBuilder(this);
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
      batchQueue: this.writeBatch ? this.writeBatch.size() : 0,
      watchers: this.watcherManager.getWatcherCount()
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
   * @param {Object} [options] Destroy options
   * @param {boolean} [options.flush=true] Flush pending operations before destroy
   */
  async destroy(options = {}) {
    const shouldFlush = options.flush !== false;

    if (this.writeBatch) {
      if (shouldFlush) {
        await this.writeBatch.flush();
      } else {
        this.writeBatch.clear();
      }
    }
    
    if (this.cache) {
      this.cache.destroy();
    }

    this.watcherManager.clearWatchers();
    this.db.destroy();
  }
}

module.exports = QuantumDB;

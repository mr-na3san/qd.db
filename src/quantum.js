const DatabaseConnection = require('./core/database');
const CacheManager = require('./core/cache');
const BatchManager = require('./core/batch');
const BackupManager = require('./core/backup');
const WatcherManager = require('./core/watcher');
const QueryBuilder = require('./core/query');
const operations = require('./core/operations');
const { TransactionError, NotArrayError } = require('./utils/errors');
const { defaultLogger } = require('./utils/logger');

const allowedOptions = new Set([
  'cache', 'cacheSize', 'cacheTTL', 'cacheMaxMemoryMB',
  'batch', 'batchSize', 'batchDelay', 'operationTimeout',
  'keepConnectionOpen', 'timeout', 'walMode'
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
   * @param {number} [options.operationTimeout=30000] Batch operation timeout in ms
   * @param {boolean} [options.keepConnectionOpen=true] Keep SQLite connection open
   * @param {number} [options.timeout=5000] Operation timeout in ms
   */
  constructor(filename = 'quantum.sqlite', options = {}) {
    if (typeof filename !== 'string' || filename.trim() === '') {
      throw new TypeError('Filename must be a non-empty string');
    }
    
    if (filename.length > 255) {
      throw new Error('Filename must be 255 characters or less');
    }
    
    const invalidChars = /[\x00-\x1f<>:"|?*]/;
    if (invalidChars.test(filename)) {
      throw new Error('Filename contains invalid characters');
    }
    
    this.validateOptions(options);

    this.db = new DatabaseConnection(filename, {
      keepConnectionOpen: options.keepConnectionOpen ?? true,
      timeout: options.timeout ?? 5000,
      walMode: options.walMode ?? true
    });

    this.options = {
      cache: options.cache ?? true,
      cacheSize: options.cacheSize ?? 1000,
      cacheTTL: options.cacheTTL ?? 0,
      cacheMaxMemoryMB: options.cacheMaxMemoryMB ?? 100,
      batch: options.batch ?? true,
      batchSize: options.batchSize ?? 100,
      batchDelay: options.batchDelay ?? 50,
      operationTimeout: options.operationTimeout ?? 30000,
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
        this.options.batchDelay,
        this.options.operationTimeout
      );
    } else {
      this.writeBatch = null;
    }

    this.backupManager = new BackupManager(this.db);
    this.watcherManager = new WatcherManager({ maxWatchers: 1000 });

    this.stats = {
      reads: 0,
      writes: 0,
      deletes: 0,
      startTime: Date.now(),
      errors: 0,
      totalReadTime: 0,
      totalWriteTime: 0,
      totalDeleteTime: 0,
      bytesRead: 0,
      bytesWritten: 0
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
      throw new Error(`Unknown options: ${unknownOptions.join(', ')}. Allowed options: ${Array.from(allowedOptions).join(', ')}`);
    }
    
    if (options.cacheSize !== undefined && (!Number.isInteger(options.cacheSize) || options.cacheSize < 1)) {
      throw new TypeError('cacheSize must be a positive integer');
    }
    
    if (options.cacheTTL !== undefined && (!Number.isInteger(options.cacheTTL) || options.cacheTTL < 0)) {
      throw new TypeError('cacheTTL must be a non-negative integer');
    }
    
    if (options.cacheMaxMemoryMB !== undefined && (typeof options.cacheMaxMemoryMB !== 'number' || options.cacheMaxMemoryMB <= 0)) {
      throw new TypeError('cacheMaxMemoryMB must be a positive number');
    }
    
    if (options.batchSize !== undefined && (!Number.isInteger(options.batchSize) || options.batchSize < 1)) {
      throw new TypeError('batchSize must be a positive integer');
    }
    
    if (options.batchDelay !== undefined && (typeof options.batchDelay !== 'number' || options.batchDelay < 0)) {
      throw new TypeError('batchDelay must be a non-negative number');
    }
    
    if (options.operationTimeout !== undefined && (!Number.isInteger(options.operationTimeout) || options.operationTimeout < 1)) {
      throw new TypeError('operationTimeout must be a positive integer');
    }
    
    if (options.timeout !== undefined && (!Number.isInteger(options.timeout) || options.timeout < 1)) {
      throw new TypeError('timeout must be a positive integer');
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
   * @returns {Promise<void>}
   */
  async set(key, value) {
    this.stats.writes++;
    
    const oldValue = this.cache ? this.cache.get(key) : undefined;
    
    if (this.writeBatch) {
      return new Promise((resolve, reject) => {
        this.writeBatch.add({ key, value })
          .then(() => {
            if (this.cache) {
              this.cache.set(key, value);
            }
            this.watcherManager.notify('set', key, value, oldValue);
            resolve();
          })
          .catch(err => reject(err));
      });
    }
    
    await operations.set(this.db, key, value, null);
    if (this.cache) {
      this.cache.set(key, value);
    }
    this.watcherManager.notify('set', key, value, oldValue);
  }

  async push(key, value) {
    this.stats.writes++;
    
    const oldValue = await this.get(key);
    
    if (this.writeBatch) {
      if (oldValue !== undefined && !Array.isArray(oldValue)) {
        throw new NotArrayError();
      }
      const array = Array.isArray(oldValue) ? [...oldValue] : [];
      array.push(value);
      return this.set(key, array);
    }
    
    await operations.push(this.db, key, value, null);
    if (this.cache) {
      const current = await operations.get(this.db, key, null);
      this.cache.set(key, current);
    }
    this.watcherManager.notify('push', key, value, oldValue);
  }

  async pull(key, value) {
    this.stats.writes++;
    
    const oldValue = await this.get(key);
    
    if (this.writeBatch) {
      if (!Array.isArray(oldValue)) {
        throw new NotArrayError();
      }
      const filtered = oldValue.filter(item => item !== value);
      return this.set(key, filtered);
    }
    
    await operations.pull(this.db, key, value, null);
    if (this.cache) {
      const current = await operations.get(this.db, key, null);
      this.cache.set(key, current);
    }
    this.watcherManager.notify('pull', key, value, oldValue);
  }

  /**
   * Delete key
   * @param {string} key Key to delete
   */
  async delete(key) {
    this.stats.deletes++;
    const oldValue = await this.get(key);
    await operations.deleteKey(this.db, key, null);
    if (this.cache) {
      this.cache.delete(key);
    }
    this.watcherManager.notify('delete', key, undefined, oldValue);
  }

  /**
   * Delete multiple keys
   * @param {string[]} keys Keys to delete
   */
  async bulkDelete(keys) {
    this.stats.deletes += keys.length;
    await operations.bulkDelete(this.db, keys, null);
    if (this.cache) {
      keys.forEach(key => this.cache.delete(key));
    }
    keys.forEach(key => {
      this.watcherManager.notify('delete', key, undefined);
    });
  }

  /**
   * Set multiple key-value pairs
   * @param {Array<{key: string, value: any}>} entries Entries to set
   */
  async bulkSet(entries) {
    if (!Array.isArray(entries)) {
      throw new TypeError('Entries must be an array');
    }
    this.stats.writes += entries.length;
    
    await operations.bulkSet(this.db, entries, null);
    if (this.cache) {
      entries.forEach(({ key, value }) => {
        this.cache.set(key, value);
      });
    }
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
    await operations.clearAll(this.db, null);
    if (this.cache) {
      this.cache.clear();
    }
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
    const newValue = await operations.add(this.db, key, amount, null);
    if (this.cache) {
      this.cache.set(key, newValue);
    }
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
    const newValue = await operations.subtract(this.db, key, amount, null);
    if (this.cache) {
      this.cache.set(key, newValue);
    }
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

  async transaction(callback) {
    if (typeof callback !== 'function') {
      throw new TypeError('Callback must be a function');
    }

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

    const stmtCache = this.createStatementCache(sqlDb);
    const modifiedKeys = new Map();
    const cacheBackup = new Map();

    sqlDb.prepare('BEGIN IMMEDIATE').run();
    
    const txProxy = this.createTransactionProxy(stmtCache, modifiedKeys, cacheBackup);

    try {
      const result = await Promise.resolve(callback(txProxy));
      sqlDb.prepare('COMMIT').run();
      
      this.applyCacheUpdates(modifiedKeys);
      
      return result;
    } catch (error) {
      sqlDb.prepare('ROLLBACK').run();
      this.restoreCacheBackup(cacheBackup);
      throw new TransactionError(error.message);
    }
  }

  createStatementCache(sqlDb) {
    return {
      select: sqlDb.prepare('SELECT value FROM data WHERE key = ?'),
      insert: sqlDb.prepare('INSERT OR REPLACE INTO data (key, value) VALUES (?, ?)'),
      delete: sqlDb.prepare('DELETE FROM data WHERE key = ?')
    };
  }

  createTransactionProxy(stmtCache, modifiedKeys, cacheBackup) {
    return {
      get: async (key) => {
        const row = stmtCache.select.get(key);
        if (!row) return undefined;
        const Serializer = require('./utils/serializer');
        return Serializer.deserialize(row.value);
      },
      set: (key, value) => {
        const { validateKey, validateValue } = require('./utils/helpers');
        validateKey(key);
        validateValue(value);
        
        if (this.cache && !cacheBackup.has(key)) {
          const oldValue = this.cache.get(key);
          cacheBackup.set(key, { exists: oldValue !== undefined, value: oldValue });
        }
        
        const Serializer = require('./utils/serializer');
        stmtCache.insert.run(key, Serializer.serialize(value));
        modifiedKeys.set(key, { operation: 'set', value });
      },
      delete: (key) => {
        const { validateKey } = require('./utils/helpers');
        validateKey(key);
        
        if (this.cache && !cacheBackup.has(key)) {
          const oldValue = this.cache.get(key);
          cacheBackup.set(key, { exists: oldValue !== undefined, value: oldValue });
        }
        
        stmtCache.delete.run(key);
        modifiedKeys.set(key, { operation: 'delete' });
      }
    };
  }

  applyCacheUpdates(modifiedKeys) {
    if (!this.cache) return;
    
    for (const [key, data] of modifiedKeys) {
      if (data.operation === 'set') {
        this.cache.set(key, data.value);
      } else if (data.operation === 'delete') {
        this.cache.delete(key);
      }
    }
  }

  restoreCacheBackup(cacheBackup) {
    if (!this.cache) return;
    
    for (const [key, backup] of cacheBackup) {
      if (backup.exists) {
        this.cache.set(key, backup.value);
      } else {
        this.cache.delete(key);
      }
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

    if (patterns !== null && patterns !== undefined && 
        typeof patterns !== 'string' && !Array.isArray(patterns)) {
      throw new TypeError('Patterns must be a string, array, or null/undefined');
    }
    
    if (Array.isArray(patterns)) {
      for (const pattern of patterns) {
        if (typeof pattern !== 'string' && !(pattern instanceof RegExp)) {
          throw new TypeError('Each pattern must be a string or RegExp');
        }
      }
    }

    if (this.writeBatch) {
      await this.writeBatch.flush();
    }

    await this.db.connect();
    const allData = !this.db.isJSON && this.db.db 
      ? await this.readDataWithTransaction()
      : await this.db.readData();
    
    const entries = Object.entries(allData);
    
    if (!patterns) {
      const toCache = entries.slice(0, this.options.cacheSize);
      toCache.forEach(([key, value]) => {
        this.cache.set(key, value);
      });
      return;
    }

    const matchers = this.createPatternMatchers(patterns);

    for (const [key, value] of entries) {
      if (this.matchesAnyPattern(key, matchers)) {
        this.cache.set(key, value);
      }
    }
  }

  async readDataWithTransaction() {
    const sqlDb = this.db.db;
    sqlDb.prepare('BEGIN DEFERRED').run();
    try {
      const rows = sqlDb.prepare('SELECT key, value FROM data').all();
      const data = {};
      const Serializer = require('./utils/serializer');
      rows.forEach(row => {
        data[row.key] = Serializer.deserialize(row.value);
      });
      sqlDb.prepare('COMMIT').run();
      return data;
    } catch (error) {
      sqlDb.prepare('ROLLBACK').run();
      throw error;
    }
  }

  createPatternMatchers(patterns) {
    const patternsArray = Array.isArray(patterns) ? patterns : [patterns];
    return patternsArray.map(p => this.createSinglePatternMatcher(p));
  }

  createSinglePatternMatcher(pattern) {
    if (typeof pattern === 'string' && pattern.includes('*')) {
      const regexPattern = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
      return new RegExp(`^${regexPattern}$`);
    }
    return pattern;
  }

  matchesAnyPattern(key, matchers) {
    for (const matcher of matchers) {
      if (this.matchesSinglePattern(key, matcher)) {
        return true;
      }
    }
    return false;
  }

  matchesSinglePattern(key, matcher) {
    if (typeof matcher === 'string') {
      return key === matcher || key.startsWith(matcher);
    }
    if (matcher instanceof RegExp) {
      return matcher.test(key);
    }
    return false;
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
    const avgReadTime = this.stats.reads > 0 ? (this.stats.totalReadTime / this.stats.reads).toFixed(2) : 0;
    const avgWriteTime = this.stats.writes > 0 ? (this.stats.totalWriteTime / this.stats.writes).toFixed(2) : 0;
    const avgDeleteTime = this.stats.deletes > 0 ? (this.stats.totalDeleteTime / this.stats.deletes).toFixed(2) : 0;
    
    return {
      reads: this.stats.reads,
      writes: this.stats.writes,
      deletes: this.stats.deletes,
      errors: this.stats.errors,
      uptime: Math.floor(uptime / 1000) + 's',
      cache: this.cache ? this.cache.getStats() : null,
      batchQueue: this.writeBatch ? this.writeBatch.size() : 0,
      watchers: this.watcherManager.getWatcherCount(),
      performance: {
        avgReadTimeMs: parseFloat(avgReadTime),
        avgWriteTimeMs: parseFloat(avgWriteTime),
        avgDeleteTimeMs: parseFloat(avgDeleteTime),
        totalReadTimeMs: this.stats.totalReadTime,
        totalWriteTimeMs: this.stats.totalWriteTime,
        totalDeleteTimeMs: this.stats.totalDeleteTime
      },
      throughput: {
        bytesRead: this.stats.bytesRead,
        bytesWritten: this.stats.bytesWritten,
        readsPerSecond: uptime > 0 ? ((this.stats.reads / uptime) * 1000).toFixed(2) : 0,
        writesPerSecond: uptime > 0 ? ((this.stats.writes / uptime) * 1000).toFixed(2) : 0
      }
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
      startTime: Date.now(),
      errors: 0,
      totalReadTime: 0,
      totalWriteTime: 0,
      totalDeleteTime: 0,
      bytesRead: 0,
      bytesWritten: 0
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
    await this.db.destroy();
  }
}

module.exports = QuantumDB;

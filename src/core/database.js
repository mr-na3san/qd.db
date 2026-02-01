const Database = require('better-sqlite3');
const fs = require('fs').promises;
const path = require('path');
const writeFileAtomic = require('write-file-atomic');
const { ReadError, WriteError } = require('../utils/errors');
const Serializer = require('../utils/serializer');

const allowedExtensions = Object.freeze(new Set(['.json', '.db', '.sqlite']));
const maxFileSizeMb = 1024;
const streamChunkSize = 100;

class DatabaseConnection {
  constructor(filePath = 'quantum.sqlite', options = {}) {
    this.filePath = path.resolve(filePath);
    this.db = null;
    this.isConnected = false;
    this.isJSON = this.filePath.endsWith('.json');
    this.options = {
      keepConnectionOpen: options.keepConnectionOpen ?? true,
      timeout: options.timeout ?? 5000,
      walMode: options.walMode ?? true,
      maxFileSizeMb: options.maxFileSizeMb ?? maxFileSizeMb,
      ...options
    };

    const ext = path.extname(this.filePath).toLowerCase();
    if (!allowedExtensions.has(ext)) {
      throw new Error(`Unsupported file extension. Allowed: ${Array.from(allowedExtensions).join(', ')}`);
    }
  }

  async connect() {
    if (this.isConnected) return;
    
    try {
      await this.initialize();
      if (!this.isJSON) {
        this.db = new Database(this.filePath, { timeout: this.options.timeout });
        if (this.options.walMode) {
          this.db.pragma('journal_mode = WAL');
        }
        this.db.pragma('synchronous = NORMAL');
        this.db.pragma('cache_size = -64000');
        this.db.pragma('temp_store = MEMORY');
        
        try {
          const stmt = this.db.prepare('CREATE INDEX IF NOT EXISTS idx_key ON data(key)');
          stmt.run();
        } catch (error) {
          const { defaultLogger } = require('../utils/logger');
          defaultLogger.warn(`Index creation failed (non-fatal): ${error.message}`);
        }
      }
      this.isConnected = true;
    } catch (error) {
      if (this.db) {
        try {
          this.db.close();
        } catch (e) {}
        this.db = null;
      }
      throw new WriteError(`Connection failed: ${error.message}`);
    }
  }

  /**
   * Close database connection
   * @private
   */
  close() {
    if (this.db && !this.options.keepConnectionOpen) {
      this.db.close();
      this.db = null;
      this.isConnected = false;
    }
  }

  async initialize() {
    try {
      await fs.access(this.filePath);
    } catch {
      try {
        if (this.isJSON) {
          await writeFileAtomic(this.filePath, '{}');
          await this.setFilePermissionsSafe(this.filePath);
        } else {
          const db = new Database(this.filePath);
          try {
            db.exec('CREATE TABLE IF NOT EXISTS data (key TEXT PRIMARY KEY, value TEXT)');
          } finally {
            db.close();
          }
          await this.setFilePermissionsSafe(this.filePath);
        }
      } catch (err) {
        throw new WriteError(`Initialization failed: ${err.message}`);
      }
    }
  }

  async setFilePermissionsSafe(filePath) {
    if (process.platform === 'win32') {
      return;
    }
    
    try {
      await fs.chmod(filePath, 0o600);
    } catch (error) {
      const { defaultLogger } = require('../utils/logger');
      defaultLogger.warn(`Could not set file permissions (non-fatal): ${error.message}`);
    }
  }

  async executeOperation(operation) {
    let shouldClose = false;
    let operationError = null;
    let timeoutId = null;
    let isTimedOut = false;
    
    try {
      shouldClose = !this.isConnected;
      await this.connect();
      
      if (this.options.timeout && this.options.timeout > 0) {
        const abortController = new AbortController();
        
        const timeoutPromise = new Promise((_, reject) => {
          timeoutId = setTimeout(() => {
            isTimedOut = true;
            abortController.abort();
            reject(new Error('Operation timeout'));
          }, this.options.timeout);
        });
        
        const result = await Promise.race([
          operation(abortController.signal), 
          timeoutPromise
        ]);
        
        if (timeoutId) clearTimeout(timeoutId);
        return result;
      }
      
      return await operation(null);
    } catch (error) {
      if (timeoutId) clearTimeout(timeoutId);
      operationError = error;
      
      if (this.db && this.isConnected && !this.options.keepConnectionOpen) {
        try {
          this.db.close();
          this.db = null;
          this.isConnected = false;
        } catch (closeError) {
          const { defaultLogger } = require('../utils/logger');
          defaultLogger.error('Error closing connection after operation failure:', closeError);
        }
      }
      throw error;
    } finally {
      if (shouldClose && !operationError && !isTimedOut) {
        this.close();
      }
    }
  }

  async readJSONFile() {
    try {
      const stats = await fs.stat(this.filePath);
      const maxBytes = this.options.maxFileSizeMb * 1024 * 1024;
      
      if (stats.size > maxBytes) {
        throw new ReadError(`File size (${(stats.size / 1024 / 1024).toFixed(2)}MB) exceeds maximum allowed (${this.options.maxFileSizeMb}MB). Use streaming instead.`);
      }
      
      const content = await fs.readFile(this.filePath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      if (error instanceof ReadError) throw error;
      if (error instanceof SyntaxError) {
        throw new ReadError(`Invalid JSON format in ${this.filePath}: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Write JSON file
   * @private
   */
  async writeJSONFile(data) {
    await writeFileAtomic(this.filePath, JSON.stringify(data, null, 2), { mode: 0o600 });
  }

  /**
   * Get single value by key
   * @param {string} key Key to retrieve
   * @returns {Promise<any>} Retrieved value
   */
  async getValue(key) {
    try {
      return await this.executeOperation(async () => {
        if (this.isJSON) {
          const data = await this.readJSONFile();
          return data[key];
        }

        const stmt = this.db.prepare('SELECT value FROM data WHERE key = ?');
        const row = stmt.get(key);
        return row ? Serializer.deserialize(row.value) : undefined;
      });
    } catch (error) {
      throw new ReadError(error.message);
    }
  }

  /**
   * Set single value by key
   * @param {string} key Key to set
   * @param {any} value Value to store
   */
  async setValue(key, value) {
    try {
      await this.executeOperation(async () => {
        if (this.isJSON) {
          const data = await this.readJSONFile();
          data[key] = value;
          await this.writeJSONFile(data);
          return;
        }

        const stmt = this.db.prepare('INSERT OR REPLACE INTO data (key, value) VALUES (?, ?)');
        stmt.run(key, Serializer.serialize(value));
      });
    } catch (error) {
      throw new WriteError(error.message);
    }
  }

  /**
   * Delete single key
   * @param {string} key Key to delete
   */
  async deleteValue(key) {
    try {
      await this.executeOperation(async () => {
        if (this.isJSON) {
          const data = await this.readJSONFile();
          delete data[key];
          await this.writeJSONFile(data);
          return;
        }

        const stmt = this.db.prepare('DELETE FROM data WHERE key = ?');
        stmt.run(key);
      });
    } catch (error) {
      throw new WriteError(error.message);
    }
  }

  /**
   * Read all data from database
   * @returns {Promise<Object>} Database contents
   */
  async readData() {
    try {
      return await this.executeOperation(async () => {
        if (this.isJSON) {
          return await this.readJSONFile();
        }

        const rows = this.db.prepare('SELECT key, value FROM data').all();
        const data = {};
        rows.forEach(row => {
          data[row.key] = Serializer.deserialize(row.value);
        });
        return data;
      });
    } catch (error) {
      throw new ReadError(error.message);
    }
  }

  async writeData(data) {
    try {
      await this.executeOperation(async () => {
        if (this.isJSON) {
          await this.writeJSONFile(data);
          return;
        }

        const transaction = this.db.transaction(() => {
          this.db.exec('DELETE FROM data');
          this.db.exec('VACUUM');
          
          const insertStmt = this.db.prepare('INSERT INTO data (key, value) VALUES (?, ?)');
          for (const [key, value] of Object.entries(data)) {
            insertStmt.run(key, Serializer.serialize(value));
          }
        });
        transaction();
      });
    } catch (error) {
      throw new WriteError(error.message);
    }
  }

  /**
   * Batch set multiple values
   * @param {Array<{key: string, value: any}>} entries Entries to set
   */
  async batchSet(entries) {
    try {
      await this.executeOperation(async () => {
        if (this.isJSON) {
          const data = await this.readJSONFile();
          entries.forEach(({ key, value }) => {
            data[key] = value;
          });
          await this.writeJSONFile(data);
          return;
        }

        const transaction = this.db.transaction(() => {
          const stmt = this.db.prepare('INSERT OR REPLACE INTO data (key, value) VALUES (?, ?)');
          entries.forEach(({ key, value }) => {
            stmt.run(key, Serializer.serialize(value));
          });
        });
        transaction();
      });
    } catch (error) {
      throw new WriteError(error.message);
    }
  }

  /**
   * Batch delete multiple keys
   * @param {Array<string>} keys Keys to delete
   */
  async batchDelete(keys) {
    try {
      await this.executeOperation(async () => {
        if (this.isJSON) {
          const data = await this.readJSONFile();
          keys.forEach(key => delete data[key]);
          await this.writeJSONFile(data);
          return;
        }

        const transaction = this.db.transaction(() => {
          const stmt = this.db.prepare('DELETE FROM data WHERE key = ?');
          keys.forEach(key => stmt.run(key));
        });
        transaction();
      });
    } catch (error) {
      throw new WriteError(error.message);
    }
  }

  async *streamEntries(yieldEvery = streamChunkSize) {
    let shouldClose = false;
    try {
      shouldClose = !this.isConnected;
      await this.connect();
      
      if (this.isJSON) {
        const fileHandle = await fs.open(this.filePath, 'r');
        try {
          const content = await fileHandle.readFile('utf8');
          const data = JSON.parse(content);
          const keys = Object.keys(data);
          for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            yield { key, value: data[key] };
            if (i % yieldEvery === 0 && i > 0) {
              await new Promise(resolve => setImmediate(resolve));
            }
          }
        } finally {
          await fileHandle.close();
        }
        return;
      }

      const selectStmt = this.db.prepare('SELECT key, value FROM data');
      let count = 0;
      try {
        for (const row of selectStmt.iterate()) {
          try {
            const value = Serializer.deserialize(row.value);
            yield { key: row.key, value };
            count++;
            if (count % yieldEvery === 0) {
              await new Promise(resolve => setImmediate(resolve));
            }
          } catch (deserializeError) {
            const { defaultLogger } = require('../utils/logger');
            defaultLogger.warn(`Failed to deserialize value for key "${row.key}": ${deserializeError.message}`);
            yield { key: row.key, value: row.value };
          }
        }
      } catch (iterateError) {
        const { defaultLogger } = require('../utils/logger');
        defaultLogger.error(`Stream iteration error: ${iterateError.message}`);
        throw new ReadError(`Stream iteration failed: ${iterateError.message}`);
      }
    } finally {
      if (shouldClose) {
        this.close();
      }
    }
  }

  /**
   * Destroy connection and cleanup
   */
  async destroy() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
    this.isConnected = false;
    
    if (!this.isJSON && this.options.walMode) {
      try {
        const walPath = this.filePath + '-wal';
        const shmPath = this.filePath + '-shm';
        
        await fs.unlink(walPath).catch(() => {});
        await fs.unlink(shmPath).catch(() => {});
      } catch (error) {
        const { defaultLogger } = require('../utils/logger');
        defaultLogger.warn(`Could not cleanup WAL/SHM files: ${error.message}`);
      }
    }
  }
}

module.exports = DatabaseConnection;
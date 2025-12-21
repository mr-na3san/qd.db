const Database = require('better-sqlite3');
const fs = require('fs').promises;
const path = require('path');
const writeFileAtomic = require('write-file-atomic');
const { ReadError, WriteError } = require('../utils/errors');
const Serializer = require('../utils/serializer');

const allowedExtensions = new Set(['.json', '.db', '.sqlite']);

class DatabaseConnection {
  /**
   * Create new database connection
   * @param {string} [filePath='quantum.sqlite'] Path to database file
   * @param {Object} [options={}] Connection options
   */
  constructor(filePath = 'quantum.sqlite', options = {}) {
    this.filePath = path.resolve(filePath);
    this.db = null;
    this.isConnected = false;
    this.isJSON = this.filePath.endsWith('.json');
    this.options = {
      keepConnectionOpen: options.keepConnectionOpen ?? true,
      timeout: options.timeout ?? 5000,
      ...options
    };

    const ext = path.extname(this.filePath).toLowerCase();
    if (!allowedExtensions.has(ext)) {
      throw new Error(`Unsupported file extension. Allowed: ${Array.from(allowedExtensions).join(', ')}`);
    }

    const cwd = process.cwd();
    const resolvedCwd = path.resolve(cwd);
    if (!this.filePath.startsWith(resolvedCwd)) {
      throw new Error('File path must be within current directory');
    }
  }

  /**
   * Connect to database
   * @private
   */
  async connect() {
    if (this.isConnected) return;
    
    try {
      await this.initialize();
      if (!this.isJSON) {
        this.db = new Database(this.filePath, { timeout: this.options.timeout });
        this.db.pragma('journal_mode = WAL');
        this.db.pragma('synchronous = NORMAL');
        this.db.pragma('cache_size = -64000');
        this.db.pragma('temp_store = MEMORY');
        
        const stmt = this.db.prepare('CREATE INDEX IF NOT EXISTS idx_key ON data(key)');
        stmt.run();
      }
      this.isConnected = true;
    } catch (error) {
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

  /**
   * Initialize database file
   * @private
   */
  async initialize() {
    try {
      await fs.access(this.filePath);
    } catch {
      try {
        if (this.isJSON) {
          await writeFileAtomic(this.filePath, '{}', { mode: 0o600 });
        } else {
          const db = new Database(this.filePath);
          db.exec('CREATE TABLE IF NOT EXISTS data (key TEXT PRIMARY KEY, value TEXT)');
          db.close();
          await fs.chmod(this.filePath, 0o600);
        }
      } catch (err) {
        throw new WriteError(`Initialization failed: ${err.message}`);
      }
    }
  }

  /**
   * Get single value by key
   * @param {string} key Key to retrieve
   * @returns {Promise<any>} Retrieved value
   */
  async getValue(key) {
    try {
      await this.connect();
      
      if (this.isJSON) {
        const content = await fs.readFile(this.filePath, 'utf8');
        const data = JSON.parse(content);
        return data[key];
      }

      const stmt = this.db.prepare('SELECT value FROM data WHERE key = ?');
      const row = stmt.get(key);
      return row ? Serializer.deserialize(row.value) : undefined;
    } catch (error) {
      throw new ReadError(error.message);
    } finally {
      this.close();
    }
  }

  /**
   * Set single value by key
   * @param {string} key Key to set
   * @param {any} value Value to store
   */
  async setValue(key, value) {
    try {
      await this.connect();
      
      if (this.isJSON) {
        const content = await fs.readFile(this.filePath, 'utf8');
        const data = JSON.parse(content);
        data[key] = value;
        await writeFileAtomic(this.filePath, JSON.stringify(data, null, 2), { mode: 0o600 });
        return;
      }

      const stmt = this.db.prepare('INSERT OR REPLACE INTO data (key, value) VALUES (?, ?)');
      stmt.run(key, Serializer.serialize(value));
    } catch (error) {
      throw new WriteError(error.message);
    } finally {
      this.close();
    }
  }

  /**
   * Delete single key
   * @param {string} key Key to delete
   */
  async deleteValue(key) {
    try {
      await this.connect();
      
      if (this.isJSON) {
        const content = await fs.readFile(this.filePath, 'utf8');
        const data = JSON.parse(content);
        delete data[key];
        await writeFileAtomic(this.filePath, JSON.stringify(data, null, 2), { mode: 0o600 });
        return;
      }

      const stmt = this.db.prepare('DELETE FROM data WHERE key = ?');
      stmt.run(key);
    } catch (error) {
      throw new WriteError(error.message);
    } finally {
      this.close();
    }
  }

  /**
   * Read all data from database
   * @returns {Promise<Object>} Database contents
   */
  async readData() {
    try {
      await this.connect();
      
      if (this.isJSON) {
        const content = await fs.readFile(this.filePath, 'utf8');
        return JSON.parse(content);
      }

      const rows = this.db.prepare('SELECT key, value FROM data').all();
      const data = {};
      rows.forEach(row => {
        data[row.key] = Serializer.deserialize(row.value);
      });
      return data;
    } catch (error) {
      throw new ReadError(error.message);
    } finally {
      this.close();
    }
  }

  /**
   * Write data to database
   * @param {Object} data Data to write
   */
  async writeData(data) {
    try {
      await this.connect();

      if (this.isJSON) {
        await writeFileAtomic(this.filePath, JSON.stringify(data, null, 2), { mode: 0o600 });
        return;
      }

      const transaction = this.db.transaction(() => {
        this.db.prepare('DELETE FROM data').run();
        const stmt = this.db.prepare('INSERT INTO data (key, value) VALUES (?, ?)');
        for (const [key, value] of Object.entries(data)) {
          stmt.run(key, Serializer.serialize(value));
        }
      });
      transaction();
    } catch (error) {
      throw new WriteError(error.message);
    } finally {
      this.close();
    }
  }

  /**
   * Batch set multiple values
   * @param {Array<{key: string, value: any}>} entries Entries to set
   */
  async batchSet(entries) {
    try {
      await this.connect();

      if (this.isJSON) {
        const content = await fs.readFile(this.filePath, 'utf8');
        const data = JSON.parse(content);
        entries.forEach(({ key, value }) => {
          data[key] = value;
        });
        await writeFileAtomic(this.filePath, JSON.stringify(data, null, 2), { mode: 0o600 });
        return;
      }

      const transaction = this.db.transaction(() => {
        const stmt = this.db.prepare('INSERT OR REPLACE INTO data (key, value) VALUES (?, ?)');
        entries.forEach(({ key, value }) => {
          stmt.run(key, Serializer.serialize(value));
        });
      });
      transaction();
    } catch (error) {
      throw new WriteError(error.message);
    } finally {
      this.close();
    }
  }

  /**
   * Batch delete multiple keys
   * @param {Array<string>} keys Keys to delete
   */
  async batchDelete(keys) {
    try {
      await this.connect();

      if (this.isJSON) {
        const content = await fs.readFile(this.filePath, 'utf8');
        const data = JSON.parse(content);
        keys.forEach(key => delete data[key]);
        await writeFileAtomic(this.filePath, JSON.stringify(data, null, 2), { mode: 0o600 });
        return;
      }

      const transaction = this.db.transaction(() => {
        const stmt = this.db.prepare('DELETE FROM data WHERE key = ?');
        keys.forEach(key => stmt.run(key));
      });
      transaction();
    } catch (error) {
      throw new WriteError(error.message);
    } finally {
      this.close();
    }
  }

  /**
   * Stream all entries
   * @returns {AsyncGenerator} Entry generator
   */
  async *streamEntries() {
    try {
      await this.connect();
      
      if (this.isJSON) {
        const content = await fs.readFile(this.filePath, 'utf8');
        const data = JSON.parse(content);
        for (const [key, value] of Object.entries(data)) {
          yield { key, value };
        }
        return;
      }

      const stmt = this.db.prepare('SELECT key, value FROM data');
      for (const row of stmt.iterate()) {
        yield { key: row.key, value: Serializer.deserialize(row.value) };
      }
    } finally {
      this.close();
    }
  }

  /**
   * Destroy connection and cleanup
   */
  destroy() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
    this.isConnected = false;
  }
}

module.exports = DatabaseConnection;
const {
  InvalidValue,
  ReadError,
  WriteError,
  NotArrayError,
  InvalidNumberError
} = require('../utils/errors');

const { validateKey, validateValue } = require('../utils/helpers');

/**
 * Get value by key with cache support
 * @param {DatabaseConnection} db Database instance
 * @param {string} key Key to retrieve
 * @param {CacheManager} cache Cache instance
 * @returns {Promise<any>} Retrieved value
 */
async function get(db, key, cache = null) {
  validateKey(key);
  
  if (cache && cache.has(key)) {
    return cache.get(key);
  }

  try {
    const value = await db.getValue(key);
    if (cache && value !== undefined) {
      cache.set(key, value);
    }
    return value;
  } catch (error) {
    throw new ReadError(error.message);
  }
}

/**
 * Set value by key with cache support
 * @param {DatabaseConnection} db Database instance
 * @param {string} key Key to set
 * @param {any} value Value to store
 * @param {CacheManager} cache Cache instance
 */
async function set(db, key, value, cache = null) {
  validateKey(key);
  validateValue(value);
  
  try {
    await db.setValue(key, value);
    if (cache) {
      cache.set(key, value);
    }
  } catch (error) {
    throw new WriteError(error.message);
  }
}

/**
 * Push value to array
 * @param {DatabaseConnection} db Database instance
 * @param {string} key Array key
 * @param {any} value Value to push
 * @param {CacheManager} cache Cache instance
 */
async function push(db, key, value, cache = null) {
  validateKey(key);
  validateValue(value);
  
  try {
    let array = await get(db, key, cache);
    if (!Array.isArray(array)) array = [];
    array.push(value);
    await set(db, key, array, cache);
  } catch (error) {
    throw new WriteError(error.message);
  }
}

/**
 * Remove value from array
 * @param {DatabaseConnection} db Database instance
 * @param {string} key Array key
 * @param {any} value Value to remove
 * @param {CacheManager} cache Cache instance
 */
async function pull(db, key, value, cache = null) {
  validateKey(key);
  validateValue(value);
  
  try {
    const array = await get(db, key, cache);
    if (!Array.isArray(array)) throw new NotArrayError();
    const filtered = array.filter(item => item !== value);
    await set(db, key, filtered, cache);
  } catch (error) {
    if (error instanceof NotArrayError) throw error;
    throw new WriteError(error.message);
  }
}

/**
 * Delete key from database
 * @param {DatabaseConnection} db Database instance
 * @param {string} key Key to delete
 * @param {CacheManager} cache Cache instance
 */
async function deleteKey(db, key, cache = null) {
  validateKey(key);
  
  try {
    await db.deleteValue(key);
    if (cache) {
      cache.delete(key);
    }
  } catch (error) {
    throw new WriteError(error.message);
  }
}

/**
 * Delete multiple keys
 * @param {DatabaseConnection} db Database instance
 * @param {string[]} keys Keys to delete
 * @param {CacheManager} cache Cache instance
 */
async function bulkDelete(db, keys, cache = null) {
  if (!Array.isArray(keys)) throw new InvalidValue('Keys must be an array');
  
  try {
    await db.batchDelete(keys);
    if (cache) {
      keys.forEach(key => cache.delete(key));
    }
  } catch (error) {
    throw new WriteError(error.message);
  }
}

/**
 * Set multiple key-value pairs
 * @param {DatabaseConnection} db Database instance
 * @param {Array<{key: string, value: any}>} entries Entries to set
 * @param {CacheManager} cache Cache instance
 */
async function bulkSet(db, entries, cache = null) {
  if (!Array.isArray(entries)) throw new InvalidValue('Entries must be an array');
  
  entries.forEach(entry => {
    if (!entry.key || entry.value === undefined) {
      throw new InvalidValue('Each entry must have key and value');
    }
    validateKey(entry.key);
    validateValue(entry.value);
  });

  try {
    await db.batchSet(entries);
    if (cache) {
      entries.forEach(({ key, value }) => cache.set(key, value));
    }
  } catch (error) {
    throw new WriteError(error.message);
  }
}

/**
 * Get all key-value pairs
 * @param {DatabaseConnection} db Database instance
 * @returns {Promise<Array<{key: string, value: any}>>} All entries
 */
async function getAll(db) {
  try {
    const data = await db.readData();
    return Object.entries(data).map(([key, value]) => ({ key, value }));
  } catch (error) {
    throw new ReadError(error.message);
  }
}

/**
 * Clear all data
 * @param {DatabaseConnection} db Database instance
 * @param {CacheManager} cache Cache instance
 */
async function clearAll(db, cache = null) {
  try {
    await db.writeData({});
    if (cache) {
      cache.clear();
    }
  } catch (error) {
    throw new WriteError(error.message);
  }
}

/**
 * Increment numeric value
 * @param {DatabaseConnection} db Database instance
 * @param {string} key Key of numeric value
 * @param {number} [amount=1] Amount to increment
 * @param {CacheManager} cache Cache instance
 */
async function add(db, key, amount = 1, cache = null) {
  validateKey(key);
  if (typeof amount !== 'number' || !isFinite(amount)) {
    throw new InvalidNumberError('Amount must be a finite number');
  }
  
  try {
    const current = await get(db, key, cache);
    if (current !== undefined && typeof current !== 'number') {
      throw new InvalidNumberError('Current value must be a number');
    }
    const newValue = (current || 0) + amount;
    await set(db, key, newValue, cache);
    return newValue;
  } catch (error) {
    if (error instanceof InvalidNumberError) throw error;
    throw new WriteError(error.message);
  }
}

/**
 * Decrement numeric value
 * @param {DatabaseConnection} db Database instance
 * @param {string} key Key of numeric value
 * @param {number} [amount=1] Amount to decrement
 * @param {CacheManager} cache Cache instance
 */
async function subtract(db, key, amount = 1, cache = null) {
  validateKey(key);
  if (typeof amount !== 'number' || !isFinite(amount)) {
    throw new InvalidNumberError('Amount must be a finite number');
  }
  
  try {
    const current = await get(db, key, cache);
    if (current !== undefined && typeof current !== 'number') {
      throw new InvalidNumberError('Current value must be a number');
    }
    const newValue = (current || 0) - amount;
    await set(db, key, newValue, cache);
    return newValue;
  } catch (error) {
    if (error instanceof InvalidNumberError) throw error;
    throw new WriteError(error.message);
  }
}

/**
 * Check if key exists
 * @param {DatabaseConnection} db Database instance
 * @param {string} key Key to check
 * @param {CacheManager} cache Cache instance
 * @returns {Promise<boolean>} True if key exists
 */
async function has(db, key, cache = null) {
  validateKey(key);
  
  if (cache && cache.has(key)) {
    return true;
  }

  try {
    const value = await db.getValue(key);
    return value !== undefined;
  } catch (error) {
    throw new ReadError(error.message);
  }
}

/**
 * Find keys matching pattern
 * @param {DatabaseConnection} db Database instance
 * @param {RegExp} pattern Pattern to match
 * @returns {Promise<string[]>} Matching keys
 */
async function findKeys(db, pattern) {
  if (!(pattern instanceof RegExp)) throw new InvalidValue('Pattern must be a RegExp');
  
  try {
    const keys = [];
    for await (const { key } of db.streamEntries()) {
      if (pattern.test(key)) {
        keys.push(key);
      }
    }
    return keys;
  } catch (error) {
    throw new ReadError(error.message);
  }
}

/**
 * Find keys starting with prefix
 * @param {DatabaseConnection} db Database instance
 * @param {string} prefix Prefix to match
 * @returns {Promise<string[]>} Matching keys
 */
async function startsWith(db, prefix) {
  validateKey(prefix);
  
  try {
    const keys = [];
    for await (const { key } of db.streamEntries()) {
      if (key.startsWith(prefix)) {
        keys.push(key);
      }
    }
    return keys;
  } catch (error) {
    throw new ReadError(error.message);
  }
}

/**
 * Stream all entries
 * @param {DatabaseConnection} db Database instance
 * @returns {AsyncGenerator} Entry generator
 */
async function* streamAll(db) {
  try {
    for await (const entry of db.streamEntries()) {
      yield entry;
    }
  } catch (error) {
    throw new ReadError(error.message);
  }
}

module.exports = {
  get,
  set,
  push,
  pull,
  deleteKey,
  bulkDelete,
  bulkSet,
  getAll,
  clearAll,
  add,
  subtract,
  has,
  findKeys,
  startsWith,
  streamAll
};
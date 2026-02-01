const validOperators = Object.freeze(new Set(['=', '==', '!=', '>', '>=', '<', '<=', 'contains', 'startsWith', 'endsWith', 'in', 'notIn']));
const limitedSortThreshold = 1000;

class QueryBuilder {
  constructor(db) {
    this.db = db;
    this.filters = [];
    this.prefixFilter = null;
    this.regexFilter = null;
    this.limitValue = null;
    this.offsetValue = 0;
    this.sortField = null;
    this.sortOrder = 'asc';
    this.selectFields = null;
    this.preserveInsertionOrder = true;
  }

  /**
   * Filter by key prefix
   * @param {string} prefix Key prefix
   * @returns {QueryBuilder} this instance for chaining
   * @example
   * db.query().prefix('user:').get()
   */
  prefix(prefix) {
    if (typeof prefix !== 'string') {
      throw new TypeError('Prefix must be a string');
    }
    if (!prefix.trim()) {
      throw new Error('Prefix cannot be empty or whitespace');
    }
    if (prefix.includes('%') || prefix.includes('_') || prefix.includes('\\')) {
      throw new Error('Prefix cannot contain SQL wildcard characters (%, _, \\)');
    }
    this.prefixFilter = prefix;
    return this;
  }

  /**
   * Filter by key regex
   * @param {RegExp} pattern Regex pattern
   * @returns {QueryBuilder} this instance for chaining
   * @example
   * db.query().keyMatches(/^user:\d+$/).get()
   */
  keyMatches(pattern) {
    this.regexFilter = pattern;
    return this;
  }

  /**
   * Add where condition
   * @param {string} field Field name
   * @param {string} operator Operator (=, !=, >, <, >=, <=, contains, in)
   * @param {any} value Value to compare
   * @returns {QueryBuilder} this
   */
  where(field, operator, value) {
    if (typeof field !== 'string' || !field) {
      throw new TypeError('Field must be a non-empty string');
    }
    if (!validOperators.has(operator)) {
      throw new Error(`Invalid operator: ${operator}. Valid operators are: ${Array.from(validOperators).join(', ')}`);
    }
    if (value === undefined) {
      throw new TypeError('Value cannot be undefined');
    }
    this.filters.push({ field, operator, value });
    return this;
  }

  /**
   * Add multiple where conditions
   * @param {Array<{field: string, operator: string, value: any}>} conditions Conditions
   * @returns {QueryBuilder} this
   */
  whereMultiple(conditions) {
    if (!Array.isArray(conditions)) {
      throw new TypeError('Conditions must be an array');
    }
    conditions.forEach((condition, index) => {
      if (!condition || typeof condition !== 'object') {
        throw new TypeError(`Condition at index ${index} must be an object`);
      }
      if (!condition.field || typeof condition.field !== 'string') {
        throw new TypeError(`Condition at index ${index} must have a valid field`);
      }
      if (!condition.operator || !validOperators.has(condition.operator)) {
        throw new Error(`Condition at index ${index} has invalid operator`);
      }
      if (condition.value === undefined) {
        throw new TypeError(`Condition at index ${index} must have a value`);
      }
    });
    this.filters.push(...conditions);
    return this;
  }

  /**
   * Select specific fields
   * @param {string[]} fields Fields to select
   * @returns {QueryBuilder} this
   */
  select(fields) {
    this.selectFields = Array.isArray(fields) ? fields : [fields];
    return this;
  }

  /**
   * Limit results
   * @param {number} n Limit
   * @returns {QueryBuilder} this
   */
  limit(n) {
    if (!Number.isInteger(n) || n < 1) {
      throw new TypeError('Limit must be a positive integer');
    }
    this.limitValue = n;
    return this;
  }

  /**
   * Offset results
   * @param {number} n Offset
   * @returns {QueryBuilder} this
   */
  offset(n) {
    if (!Number.isInteger(n) || n < 0) {
      throw new TypeError('Offset must be a non-negative integer');
    }
    this.offsetValue = n;
    return this;
  }

  /**
   * Sort results
   * @param {string} field Field to sort by
   * @param {string} order Order (asc or desc)
   * @returns {QueryBuilder} this
   */
  sort(field, order = 'asc') {
    this.sortField = field;
    const normalizedOrder = order.toLowerCase();
    if (normalizedOrder !== 'asc' && normalizedOrder !== 'desc') {
      throw new Error('Sort order must be either "asc" or "desc"');
    }
    this.sortOrder = normalizedOrder;
    return this;
  }

  /**
   * Check if value matches filter
   * @private
   */
  matchesFilter(data, filter) {
    const fieldValue = this.getNestedValue(data, filter.field);

    switch (filter.operator) {
      case '=':
      case '==':
        return fieldValue === filter.value;
      
      case '!=':
        return fieldValue !== filter.value;
      
      case '>':
        return fieldValue > filter.value;
      
      case '>=':
        return fieldValue >= filter.value;
      
      case '<':
        return fieldValue < filter.value;
      
      case '<=':
        return fieldValue <= filter.value;
      
      case 'contains':
        return String(fieldValue).includes(String(filter.value));
      
      case 'startsWith':
        return String(fieldValue).startsWith(String(filter.value));
      
      case 'endsWith':
        return String(fieldValue).endsWith(String(filter.value));
      
      case 'in':
        return Array.isArray(filter.value) && filter.value.includes(fieldValue);
      
      case 'notIn':
        return Array.isArray(filter.value) && !filter.value.includes(fieldValue);
      
      default:
        return false;
    }
  }

  /**
   * Get nested value from object
   * @private
   */
  getNestedValue(obj, path) {
    if (!path.includes('.')) {
      return obj[path];
    }

    const parts = path.split('.');
    let current = obj;
    
    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }
      current = current[part];
    }
    
    return current;
  }

  sortComparator(a, b, field, order) {
    const aVal = this.getNestedValue(a, field);
    const bVal = this.getNestedValue(b, field);
    
    if (aVal === bVal) return 0;
    if (aVal === null || aVal === undefined) return 1;
    if (bVal === null || bVal === undefined) return -1;
    
    const comparison = aVal < bVal ? -1 : 1;
    return order === 'asc' ? comparison : -comparison;
  }

  /**
   * Safely parse value
   * @private
   */
  parseValue(value) {
    if (value === null || typeof value !== 'string') {
      return value;
    }
    
    try {
      return JSON.parse(value);
    } catch (error) {
      return value;
    }
  }

  async get() {
    if (this.canUseSQLOptimization()) {
      return this.getSQLOptimized();
    }
    
    let results = [];
    let processed = 0;
    const useLimitedSort = this.sortField && this.limitValue && this.limitValue < limitedSortThreshold;
    const needsFullScan = this.sortField || this.limitValue === null || (this.limitValue + this.offsetValue) > limitedSortThreshold;

    for await (const { key, value } of this.db.stream()) {
      if (this.prefixFilter && !key.startsWith(this.prefixFilter)) {
        continue;
      }

      if (this.regexFilter && !this.regexFilter.test(key)) {
        continue;
      }

      const data = this.parseValue(value);

      let matches = true;
      for (const filter of this.filters) {
        if (!this.matchesFilter(data, filter)) {
          matches = false;
          break;
        }
      }

      if (!matches) continue;

      const result = typeof data === 'object' && data !== null && !Array.isArray(data)
        ? { key, ...data }
        : { key, value: data };
      
      if (useLimitedSort) {
        results.push(result);
        if (results.length > this.limitValue + this.offsetValue) {
          results.sort((a, b) => this.sortComparator(a, b, this.sortField, this.sortOrder));
          results = results.slice(0, this.limitValue + this.offsetValue);
        }
      } else {
        results.push(result);
        processed++;

        if (!needsFullScan && processed >= this.limitValue + this.offsetValue) {
          break;
        }
      }
    }

    if (this.sortField) {
      results.sort((a, b) => this.sortComparator(a, b, this.sortField, this.sortOrder));
    }

    if (this.offsetValue > 0) {
      results = results.slice(this.offsetValue);
    }

    if (this.limitValue !== null) {
      results = results.slice(0, this.limitValue);
    }

    if (this.selectFields) {
      results = results.map(item => {
        const selected = { key: item.key };
        for (const field of this.selectFields) {
          selected[field] = this.getNestedValue(item, field);
        }
        return selected;
      });
    }

    return results;
  }
  
  canUseSQLOptimization() {
    try {
      return !this.db.db.isJSON && 
             this.db.db.db && 
             this.db.db.isConnected &&
             this.prefixFilter && 
             !this.regexFilter && 
             this.filters.length === 0;
    } catch {
      return false;
    }
  }
  
  async getSQLOptimized() {
    try {
      await this.db.db.connect();
      const sqlDb = this.db.db.db;
      
      if (!sqlDb) {
        return this.get();
      }
      
      let query = 'SELECT key, value FROM data WHERE key LIKE ?';
      const params = [this.prefixFilter + '%'];
      
      if (this.sortField === 'key') {
        const safeOrder = this.sortOrder === 'desc' ? 'DESC' : 'ASC';
        query += ` ORDER BY key ${safeOrder}`;
      }
      
      if (this.limitValue) {
        query += ` LIMIT ?`;
        params.push(this.limitValue);
        
        if (this.offsetValue) {
          query += ` OFFSET ?`;
          params.push(this.offsetValue);
        }
      }
      
      const Serializer = require('../utils/serializer');
      const rows = sqlDb.prepare(query).all(...params);
      
      return rows.map(row => {
        const value = Serializer.deserialize(row.value);
        const data = this.parseValue(value);
        return typeof data === 'object' && data !== null && !Array.isArray(data)
          ? { key: row.key, ...data }
          : { key: row.key, value: data };
      });
    } catch (error) {
      const { defaultLogger } = require('../utils/logger');
      defaultLogger.warn(`SQL optimization failed, falling back to streaming: ${error.message}`);
      return this.get();
    }
  }

  /**
   * Count matching results
   * @returns {Promise<number>} Count
   */
  async count() {
    let count = 0;

    for await (const { key, value } of this.db.stream()) {
      // Key filters
      if (this.prefixFilter && !key.startsWith(this.prefixFilter)) {
        continue;
      }

      if (this.regexFilter && !this.regexFilter.test(key)) {
        continue;
      }

      const data = this.parseValue(value);

      // Apply filters
      let matches = true;
      for (const filter of this.filters) {
        if (!this.matchesFilter(data, filter)) {
          matches = false;
          break;
        }
      }

      if (matches) {
        count++;
      }
    }

    return count;
  }

  /**
   * Get first matching result
   * @returns {Promise<Object|null>} First result or null
   */
  async first() {
    const originalLimit = this.limitValue;
    this.limitValue = 1;
    const results = await this.get();
    this.limitValue = originalLimit;
    return results[0] || null;
  }

  /**
   * Check if any results exist
   * @returns {Promise<boolean>} True if exists
   */
  async exists() {
    return (await this.first()) !== null;
  }

  /**
   * Get all values for a specific field
   * @param {string} field Field name
   * @returns {Promise<Array>} Values
   */
  async pluck(field) {
    const results = await this.get();
    return results.map(item => this.getNestedValue(item, field)).filter(v => v !== undefined);
  }
}

module.exports = QueryBuilder;

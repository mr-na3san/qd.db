class QueryBuilder {
  /**
   * Create query builder
   * @param {QuantumDB} db Database instance
   */
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
  }

  /**
   * Filter by key prefix
   * @param {string} prefix Key prefix
   * @returns {QueryBuilder} this
   */
  prefix(prefix) {
    this.prefixFilter = prefix;
    return this;
  }

  /**
   * Filter by key regex
   * @param {RegExp} pattern Regex pattern
   * @returns {QueryBuilder} this
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
    this.filters.push({ field, operator, value });
    return this;
  }

  /**
   * Add multiple where conditions
   * @param {Array<{field: string, operator: string, value: any}>} conditions Conditions
   * @returns {QueryBuilder} this
   */
  whereMultiple(conditions) {
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
    this.limitValue = n;
    return this;
  }

  /**
   * Offset results
   * @param {number} n Offset
   * @returns {QueryBuilder} this
   */
  offset(n) {
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
    this.sortOrder = order.toLowerCase();
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

  /**
   * Execute query and return results
   * @returns {Promise<Array>} Results
   */
  async get() {
    let results = [];
    let processed = 0;

    for await (const { key, value } of this.db.stream()) {
      // Key filters
      if (this.prefixFilter && !key.startsWith(this.prefixFilter)) {
        continue;
      }

      if (this.regexFilter && !this.regexFilter.test(key)) {
        continue;
      }

      // Parse value
      let data;
      try {
        data = typeof value === 'string' ? JSON.parse(value) : value;
      } catch {
        data = value;
      }

      // Apply filters
      let matches = true;
      for (const filter of this.filters) {
        if (!this.matchesFilter(data, filter)) {
          matches = false;
          break;
        }
      }

      if (!matches) continue;

      // Add to results
      const result = { key, ...data };
      results.push(result);
      processed++;

      // Early exit if limit reached (without sorting)
      if (this.limitValue && !this.sortField && processed >= this.limitValue + this.offsetValue) {
        break;
      }
    }

    // Sort
    if (this.sortField) {
      results.sort((a, b) => {
        const aVal = this.getNestedValue(a, this.sortField);
        const bVal = this.getNestedValue(b, this.sortField);
        
        if (aVal === bVal) return 0;
        if (aVal === null || aVal === undefined) return 1;
        if (bVal === null || bVal === undefined) return -1;
        
        const comparison = aVal < bVal ? -1 : 1;
        return this.sortOrder === 'asc' ? comparison : -comparison;
      });
    }

    // Apply offset and limit
    if (this.offsetValue > 0) {
      results = results.slice(this.offsetValue);
    }

    if (this.limitValue !== null) {
      results = results.slice(0, this.limitValue);
    }

    // Select specific fields
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

      // Parse value
      let data;
      try {
        data = typeof value === 'string' ? JSON.parse(value) : value;
      } catch {
        data = value;
      }

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

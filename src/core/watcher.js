const EventEmitter = require('events');

class WatcherManager extends EventEmitter {
  /**
   * Create watcher manager
   * @param {Object} options Options
   * @param {number} [options.maxWatchers=1000] Maximum number of watchers
   */
  constructor(options = {}) {
    super();
    this.watchers = new Map();
    this.watcherId = 0;
    this.maxWatchers = options.maxWatchers || 1000;
    this.watcherErrors = new Map();
    this.maxErrorsBeforeDisable = options.maxErrorsBeforeDisable || 10;
    this.watcherCallCounts = new Map();
    this.rateLimitWindow = options.rateLimitWindow || 1000;
    this.maxCallsPerWindow = options.maxCallsPerWindow || 1000;
    
    this.on('error', (errorInfo) => {
      const { defaultLogger } = require('../utils/logger');
      defaultLogger.error('Watcher error:', errorInfo.error.message, 'for key:', errorInfo.key);
    });
  }

  /**
   * Add watcher for key pattern
   * @param {string|RegExp} pattern Key pattern to watch
   * @param {Function} callback Callback function
   * @returns {number} Watcher ID
   */
  watch(pattern, callback) {
    if (typeof callback !== 'function') {
      throw new TypeError('Callback must be a function');
    }
    
    if (pattern === null || pattern === undefined) {
      throw new TypeError('Pattern cannot be null or undefined');
    }
    
    if (typeof pattern !== 'string' && !(pattern instanceof RegExp)) {
      throw new TypeError('Pattern must be a string or RegExp');
    }
    
    if (this.watchers.size >= this.maxWatchers) {
      throw new Error(`Maximum number of watchers (${this.maxWatchers}) reached`);
    }
    
    const id = ++this.watcherId;
    const matcher = this.createMatcher(pattern);
    
    this.watchers.set(id, {
      pattern: pattern,
      matcher: matcher,
      callback: callback
    });

    return id;
  }

  /**
   * Remove watcher
   * @param {number} id Watcher ID
   * @returns {boolean} True if watcher was removed
   */
  unwatch(id) {
    return this.watchers.delete(id);
  }

  /**
   * Clear all watchers
   */
  clearWatchers() {
    this.watchers.clear();
    this.watcherErrors.clear();
    this.watcherCallCounts.clear();
  }

  notify(event, key, value, oldValue = undefined) {
    const now = Date.now();
    
    for (const [id, watcher] of this.watchers) {
      if (watcher.matcher(key)) {
        const errorCount = this.watcherErrors.get(id) || 0;
        if (errorCount >= this.maxErrorsBeforeDisable) {
          continue;
        }
        
        if (!this.watcherCallCounts.has(id)) {
          this.watcherCallCounts.set(id, { 
            calls: [],
            windowStart: now 
          });
        }
        
        const callInfo = this.watcherCallCounts.get(id);
        
        callInfo.calls = callInfo.calls.filter(
          timestamp => now - timestamp < this.rateLimitWindow
        );
        
        if (callInfo.calls.length >= this.maxCallsPerWindow) {
          continue;
        }
        
        callInfo.calls.push(now);
        
        try {
          watcher.callback({
            event: event,
            key: key,
            value: value,
            oldValue: oldValue,
            timestamp: now
          });
        } catch (error) {
          const newErrorCount = errorCount + 1;
          this.watcherErrors.set(id, newErrorCount);
          
          this.emit('error', {
            watcherId: id,
            error: error,
            key: key,
            errorCount: newErrorCount,
            disabled: newErrorCount >= this.maxErrorsBeforeDisable
          });
          
          if (newErrorCount >= this.maxErrorsBeforeDisable) {
            const { defaultLogger } = require('../utils/logger');
            defaultLogger.warn(`Watcher ${id} disabled after ${newErrorCount} errors`);
          }
        }
      }
    }

    this.emit(event, { key, value, oldValue });
  }

  /**
   * Create matcher function for pattern
   * @private
   * @param {string|RegExp} pattern Pattern to match
   * @returns {Function} Matcher function
   */
  createMatcher(pattern) {
    if (pattern instanceof RegExp) {
      return (key) => pattern.test(key);
    }

    if (typeof pattern === 'string') {
      if (pattern.includes('*')) {
        const regexPattern = pattern
          .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
          .replace(/\*/g, '.*');
        const regex = new RegExp(`^${regexPattern}$`);
        return (key) => regex.test(key);
      }
      return (key) => key === pattern;
    }

    return () => false;
  }

  /**
   * Get all active watchers
   * @returns {Array} List of watcher info
   */
  getWatchers() {
    return Array.from(this.watchers.entries()).map(([id, watcher]) => ({
      id: id,
      pattern: watcher.pattern.toString()
    }));
  }

  /**
   * Get watcher count
   * @returns {number} Number of active watchers
   */
  getWatcherCount() {
    return this.watchers.size;
  }
}

module.exports = WatcherManager;

const EventEmitter = require('events');

class WatcherManager extends EventEmitter {
  /**
   * Create watcher manager
   */
  constructor() {
    super();
    this.watchers = new Map();
    this.watcherId = 0;
  }

  /**
   * Add watcher for key pattern
   * @param {string|RegExp} pattern Key pattern to watch
   * @param {Function} callback Callback function
   * @returns {number} Watcher ID
   */
  watch(pattern, callback) {
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
  }

  /**
   * Notify watchers of key change
   * @param {string} event Event type (set, delete, push, pull, add, subtract)
   * @param {string} key Key that changed
   * @param {any} value New value
   * @param {any} oldValue Old value
   */
  notify(event, key, value, oldValue = undefined) {
    for (const [id, watcher] of this.watchers) {
      if (watcher.matcher(key)) {
        try {
          watcher.callback({
            event: event,
            key: key,
            value: value,
            oldValue: oldValue,
            timestamp: Date.now()
          });
        } catch (error) {
          this.emit('error', {
            watcherId: id,
            error: error,
            key: key
          });
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

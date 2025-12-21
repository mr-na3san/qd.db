class BatchManager {
  /**
   * Create batch manager
   * @param {Function} executeCallback Callback to execute batch
   * @param {number} maxBatchSize Maximum batch size
   * @param {number} maxWaitTime Maximum wait time in ms
   */
  constructor(executeCallback, maxBatchSize = 100, maxWaitTime = 50) {
    this.executeCallback = executeCallback;
    this.maxBatchSize = maxBatchSize;
    this.maxWaitTime = maxWaitTime;
    this.queue = [];
    this.timer = null;
    this.isProcessing = false;
  }

  /**
   * Add operation to batch queue
   * @param {Object} operation Operation to add
   * @returns {Promise} Promise that resolves when operation completes
   */
  add(operation) {
    return new Promise((resolve, reject) => {
      this.queue.push({ operation, resolve, reject });

      if (this.queue.length >= this.maxBatchSize) {
        this.flush();
      } else if (!this.timer) {
        this.timer = setTimeout(() => this.flush(), this.maxWaitTime);
      }
    });
  }

  /**
   * Flush all pending operations
   * @returns {Promise} Promise that resolves when flush completes
   */
  async flush() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    if (this.queue.length === 0 || this.isProcessing) {
      return;
    }

    this.isProcessing = true;
    const batch = this.queue.splice(0);

    try {
      await this.executeCallback(batch.map(item => item.operation));
      batch.forEach(item => item.resolve());
    } catch (error) {
      batch.forEach(item => item.reject(error));
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Get queue size
   * @returns {number} Current queue size
   */
  size() {
    return this.queue.length;
  }

  /**
   * Clear queue
   */
  clear() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.queue = [];
  }
}

module.exports = BatchManager;

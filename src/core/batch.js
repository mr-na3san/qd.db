const defaultMaxBatchSize = 100;
const defaultMaxWaitTimeMs = 50;
const defaultOperationTimeoutMs = 30000;
const queueSizeMultiplier = 100;
const defaultRetryAttempts = 3;
const initialRetryDelayMs = 100;
const maxRetryDelayMs = 5000;

class BatchManager {
  constructor(executeCallback, maxBatchSize = defaultMaxBatchSize, maxWaitTime = defaultMaxWaitTimeMs, operationTimeout = defaultOperationTimeoutMs, maxQueueSize = null) {
    this.executeCallback = executeCallback;
    this.maxBatchSize = maxBatchSize;
    this.maxWaitTime = maxWaitTime;
    this.operationTimeout = operationTimeout;
    this.maxQueueSize = maxQueueSize || (maxBatchSize * queueSizeMultiplier);
    this.queue = [];
    this.timer = null;
    this.isProcessing = false;
    this.processingPromise = null;
    this.abortController = null;
    this.retryAttempts = defaultRetryAttempts;
    this.retryDelay = initialRetryDelayMs;
  }

  async add(operation) {
    let currentDelay = initialRetryDelayMs;
    let attempts = 0;
    
    while (attempts < this.retryAttempts) {
      if (this.queue.length < this.maxQueueSize) {
        return new Promise((resolve, reject) => {
          this.queue.push({ operation, resolve, reject });

          if (this.queue.length >= this.maxBatchSize) {
            this.scheduleFlush();
          } else if (!this.timer && !this.isProcessing) {
            this.timer = setTimeout(() => this.scheduleFlush(), this.maxWaitTime);
          }
        });
      }
      
      attempts++;
      if (attempts < this.retryAttempts) {
        await new Promise(resolve => setTimeout(resolve, currentDelay));
        currentDelay = Math.min(currentDelay * 2, maxRetryDelayMs);
      }
    }
    
    throw new Error('Batch queue is full. Too many pending operations.');
  }

  async scheduleFlush() {
    if (this.isProcessing) {
      if (this.processingPromise) {
        await this.processingPromise;
      }
      if (this.queue.length > 0) {
        return this.flush();
      }
      return;
    }
    return this.flush();
  }

  async flush() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    if (this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;
    
    const batchSize = Math.min(this.queue.length, this.maxBatchSize);
    const batch = this.queue.slice(0, batchSize);
    this.queue = this.queue.slice(batchSize);

    this.processingPromise = (async () => {
      let timeoutId;
      let isTimedOut = false;
      this.abortController = new AbortController();
      
      try {
        const timeoutPromise = new Promise((_, reject) => {
          timeoutId = setTimeout(() => {
            isTimedOut = true;
            reject(new Error('Batch operation timeout'));
          }, this.operationTimeout);
        });
        
        const operationPromise = this.executeCallback(batch.map(item => item.operation));
        
        await Promise.race([operationPromise, timeoutPromise]);
        
        if (!isTimedOut) {
          clearTimeout(timeoutId);
          batch.forEach(item => item.resolve());
        }
      } catch (error) {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        batch.forEach(item => item.reject(error));
      } finally {
        this.isProcessing = false;
        this.processingPromise = null;
        this.abortController = null;
        
        if (this.queue.length > 0) {
          setImmediate(() => this.flush());
        }
      }
    })();

    await this.processingPromise;
  }

  /**
   * Get queue size
   * @returns {number} Current queue size
   */
  size() {
    return this.queue.length;
  }

  /**
   * Clear queue without executing
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

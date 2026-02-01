class Logger {
  constructor(options = {}) {
    this.enabled = options.enabled !== false;
    this.level = options.level || 'info';
    this.levels = { error: 0, warn: 1, info: 2, debug: 3 };
    this.customLogger = options.customLogger || null;
  }

  setLevel(level) {
    if (!this.levels.hasOwnProperty(level)) {
      throw new Error(`Invalid log level: ${level}. Valid levels: ${Object.keys(this.levels).join(', ')}`);
    }
    this.level = level;
  }

  setEnabled(enabled) {
    this.enabled = !!enabled;
  }

  setCustomLogger(customLogger) {
    if (customLogger && typeof customLogger !== 'object') {
      throw new TypeError('Custom logger must be an object');
    }
    const requiredMethods = ['error', 'warn', 'info', 'debug'];
    for (const method of requiredMethods) {
      if (customLogger && typeof customLogger[method] !== 'function') {
        throw new TypeError(`Custom logger must implement ${method}() method`);
      }
    }
    this.customLogger = customLogger;
  }

  shouldLog(level) {
    return this.enabled && this.levels[level] <= this.levels[this.level];
  }

  error(message, ...args) {
    if (this.shouldLog('error')) {
      if (this.customLogger) {
        this.customLogger.error(message, ...args);
      } else {
        console.error(`[QuantumDB ERROR] ${message}`, ...args);
      }
    }
  }

  warn(message, ...args) {
    if (this.shouldLog('warn')) {
      if (this.customLogger) {
        this.customLogger.warn(message, ...args);
      } else {
        console.warn(`[QuantumDB WARN] ${message}`, ...args);
      }
    }
  }

  info(message, ...args) {
    if (this.shouldLog('info')) {
      if (this.customLogger) {
        this.customLogger.info(message, ...args);
      } else {
        console.info(`[QuantumDB INFO] ${message}`, ...args);
      }
    }
  }

  debug(message, ...args) {
    if (this.shouldLog('debug')) {
      if (this.customLogger) {
        this.customLogger.debug(message, ...args);
      } else {
        console.debug(`[QuantumDB DEBUG] ${message}`, ...args);
      }
    }
  }
}

const defaultLogger = new Logger();

module.exports = { Logger, defaultLogger };

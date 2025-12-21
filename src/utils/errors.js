class InvalidKey extends Error {
  constructor(message = 'Key must be a non-empty string') {
    super(message);
    this.name = 'InvalidKey';
  }
}

class InvalidValue extends Error {
  constructor(message = 'Invalid value provided') {
    super(message);
    this.name = 'InvalidValue';
  }
}

class ReadError extends Error {
  constructor(message = 'Failed to read from database') {
    super(message);
    this.name = 'ReadError';
  }
}

class WriteError extends Error {
  constructor(message = 'Failed to write to database') {
    super(message);
    this.name = 'WriteError';
  }
}

class NotArrayError extends Error {
  constructor(message = 'Target is not an array') {
    super(message);
    this.name = 'NotArrayError';
  }
}

class InvalidNumberError extends Error {
  constructor(message = 'Value must be a number') {
    super(message);
    this.name = 'InvalidNumberError';
  }
}

class TransactionError extends Error {
  constructor(message = 'Transaction failed') {
    super(message);
    this.name = 'TransactionError';
  }
}

class TimeoutError extends Error {
  constructor(message = 'Operation timed out') {
    super(message);
    this.name = 'TimeoutError';
  }
}

module.exports = {
  InvalidKey,
  InvalidValue,
  ReadError,
  WriteError,
  NotArrayError,
  InvalidNumberError,
  TransactionError,
  TimeoutError
};

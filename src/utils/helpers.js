const { InvalidKey, InvalidValue } = require('./errors');

function validateKey(key) {
  if (typeof key !== 'string' || !key.trim()) {
    throw new InvalidKey('Key must be a non-empty string');
  }
  
  if (/["';\\]/.test(key)) {
    throw new InvalidKey('Key contains invalid characters');
  }
  
  if (key.length > 256) {
    throw new InvalidKey('Key is too long (max 256 chars)');
  }
}

function validateValue(value) {
  if (value === undefined) {
    throw new InvalidValue('Value cannot be undefined');
  }
}

module.exports = { validateKey, validateValue };
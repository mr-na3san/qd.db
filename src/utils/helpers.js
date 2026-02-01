const { InvalidKey, InvalidValue } = require('./errors');

function validateKey(key) {
  if (typeof key !== 'string' || !key.trim()) {
    throw new InvalidKey('Key must be a non-empty string');
  }
  
  if (key.normalize('NFC') !== key) {
    throw new InvalidKey('Key must be in Unicode NFC normalized form');
  }
  
  if (/["';\\\/\x00-\x1F\x7F]/.test(key)) {
    throw new InvalidKey('Key contains invalid characters (quotes, slashes, null bytes, or control characters)');
  }
  
  if (key.length > 256) {
    throw new InvalidKey('Key is too long (max 256 chars)');
  }
  
  for (const char of key) {
    const code = char.codePointAt(0);
    if (code >= 0xFDD0 && code <= 0xFDEF) {
      throw new InvalidKey('Key contains non-character Unicode code points');
    }
    if ((code & 0xFFFF) >= 0xFFFE) {
      throw new InvalidKey('Key contains invalid Unicode code points');
    }
  }
}

function validateValue(value) {
  if (value === undefined) {
    throw new InvalidValue('Value cannot be undefined');
  }
  
  if (typeof value === 'function') {
    throw new InvalidValue('Value cannot be a function');
  }
  
  if (typeof value === 'symbol') {
    throw new InvalidValue('Value cannot be a symbol');
  }
}

module.exports = { validateKey, validateValue };
class Serializer {
  /**
   * Serialize value to string
   * @param {any} value Value to serialize
   * @returns {string} Serialized value
   */
  static serialize(value) {
    if (value === null) {
      return JSON.stringify({ __type: 'null' });
    }

    if (value === undefined) {
      return JSON.stringify({ __type: 'undefined' });
    }
    
    if (typeof value === 'function') {
      throw new Error('Functions cannot be serialized');
    }
    
    if (typeof value === 'symbol') {
      throw new Error('Symbols cannot be serialized');
    }
    
    if (typeof value === 'object' && value !== null && !Buffer.isBuffer(value)) {
      if (this.hasCircularReference(value)) {
        throw new Error('Circular references are not supported');
      }
    }
    
    if (value instanceof Error) {
      return JSON.stringify({
        __type: 'Error',
        name: value.name,
        message: value.message,
        stack: value.stack
      });
    }

    if (value instanceof Date) {
      if (isNaN(value.getTime())) {
        throw new Error('Invalid Date object');
      }
      return JSON.stringify({ __type: 'Date', value: value.toISOString() });
    }
    
    if (typeof value === 'number') {
      if (Number.isNaN(value)) {
        return JSON.stringify({ __type: 'NaN' });
      }
      if (value === Infinity) {
        return JSON.stringify({ __type: 'Infinity' });
      }
      if (value === -Infinity) {
        return JSON.stringify({ __type: '-Infinity' });
      }
    }

    if (value instanceof RegExp) {
      return JSON.stringify({ __type: 'RegExp', source: value.source, flags: value.flags });
    }

    if (value instanceof Set) {
      return JSON.stringify({ __type: 'Set', value: Array.from(value) });
    }

    if (value instanceof Map) {
      return JSON.stringify({ __type: 'Map', value: Array.from(value.entries()) });
    }

    if (Buffer.isBuffer(value)) {
      return JSON.stringify({ __type: 'Buffer', value: value.toString('base64') });
    }
    
    if (value instanceof DataView) {
      const buffer = value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
      return JSON.stringify({
        __type: 'DataView',
        value: Buffer.from(buffer).toString('base64')
      });
    }
    
    if (ArrayBuffer.isView(value)) {
      return JSON.stringify({
        __type: 'TypedArray',
        arrayType: value.constructor.name,
        value: Array.from(value)
      });
    }

    if (typeof value === 'bigint') {
      return JSON.stringify({ __type: 'BigInt', value: value.toString() });
    }

    try {
      return JSON.stringify(value);
    } catch (error) {
      if (error.message.includes('circular')) {
        throw new Error('Circular references are not supported');
      }
      throw error;
    }
  }

  static hasCircularReference(obj, seen = new WeakSet()) {
    if (typeof obj !== 'object' || obj === null) {
      return false;
    }
    
    if (seen.has(obj)) {
      return true;
    }
    
    seen.add(obj);
    
    if (Array.isArray(obj)) {
      for (const item of obj) {
        if (this.hasCircularReference(item, seen)) {
          return true;
        }
      }
    } else {
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          if (this.hasCircularReference(obj[key], seen)) {
            return true;
          }
        }
      }
    }
    
    return false;
  }

  /**
   * Deserialize string to value
   * @param {string} str Serialized string
   * @returns {any} Deserialized value
   */
  static deserialize(str) {
    try {
      const parsed = JSON.parse(str);

      if (parsed && typeof parsed === 'object' && '__type' in parsed) {
        switch (parsed.__type) {
          case 'null':
            return null;
          case 'undefined':
            return undefined;
          case 'NaN':
            return NaN;
          case 'Infinity':
            return Infinity;
          case '-Infinity':
            return -Infinity;
          case 'Error': {
            const error = new Error(parsed.message);
            error.name = parsed.name;
            error.stack = parsed.stack;
            return error;
          }
          case 'Date':
            return new Date(parsed.value);
          case 'RegExp':
            return new RegExp(parsed.source, parsed.flags);
          case 'Set':
            return new Set(parsed.value);
          case 'Map':
            return new Map(parsed.value);
          case 'Buffer':
            return Buffer.from(parsed.value, 'base64');
          case 'DataView': {
            const buffer = Buffer.from(parsed.value, 'base64');
            return new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
          }
          case 'TypedArray': {
            const typedArrayMap = {
              'Int8Array': Int8Array,
              'Uint8Array': Uint8Array,
              'Uint8ClampedArray': Uint8ClampedArray,
              'Int16Array': Int16Array,
              'Uint16Array': Uint16Array,
              'Int32Array': Int32Array,
              'Uint32Array': Uint32Array,
              'Float32Array': Float32Array,
              'Float64Array': Float64Array,
              'BigInt64Array': BigInt64Array,
              'BigUint64Array': BigUint64Array
            };
            const TypedArrayConstructor = typedArrayMap[parsed.arrayType];
            if (TypedArrayConstructor) {
              return new TypedArrayConstructor(parsed.value);
            }
            return parsed.value;
          }
          case 'BigInt':
            return BigInt(parsed.value);
        }
      }

      return parsed;
    } catch (error) {
      const { defaultLogger } = require('./logger');
      defaultLogger.debug(`Failed to deserialize value, returning as-is: ${error.message}`);
      return str;
    }
  }

  /**
   * Check if value is serializable
   * @param {any} value Value to check
   * @returns {boolean} True if serializable
   */
  static isSerializable(value) {
    if (typeof value === 'function') {
      return false;
    }

    if (typeof value === 'symbol') {
      return false;
    }

    try {
      JSON.stringify(value);
      return true;
    } catch {
      return false;
    }
  }
}

module.exports = Serializer;

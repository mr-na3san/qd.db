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

    if (value instanceof Date) {
      return JSON.stringify({ __type: 'Date', value: value.toISOString() });
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

    if (typeof value === 'bigint') {
      return JSON.stringify({ __type: 'BigInt', value: value.toString() });
    }

    if (typeof value === 'function') {
      throw new Error('Functions cannot be serialized');
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
          case 'BigInt':
            return BigInt(parsed.value);
        }
      }

      return parsed;
    } catch (error) {
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

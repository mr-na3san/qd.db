const QuantumDB = require('../../src/quantum');
const path = require('path');
const fs = require('fs').promises;
describe('Array Operations - Push/Pull', () => {
  let db;
  const dbPath = path.join(__dirname, '../temp-array-test.sqlite');
  beforeEach(async () => {
    db = new QuantumDB(dbPath);
  });
  afterEach(async () => {
    await db.destroy({ flush: true });
    try {
      await fs.unlink(dbPath);
    } catch (err) {
    }
  });
  test('should push to non-existent array', async () => {
    await db.push('items', 'item1');
    const result = await db.get('items');
    expect(Array.isArray(result)).toBe(true);
    expect(result).toEqual(['item1']);
  });
  test('should push to existing array', async () => {
    await db.set('items', ['a', 'b']);
    await db.push('items', 'c');
    const result = await db.get('items');
    expect(result).toEqual(['a', 'b', 'c']);
  });
  test('should push multiple items', async () => {
    await db.push('items', 'item1');
    await db.push('items', 'item2');
    await db.push('items', 'item3');
    const result = await db.get('items');
    expect(result).toEqual(['item1', 'item2', 'item3']);
  });
  test('should push objects to array', async () => {
    await db.push('users', { id: 1, name: 'Ahmed' });
    await db.push('users', { id: 2, name: 'Sara' });
    const result = await db.get('users');
    expect(result.length).toBe(2);
    expect(result[0]).toEqual({ id: 1, name: 'Ahmed' });
    expect(result[1]).toEqual({ id: 2, name: 'Sara' });
  });
  test('should push different data types', async () => {
    await db.push('mixed', 'string');
    await db.push('mixed', 42);
    await db.push('mixed', true);
    await db.push('mixed', { key: 'value' });
    const result = await db.get('mixed');
    expect(result).toEqual(['string', 42, true, { key: 'value' }]);
  });
  test('should pull value from array', async () => {
    await db.set('items', ['a', 'b', 'c', 'b']);
    await db.pull('items', 'b');
    const result = await db.get('items');
    expect(result).toEqual(['a', 'c']);
  });
  test('should remove all occurrences when pulling', async () => {
    await db.set('items', ['x', 'y', 'x', 'z', 'x']);
    await db.pull('items', 'x');
    const result = await db.get('items');
    expect(result).toEqual(['y', 'z']);
  });
  test('should pull object from array', async () => {
    const obj1 = { id: 1, name: 'Ahmed' };
    const obj2 = { id: 2, name: 'Sara' };
    await db.set('users', [obj1, obj2]);
    await db.pull('users', obj1);
    const result = await db.get('users');
    expect(result).toEqual([obj2]);
  });
  test('should handle pull on non-existent value', async () => {
    await db.set('items', ['a', 'b', 'c']);
    await db.pull('items', 'x');
    const result = await db.get('items');
    expect(result).toEqual(['a', 'b', 'c']);
  });
  test('should throw error when pulling from non-array', async () => {
    await db.set('notArray', 'string value');
    await expect(db.pull('notArray', 'value')).rejects.toThrow();
  });
  test('should handle empty array after pull', async () => {
    await db.set('items', ['only']);
    await db.pull('items', 'only');
    const result = await db.get('items');
    expect(result).toEqual([]);
  });
});
describe('Array Operations - With Batch', () => {
  let db;
  const dbPath = path.join(__dirname, '../temp-array-batch.sqlite');
  beforeEach(async () => {
    db = new QuantumDB(dbPath, {
      batch: true,
      batchSize: 3,
      batchDelay: 50
    });
  });
  afterEach(async () => {
    await db.destroy({ flush: true });
    try {
      await fs.unlink(dbPath);
    } catch (err) {
    }
  });
  test('should handle push with batching enabled', async () => {
    await db.push('items', 'a');
    await db.push('items', 'b');
    await db.push('items', 'c');
    await db.flush();
    const result = await db.get('items');
    expect(result).toEqual(['a', 'b', 'c']);
  });
  test('should handle pull with batching enabled', async () => {
    await db.set('items', ['a', 'b', 'c', 'd']);
    await db.flush();
    await db.pull('items', 'b');
    await db.flush();
    const result = await db.get('items');
    expect(result).toEqual(['a', 'c', 'd']);
  });
  test('should handle rapid push operations', async () => {
    for (let i = 0; i < 10; i++) {
      await db.push('numbers', i);
    }
    await db.flush();
    const result = await db.get('numbers');
    expect(result.length).toBe(10);
  });
});
describe('Array Operations - Edge Cases', () => {
  let db;
  const dbPath = path.join(__dirname, '../temp-array-edge.sqlite');
  beforeEach(async () => {
    db = new QuantumDB(dbPath);
  });
  afterEach(async () => {
    await db.destroy({ flush: true });
    try {
      await fs.unlink(dbPath);
    } catch (err) {
    }
  });
  test('should convert non-array to array when pushing', async () => {
    await db.set('value', 'not an array');
    await db.push('value', 'item');
    const result = await db.get('value');
    expect(result).toEqual(['item']);
  });
  test('should handle null values in array', async () => {
    await db.push('items', null);
    await db.push('items', 'value');
    await db.push('items', null);
    const result = await db.get('items');
    expect(result).toEqual([null, 'value', null]);
  });
  test('should pull null from array', async () => {
    await db.set('items', [null, 'a', null, 'b']);
    await db.pull('items', null);
    const result = await db.get('items');
    expect(result).toEqual(['a', 'b']);
  });
  test('should handle large arrays', async () => {
    for (let i = 0; i < 100; i++) {
      await db.push('large', i);
    }
    const result = await db.get('large');
    expect(result.length).toBe(100);
    expect(result[0]).toBe(0);
    expect(result[99]).toBe(99);
  });
  test('should preserve array order', async () => {
    const items = ['first', 'second', 'third', 'fourth', 'fifth'];
    for (const item of items) {
      await db.push('ordered', item);
    }
    const result = await db.get('ordered');
    expect(result).toEqual(items);
  });
  test('should handle nested arrays', async () => {
    await db.push('nested', [1, 2, 3]);
    await db.push('nested', [4, 5, 6]);
    const result = await db.get('nested');
    expect(result).toEqual([[1, 2, 3], [4, 5, 6]]);
  });
  test('should handle deep objects in array', async () => {
    const deepObj = {
      level1: {
        level2: {
          level3: {
            value: 'deep'
          }
        }
      }
    };
    await db.push('deep', deepObj);
    const result = await db.get('deep');
    expect(result[0]).toEqual(deepObj);
  });
});

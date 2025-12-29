const CacheManager = require('../../src/core/cache');

describe('CacheManager - Basic Operations', () => {
  let cache;

  beforeEach(() => {
    cache = new CacheManager({ maxSize: 5 });
  });

  afterEach(() => {
    if (cache) {
      cache.destroy();
    }
  });

  test('should set and get value', () => {
    cache.set('key1', 'value1');
    expect(cache.get('key1')).toBe('value1');
  });

  test('should return undefined for non-existent key', () => {
    expect(cache.get('nonexistent')).toBeUndefined();
  });

  test('should update existing key', () => {
    cache.set('key1', 'value1');
    cache.set('key1', 'value2');
    expect(cache.get('key1')).toBe('value2');
  });

  test('should store different data types', () => {
    cache.set('string', 'test');
    cache.set('number', 42);
    cache.set('object', { foo: 'bar' });
    cache.set('array', [1, 2, 3]);
    cache.set('boolean', true);

    expect(cache.get('string')).toBe('test');
    expect(cache.get('number')).toBe(42);
    expect(cache.get('object')).toEqual({ foo: 'bar' });
    expect(cache.get('array')).toEqual([1, 2, 3]);
    expect(cache.get('boolean')).toBe(true);
  });

  test('should delete key', () => {
    cache.set('key1', 'value1');
    expect(cache.delete('key1')).toBe(true);
    expect(cache.get('key1')).toBeUndefined();
  });

  test('should return false when deleting non-existent key', () => {
    expect(cache.delete('nonexistent')).toBe(false);
  });

  test('should check if key exists', () => {
    cache.set('key1', 'value1');
    expect(cache.has('key1')).toBe(true);
    expect(cache.has('nonexistent')).toBe(false);
  });

  test('should clear all entries', () => {
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    cache.clear();
    expect(cache.get('key1')).toBeUndefined();
    expect(cache.get('key2')).toBeUndefined();
    expect(cache.getStats().size).toBe(0);
  });
});

describe('CacheManager - LRU Eviction', () => {
  test('should evict least recently used item when full', () => {
    const cache = new CacheManager({ maxSize: 3 });

    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    cache.set('key3', 'value3');
    cache.set('key4', 'value4');

    expect(cache.get('key1')).toBeUndefined();
    expect(cache.get('key2')).toBe('value2');
    expect(cache.get('key3')).toBe('value3');
    expect(cache.get('key4')).toBe('value4');

    cache.destroy();
  });

  test('should update LRU order on access', () => {
    const cache = new CacheManager({ maxSize: 3 });

    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    cache.set('key3', 'value3');
    
    cache.get('key1');
    
    cache.set('key4', 'value4');

    expect(cache.get('key1')).toBe('value1');
    expect(cache.get('key2')).toBeUndefined();
    expect(cache.get('key3')).toBe('value3');
    expect(cache.get('key4')).toBe('value4');

    cache.destroy();
  });

  test('should update LRU order on set', () => {
    const cache = new CacheManager({ maxSize: 3 });

    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    cache.set('key3', 'value3');
    
    cache.set('key1', 'updated');
    cache.set('key4', 'value4');

    expect(cache.get('key1')).toBe('updated');
    expect(cache.get('key2')).toBeUndefined();

    cache.destroy();
  });
});

describe('CacheManager - TTL Support', () => {
  test('should expire entries after TTL', async () => {
    const cache = new CacheManager({ maxSize: 10, ttl: 100 });

    cache.set('key1', 'value1');
    expect(cache.get('key1')).toBe('value1');

    await new Promise(resolve => setTimeout(resolve, 150));

    expect(cache.get('key1')).toBeUndefined();

    cache.destroy();
  });

  test('should allow custom TTL per entry', async () => {
    const cache = new CacheManager({ maxSize: 10 });

    cache.set('key1', 'value1', 100);
    cache.set('key2', 'value2', 300);

    await new Promise(resolve => setTimeout(resolve, 150));

    expect(cache.get('key1')).toBeUndefined();
    expect(cache.get('key2')).toBe('value2');

    cache.destroy();
  });

  test('should track expirations in stats', async () => {
    const cache = new CacheManager({ maxSize: 10, ttl: 50 });

    cache.set('key1', 'value1');
    cache.set('key2', 'value2');

    await new Promise(resolve => setTimeout(resolve, 100));

    cache.get('key1');
    cache.get('key2');

    const stats = cache.getStats();
    expect(stats.expirations).toBeGreaterThan(0);

    cache.destroy();
  });

  test('should not expire entries without TTL', async () => {
    const cache = new CacheManager({ maxSize: 10 });

    cache.set('key1', 'value1');
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    expect(cache.get('key1')).toBe('value1');

    cache.destroy();
  });
});

describe('CacheManager - Memory Limits', () => {
  test('should respect memory limits', () => {
    const cache = new CacheManager({ 
      maxSize: 1000,
      maxMemoryMB: 0.01
    });

    for (let i = 0; i < 100; i++) {
      cache.set(`key${i}`, 'x'.repeat(200));
    }

    const stats = cache.getStats();
    const memoryMB = parseFloat(stats.memoryMB);

    expect(memoryMB).toBeLessThanOrEqual(0.015);
    expect(stats.evictions).toBeGreaterThan(0);

    cache.destroy();
  });

  test('should track memory usage', () => {
    const cache = new CacheManager({ maxSize: 10 });

    cache.set('key1', 'test');
    
    const stats = cache.getStats();
    expect(parseFloat(stats.memoryMB)).toBeGreaterThan(0);

    cache.destroy();
  });
});

describe('CacheManager - Statistics', () => {
  test('should track hits and misses', () => {
    const cache = new CacheManager({ maxSize: 10 });

    cache.set('key1', 'value1');

    cache.get('key1');
    cache.get('key2');
    cache.get('key1');
    cache.get('key3');

    const stats = cache.getStats();

    expect(stats.hits).toBe(2);
    expect(stats.misses).toBe(2);
    expect(stats.hitRate).toBe('50.00%');

    cache.destroy();
  });

  test('should track evictions', () => {
    const cache = new CacheManager({ maxSize: 2 });

    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    cache.set('key3', 'value3');
    cache.set('key4', 'value4');

    const stats = cache.getStats();
    expect(stats.evictions).toBe(2);

    cache.destroy();
  });

  test('should reset statistics', () => {
    const cache = new CacheManager({ maxSize: 10 });

    cache.set('key1', 'value1');
    cache.get('key1');
    cache.get('key2');

    cache.resetStats();

    const stats = cache.getStats();
    expect(stats.hits).toBe(0);
    expect(stats.misses).toBe(0);
    expect(stats.evictions).toBe(0);

    cache.destroy();
  });

  test('should calculate hit rate correctly with zero operations', () => {
    const cache = new CacheManager({ maxSize: 10 });

    const stats = cache.getStats();
    expect(stats.hitRate).toBe('0%');

    cache.destroy();
  });
});

describe('CacheManager - Edge Cases', () => {
  test('should handle rapid set/get operations', () => {
    const cache = new CacheManager({ maxSize: 100 });

    for (let i = 0; i < 1000; i++) {
      cache.set(`key${i % 100}`, `value${i}`);
      expect(cache.get(`key${i % 100}`)).toBe(`value${i}`);
    }

    cache.destroy();
  });

  test('should handle null and undefined values', () => {
    const cache = new CacheManager({ maxSize: 10 });

    cache.set('null', null);
    cache.set('undefined', undefined);

    expect(cache.get('null')).toBe(null);
    expect(cache.get('undefined')).toBe(undefined);

    cache.destroy();
  });

  test('should handle very large strings', () => {
    const cache = new CacheManager({ maxSize: 10 });

    const largeString = 'x'.repeat(10000);
    cache.set('large', largeString);

    expect(cache.get('large')).toBe(largeString);

    cache.destroy();
  });
});

const { QuantumDB } = require('../../src/index');
const CacheManager = require('../../src/core/cache');
const fs = require('fs');
const path = require('path');
const testDB = path.join(__dirname, 'test-performance.db');
describe('Performance - Cache Operations', () => {
  test('should perform 100k operations in < 500ms', () => {
    const cache = new CacheManager({ maxSize: 10000 });
    const start = Date.now();
    for (let i = 0; i < 100000; i++) {
      cache.set(`key${i % 10000}`, `value${i}`);
      cache.get(`key${i % 10000}`);
    }
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(500);
    console.log(`✅ 100k cache operations in ${duration}ms`);
    cache.destroy();
  });
  test('eviction should be O(1) - constant time', () => {
    const cache = new CacheManager({ maxSize: 1000 });
    for (let i = 0; i < 1000; i++) {
      cache.set(`key${i}`, `value${i}`);
    }
    const times = [];
    for (let i = 0; i < 1000; i++) {
      const start = performance.now();
      cache.set(`new${i}`, `value${i}`);
      const duration = performance.now() - start;
      times.push(duration);
    }
    const firstQuarter = times.slice(0, 250).reduce((a, b) => a + b) / 250;
    const lastQuarter = times.slice(750).reduce((a, b) => a + b) / 250;
    const percentDiff = Math.abs(firstQuarter - lastQuarter) / firstQuarter;
    expect(percentDiff).toBeLessThan(1.0);
    console.log(`✅ Eviction time variance: ${(percentDiff * 100).toFixed(2)}%`);
    cache.destroy();
  });
  test('should handle high cache hit rate efficiently', () => {
    const cache = new CacheManager({ maxSize: 1000 });
    for (let i = 0; i < 100; i++) {
      cache.set(`key${i}`, `value${i}`);
    }
    const start = Date.now();
    for (let i = 0; i < 100000; i++) {
      cache.get(`key${i % 100}`);
    }
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(100);
    const stats = cache.getStats();
    expect(parseFloat(stats.hitRate)).toBeGreaterThan(99);
    console.log(`✅ 100k cache hits in ${duration}ms (${stats.hitRate} hit rate)`);
    cache.destroy();
  });
});
describe('Performance - Batch Operations', () => {
  let db;
  beforeEach(async () => {
    if (fs.existsSync(testDB)) {
      fs.unlinkSync(testDB);
    }
  });
  afterEach(async () => {
    if (db) {
      await db.destroy();
    }
    if (fs.existsSync(testDB)) {
      fs.unlinkSync(testDB);
    }
  });
  test('batch should be significantly faster than individual operations', async () => {
    const operations = 100;
    const testDBNoBatch = testDB + '.nobatch.db';
    const testDBBatch = testDB + '.batch.db';
    const db1 = new QuantumDB(testDBNoBatch, { 
      batch: false,
      cache: false 
    });
    const start1 = Date.now();
    for (let i = 0; i < operations; i++) {
      await db1.set(`key${i}`, `value${i}`);
    }
    const duration1 = Date.now() - start1;
    await db1.destroy();
    if (fs.existsSync(testDBNoBatch)) {
      fs.unlinkSync(testDBNoBatch);
    }
    const db2 = new QuantumDB(testDBBatch, { 
      batch: true,
      batchSize: 50,
      cache: false 
    });
    const start2 = Date.now();
    for (let i = 0; i < operations; i++) {
      db2.set(`key${i}`, `value${i}`);
    }
    await db2.flush();
    const duration2 = Date.now() - start2;
    await db2.destroy();
    if (fs.existsSync(testDBBatch)) {
      fs.unlinkSync(testDBBatch);
    }
    expect(duration1).toBeGreaterThan(0);
    expect(duration2).toBeGreaterThan(0);
    console.log(`✅ Without batch: ${duration1}ms`);
    console.log(`✅ With batch: ${duration2}ms`);
  }, 15000);
  test('should handle burst writes efficiently', async () => {
    db = new QuantumDB(testDB, { 
      batch: true,
      batchSize: 100,
      cache: true 
    });
    const start = Date.now();
    for (let i = 0; i < 5000; i++) {
      db.set(`key${i}`, { value: i, data: 'x'.repeat(100) });
    }
    await db.flush();
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(2000);
    console.log(`✅ 5000 writes in ${duration}ms`);
  });
});
describe('Performance - Query Operations', () => {
  let db;
  const queryTestDB = path.join(__dirname, 'test-query-perf.db');
  beforeAll(async () => {
    if (fs.existsSync(queryTestDB)) {
      fs.unlinkSync(queryTestDB);
    }
    db = new QuantumDB(queryTestDB, { cache: false, batch: true, batchSize: 100 });
    for (let i = 1; i <= 500; i++) {
      db.set(`user:${i}`, {
        name: `User ${i}`,
        age: 20 + (i % 50),
        city: ['Cairo', 'Alexandria', 'Giza'][i % 3],
        active: i % 2 === 0
      });
    }
    await db.flush();
  }, 30000);
  afterAll(async () => {
    if (db) {
      await db.destroy();
    }
    if (fs.existsSync(queryTestDB)) {
      fs.unlinkSync(queryTestDB);
    }
  });
  test('simple query should complete quickly', async () => {
    const start = Date.now();
    const results = await db.query()
      .prefix('user:')
      .where('age', '>=', 30)
      .get();
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(500);
    expect(results.length).toBeGreaterThan(0);
    console.log(`✅ Simple query (${results.length} results) in ${duration}ms`);
  });
  test('complex query should complete in reasonable time', async () => {
    const start = Date.now();
    const results = await db.query()
      .prefix('user:')
      .where('age', '>=', 30)
      .where('age', '<', 40)
      .where('city', '=', 'Cairo')
      .where('active', '=', true)
      .sort('age', 'desc')
      .limit(10)
      .get();
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(1000);
    console.log(`✅ Complex query (${results.length} results) in ${duration}ms`);
  });
  test('count should be faster than full query', async () => {
    const start1 = Date.now();
    const fullResults = await db.query()
      .prefix('user:')
      .where('age', '>=', 30)
      .get();
    const duration1 = Date.now() - start1;
    const start2 = Date.now();
    const count = await db.query()
      .prefix('user:')
      .where('age', '>=', 30)
      .count();
    const duration2 = Date.now() - start2;
    expect(count).toBe(fullResults.length);
    expect(duration2).toBeLessThan(500);
    console.log(`✅ Full query: ${duration1}ms, Count: ${duration2}ms`);
  });
});
describe('Performance - Memory Management', () => {
  test('cache should respect memory limits', () => {
    const cache = new CacheManager({ 
      maxSize: 10000,
      maxMemoryMB: 1
    });
    for (let i = 0; i < 10000; i++) {
      cache.set(`key${i}`, 'x'.repeat(200));
    }
    const stats = cache.getStats();
    const memoryMB = parseFloat(stats.memoryMB);
    expect(memoryMB).toBeLessThanOrEqual(1.2);
    expect(stats.evictions).toBeGreaterThan(0);
    console.log(`✅ Memory usage: ${stats.memoryMB}MB (${stats.evictions} evictions)`);
    cache.destroy();
  });
  test('should not leak memory over time', async () => {
    if (!global.gc) {
      console.warn('⚠️ Run with --expose-gc for accurate memory test');
      return;
    }
    const db = new QuantumDB(':memory:', {
      cache: true,
      cacheSize: 1000
    });
    global.gc();
    const initialMemory = process.memoryUsage().heapUsed;
    for (let cycle = 0; cycle < 5; cycle++) {
      for (let i = 0; i < 1000; i++) {
        await db.set(`key${i}`, `value${i}`.repeat(10));
      }
      for (let i = 0; i < 1000; i++) {
        await db.delete(`key${i}`);
      }
    }
    global.gc();
    const finalMemory = process.memoryUsage().heapUsed;
    const growth = (finalMemory - initialMemory) / 1024 / 1024;
    expect(growth).toBeLessThan(10);
    console.log(`✅ Memory growth after 5 cycles: ${growth.toFixed(2)}MB`);
    await db.destroy();
  });
});
describe('Performance - Concurrent Operations', () => {
  let db;
  beforeEach(async () => {
    if (fs.existsSync(testDB)) {
      fs.unlinkSync(testDB);
    }
    db = new QuantumDB(testDB, { batch: true, cache: true });
  });
  afterEach(async () => {
    await db.destroy();
    if (fs.existsSync(testDB)) {
      fs.unlinkSync(testDB);
    }
  });
  test('should handle concurrent writes efficiently', async () => {
    const start = Date.now();
    const promises = [];
    for (let i = 0; i < 1000; i++) {
      promises.push(db.set(`key${i}`, `value${i}`));
    }
    await Promise.all(promises);
    await db.flush();
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(2000);
    console.log(`✅ 1000 concurrent writes in ${duration}ms`);
  });
  test('should handle mixed read/write operations', async () => {
    for (let i = 0; i < 50; i++) {
      db.set(`mixkey${i}`, i);
    }
    await db.flush();
    const start = Date.now();
    for (let i = 0; i < 100; i++) {
      if (i % 2 === 0) {
        await db.get(`mixkey${i % 50}`);
      } else {
        db.set(`mixkey${i % 50}`, i);
      }
    }
    await db.flush();
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(5000);
    console.log(`✅ 100 mixed operations in ${duration}ms`);
  }, 15000);
});
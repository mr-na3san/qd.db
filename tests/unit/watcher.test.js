const { QuantumDB } = require('../../src/index');
const fs = require('fs');
const path = require('path');
const testDB = path.join(__dirname, 'test-query.db');
describe('QueryBuilder - Basic Operations', () => {
  let db;
  beforeEach(async () => {
    if (fs.existsSync(testDB)) {
      fs.unlinkSync(testDB);
    }
    db = new QuantumDB(testDB, { cache: false });
    await db.set('user:1', { name: 'Alice', age: 25, city: 'Cairo' });
    await db.set('user:2', { name: 'Bob', age: 30, city: 'Alexandria' });
    await db.set('user:3', { name: 'Charlie', age: 35, city: 'Cairo' });
    await db.set('post:1', { title: 'Hello', author: 'Alice' });
    await db.set('post:2', { title: 'World', author: 'Bob' });
  });
  afterEach(async () => {
    await db.destroy();
    if (fs.existsSync(testDB)) {
      fs.unlinkSync(testDB);
    }
  });
  test('should get all results without filters', async () => {
    const results = await db.query().get();
    expect(results.length).toBe(5);
  });
  test('should filter by prefix', async () => {
    const results = await db.query().prefix('user:').get();
    expect(results.length).toBe(3);
    expect(results.every(r => r.key.startsWith('user:'))).toBe(true);
  });
  test('should filter by regex', async () => {
    const results = await db.query().keyMatches(/^user:\d+$/).get();
    expect(results.length).toBe(3);
  });
  test('should filter with where clause', async () => {
    const results = await db.query()
      .prefix('user:')
      .where('age', '>', 25)
      .get();
    expect(results.length).toBe(2);
    expect(results.every(r => r.age > 25)).toBe(true);
  });
  test('should filter with multiple where clauses', async () => {
    const results = await db.query()
      .prefix('user:')
      .where('age', '>=', 30)
      .where('city', '=', 'Cairo')
      .get();
    expect(results.length).toBe(1);
    expect(results[0].name).toBe('Charlie');
  });
});
describe('QueryBuilder - Operators', () => {
  let db;
  beforeEach(async () => {
    if (fs.existsSync(testDB)) {
      fs.unlinkSync(testDB);
    }
    db = new QuantumDB(testDB, { cache: false });
    await db.set('item:1', { name: 'Apple', price: 10, category: 'fruit' });
    await db.set('item:2', { name: 'Banana', price: 5, category: 'fruit' });
    await db.set('item:3', { name: 'Carrot', price: 3, category: 'vegetable' });
    await db.set('item:4', { name: 'Date', price: 15, category: 'fruit' });
  });
  afterEach(async () => {
    await db.destroy();
    if (fs.existsSync(testDB)) {
      fs.unlinkSync(testDB);
    }
  });
  test('should support equals operator', async () => {
    const results = await db.query()
      .where('category', '=', 'fruit')
      .get();
    expect(results.length).toBe(3);
  });
  test('should support not equals operator', async () => {
    const results = await db.query()
      .where('category', '!=', 'fruit')
      .get();
    expect(results.length).toBe(1);
    expect(results[0].name).toBe('Carrot');
  });
  test('should support greater than operator', async () => {
    const results = await db.query()
      .where('price', '>', 5)
      .get();
    expect(results.length).toBe(2);
  });
  test('should support greater than or equal operator', async () => {
    const results = await db.query()
      .where('price', '>=', 5)
      .get();
    expect(results.length).toBe(3);
  });
  test('should support less than operator', async () => {
    const results = await db.query()
      .where('price', '<', 10)
      .get();
    expect(results.length).toBe(2);
  });
  test('should support less than or equal operator', async () => {
    const results = await db.query()
      .where('price', '<=', 10)
      .get();
    expect(results.length).toBe(3);
  });
  test('should support contains operator', async () => {
    const results = await db.query()
      .where('name', 'contains', 'a')
      .get();
    expect(results.length).toBe(3);
  });
  test('should support in operator', async () => {
    const results = await db.query()
      .where('category', 'in', ['fruit', 'vegetable'])
      .get();
    expect(results.length).toBe(4);
  });
});
describe('QueryBuilder - Sorting and Limiting', () => {
  let db;
  beforeEach(async () => {
    if (fs.existsSync(testDB)) {
      fs.unlinkSync(testDB);
    }
    db = new QuantumDB(testDB, { cache: false });
    await db.set('user:1', { name: 'Charlie', age: 35 });
    await db.set('user:2', { name: 'Alice', age: 25 });
    await db.set('user:3', { name: 'Bob', age: 30 });
  });
  afterEach(async () => {
    await db.destroy();
    if (fs.existsSync(testDB)) {
      fs.unlinkSync(testDB);
    }
  });
  test('should sort ascending', async () => {
    const results = await db.query()
      .prefix('user:')
      .sort('age', 'asc')
      .get();
    expect(results[0].age).toBe(25);
    expect(results[1].age).toBe(30);
    expect(results[2].age).toBe(35);
  });
  test('should sort descending', async () => {
    const results = await db.query()
      .prefix('user:')
      .sort('age', 'desc')
      .get();
    expect(results[0].age).toBe(35);
    expect(results[1].age).toBe(30);
    expect(results[2].age).toBe(25);
  });
  test('should limit results', async () => {
    const results = await db.query()
      .prefix('user:')
      .limit(2)
      .get();
    expect(results.length).toBe(2);
  });
  test('should apply offset', async () => {
    const results = await db.query()
      .prefix('user:')
      .sort('age')
      .offset(1)
      .get();
    expect(results.length).toBe(2);
    expect(results[0].age).toBe(30);
  });
  test('should apply limit and offset together', async () => {
    const results = await db.query()
      .prefix('user:')
      .sort('age')
      .limit(1)
      .offset(1)
      .get();
    expect(results.length).toBe(1);
    expect(results[0].age).toBe(30);
  });
});
describe('QueryBuilder - Aggregations', () => {
  let db;
  beforeEach(async () => {
    if (fs.existsSync(testDB)) {
      fs.unlinkSync(testDB);
    }
    db = new QuantumDB(testDB, { cache: false });
    await db.set('user:1', { name: 'Alice', age: 25 });
    await db.set('user:2', { name: 'Bob', age: 30 });
    await db.set('user:3', { name: 'Charlie', age: 35 });
  });
  afterEach(async () => {
    await db.destroy();
    if (fs.existsSync(testDB)) {
      fs.unlinkSync(testDB);
    }
  });
  test('should count results', async () => {
    const count = await db.query()
      .prefix('user:')
      .count();
    expect(count).toBe(3);
  });
  test('should count with filters', async () => {
    const count = await db.query()
      .prefix('user:')
      .where('age', '>=', 30)
      .count();
    expect(count).toBe(2);
  });
  test('should get first result', async () => {
    const result = await db.query()
      .prefix('user:')
      .sort('age')
      .first();
    expect(result.age).toBe(25);
    expect(result.name).toBe('Alice');
  });
  test('should return null if no results', async () => {
    const result = await db.query()
      .prefix('post:')
      .first();
    expect(result).toBeNull();
  });
  test('should check if results exist', async () => {
    const exists = await db.query()
      .prefix('user:')
      .exists();
    expect(exists).toBe(true);
  });
  test('should return false if no results exist', async () => {
    const exists = await db.query()
      .prefix('post:')
      .exists();
    expect(exists).toBe(false);
  });
  test('should pluck values', async () => {
    const ages = await db.query()
      .prefix('user:')
      .pluck('age');
    expect(ages).toEqual(expect.arrayContaining([25, 30, 35]));
    expect(ages.length).toBe(3);
  });
});
describe('QueryBuilder - Field Selection', () => {
  let db;
  beforeEach(async () => {
    if (fs.existsSync(testDB)) {
      fs.unlinkSync(testDB);
    }
    db = new QuantumDB(testDB, { cache: false });
    await db.set('user:1', { name: 'Alice', age: 25, city: 'Cairo', email: 'alice@test.com' });
    await db.set('user:2', { name: 'Bob', age: 30, city: 'Alexandria', email: 'bob@test.com' });
  });
  afterEach(async () => {
    await db.destroy();
    if (fs.existsSync(testDB)) {
      fs.unlinkSync(testDB);
    }
  });
  test('should select specific fields', async () => {
    const results = await db.query()
      .prefix('user:')
      .select(['name', 'age'])
      .get();
    expect(results[0]).toHaveProperty('key');
    expect(results[0]).toHaveProperty('name');
    expect(results[0]).toHaveProperty('age');
    expect(results[0]).not.toHaveProperty('city');
    expect(results[0]).not.toHaveProperty('email');
  });
  test('should select single field', async () => {
    const results = await db.query()
      .prefix('user:')
      .select('name')
      .get();
    expect(results[0]).toHaveProperty('name');
    expect(results[0]).not.toHaveProperty('age');
  });
});
describe('QueryBuilder - Nested Fields', () => {
  let db;
  beforeEach(async () => {
    if (fs.existsSync(testDB)) {
      fs.unlinkSync(testDB);
    }
    db = new QuantumDB(testDB, { cache: false });
    await db.set('user:1', { 
      name: 'Alice', 
      profile: { age: 25, location: { city: 'Cairo' } }
    });
    await db.set('user:2', { 
      name: 'Bob', 
      profile: { age: 30, location: { city: 'Alexandria' } }
    });
  });
  afterEach(async () => {
    await db.destroy();
    if (fs.existsSync(testDB)) {
      fs.unlinkSync(testDB);
    }
  });
  test('should filter by nested field', async () => {
    const results = await db.query()
      .prefix('user:')
      .where('profile.age', '>=', 30)
      .get();
    expect(results.length).toBe(1);
    expect(results[0].name).toBe('Bob');
  });
  test('should sort by nested field', async () => {
    const results = await db.query()
      .prefix('user:')
      .sort('profile.age', 'desc')
      .get();
    expect(results[0].name).toBe('Bob');
    expect(results[1].name).toBe('Alice');
  });
  test('should select nested field', async () => {
    const results = await db.query()
      .prefix('user:')
      .select(['name', 'profile.age'])
      .get();
    expect(results[0]).toHaveProperty('name');
    expect(results[0]['profile.age']).toBeDefined();
  });
});
describe('QueryBuilder - Chaining', () => {
  let db;
  beforeEach(async () => {
    if (fs.existsSync(testDB)) {
      fs.unlinkSync(testDB);
    }
    db = new QuantumDB(testDB, { cache: false });
    for (let i = 1; i <= 10; i++) {
      await db.set(`item:${i}`, {
        name: `Item ${i}`,
        price: i * 10,
        category: i % 2 === 0 ? 'even' : 'odd',
        active: i > 5
      });
    }
  });
  afterEach(async () => {
    await db.destroy();
    if (fs.existsSync(testDB)) {
      fs.unlinkSync(testDB);
    }
  });
  test('should chain multiple operations', async () => {
    const results = await db.query()
      .prefix('item:')
      .where('category', '=', 'even')
      .where('active', '=', true)
      .where('price', '>=', 60)
      .sort('price', 'desc')
      .limit(2)
      .get();
    expect(results.length).toBe(2);
    expect(results[0].price).toBe(100);
    expect(results[1].price).toBe(80);
  });
});

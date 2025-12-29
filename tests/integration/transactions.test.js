const { QuantumDB } = require('../../src/index');
const fs = require('fs');
const path = require('path');

const testDB = path.join(__dirname, 'test-transactions.db');

describe('Transactions - Basic Operations', () => {
  let db;

  beforeEach(async () => {
    if (fs.existsSync(testDB)) {
      fs.unlinkSync(testDB);
    }
    db = new QuantumDB(testDB);
  });

  afterEach(async () => {
    await db.destroy();
    if (fs.existsSync(testDB)) {
      fs.unlinkSync(testDB);
    }
  });

  test('should commit successful transaction', async () => {
    await db.transaction(async (tx) => {
      tx.set('key1', 'value1');
      tx.set('key2', 'value2');
    });

    expect(await db.get('key1')).toBe('value1');
    expect(await db.get('key2')).toBe('value2');
  });

  test('should rollback on error', async () => {
    await db.set('key1', 'original');

    try {
      await db.transaction(async (tx) => {
        tx.set('key1', 'modified');
        tx.set('key2', 'new');
        throw new Error('Test error');
      });
    } catch (error) {
      expect(error.message).toContain('Test error');
    }

    expect(await db.get('key1')).toBe('original');
    expect(await db.get('key2')).toBeUndefined();
  });

  test('should support get within transaction', async () => {
    await db.set('counter', 5);

    await db.transaction(async (tx) => {
      const value = await tx.get('counter');
      tx.set('counter', value + 1);
    });

    expect(await db.get('counter')).toBe(6);
  });

  test('should support delete within transaction', async () => {
    await db.set('key1', 'value1');
    await db.set('key2', 'value2');

    await db.transaction(async (tx) => {
      tx.delete('key1');
    });

    expect(await db.get('key1')).toBeUndefined();
    expect(await db.get('key2')).toBe('value2');
  });

  test('should return transaction result', async () => {
    const result = await db.transaction(async (tx) => {
      tx.set('key1', 'value1');
      return { success: true, count: 1 };
    });

    expect(result).toEqual({ success: true, count: 1 });
  });
});

describe('Transactions - Isolation', () => {
  let db;

  beforeEach(async () => {
    if (fs.existsSync(testDB)) {
      fs.unlinkSync(testDB);
    }
    db = new QuantumDB(testDB);
  });

  afterEach(async () => {
    await db.destroy();
    if (fs.existsSync(testDB)) {
      fs.unlinkSync(testDB);
    }
  });

  test('should provide isolation between transactions', async () => {
    await db.set('counter', 0);

    const tx1 = db.transaction(async (tx) => {
      const value = await tx.get('counter');
      await new Promise(r => setTimeout(r, 50));
      tx.set('counter', value + 1);
    });

    const tx2 = db.transaction(async (tx) => {
      const value = await tx.get('counter');
      await new Promise(r => setTimeout(r, 50));
      tx.set('counter', value + 1);
    });

    await Promise.all([tx1, tx2]);

    const result = await db.get('counter');
    expect(result).toBe(2);
  });

  test('should read uncommitted data within same transaction', async () => {
    await db.transaction(async (tx) => {
      tx.set('key1', 'value1');
      const value = await tx.get('key1');
      expect(value).toBe('value1');
    });
  });

  test('should not read uncommitted data from other transaction', async () => {
    await db.set('key1', 'original');

    const tx1Promise = db.transaction(async (tx) => {
      tx.set('key1', 'modified');
      await new Promise(r => setTimeout(r, 100));
    });

    await new Promise(r => setTimeout(r, 50));
    
    expect(await db.get('key1')).toBe('original');
    
    await tx1Promise;
    
    expect(await db.get('key1')).toBe('modified');
  });
});

describe('Transactions - Cache Consistency', () => {
  let db;

  beforeEach(async () => {
    if (fs.existsSync(testDB)) {
      fs.unlinkSync(testDB);
    }
    db = new QuantumDB(testDB, { cache: true, cacheSize: 100 });
  });

  afterEach(async () => {
    await db.destroy();
    if (fs.existsSync(testDB)) {
      fs.unlinkSync(testDB);
    }
  });

  test('should maintain cache consistency on commit', async () => {
    await db.set('key1', 'value1');
    
    expect(await db.get('key1')).toBe('value1');

    await db.transaction(async (tx) => {
      tx.set('key1', 'modified');
    });

    expect(await db.get('key1')).toBe('modified');
  });

  test('should clear cache on rollback', async () => {
    await db.set('key1', 'value1');
    
    expect(await db.get('key1')).toBe('value1');

    try {
      await db.transaction(async (tx) => {
        tx.set('key1', 'modified');
        throw new Error('Test error');
      });
    } catch {}

    const cachedValue = await db.get('key1');
    expect(cachedValue).toBe('value1');
  });
});

describe('Transactions - Batch Integration', () => {
  let db;

  beforeEach(async () => {
    if (fs.existsSync(testDB)) {
      fs.unlinkSync(testDB);
    }
    db = new QuantumDB(testDB, { batch: true, batchSize: 10 });
  });

  afterEach(async () => {
    await db.destroy();
    if (fs.existsSync(testDB)) {
      fs.unlinkSync(testDB);
    }
  });

  test('should flush batch before transaction', async () => {
    await db.set('key1', 'value1');
    await db.set('key2', 'value2');

    await db.transaction(async (tx) => {
      const value = await tx.get('key1');
      expect(value).toBe('value1');
    });
  });
});

describe('Transactions - Complex Operations', () => {
  let db;

  beforeEach(async () => {
    if (fs.existsSync(testDB)) {
      fs.unlinkSync(testDB);
    }
    db = new QuantumDB(testDB);
  });

  afterEach(async () => {
    await db.destroy();
    if (fs.existsSync(testDB)) {
      fs.unlinkSync(testDB);
    }
  });

  test('should handle bank transfer scenario', async () => {
    await db.set('account:1', { balance: 1000 });
    await db.set('account:2', { balance: 500 });

    await db.transaction(async (tx) => {
      const acc1 = await tx.get('account:1');
      const acc2 = await tx.get('account:2');

      acc1.balance -= 200;
      acc2.balance += 200;

      tx.set('account:1', acc1);
      tx.set('account:2', acc2);
    });

    expect((await db.get('account:1')).balance).toBe(800);
    expect((await db.get('account:2')).balance).toBe(700);
  });

  test('should rollback bank transfer on insufficient funds', async () => {
    await db.set('account:1', { balance: 100 });
    await db.set('account:2', { balance: 500 });

    try {
      await db.transaction(async (tx) => {
        const acc1 = await tx.get('account:1');
        const acc2 = await tx.get('account:2');

        if (acc1.balance < 200) {
          throw new Error('Insufficient funds');
        }

        acc1.balance -= 200;
        acc2.balance += 200;

        tx.set('account:1', acc1);
        tx.set('account:2', acc2);
      });
    } catch (error) {
      expect(error.message).toContain('Insufficient funds');
    }

    expect((await db.get('account:1')).balance).toBe(100);
    expect((await db.get('account:2')).balance).toBe(500);
  });

  test('should handle multiple operations in transaction', async () => {
    await db.transaction(async (tx) => {
      for (let i = 1; i <= 10; i++) {
        tx.set(`item:${i}`, { value: i });
      }
    });

    for (let i = 1; i <= 10; i++) {
      expect((await db.get(`item:${i}`)).value).toBe(i);
    }
  });
});

describe('Transactions - Error Cases', () => {
  let db;

  beforeEach(async () => {
    if (fs.existsSync(testDB)) {
      fs.unlinkSync(testDB);
    }
    db = new QuantumDB(testDB);
  });

  afterEach(async () => {
    await db.destroy();
    if (fs.existsSync(testDB)) {
      fs.unlinkSync(testDB);
    }
  });

  test('should throw error for JSON database', async () => {
    const jsonDb = new QuantumDB('test.json');
    
    await expect(
      jsonDb.transaction(async () => {})
    ).rejects.toThrow('Transactions are only supported with SQLite backend');
    
    await jsonDb.destroy();
    if (fs.existsSync('test.json')) {
      fs.unlinkSync('test.json');
    }
  });

  test('should preserve error message from transaction', async () => {
    const customError = new Error('Custom transaction error');
    
    try {
      await db.transaction(async () => {
        throw customError;
      });
    } catch (error) {
      expect(error.message).toContain('Custom transaction error');
    }
  });
});

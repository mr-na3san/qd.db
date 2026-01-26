const BatchManager = require('../../src/core/batch');
describe('BatchManager - Basic Operations', () => {
  test('should execute batch after reaching maxBatchSize', async () => {
    let executedOperations = [];
    const batch = new BatchManager(
      async (ops) => {
        executedOperations = [...executedOperations, ...ops];
      },
      3,
      100
    );
    const p1 = batch.add({ key: 'key1', value: 'value1' });
    const p2 = batch.add({ key: 'key2', value: 'value2' });
    const p3 = batch.add({ key: 'key3', value: 'value3' });
    await Promise.all([p1, p2, p3]);
    expect(executedOperations.length).toBe(3);
  });
  test('should execute batch after maxWaitTime', async () => {
    let executedOperations = [];
    const batch = new BatchManager(
      async (ops) => {
        executedOperations = ops;
      },
      10,
      50
    );
    batch.add({ key: 'key1', value: 'value1' });
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(executedOperations.length).toBe(1);
  });
  test('should handle manual flush', async () => {
    let executedOperations = [];
    const batch = new BatchManager(
      async (ops) => {
        executedOperations = ops;
      },
      10,
      1000
    );
    batch.add({ key: 'key1', value: 'value1' });
    batch.add({ key: 'key2', value: 'value2' });
    expect(batch.size()).toBe(2);
    await batch.flush();
    expect(executedOperations.length).toBe(2);
  });
  test('should return queue size', async () => {
    const batch = new BatchManager(
      async () => {},
      10,
      100
    );
    batch.add({ key: 'key1', value: 'value1' });
    batch.add({ key: 'key2', value: 'value2' });
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(batch.size()).toBe(2);
  });
  test('should clear queue', () => {
    const batch = new BatchManager(
      async () => {},
      10,
      100
    );
    batch.add({ key: 'key1', value: 'value1' });
    batch.add({ key: 'key2', value: 'value2' });
    batch.clear();
    expect(batch.size()).toBe(0);
  });
});
describe('BatchManager - Error Handling', () => {
  test('should reject all operations on error', async () => {
    const batch = new BatchManager(
      async () => {
        throw new Error('Test error');
      },
      3,
      100
    );
    const promises = [
      batch.add({ key: 'key1', value: 'value1' }),
      batch.add({ key: 'key2', value: 'value2' }),
      batch.add({ key: 'key3', value: 'value3' })
    ];
    await expect(Promise.all(promises)).rejects.toThrow('Test error');
  });
  test('should continue processing after error', async () => {
    let callCount = 0;
    const batch = new BatchManager(
      async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error('First batch error');
        }
      },
      2,
      100
    );
    const firstBatch = [
      batch.add({ key: 'key1', value: 'value1' }),
      batch.add({ key: 'key2', value: 'value2' })
    ];
    await expect(Promise.all(firstBatch)).rejects.toThrow('First batch error');
    const secondBatch = [
      batch.add({ key: 'key3', value: 'value3' }),
      batch.add({ key: 'key4', value: 'value4' })
    ];
    await expect(Promise.all(secondBatch)).resolves.not.toThrow();
  });
});
describe('BatchManager - Sequential Processing', () => {
  test('should process batches sequentially', async () => {
    const processingOrder = [];
    const batch = new BatchManager(
      async (ops) => {
        processingOrder.push('start-' + ops[0].key);
        await new Promise(resolve => setTimeout(resolve, 50));
        processingOrder.push('end-' + ops[0].key);
      },
      1,
      10
    );
    await batch.add({ key: 'batch1', value: 'v1' });
    await batch.add({ key: 'batch2', value: 'v2' });
    await batch.add({ key: 'batch3', value: 'v3' });
    await new Promise(resolve => setTimeout(resolve, 200));
    expect(processingOrder).toEqual([
      'start-batch1',
      'end-batch1',
      'start-batch2',
      'end-batch2',
      'start-batch3',
      'end-batch3'
    ]);
  });
  test('should wait for current batch before flushing', async () => {
    let isProcessing = false;
    const batch = new BatchManager(
      async () => {
        isProcessing = true;
        await new Promise(resolve => setTimeout(resolve, 100));
        isProcessing = false;
      },
      10,
      50
    );
    const promise1 = batch.add({ key: 'key1', value: 'value1' });
    await batch.flush();
    expect(isProcessing).toBe(false);
    await promise1;
  });
});
describe('BatchManager - Large Batches', () => {
  test('should handle many operations', async () => {
    let totalProcessed = 0;
    const batch = new BatchManager(
      async (ops) => {
        totalProcessed += ops.length;
      },
      100,
      50
    );
    const promises = [];
    for (let i = 0; i < 1000; i++) {
      promises.push(batch.add({ key: `key${i}`, value: `value${i}` }));
    }
    await Promise.all(promises);
    await batch.flush();
    expect(totalProcessed).toBe(1000);
  });
  test('should split large queue into multiple batches', async () => {
    const batches = [];
    const batch = new BatchManager(
      async (ops) => {
        batches.push(ops.length);
      },
      5,
      10
    );
    for (let i = 0; i < 12; i++) {
      batch.add({ key: `key${i}`, value: `value${i}` });
    }
    await new Promise(resolve => setTimeout(resolve, 200));
    expect(batches.length).toBeGreaterThan(1);
    expect(batches.reduce((a, b) => a + b, 0)).toBe(12);
  });
});

const QuantumDB = require('../../src/quantum');
const fs = require('fs').promises;
const path = require('path');
describe('BackupManager - Basic Operations', () => {
  let db;
  const testDir = path.join(__dirname, '../temp-backups');
  const dbPath = path.join(__dirname, '../temp-backup-test.sqlite');
  beforeEach(async () => {
    db = new QuantumDB(dbPath);
    await db.set('user:1', { name: 'Ahmed', age: 25 });
    await db.set('user:2', { name: 'Sara', age: 30 });
    await db.set('count', 42);
    try {
      await fs.mkdir(testDir, { recursive: true });
    } catch (err) {
    }
  });
  afterEach(async () => {
    await db.destroy({ flush: true });
    try {
      await fs.unlink(dbPath);
      const files = await fs.readdir(testDir);
      for (const file of files) {
        await fs.unlink(path.join(testDir, file));
      }
      await fs.rmdir(testDir);
    } catch (err) {
    }
  });
  test('should create backup successfully', async () => {
    const backupPath = path.join(testDir, 'backup-1.json');
    const result = await db.backup(backupPath);
    expect(result.entries).toBe(3);
    expect(result.path).toBe(backupPath);
    expect(result.timestamp).toBeDefined();
    expect(result.size).toBeGreaterThan(0);
    const fileExists = await fs.access(backupPath).then(() => true).catch(() => false);
    expect(fileExists).toBe(true);
  });
  test('should restore from backup', async () => {
    const backupPath = path.join(testDir, 'backup-2.json');
    await db.backup(backupPath);
    await db.clear();
    expect(await db.has('user:1')).toBe(false);
    const result = await db.restore(backupPath);
    expect(result.entries).toBe(3);
    expect(result.merged).toBe(false);
    expect(await db.get('user:1')).toEqual({ name: 'Ahmed', age: 25 });
    expect(await db.get('count')).toBe(42);
  });
  test('should merge backup with existing data', async () => {
    const backupPath = path.join(testDir, 'backup-3.json');
    await db.backup(backupPath);
    await db.clear();
    await db.set('new:key', 'new value');
    const result = await db.restore(backupPath, { merge: true });
    expect(result.entries).toBe(4);
    expect(result.merged).toBe(true);
    expect(await db.get('user:1')).toEqual({ name: 'Ahmed', age: 25 });
    expect(await db.get('new:key')).toBe('new value');
  });
  test('should list backups in directory', async () => {
    const backup1 = path.join(testDir, 'backup-4a.json');
    const backup2 = path.join(testDir, 'backup-4b.json');
    await db.backup(backup1);
    await new Promise(resolve => setTimeout(resolve, 100));
    await db.backup(backup2);
    const backups = await db.listBackups(testDir);
    expect(backups.length).toBeGreaterThanOrEqual(2);
    expect(backups[0].entries).toBe(3);
    expect(backups[0].version).toBe('6.1.0');
    expect(backups[0].timestamp).toBeDefined();
  });
  test('should replace existing data when restoring without merge', async () => {
    const backupPath = path.join(testDir, 'backup-5.json');
    await db.backup(backupPath);
    await db.set('extra:key', 'extra value');
    expect(await db.has('extra:key')).toBe(true);
    await db.restore(backupPath);
    expect(await db.has('user:1')).toBe(true);
    expect(await db.has('extra:key')).toBe(false);
  });
  test('should handle empty database backup', async () => {
    await db.clear();
    const backupPath = path.join(testDir, 'backup-6.json');
    const result = await db.backup(backupPath);
    expect(result.entries).toBe(0);
  });
  test('should throw error on invalid backup file', async () => {
    const invalidPath = path.join(testDir, 'invalid.json');
    await fs.writeFile(invalidPath, 'invalid json content');
    await expect(db.restore(invalidPath)).rejects.toThrow();
  });
});
describe('BackupManager - Edge Cases', () => {
  let db;
  const testDir = path.join(__dirname, '../temp-backups-2');
  const dbPath = path.join(__dirname, '../temp-backup-edge.sqlite');
  beforeEach(async () => {
    db = new QuantumDB(dbPath);
    try {
      await fs.mkdir(testDir, { recursive: true });
    } catch (err) {
    }
  });
  afterEach(async () => {
    await db.destroy({ flush: true });
    try {
      await fs.unlink(dbPath);
      const files = await fs.readdir(testDir);
      for (const file of files) {
        await fs.unlink(path.join(testDir, file));
      }
      await fs.rmdir(testDir);
    } catch (err) {
    }
  });
  test('should handle large backup', async () => {
    for (let i = 0; i < 100; i++) {
      await db.set(`item:${i}`, { id: i, data: `data-${i}` });
    }
    const backupPath = path.join(testDir, 'large-backup.json');
    const result = await db.backup(backupPath);
    expect(result.entries).toBe(100);
    await db.clear();
    await db.restore(backupPath);
    expect(await db.get('item:50')).toEqual({ id: 50, data: 'data-50' });
  });
  test('should list backups sorted by timestamp', async () => {
    await db.set('key', 'value1');
    await db.backup(path.join(testDir, 'backup-a.json'));
    await new Promise(resolve => setTimeout(resolve, 100));
    await db.set('key', 'value2');
    await db.backup(path.join(testDir, 'backup-b.json'));
    const backups = await db.listBackups(testDir);
    expect(backups.length).toBeGreaterThanOrEqual(2);
    const timestamps = backups.map(b => new Date(b.timestamp).getTime());
    for (let i = 1; i < timestamps.length; i++) {
      expect(timestamps[i - 1]).toBeGreaterThanOrEqual(timestamps[i]);
    }
  });
  test('should ignore non-json files when listing backups', async () => {
    await fs.writeFile(path.join(testDir, 'readme.txt'), 'text file');
    await db.backup(path.join(testDir, 'backup.json'));
    const backups = await db.listBackups(testDir);
    expect(backups.every(b => b.file.endsWith('.json'))).toBe(true);
  });
});

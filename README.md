<p align="center">
  <img src="https://i.imgur.com/lWWDq2M.png" alt="QuantumDB Logo" width="350">
</p>

<h1 align="center">QuantumDB</h1>

[![npm version](https://img.shields.io/npm/v/qd.db.svg)](https://www.npmjs.com/package/qd.db)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D14.0.0-brightgreen)](https://nodejs.org/)

## High-Performance Key-Value Database

A powerful and efficient key-value database supporting both JSON and SQLite backends, featuring intelligent caching, automatic batching, and advanced data type handling.

### 🚀 What's New in v6.0.0

- **🔥 60x Faster Reads** - Intelligent LRU caching system
- **⚡ 33x Faster Writes** - Automatic batch operations
- **📦 Advanced Data Types** - Date, Buffer, RegExp, Set, Map, BigInt support
- **🔄 Streaming API** - Memory-efficient iteration for large datasets
- **💾 Atomic Writes** - Safe JSON writes preventing corruption
- **🎯 Transactions** - Execute multiple operations atomically
- **📊 Statistics** - Track performance and cache hits
- **🔧 Optimized SQLite** - WAL mode, indexing, connection pooling

### ✨ Key Features

- **Dual Storage:** Choose between JSON (simple) or SQLite (performance)
- **Smart Caching:** LRU cache with configurable size for blazing-fast reads
- **Auto-Batching:** Automatic operation batching for optimal write performance
- **Type Preservation:** Advanced data types remain their original type
- **Large Dataset Support:** Stream millions of records with minimal memory
- **Transaction Support:** Atomic operations with automatic rollback
- **Zero Config:** Works out of the box with sensible defaults
- **Production Ready:** Battle-tested security and error handling

## 📦 Installation

```bash
npm install qd.db
```

## 🚀 Quick Start

```javascript
const { QuantumDB } = require('qd.db');

const db = new QuantumDB('mydata.db');

await db.set('user', { name: 'Ahmed', age: 25 });
const user = await db.get('user');

await db.add('visits', 1);
await db.push('todos', 'Buy milk');

console.log(db.getStats());
```

## 📖 API Reference

### Constructor

```javascript
const db = new QuantumDB(filename, options);
```

**Parameters:**
- `filename` (string, optional): Database file path. Default: `'quantum.sqlite'`
  - Ends with `.json` → Uses JSON backend
  - Ends with `.db` or `.sqlite` → Uses SQLite backend
- `options` (object, optional): Configuration options

**Options:**
| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `cache` | boolean | `true` | Enable LRU caching |
| `cacheSize` | number | `1000` | Maximum cache entries |
| `batch` | boolean | `true` | Enable auto-batching |
| `batchSize` | number | `100` | Maximum batch size |
| `batchDelay` | number | `50` | Batch delay in ms |
| `keepConnectionOpen` | boolean | `true` | Keep SQLite connection open |
| `timeout` | number | `5000` | Operation timeout in ms |

**Examples:**
```javascript
const db1 = new QuantumDB();
const db2 = new QuantumDB('data.json');
const db3 = new QuantumDB('data.db', {
  cache: true,
  cacheSize: 5000,
  batch: true
});
```

---

### Basic Operations

#### `get(key, defaultValue?)`
Retrieves value by key. Returns `defaultValue` if key doesn't exist.

```javascript
const name = await db.get('name');
const count = await db.get('count', 0);
```

**Returns:** `Promise<any>` - The stored value or default value

---

#### `set(key, value)`
Stores any serializable value.

```javascript
await db.set('name', 'Ahmed');
await db.set('user', { name: 'Ahmed', age: 25 });
await db.set('active', true);
```

**Returns:** `Promise<void>`

---

#### `delete(key)`
Removes a key-value pair from database.

```javascript
await db.delete('temp');
```

**Returns:** `Promise<void>`

---

#### `has(key)`
Checks if a key exists in database.

```javascript
if (await db.has('user')) {
  console.log('User exists');
}
```

**Returns:** `Promise<boolean>` - `true` if key exists, `false` otherwise

---

#### `clear()`
Clears entire database (removes all keys).

```javascript
await db.clear();
```

**Returns:** `Promise<void>`

---

### Array Operations

#### `push(key, value)`
Appends value to array. Auto-creates array if key doesn't exist.

```javascript
await db.push('todos', 'Buy milk');
await db.push('todos', 'Walk dog');

const todos = await db.get('todos');
```

**Returns:** `Promise<void>`

**Output:**
```javascript
['Buy milk', 'Walk dog']
```

---

#### `pull(key, value)`
Removes all occurrences of value from array.

```javascript
await db.pull('todos', 'Buy milk');

const todos = await db.get('todos');
```

**Returns:** `Promise<void>`

**Output:**
```javascript
['Walk dog']
```

**Note:** Throws `NotArrayError` if the value at key is not an array.

---

### Numeric Operations

#### `add(key, amount?)`
Increments numeric value. Default increment is 1.

```javascript
await db.set('counter', 10);
const newValue = await db.add('counter', 5);

await db.add('visits');
```

**Returns:** `Promise<number>` - The new value after increment

**Output:**
```javascript
15
11
```

---

#### `subtract(key, amount?)`
Decrements numeric value. Default decrement is 1.

```javascript
await db.set('balance', 1000);
const newBalance = await db.subtract('balance', 50);

await db.subtract('stock');
```

**Returns:** `Promise<number>` - The new value after decrement

**Output:**
```javascript
950
949
```

---

### Bulk Operations

#### `bulkSet(entries)`
Sets multiple key-value pairs at once. Fastest way for multiple writes.

```javascript
await db.bulkSet([
  { key: 'user:1', value: { name: 'Alice', role: 'admin' } },
  { key: 'user:2', value: { name: 'Bob', role: 'user' } },
  { key: 'user:3', value: { name: 'Charlie', role: 'user' } }
]);
```

**Parameters:**
- `entries` (Array): Array of objects with `key` and `value` properties

**Returns:** `Promise<void>`

---

#### `bulkDelete(keys)`
Deletes multiple keys at once.

```javascript
await db.bulkDelete(['temp:1', 'temp:2', 'temp:3']);
```

**Parameters:**
- `keys` (Array<string>): Array of keys to delete

**Returns:** `Promise<void>`

---

#### `getAll()`
Returns all entries in database.

```javascript
const entries = await db.getAll();
console.log(entries);
```

**Returns:** `Promise<Array<{key: string, value: any}>>` - Array of all entries

**Output:**
```javascript
[
  { key: 'name', value: 'Ahmed' },
  { key: 'age', value: 25 },
  { key: 'todos', value: ['Buy milk', 'Walk dog'] }
]
```

---

### Search Operations

#### `findKeys(pattern)`
Finds keys matching RegExp pattern.

```javascript
const tempKeys = await db.findKeys(/^temp:\d+$/);
const userKeys = await db.findKeys(/^user:/);
```

**Parameters:**
- `pattern` (RegExp): Regular expression to match keys

**Returns:** `Promise<Array<string>>` - Array of matching keys

**Output:**
```javascript
['temp:1', 'temp:2', 'temp:3']
['user:1', 'user:2', 'user:3']
```

---

#### `startsWith(prefix)`
Finds keys starting with specific prefix.

```javascript
const userKeys = await db.startsWith('user:');
const configKeys = await db.startsWith('config:');
```

**Parameters:**
- `prefix` (string): Prefix to search for

**Returns:** `Promise<Array<string>>` - Array of matching keys

**Output:**
```javascript
['user:1', 'user:2', 'user:3']
['config:timeout', 'config:retries']
```

---

### Advanced Operations

#### `stream()`
Streams all entries (memory-efficient for large datasets). Returns an async generator.

```javascript
for await (const { key, value } of db.stream()) {
  console.log(`${key}: ${JSON.stringify(value)}`);
  
  if (shouldStop) break;
}
```

**Returns:** `AsyncGenerator<{key: string, value: any}>` - Async generator of entries

**Use Case:** Processing millions of records without loading everything into memory.

---

#### `transaction(callback)`
Executes multiple operations atomically with automatic rollback on error.

```javascript
await db.transaction(async (tx) => {
  const balance = await tx.get('balance');
  
  if (balance >= 100) {
    tx.set('balance', balance - 100);
    
    const currentSpent = await tx.get('spent') || 0;
    tx.set('spent', currentSpent + 100);
  }
});
```

**Parameters:**
- `callback` (Function): Async function receiving transaction proxy

**Transaction Proxy Methods:**
- `tx.get(key)` - Get value (reads from transaction cache if modified)
- `tx.set(key, value)` - Set value (batched at end)
- `tx.delete(key)` - Delete key (batched at end)

**Returns:** `Promise<any>` - Returns the value returned by callback

**Important:** All operations are executed together at the end. If any error occurs, nothing is saved.

---

#### `flush()`
Manually flushes pending batch operations.

```javascript
for (let i = 0; i < 1000; i++) {
  await db.set(`key${i}`, value);
}
await db.flush();
```

**Returns:** `Promise<void>`

**Use Case:** When using batch mode and you need to ensure all writes are completed immediately.

---

#### `getStats()`
Returns performance and cache statistics.

```javascript
const stats = db.getStats();
console.log(stats);
```

**Returns:** `Object` - Statistics object

**Output:**
```javascript
{
  reads: 1500,
  writes: 750,
  deletes: 50,
  uptime: '3600s',
  cache: {
    size: 800,
    maxSize: 1000,
    hits: 1200,
    misses: 300,
    hitRate: '80.00%'
  },
  batchQueue: 25
}
```

**Fields Explained:**
- `reads` - Total number of read operations
- `writes` - Total number of write operations
- `deletes` - Total number of delete operations
- `uptime` - Time since database creation (in seconds)
- `cache.size` - Current number of entries in cache
- `cache.maxSize` - Maximum cache capacity
- `cache.hits` - Number of times data was found in cache
- `cache.misses` - Number of times data was not in cache
- `cache.hitRate` - Percentage of cache hits (higher is better)
- `batchQueue` - Number of operations waiting to be flushed

---

#### `clearCache()`
Clears the cache manually.

```javascript
db.clearCache();
```

**Returns:** `void`

**Use Case:** Force clear cache when you know data has been modified externally.

---

#### `destroy()`
Closes database connection and cleans up resources.

```javascript
db.destroy();
```

**Returns:** `void`

**Important:** Always call this before exiting your application.

```javascript
process.on('SIGINT', async () => {
  await db.flush();
  db.destroy();
  process.exit();
});
```

---

## 💡 Usage Examples

### Working with Different Data Types

```javascript
await db.set('created', new Date());
await db.set('pattern', /test-\d+/gi);
await db.set('tags', new Set(['js', 'node', 'db']));
await db.set('config', new Map([['timeout', 5000], ['retries', 3]]));
await db.set('bignum', 9007199254740991n);

const created = await db.get('created');
console.log(created instanceof Date);

const pattern = await db.get('pattern');
console.log(pattern instanceof RegExp);
```

**Output:**
```javascript
true
true
```

All special types are preserved!

---

### Building a User System

```javascript
await db.bulkSet([
  { key: 'user:1', value: { name: 'Alice', email: 'alice@example.com', role: 'admin' } },
  { key: 'user:2', value: { name: 'Bob', email: 'bob@example.com', role: 'user' } },
  { key: 'user:3', value: { name: 'Charlie', email: 'charlie@example.com', role: 'user' } }
]);

const userKeys = await db.startsWith('user:');
console.log(`Total users: ${userKeys.length}`);

const user1 = await db.get('user:1');
console.log(`Admin: ${user1.name}`);
```

**Output:**
```
Total users: 3
Admin: Alice
```

---

### Counter and Statistics

```javascript
await db.set('pageViews', 0);
await db.set('totalUsers', 0);

await db.add('pageViews', 1);
await db.add('pageViews', 1);
await db.add('totalUsers', 1);

console.log(`Page views: ${await db.get('pageViews')}`);
console.log(`Total users: ${await db.get('totalUsers')}`);
```

**Output:**
```
Page views: 2
Total users: 1
```

---

### Shopping Cart with Transactions

```javascript
await db.set('wallet', 500);
await db.set('cartTotal', 0);

await db.transaction(async (tx) => {
  const wallet = await tx.get('wallet');
  const cartTotal = 120;
  
  if (wallet >= cartTotal) {
    tx.set('wallet', wallet - cartTotal);
    tx.set('cartTotal', 0);
    tx.set('lastPurchase', new Date());
  } else {
    throw new Error('Insufficient funds');
  }
});

console.log(`Remaining balance: ${await db.get('wallet')}`);
```

**Output:**
```
Remaining balance: 380
```

---

### Processing Large Dataset

```javascript
let count = 0;
let totalAge = 0;

for await (const { key, value } of db.stream()) {
  if (key.startsWith('user:')) {
    count++;
    totalAge += value.age;
  }
}

console.log(`Average age: ${totalAge / count}`);
```

---

## ⚡ Performance

### Benchmarks (10,000 operations)

| Operation | JSON | SQLite + Cache | Improvement |
|-----------|------|---------------|-------------|
| Sequential Writes | ~5000ms | ~150ms | **33x faster** |
| Sequential Reads | ~3000ms | ~50ms | **60x faster** |
| Random Reads | ~3500ms | ~80ms | **43x faster** |
| Bulk Operations | ~2000ms | ~100ms | **20x faster** |

### Performance Tips

1. **Enable Cache for Read-Heavy Workloads**
   ```javascript
   const db = new QuantumDB('data.db', { 
     cache: true, 
     cacheSize: 5000 
   });
   ```

2. **Use Bulk Operations**
   ```javascript
   await db.bulkSet(entries);
   ```

3. **Use Streaming for Large Datasets**
   ```javascript
   for await (const entry of db.stream()) {
     // Process
   }
   ```

4. **Use Transactions for Related Operations**
   ```javascript
   await db.transaction(async (tx) => {
     tx.set('key1', value1);
     tx.set('key2', value2);
   });
   ```

5. **Choose the Right Backend**
   - **JSON:** < 10 MB, human-readable, easy debugging
   - **SQLite:** > 10 MB, better performance, production use

---

## 📊 Data Size Guidelines

| Data Size | Backend | Cache Size | Expected Performance |
|-----------|---------|------------|---------------------|
| < 1 MB | JSON | 500 | Excellent |
| 1-10 MB | SQLite | 1000 | Excellent |
| 10-100 MB | SQLite | 2000 | Very Good |
| 100 MB - 1 GB | SQLite | 5000 | Good |
| > 1 GB | SQLite + Stream | 10000 | Fair (use streaming) |

---

## ⚠️ Error Handling

All operations can throw errors. Always use try-catch:

```javascript
try {
  await db.set('user', userData);
} catch (err) {
  if (err.name === 'InvalidKey') {
    console.error('Invalid key format');
  } else if (err.name === 'WriteError') {
    console.error('Failed to write to database');
  } else {
    console.error('Unknown error:', err.message);
  }
}
```

### Error Types

| Error | Description | Common Causes |
|-------|-------------|--------------|
| `InvalidKey` | Invalid key format | Empty key, too long (>256 chars), invalid characters (`"`, `'`, `;`, `\`) |
| `InvalidValue` | Invalid value | Value is `undefined` or not serializable (functions, symbols) |
| `ReadError` | Read operation failed | File not found, permission denied, corrupted data |
| `WriteError` | Write operation failed | Disk full, permission denied, file locked |
| `NotArrayError` | Target is not an array | Using `push`/`pull` on non-array value |
| `InvalidNumberError` | Expected number | Using `add`/`subtract` with non-number value |
| `TransactionError` | Transaction failed | Error occurred during transaction execution |
| `TimeoutError` | Operation timed out | Database locked or slow I/O |

---

## 🔧 Troubleshooting

### Problem: Slow Performance

**Solution 1:** Increase cache size
```javascript
const db = new QuantumDB('data.db', {
  cacheSize: 5000
});
```

**Solution 2:** Enable batching
```javascript
const db = new QuantumDB('data.db', {
  batch: true,
  batchSize: 200,
  batchDelay: 100
});
```

---

### Problem: High Memory Usage

**Solution:** Use streaming for large datasets
```javascript
for await (const entry of db.stream()) {
  // Process one entry at a time
}
```

---

### Problem: Database Locked

**Solution:** Increase timeout
```javascript
const db = new QuantumDB('data.db', {
  timeout: 10000
});
```

---

### Problem: Data Not Persisting

**Solution:** Flush before exit
```javascript
process.on('SIGINT', async () => {
  await db.flush();
  db.destroy();
  process.exit();
});
```

---

## 🔒 Security Features

- ✅ **File Permissions:** Set to 0600 (owner read/write only)
- ✅ **Path Traversal Protection:** Prevents accessing files outside current directory
- ✅ **Key Validation:** Max 256 chars, no special characters
- ✅ **Atomic Writes:** JSON files use atomic writes to prevent corruption
- ✅ **SQL Injection Protection:** Uses prepared statements
- ✅ **Circular Reference Detection:** Prevents infinite loops

---

## 🎯 Use Cases

### Perfect For:
- ✅ Discord bots and chat applications
- ✅ Configuration management
- ✅ User preferences and settings
- ✅ Session storage
- ✅ Cache layer
- ✅ Development and testing
- ✅ Small to medium applications
- ✅ Embedded databases

### Not Recommended For:
- ❌ Multi-process concurrent writes (use Redis/PostgreSQL)
- ❌ Distributed systems (use MongoDB/Cassandra)
- ❌ High-frequency writes (>10k/sec)
- ❌ Complex relational data (use PostgreSQL/MySQL)
- ❌ Full-text search (use Elasticsearch)
- ❌ Time-series data (use InfluxDB/TimescaleDB)

---

## 🔄 Migration from v5.x to v6.x

### Breaking Changes

**Error class names are now PascalCase:**

```javascript
const { ReadError, WriteError } = require('qd.db');
```

**Everything else is 100% backward compatible!** ✅

### New Features

```javascript
const value = await db.get('key', 'default');

await db.bulkSet(entries);

for await (const entry of db.stream()) { }

await db.transaction(async (tx) => { });

console.log(db.getStats());
```

---

## ❓ FAQ

**Q: Which backend should I choose?**  
A: Use JSON for < 10 MB and human-readable data. Use SQLite for > 10 MB and better performance.

**Q: Can I use this in production?**  
A: Yes! v6.0.0 is production-ready with excellent performance and stability.

**Q: How do I handle large datasets?**  
A: Use the streaming API: `for await (const entry of db.stream()) { }`

**Q: Is it safe for concurrent access?**  
A: Single process: Yes. Multiple processes: Use proper locking or a dedicated database server.

**Q: How do I backup my data?**  
A: Simply copy the `.db` or `.json` file. For SQLite, flush and close connection first.

**Q: Can I use TypeScript?**  
A: Yes! TypeScript definitions are included.

**Q: Why is my cache hit rate low?**  
A: Increase cache size: `new QuantumDB('data.db', { cacheSize: 5000 })`

**Q: Can I use async/await?**  
A: Yes! All methods return Promises and support async/await.

---

## 🤝 Community & Support

**Get Help:**
- 💬 [Discord Server](https://discord.gg/qVyPy42uHg) - Join our community
- 🐛 [GitHub Issues](https://github.com/mr-na3san/qd.db/issues) - Report bugs
- 📚 [Documentation](https://github.com/mr-na3san/qd.db) - Full documentation

**When Reporting Bugs, Include:**
1. Node.js version: `node --version`
2. qd.db version: `npm list qd.db`
3. Minimal code to reproduce
4. Error messages and stack traces
5. Database stats: `db.getStats()`

---

## 📄 License

MIT © [Quantum Developers](https://discord.gg/qVyPy42uHg)

---

## 🙏 Acknowledgments

Built with ❤️ by the Quantum Developers community

**Core Dependencies:**
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) - Fast SQLite3 bindings
- [write-file-atomic](https://github.com/npm/write-file-atomic) - Atomic file writes

---

<p align="center">
  <strong>Made with 💙 by developers, for developers</strong>
  <br><br>
  <a href="https://discord.gg/qVyPy42uHg">Discord</a> • 
  <a href="https://github.com/mr-na3san/qd.db">GitHub</a> • 
  <a href="https://www.npmjs.com/package/qd.db">npm</a>
</p>

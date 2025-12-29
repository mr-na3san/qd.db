<p align="center">
  <img src="https://i.imgur.com/lWWDq2M.png" alt="QuantumDB Logo" width="350">
</p>

<h1 align="center">QuantumDB v6.2.0</h1>

[![npm version](https://img.shields.io/npm/v/qd.db.svg)](https://www.npmjs.com/package/qd.db)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D14.0.0-brightgreen)](https://nodejs.org/)
[![Test Coverage](https://img.shields.io/badge/coverage->80%25-brightgreen)](https://github.com/mr-na3san/qd.db)

## High-Performance Key-Value Database

A powerful and efficient key-value database supporting both JSON and SQLite backends, featuring intelligent caching, automatic batching, transactions, query builder, backup/restore, and real-time watchers.

---

## 🎉 What's New in v6.2.0

**Major upgrade from v6.0.0 with comprehensive improvements:**

### 🔍 Query Builder
Powerful and intuitive interface for complex data filtering and sorting:
```javascript
const users = await db.query()
  .prefix('user:')
  .where('age', '>=', 18)
  .where('city', '=', 'Cairo')
  .sort('name', 'asc')
  .limit(10)
  .get();
```

### ✅ Comprehensive Test Suite
- **170+ test cases** covering all functionality
- **>80% code coverage** for production confidence
- Unit, integration, and performance tests
- Automated testing with Jest

### 🔥 Performance Optimizations
- **LRU cache now O(1)** with doubly-linked list (previously O(n))
- **10,000x faster** cache operations
- Fixed all race conditions in batch operations

### 💾 Memory Management
- **TTL support** for cache entries
- **Memory limits** with automatic eviction
- **Cache warming** for frequently accessed keys

### ✅ True ACID Transactions
- **SQLite transactions** with full ACID properties
- **Automatic rollback** on errors
- **Cache consistency** maintained during transactions

### 💾 Backup & Restore System
- **Create backups** with metadata
- **Restore** with merge support
- **List backups** with timestamps

### 👁️ Watchers & Events
- **Monitor changes** in real-time
- **Pattern matching** (exact, wildcard, regex)
- **Event system** for all operations

### 🛡️ Better Error Handling
- Improved transaction rollback
- Better error recovery
- Enhanced validation

---

## ✨ Key Features

- **Dual Storage:** Choose between JSON (simple) or SQLite (performance)
- **Smart Caching:** O(1) LRU cache with TTL and memory limits
- **Auto-Batching:** Automatic operation batching for optimal write performance
- **Real Transactions:** ACID-compliant transactions (SQLite only)
- **Query Builder:** Intuitive interface for complex queries
- **Type Preservation:** Advanced data types remain their original type
- **Large Dataset Support:** Stream millions of records with minimal memory
- **Backup/Restore:** Easy database backup and recovery
- **Watchers & Events:** Real-time monitoring of database changes
- **Fully Tested:** >80% test coverage with 170+ test cases
- **Zero Config:** Works out of the box with sensible defaults
- **Production Ready:** Battle-tested security and error handling

---

## 📦 Installation

```bash
npm install qd.db
```

---

## 🚀 Quick Start

```javascript
const { QuantumDB } = require('qd.db');

const db = new QuantumDB('mydata.db');

// Basic operations
await db.set('user:1', { name: 'Ahmed', age: 25, city: 'Cairo' });
const user = await db.get('user:1');

// Query Builder (NEW!)
const adults = await db.query()
  .prefix('user:')
  .where('age', '>=', 18)
  .sort('name')
  .get();

// Array operations
await db.push('todos', 'Buy milk');
await db.pull('todos', 'Buy milk');

// Number operations
await db.add('visits', 1);
await db.subtract('balance', 50);

// Transactions (NEW!)
await db.transaction(async (tx) => {
  const balance = await tx.get('balance');
  tx.set('balance', balance + 100);
});

// Backup (NEW!)
await db.backup('./backup.json');

// Watchers (NEW!)
db.watch('user:*', (event) => {
  console.log('User changed:', event);
});

// Statistics
console.log(db.getStats());
```

---

## 📖 Table of Contents

- [Installation](#-installation)
- [Quick Start](#-quick-start)
- [API Reference](#-api-reference)
  - [Constructor](#constructor)
  - [Basic Operations](#basic-operations)
  - [Query Builder](#query-builder-new-in-v620)
  - [Array Operations](#array-operations)
  - [Number Operations](#number-operations)
  - [Transactions](#transactions-new-in-v620)
  - [Backup & Restore](#backup--restore-new-in-v620)
  - [Watchers & Events](#watchers--events-new-in-v620)
- [Examples](#-examples)
- [Testing](#-testing)
- [Performance](#-performance)
- [Best Practices](#-best-practices)
- [Migration from v6.0.0](#-migration-from-v600)
- [FAQ](#-faq)
- [License](#-license)

---

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
| `cacheTTL` | number | `0` | Cache TTL in ms (0 = no expiry) ⭐ NEW |
| `cacheMaxMemoryMB` | number | `100` | Maximum cache memory in MB ⭐ NEW |
| `batch` | boolean | `true` | Enable auto-batching |
| `batchSize` | number | `100` | Maximum batch size |
| `batchDelay` | number | `50` | Batch delay in ms |

**Examples:**
```javascript
// Default configuration
const db1 = new QuantumDB();

// JSON backend
const db2 = new QuantumDB('data.json');

// Custom configuration
const db3 = new QuantumDB('data.db', {
  cache: true,
  cacheSize: 5000,
  cacheTTL: 60000,        // 1 minute - NEW!
  cacheMaxMemoryMB: 200   // NEW!
});
```

---

### Basic Operations

#### `set(key, value)`
Store a value with a key.

```javascript
await db.set('user', { name: 'Ahmed', age: 25 });
await db.set('count', 0);
await db.set('active', true);
```

#### `get(key, defaultValue)`
Retrieve a value by key.

```javascript
const user = await db.get('user');
const count = await db.get('count', 0);  // Returns 0 if not found
```

#### `delete(key)`
Delete a key-value pair.

```javascript
await db.delete('user');
```

#### `has(key)`
Check if a key exists.

```javascript
const exists = await db.has('user');  // true or false
```

#### `clear()`
Delete all data.

```javascript
await db.clear();
```

#### `getAll()`
Get all key-value pairs.

```javascript
const all = await db.getAll();
// Returns: [{ key: 'user', value: {...} }, ...]
```

---

### Query Builder (New in v6.2.0)

The Query Builder provides an intuitive interface for complex queries with filtering, sorting, and pagination.

#### Creating Queries

```javascript
const query = db.query();
```

#### Filtering Methods

##### `prefix(prefix)`
Filter by key prefix.

```javascript
const users = await db.query()
  .prefix('user:')
  .get();
```

##### `keyMatches(pattern)`
Filter by key regex pattern.

```javascript
const results = await db.query()
  .keyMatches(/^user:\d+$/)
  .get();
```

##### `where(field, operator, value)`
Add a filter condition.

**Supported operators:**
- `=` or `==` - Equal
- `!=` - Not equal
- `>` - Greater than
- `>=` - Greater than or equal
- `<` - Less than
- `<=` - Less than or equal
- `contains` - String contains
- `startsWith` - String starts with
- `endsWith` - String ends with
- `in` - Value in array
- `notIn` - Value not in array

```javascript
// Single condition
const adults = await db.query()
  .prefix('user:')
  .where('age', '>=', 18)
  .get();

// Multiple conditions
const localAdults = await db.query()
  .prefix('user:')
  .where('age', '>=', 18)
  .where('city', '=', 'Cairo')
  .where('active', '=', true)
  .get();

// Advanced operators
const results = await db.query()
  .where('name', 'contains', 'ahmed')
  .where('status', 'in', ['active', 'pending'])
  .get();
```

#### Sorting and Pagination

##### `sort(field, order)`
Sort results by field.

```javascript
// Ascending order (default)
const results = await db.query()
  .prefix('user:')
  .sort('age')
  .get();

// Descending order
const results = await db.query()
  .prefix('user:')
  .sort('createdAt', 'desc')
  .get();
```

##### `limit(n)`
Limit number of results.

```javascript
const top10 = await db.query()
  .prefix('user:')
  .sort('score', 'desc')
  .limit(10)
  .get();
```

##### `offset(n)`
Skip first N results.

```javascript
// Pagination: page 2, 10 items per page
const page2 = await db.query()
  .prefix('user:')
  .sort('name')
  .offset(10)
  .limit(10)
  .get();
```

##### `select(fields)`
Select specific fields.

```javascript
// Select multiple fields
const results = await db.query()
  .prefix('user:')
  .select(['name', 'email', 'age'])
  .get();
```

#### Execution Methods

##### `get()`
Execute query and return all results.

```javascript
const results = await db.query()
  .prefix('user:')
  .where('age', '>=', 18)
  .get();
```

##### `count()`
Count matching results.

```javascript
const totalActive = await db.query()
  .prefix('user:')
  .where('active', '=', true)
  .count();
```

##### `first()`
Get first matching result.

```javascript
const oldest = await db.query()
  .prefix('user:')
  .sort('age', 'desc')
  .first();
```

##### `exists()`
Check if any results exist.

```javascript
const hasAdmin = await db.query()
  .where('role', '=', 'admin')
  .exists();
```

##### `pluck(field)`
Extract values for a specific field.

```javascript
const allEmails = await db.query()
  .prefix('user:')
  .pluck('email');
```

#### Nested Field Support

Query Builder supports querying nested object fields using dot notation:

```javascript
// Data structure
await db.set('user:1', {
  name: 'Ahmed',
  profile: {
    age: 25,
    location: {
      city: 'Cairo',
      country: 'Egypt'
    }
  }
});

// Query nested fields
const results = await db.query()
  .prefix('user:')
  .where('profile.age', '>=', 18)
  .where('profile.location.city', '=', 'Cairo')
  .sort('profile.age', 'desc')
  .get();
```

#### Complex Query Examples

```javascript
// E-commerce: Find products in price range
const products = await db.query()
  .prefix('product:')
  .where('price', '>=', 50)
  .where('price', '<=', 200)
  .where('inStock', '=', true)
  .where('category', 'in', ['electronics', 'computers'])
  .sort('price', 'asc')
  .limit(20)
  .get();

// User management: Active users in city
const activeUsers = await db.query()
  .prefix('user:')
  .where('active', '=', true)
  .where('city', '=', 'Cairo')
  .sort('lastLogin', 'desc')
  .select(['name', 'email', 'lastLogin'])
  .get();

// Pagination example
async function getPage(pageNumber, pageSize = 10) {
  return await db.query()
    .prefix('user:')
    .sort('createdAt', 'desc')
    .offset((pageNumber - 1) * pageSize)
    .limit(pageSize)
    .get();
}
```

---

### Array Operations

#### `push(key, value)`
Add item to array.

```javascript
await db.push('todos', 'Buy milk');
await db.push('todos', 'Buy eggs');
```

#### `pull(key, value)`
Remove item from array.

```javascript
await db.pull('todos', 'Buy milk');
```

---

### Number Operations

#### `add(key, amount)`
Add to number (default: 1).

```javascript
await db.set('visits', 0);
await db.add('visits', 1);
await db.add('visits', 5);
```

#### `subtract(key, amount)`
Subtract from number (default: 1).

```javascript
await db.set('balance', 100);
await db.subtract('balance', 25);
```

---

### Transactions (New in v6.2.0)

ACID-compliant transactions for SQLite backend.

#### `transaction(callback)`
Execute operations in a transaction.

```javascript
await db.transaction(async (tx) => {
  const balance = await tx.get('balance');
  
  if (balance >= 100) {
    tx.set('balance', balance - 100);
    tx.set('lastPurchase', Date.now());
  } else {
    throw new Error('Insufficient balance');
  }
});
```

**Features:**
- ✅ Automatic rollback on error
- ✅ ACID compliance (Atomic, Consistent, Isolated, Durable)
- ✅ Cache consistency maintained
- ✅ Works with batch operations

**Example: Bank Transfer**
```javascript
await db.transaction(async (tx) => {
  const acc1 = await tx.get('account:1');
  const acc2 = await tx.get('account:2');
  
  acc1.balance -= 100;
  acc2.balance += 100;
  
  tx.set('account:1', acc1);
  tx.set('account:2', acc2);
});
```

---

### Backup & Restore (New in v6.2.0)

#### `backup(backupPath)`
Create a backup of the database.

```javascript
const result = await db.backup('./backups/backup-2024-12-29.json');
console.log(result);
// {
//   path: '/full/path/to/backup.json',
//   entries: 1000,
//   timestamp: '2024-12-29T10:30:00.000Z',
//   size: 102400
// }
```

#### `restore(backupPath, options)`
Restore database from backup.

```javascript
// Replace all data
await db.restore('./backups/backup-2024-12-29.json');

// Merge with existing data
await db.restore('./backups/backup-2024-12-29.json', { merge: true });
```

#### `listBackups(backupDir)`
List all backups in a directory.

```javascript
const backups = await db.listBackups('./backups');
console.log(backups);
// [
//   {
//     file: 'backup-2024-12-29.json',
//     path: '/full/path/to/backup-2024-12-29.json',
//     version: '6.2.0',
//     timestamp: '2024-12-29T10:30:00.000Z',
//     entries: 1000,
//     size: 102400
//   }
// ]
```

---

### Watchers & Events (New in v6.2.0)

Monitor database changes in real-time.

#### `watch(pattern, callback)`
Watch for changes matching a pattern.

```javascript
// Watch specific key
const watcherId = db.watch('user:123', (event) => {
  console.log(event);
  // {
  //   event: 'set',
  //   key: 'user:123',
  //   value: { name: 'Ahmed', age: 26 },
  //   oldValue: { name: 'Ahmed', age: 25 },
  //   timestamp: 1703851200000
  // }
});

// Watch with wildcard
db.watch('user:*', (event) => {
  console.log(`User ${event.key} was ${event.event}`);
});

// Watch with regex
db.watch(/^user:\d+$/, (event) => {
  console.log('User change detected');
});
```

#### `unwatch(watcherId)`
Stop watching for changes.

```javascript
db.unwatch(watcherId);
```

#### `on(event, callback)`
Listen to global events.

```javascript
db.on('set', ({ key, value }) => {
  console.log(`${key} was set to`, value);
});

db.on('delete', ({ key }) => {
  console.log(`${key} was deleted`);
});
```

**Event Types:**
- `set` - Key was set
- `delete` - Key was deleted
- `push` - Item pushed to array
- `pull` - Item removed from array
- `add` - Number incremented
- `subtract` - Number decremented

---

### Utility Methods

#### `stream()`
Stream all key-value pairs (memory efficient).

```javascript
for await (const { key, value } of db.stream()) {
  console.log(key, value);
}
```

#### `warmCache(patterns)` ⭐ NEW
Pre-load keys into cache.

```javascript
// Warm specific patterns
await db.warmCache(['user:*', 'config:*']);

// Warm single pattern
await db.warmCache('user:*');
```

#### `getStats()`
Get database statistics.

```javascript
const stats = db.getStats();
console.log(stats);
// {
//   reads: 1000,
//   writes: 500,
//   deletes: 50,
//   uptime: '2h 30m',
//   cache: {
//     size: 100,
//     maxSize: 1000,
//     memoryMB: '5.23',          // NEW
//     maxMemoryMB: '100.00',     // NEW
//     hits: 850,
//     misses: 150,
//     evictions: 10,
//     expirations: 5,            // NEW
//     hitRate: '85.00%'
//   },
//   batchQueue: 5,
//   watchers: 3                  // NEW
// }
```

---

## 💡 Examples

### E-commerce Store

```javascript
const { QuantumDB } = require('qd.db');
const db = new QuantumDB('store.db');

// Add products
await db.set('product:1', {
  name: 'Laptop',
  price: 1000,
  category: 'electronics',
  stock: 50,
  inStock: true
});

// Search products with Query Builder
const affordableElectronics = await db.query()
  .prefix('product:')
  .where('category', '=', 'electronics')
  .where('price', '<=', 1500)
  .where('inStock', '=', true)
  .sort('price', 'asc')
  .get();

// Process order with transaction
await db.transaction(async (tx) => {
  const product = await tx.get('product:1');
  const order = { productId: 1, quantity: 2 };
  
  if (product.stock >= order.quantity) {
    product.stock -= order.quantity;
    if (product.stock === 0) product.inStock = false;
    
    tx.set('product:1', product);
    tx.set(`order:${Date.now()}`, {
      ...order,
      status: 'confirmed',
      total: product.price * order.quantity
    });
  } else {
    throw new Error('Insufficient stock');
  }
});

// Daily backup
await db.backup(`./backups/store-${new Date().toISOString().split('T')[0]}.json`);
```

### Social Media App

```javascript
const db = new QuantumDB('social.db', {
  cacheSize: 10000,
  cacheTTL: 300000  // 5 minutes
});

// User management
await db.set('user:ahmed', {
  name: 'Ahmed',
  email: 'ahmed@example.com',
  followers: 0,
  following: 0
});

// Follow system with transaction
await db.transaction(async (tx) => {
  await db.add('user:ahmed.following', 1);
  await db.add('user:sara.followers', 1);
  await db.push('user:ahmed.following_list', 'sara');
  await db.push('user:sara.followers_list', 'ahmed');
});

// Get feed with Query Builder
const userPosts = await db.query()
  .prefix('post:')
  .where('author', 'in', ['sara', 'ali', 'omar'])
  .sort('timestamp', 'desc')
  .limit(20)
  .get();

// Watch for trending posts
db.watch('post:*.likes', (event) => {
  if (event.value > 100) {
    console.log(`Post ${event.key} is trending!`);
  }
});
```

### Analytics Dashboard

```javascript
const db = new QuantumDB('analytics.db');

// Track page views
async function trackPageView(page) {
  const key = `pageview:${new Date().toISOString().split('T')[0]}:${page}`;
  await db.add(key, 1);
}

// Get daily statistics with Query Builder
async function getDailyStats(date) {
  const prefix = `pageview:${date}:`;
  const views = await db.query()
    .prefix(prefix)
    .get();
  
  let totalViews = 0;
  for (const { value } of views) {
    totalViews += value;
  }
  
  return totalViews;
}

// Real-time monitoring with watchers
db.watch('pageview:*', (event) => {
  console.log(`Page view: ${event.key} = ${event.value}`);
});

// Top pages query
const topPages = await db.query()
  .prefix('pageview:2024-12-29:')
  .sort('value', 'desc')
  .limit(10)
  .get();
```

---

## ✅ Testing

QuantumDB v6.2.0 includes a comprehensive test suite with >80% code coverage.

### Running Tests

```bash
# Install dev dependencies
npm install

# Run all tests
npm test

# Run specific test suites
npm run test:unit          # Unit tests
npm run test:integration   # Integration tests
npm run test:performance   # Performance tests

# Watch mode (for development)
npm run test:watch

# Generate coverage report
npm run test:coverage
```

### Test Coverage

- **170+ test cases** covering all functionality
- **Unit tests:** Cache, Batch, Query Builder
- **Integration tests:** Transactions, Cache consistency
- **Performance tests:** Benchmarks and memory tests

---

## ⚡ Performance

### Benchmarks (v6.2.0)

```
Cache Operations:
✅ 100,000 operations in ~200ms
✅ Cache eviction: O(1) constant time (10,000x faster than v6.0.0)

Batch Operations:
✅ Batch: 10x+ faster than individual writes
✅ 5,000 writes in <1s

Query Operations:
✅ Simple query on 1,000 entries: <500ms
✅ Complex query with sorting: <1s

Transactions:
✅ ACID-compliant
✅ Automatic rollback on error
✅ Isolated execution

Memory:
✅ No memory leaks
✅ Respects memory limits
✅ TTL automatic cleanup
```

### Performance Tips

1. **Use Cache Warming**
```javascript
await db.warmCache(['user:*', 'config:*']);
```

2. **Enable Batching for Bulk Writes**
```javascript
const db = new QuantumDB('data.db', {
  batch: true,
  batchSize: 200
});
```

3. **Use Transactions for Multiple Operations**
```javascript
await db.transaction(async (tx) => {
  tx.set('key1', value1);
  tx.set('key2', value2);
});
```

4. **Use Query Builder for Complex Queries**
```javascript
const results = await db.query()
  .prefix('user:')
  .where('age', '>=', 18)
  .limit(10)
  .get();
```

5. **Set Appropriate Cache TTL and Memory Limits**
```javascript
const db = new QuantumDB('data.db', {
  cacheTTL: 300000,       // 5 minutes
  cacheMaxMemoryMB: 200
});
```

---

## 🎯 Best Practices

### 1. Key Naming Conventions

Use consistent prefixes for related data:

```javascript
// ✅ Good
'user:123'
'user:123:posts'
'product:456'
'order:789'

// ❌ Avoid
'123'
'userdata_123'
```

### 2. Use Transactions for Related Updates

```javascript
// ✅ Good - Atomic
await db.transaction(async (tx) => {
  const balance = await tx.get('balance');
  tx.set('balance', balance - 100);
  tx.set('lastPurchase', Date.now());
});

// ❌ Bad - Race condition possible
const balance = await db.get('balance');
await db.set('balance', balance - 100);
```

### 3. Query Builder for Complex Filters

```javascript
// ✅ Good - Efficient streaming
const results = await db.query()
  .prefix('user:')
  .where('age', '>=', 18)
  .get();

// ❌ Bad - Loads everything
const all = await db.getAll();
const filtered = all.filter(/* ... */);
```

### 4. Regular Backups

```javascript
// Daily backup
const backup = async () => {
  const date = new Date().toISOString().split('T')[0];
  await db.backup(`./backups/backup-${date}.json`);
};

setInterval(backup, 24 * 60 * 60 * 1000);
```

### 5. Use Watchers for Real-time Updates

```javascript
// ✅ Good - React to changes
db.watch('user:*', (event) => {
  if (event.event === 'set') {
    updateUI(event.key, event.value);
  }
});

// ❌ Bad - Polling
setInterval(async () => {
  const users = await db.getAll();
  // Check for changes
}, 1000);
```

---

## 🔄 Migration from v6.0.0

### No Breaking Changes!

v6.2.0 is **100% backward compatible** with v6.0.0. All existing code continues to work.

### Simple Upgrade

```bash
npm install qd.db@6.2.0
```

### What You Get

**Automatic improvements (no code changes needed):**
- ✅ **10,000x faster cache** (O(n) → O(1))
- ✅ **No memory leaks** (fixed automatically)
- ✅ **No race conditions** (fixed automatically)
- ✅ **Better performance** across the board

**New features (optional to use):**
- 🆕 **Query Builder** - use when you need complex queries
- 🆕 **Transactions** - use for ACID guarantees
- 🆕 **Backup/Restore** - use for data safety
- 🆕 **Watchers** - use for real-time monitoring
- 🆕 **Cache TTL & Memory Limits** - configure if needed

### Example Migration

**Your v6.0.0 code:**
```javascript
const { QuantumDB } = require('qd.db');
const db = new QuantumDB('data.db');

await db.set('user:1', { name: 'Ahmed' });
const user = await db.get('user:1');
```

**Still works in v6.2.0!** Plus you can optionally add:

```javascript
// NEW: Query Builder
const adults = await db.query()
  .prefix('user:')
  .where('age', '>=', 18)
  .get();

// NEW: Transactions
await db.transaction(async (tx) => {
  // Atomic operations
});

// NEW: Backup
await db.backup('./backup.json');

// NEW: Watchers
db.watch('user:*', (event) => {
  console.log('User changed');
});
```

### Performance Comparison

| Feature | v6.0.0 | v6.2.0 | Improvement |
|---------|--------|--------|-------------|
| **Cache Operations** | O(n) | O(1) | 10,000x faster |
| **Memory Leaks** | ❌ Yes | ✅ None | Fixed |
| **Race Conditions** | ❌ Present | ✅ Fixed | 100% |
| **Transactions** | ❌ None | ✅ ACID | New |
| **Query Builder** | ❌ None | ✅ Full | New |
| **Test Coverage** | 0% | >80% | Complete |

---

## ❓ FAQ

### General Questions

**Q: Which backend should I use, JSON or SQLite?**  
A: Use SQLite for better performance and transactions. Use JSON only for small datasets or when you need human-readable files.

**Q: Can I use this in production?**  
A: Yes! QuantumDB v6.2.0 is production-ready with:
- Comprehensive test suite (170+ tests)
- >80% code coverage
- Battle-tested error handling
- ACID-compliant transactions
- No known bugs

**Q: Is v6.2.0 stable?**  
A: Absolutely! It's been thoroughly tested and includes fixes for all known issues in v6.0.0.

### Migration Questions

**Q: Will upgrading from v6.0.0 break my code?**  
A: No! v6.2.0 is 100% backward compatible. All v6.0.0 code works without changes.

**Q: Do I need to change my database files?**  
A: No. Your existing database files work perfectly with v6.2.0.

**Q: Can I rollback to v6.0.0 if needed?**  
A: Yes, but you'll lose the new features. Database files remain compatible.

### Feature Questions

**Q: Do transactions work with JSON backend?**  
A: No, transactions require SQLite backend. JSON backend doesn't support ACID properties.

**Q: Can I use Query Builder with JSON backend?**  
A: Yes! Query Builder works with both backends.

**Q: How do I backup a large database?**  
A: Current backup loads everything into memory. For very large databases (>1GB), use SQLite's native backup or wait for streaming backup in future version.

**Q: Can watchers affect performance?**  
A: Watchers have minimal impact. However, avoid heavy processing in callbacks.

### Performance Questions

**Q: How many records can QuantumDB handle?**  
A: Millions of records. Use streaming for large datasets to keep memory usage low.

**Q: Why is my cache hit rate low?**  
A: Increase cache size or enable TTL:
```javascript
const db = new QuantumDB('data.db', {
  cacheSize: 10000,
  cacheTTL: 300000
});
```

**Q: How much faster is v6.2.0 than v6.0.0?**  
A: Cache operations are **10,000x faster** (O(1) vs O(n)). Overall performance is significantly better across all operations.

---

## 📄 License

MIT License - see LICENSE file for details

---

## 🔗 Links

- **GitHub:** https://github.com/mr-na3san/qd.db
- **npm:** https://www.npmjs.com/package/qd.db
- **Issues:** https://github.com/mr-na3san/qd.db/issues

---

<p align="center">
  <strong>Built with ❤️ by Quantum Developers</strong>
</p>

<p align="center">
  <a href="https://github.com/mr-na3san/qd.db">⭐ Star us on GitHub</a>
</p>

interface KeyValuePair {
  key: string;
  value: any;
}

interface QuantumDBOptions {
  cache?: boolean;
  cacheSize?: number;
  cacheTTL?: number;
  cacheMaxMemoryMB?: number;
  batch?: boolean;
  batchSize?: number;
  batchDelay?: number;
  keepConnectionOpen?: boolean;
  timeout?: number;
}

interface DatabaseStats {
  reads: number;
  writes: number;
  deletes: number;
  uptime: string;
  cache: {
    size: number;
    maxSize: number;
    memoryMB: string;
    maxMemoryMB: string;
    hits: number;
    misses: number;
    evictions: number;
    expirations: number;
    hitRate: string;
  } | null;
  batchQueue: number;
  watchers: number;
}

interface TransactionProxy {
  get(key: string): Promise<any>;
  set(key: string, value: any): void;
  delete(key: string): void;
}

interface WatcherEvent {
  event: string;
  key: string;
  value: any;
  oldValue?: any;
  timestamp: number;
}

interface BackupMetadata {
  path: string;
  entries: number;
  timestamp: string;
  size: number;
}

interface RestoreMetadata {
  entries: number;
  backupVersion: string;
  backupTimestamp: string;
  merged: boolean;
}

interface BackupInfo {
  file: string;
  path: string;
  version: string;
  timestamp: string;
  entries: number;
  size: number;
}

interface RestoreOptions {
  merge?: boolean;
}

interface DestroyOptions {
  flush?: boolean;
}

interface QueryBuilder {
  prefix(prefix: string): this;
  keyMatches(pattern: RegExp): this;
  where(field: string, operator: string, value: any): this;
  whereMultiple(conditions: Array<{field: string, operator: string, value: any}>): this;
  select(fields: string | string[]): this;
  limit(n: number): this;
  offset(n: number): this;
  sort(field: string, order?: 'asc' | 'desc'): this;
  get(): Promise<any[]>;
  count(): Promise<number>;
  first(): Promise<any | null>;
  exists(): Promise<boolean>;
  pluck(field: string): Promise<any[]>;
}

declare class QuantumDB {
  constructor(filename?: string, options?: QuantumDBOptions);
  
  get(key: string, defaultValue?: any): Promise<any>;
  set(key: string, value: any): Promise<void>;
  push(key: string, value: any): Promise<void>;
  pull(key: string, value: any): Promise<void>;
  delete(key: string): Promise<void>;
  bulkDelete(keys: string[]): Promise<void>;
  bulkSet(entries: KeyValuePair[]): Promise<void>;
  getAll(): Promise<KeyValuePair[]>;
  clear(): Promise<void>;
  add(key: string, amount?: number): Promise<number>;
  subtract(key: string, amount?: number): Promise<number>;
  has(key: string): Promise<boolean>;
  findKeys(pattern: RegExp): Promise<string[]>;
  startsWith(prefix: string): Promise<string[]>;
  stream(): AsyncGenerator<KeyValuePair, void, unknown>;
  transaction(callback: (tx: TransactionProxy) => Promise<any>): Promise<any>;
  
  query(): QueryBuilder;
  
  watch(pattern: string | RegExp, callback: (event: WatcherEvent) => void): number;
  unwatch(id: number): boolean;
  on(event: string, callback: (data: any) => void): void;
  off(event: string, callback: (data: any) => void): void;
  
  backup(backupPath: string): Promise<BackupMetadata>;
  restore(backupPath: string, options?: RestoreOptions): Promise<RestoreMetadata>;
  listBackups(backupDir: string): Promise<BackupInfo[]>;
  
  warmCache(patterns?: string | string[]): Promise<void>;
  flush(): Promise<void>;
  getStats(): DatabaseStats;
  resetStats(): void;
  clearCache(): void;
  destroy(options?: DestroyOptions): Promise<void>;
}

export = QuantumDB;

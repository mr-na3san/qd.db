/**
 * Key-value pair interface
 */
export interface KeyValuePair {
  key: string;
  value: any;
}

/**
 * Query operators for filtering
 */
export type QueryOperator =
  | '='
  | '=='
  | '!='
  | '>'
  | '>='
  | '<'
  | '<='
  | 'contains'
  | 'startsWith'
  | 'endsWith'
  | 'in'
  | 'notIn';

/**
 * Error classes
 */
export class InvalidKey extends Error {
  constructor(message?: string);
}

export class InvalidValue extends Error {
  constructor(message?: string);
}

export class ReadError extends Error {
  constructor(message?: string);
}

export class WriteError extends Error {
  constructor(message?: string);
}

export class NotArrayError extends Error {
  constructor(message?: string);
}

export class InvalidNumberError extends Error {
  constructor(message?: string);
}

export class TransactionError extends Error {
  constructor(message?: string);
}

export class TimeoutError extends Error {
  constructor(message?: string);
}

/**
 * QuantumDB configuration options
 */
export interface QuantumDBOptions {
  cache?: boolean;
  cacheSize?: number;
  cacheTTL?: number;
  cacheMaxMemoryMB?: number;
  batch?: boolean;
  batchSize?: number;
  batchDelay?: number;
  operationTimeout?: number;
  keepConnectionOpen?: boolean;
  timeout?: number;
}

export interface DatabaseStats {
  reads: number;
  writes: number;
  deletes: number;
  errors: number;
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
  performance: {
    avgReadTimeMs: number;
    avgWriteTimeMs: number;
    avgDeleteTimeMs: number;
    totalReadTimeMs: number;
    totalWriteTimeMs: number;
    totalDeleteTimeMs: number;
  };
  throughput: {
    bytesRead: number;
    bytesWritten: number;
    readsPerSecond: string;
    writesPerSecond: string;
  };
}

/**
 * Transaction proxy
 */
export interface TransactionProxy {
  get<T = any>(key: string): Promise<T>;
  set(key: string, value: any): void;
  delete(key: string): void;
}

/**
 * Watcher event
 */
export interface WatcherEvent {
  event: string;
  key: string;
  value: any;
  oldValue?: any;
  timestamp: number;
}

/**
 * Backup metadata
 */
export interface BackupMetadata {
  path: string;
  entries: number;
  timestamp: string;
  size: number;
}

export interface RestoreMetadata {
  entries: number;
  backupVersion: string;
  backupTimestamp: string;
  merged: boolean;
}

export interface BackupInfo {
  file: string;
  path: string;
  version: string;
  timestamp: string;
  entries: number;
  size: number;
}

export interface RestoreOptions {
  merge?: boolean;
  timeout?: number;
}

export interface DestroyOptions {
  flush?: boolean;
}

/**
 * Query builder interface
 */
export interface QueryBuilder<T = any> {
  prefix(prefix: string): this;
  keyMatches(pattern: RegExp): this;

  where(field: string, operator: QueryOperator, value: any): this;

  whereMultiple(
    conditions: Array<{
      field: string;
      operator: QueryOperator;
      value: any;
    }>
  ): this;

  select(fields: string | string[]): this;
  limit(n: number): this;
  offset(n: number): this;
  sort(field: string, order?: 'asc' | 'desc'): this;

  get(): Promise<T[]>;
  count(): Promise<number>;
  first(): Promise<T | null>;
  exists(): Promise<boolean>;
  pluck(field: string): Promise<any[]>;
}

/**
 * QuantumDB class
 */
declare class QuantumDB {
  constructor(filename?: string, options?: QuantumDBOptions);

  get<T>(key: string): Promise<T | undefined>;
  get<T>(key: string, defaultValue: T): Promise<T>;

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

  stream(): AsyncIterableIterator<KeyValuePair>;

  transaction(callback: (tx: TransactionProxy) => Promise<any>): Promise<any>;

  query<T = any>(): QueryBuilder<T>;

  watch(pattern: string | RegExp, callback: (event: WatcherEvent) => void): number;
  unwatch(id: number): boolean;

  on(event: string, callback: (data: any) => void): void;
  off(event: string, callback: (data: any) => void): void;

  backup(path: string): Promise<BackupMetadata>;
  restore(path: string, options?: RestoreOptions): Promise<RestoreMetadata>;
  listBackups(dir: string): Promise<BackupInfo[]>;

  warmCache(patterns?: string | string[] | null): Promise<void>;
  flush(): Promise<void>;

  getStats(): DatabaseStats;
  resetStats(): void;
  clearCache(): void;

  destroy(options?: DestroyOptions): Promise<void>;
}

/**
 * Error namespace (compatibility-safe)
 */
export namespace Errors {
  export {
    InvalidKey,
    InvalidValue,
    ReadError,
    WriteError,
    NotArrayError,
    InvalidNumberError,
    TransactionError,
    TimeoutError
  };
}

export = QuantumDB;
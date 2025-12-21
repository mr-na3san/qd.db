interface KeyValuePair {
  key: string;
  value: any;
}

interface QuantumDBOptions {
  cache?: boolean;
  cacheSize?: number;
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
    hits: number;
    misses: number;
    hitRate: string;
  } | null;
  batchQueue: number;
}

interface TransactionProxy {
  get(key: string): Promise<any>;
  set(key: string, value: any): void;
  delete(key: string): void;
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
  flush(): Promise<void>;
  getStats(): DatabaseStats;
  resetStats(): void;
  clearCache(): void;
  destroy(): void;
}

export = QuantumDB;

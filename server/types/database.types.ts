// Database types for server use
// Note: These types are duplicated from src/types/shared/database.types.ts
// This is intentional to avoid cross-directory imports between client and server code
// The server extends these types with additional database-specific interfaces

// Database connection configuration
export interface DatabaseConfig {
  path: string;
  options?: DatabaseOptions;
}

export interface DatabaseOptions {
  readonly?: boolean;
  fileMustExist?: boolean;
  timeout?: number;
  verbose?: ((message?: any, ...additionalArgs: any[]) => void) | undefined;
}

// Query result interfaces
export interface QueryResult {
  changes: number;
  lastInsertRowid: number;
}

export interface SelectResult<T = any> {
  data: T[];
  total?: number;
}

// Pagination and filtering
export interface PaginationOptions {
  limit?: number;
  offset?: number;
  page?: number;
}

export interface SortOptions {
  column: string;
  direction: 'ASC' | 'DESC';
}

export interface FilterOptions {
  [key: string]: any;
}

export interface QueryOptions extends PaginationOptions {
  sort?: SortOptions[];
  filters?: FilterOptions;
}

// Transaction interface
export interface TransactionCallback<T = any> {
  (): Promise<T>;
}

// Abstract database interface
export interface IDatabase {
  // Connection management
  connect(config: DatabaseConfig): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;

  // Query execution
  executeQuery(query: string, params?: any[]): Promise<QueryResult>;
  getOne<T = any>(query: string, params?: any[]): Promise<T | null>;
  getMany<T = any>(query: string, params?: any[]): Promise<T[]>;
  getWithPagination<T = any>(query: string, params?: any[], options?: QueryOptions): Promise<SelectResult<T>>;

  // Transaction support
  beginTransaction(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  transaction<T>(callback: () => Promise<T>): Promise<T>;

  // Schema operations
  createTable(tableName: string, definition: string): Promise<void>;
  dropTable(tableName: string): Promise<void>;
  tableExists(tableName: string): Promise<boolean>;

  // Utility operations
  backup(path: string): Promise<void>;
  vacuum(): Promise<void>;
  pragma(setting: string, value?: string | number): Promise<any>;
}

// Database service options
export interface ServiceOptions extends QueryOptions {
  includeDeleted?: boolean;
  includeArchived?: boolean;
}

// Schema definition interfaces
export interface TableSchema {
  name: string;
  columns: ColumnDefinition[];
  constraints?: string[];
  indexes?: IndexDefinition[];
}

export interface ColumnDefinition {
  name: string;
  type: 'TEXT' | 'INTEGER' | 'REAL' | 'BLOB' | 'NUMERIC' | 'TIMESTAMPTZ' | 'BOOLEAN' | 'JSONB' | 'BIGINT';
  constraints?: string[];
}

export interface IndexDefinition {
  name: string;
  columns: string[];
  unique?: boolean;
}

// Seed data interface
export interface SeedData {
  table: string;
  data: Record<string, any>[];
  truncate?: boolean;
}

// SQL parameter types for query safety
export type SQLParameter = string | number | null | boolean;
export type SQLParams = SQLParameter[];
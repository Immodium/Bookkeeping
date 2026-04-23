import type {
  DatabaseConfig,
  IDatabase,
  QueryOptions,
  QueryResult,
  SelectResult,
  TransactionCallback
} from '../types/database.types.js';

/**
 * Postgres database adapter scaffold.
 * This keeps the same IDatabase contract while we migrate from SQLite.
 */
export class PostgresDatabase implements IDatabase {
  private connected = false;

  async connect(config: DatabaseConfig): Promise<void> {
    void config;
    this.connected = true;
    console.warn('PostgresDatabase scaffold initialized; adapter implementation is pending.');
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  executeQuery(query: string, params: unknown[] = []): QueryResult {
    void query;
    void params;
    throw new Error('PostgresDatabase scaffold is not implemented yet.');
  }

  getOne<T = Record<string, unknown>>(query: string, params: unknown[] = []): T | null {
    void query;
    void params;
    throw new Error('PostgresDatabase scaffold is not implemented yet.');
  }

  getMany<T = Record<string, unknown>>(query: string, params: unknown[] = []): T[] {
    void query;
    void params;
    throw new Error('PostgresDatabase scaffold is not implemented yet.');
  }

  getWithPagination<T = Record<string, unknown>>(
    query: string,
    params: unknown[] = [],
    options: QueryOptions = {}
  ): SelectResult<T> {
    void query;
    void params;
    void options;
    throw new Error('PostgresDatabase scaffold is not implemented yet.');
  }

  beginTransaction(): void {
    throw new Error('PostgresDatabase scaffold is not implemented yet.');
  }

  commit(): void {
    throw new Error('PostgresDatabase scaffold is not implemented yet.');
  }

  rollback(): void {
    throw new Error('PostgresDatabase scaffold is not implemented yet.');
  }

  transaction<T>(callback: TransactionCallback<T>): T {
    void callback;
    throw new Error('PostgresDatabase scaffold is not implemented yet.');
  }

  createTable(tableName: string, definition: string): void {
    void tableName;
    void definition;
    throw new Error('PostgresDatabase scaffold is not implemented yet.');
  }

  dropTable(tableName: string): void {
    void tableName;
    throw new Error('PostgresDatabase scaffold is not implemented yet.');
  }

  tableExists(tableName: string): boolean {
    void tableName;
    throw new Error('PostgresDatabase scaffold is not implemented yet.');
  }

  backup(path: string): void {
    void path;
    throw new Error('PostgresDatabase scaffold is not implemented yet.');
  }

  vacuum(): void {
    throw new Error('PostgresDatabase scaffold is not implemented yet.');
  }

  pragma(setting: string, value?: string | number): unknown {
    void setting;
    void value;
    throw new Error('PostgresDatabase does not support pragma calls.');
  }
}

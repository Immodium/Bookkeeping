// PostgreSQL Database Implementation
// Implements the abstract database interface with PostgreSQL-specific functionality

import { AsyncLocalStorage } from 'async_hooks';
import { Pool, PoolClient } from 'pg';
import type {
  IDatabase,
  DatabaseConfig,
  QueryResult,
  SelectResult,
  QueryOptions,
} from '../types/database.types.js';
import { databaseConfig } from '../config/index.js';

// Transaction context storage - allows nested calls to share same client
const transactionContext = new AsyncLocalStorage<PoolClient>();

/**
 * Prepare a query for PostgreSQL:
 * - Replace ? params with $1, $2...
 * - Replace SQLite datetime functions with PostgreSQL equivalents
 * - Replace INSERT OR IGNORE with INSERT ... ON CONFLICT DO NOTHING
 * - Replace json_array() with json_build_array()
 * - Replace LIKE ? with ILIKE $n
 */
function prepareQuery(sql: string, params: any[] = []): { sql: string; values: any[] } {
  let prepared = sql;

  // Convert INSERT OR IGNORE INTO tableName ... to INSERT INTO tableName ... ON CONFLICT DO NOTHING
  if (/INSERT\s+OR\s+IGNORE\s+INTO/i.test(prepared)) {
    prepared = prepared.replace(/INSERT\s+OR\s+IGNORE\s+INTO/gi, 'INSERT INTO');
    // Append ON CONFLICT DO NOTHING if not already present
    if (!/ON\s+CONFLICT/i.test(prepared)) {
      // Find the end of the INSERT statement (after VALUES clause or subquery)
      prepared = prepared.trimEnd();
      if (!prepared.endsWith(';')) {
        prepared = prepared + ' ON CONFLICT DO NOTHING';
      }
    }
  }

  // Convert datetime('now', '+X unit') → NOW() + INTERVAL 'X unit'
  prepared = prepared.replace(/datetime\s*\(\s*'now'\s*,\s*'([^']+)'\s*\)/gi, (_match, interval) => {
    // interval might be '+30 days' or '-7 days' etc.
    const trimmed = interval.trim();
    // Extract sign and amount/unit
    const signMatch = trimmed.match(/^([+-]?\d+)\s+(\w+)$/);
    if (signMatch) {
      const amount = signMatch[1];
      const unit = signMatch[2];
      if (amount.startsWith('-')) {
        return `NOW() - INTERVAL '${amount.substring(1)} ${unit}'`;
      } else {
        const cleanAmount = amount.startsWith('+') ? amount.substring(1) : amount;
        return `NOW() + INTERVAL '${cleanAmount} ${unit}'`;
      }
    }
    return `NOW() + INTERVAL '${trimmed}'`;
  });

  // Convert datetime('now') → NOW()
  prepared = prepared.replace(/datetime\s*\(\s*'now'\s*\)/gi, 'NOW()');
  prepared = prepared.replace(/DATETIME\s*\(\s*'now'\s*\)/g, 'NOW()');

  // Convert DEFAULT (datetime('now')) in CREATE TABLE → DEFAULT NOW()
  prepared = prepared.replace(/DEFAULT\s+\(datetime\('now'\)\)/gi, 'DEFAULT NOW()');

  // Convert json_array( → json_build_array(
  prepared = prepared.replace(/\bjson_array\s*\(/gi, 'json_build_array(');

  // Convert INTEGER PRIMARY KEY AUTOINCREMENT → SERIAL PRIMARY KEY
  prepared = prepared.replace(/INTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT/gi, 'SERIAL PRIMARY KEY');

  // Convert SQLite column type DATETIME → TIMESTAMPTZ
  // Only replace DATETIME when used as a column type (preceded by whitespace or comma, followed by space/constraint/comma)
  prepared = prepared.replace(/\bDATETIME\b/g, 'TIMESTAMPTZ');

  // Replace ? placeholders with $1, $2, ... while also handling LIKE -> ILIKE
  let paramIndex = 1;
  let result = '';
  let i = 0;
  while (i < prepared.length) {
    if (prepared[i] === '?') {
      result += `$${paramIndex}`;
      paramIndex++;
      i++;
    } else if (prepared[i] === "'" ) {
      // Skip string literals to avoid replacing ? inside strings
      result += prepared[i];
      i++;
      while (i < prepared.length) {
        result += prepared[i];
        if (prepared[i] === "'" && prepared[i - 1] !== '\\') {
          i++;
          break;
        }
        i++;
      }
    } else {
      result += prepared[i];
      i++;
    }
  }
  prepared = result;

  // Convert LIKE $n to ILIKE $n for case-insensitive matching
  prepared = prepared.replace(/\bLIKE\s+(\$\d+)/gi, 'ILIKE $1');

  // Remove sqlite_master references (will fail gracefully in catch blocks)
  // Keep as is - callers should wrap in try/catch

  return { sql: prepared, values: params };
}

/**
 * PostgreSQL implementation of the abstract database interface
 */
export class PostgreSQLDatabase implements IDatabase {
  private pool: Pool;
  private _connected = false;
  private connectionTime = 0;
  private queryCount = 0;

  constructor(connectionString?: string) {
    const connStr = connectionString || databaseConfig.databaseUrl;
    if (!connStr) {
      throw new Error('DATABASE_URL environment variable is required for PostgreSQL');
    }

    this.pool = new Pool({
      connectionString: connStr,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
      ssl: connStr.includes('sslmode=require') || (process.env.NODE_ENV === 'production' && !connStr.includes('localhost'))
        ? { rejectUnauthorized: false }
        : undefined
    });
  }

  async connect(_config: DatabaseConfig): Promise<void> {
    try {
      // Test connection
      const client = await this.pool.connect();
      client.release();
      this._connected = true;
      this.connectionTime = Date.now();
      if (process.env.NODE_ENV === 'development') {
        console.log('PostgreSQL connected');
      }
    } catch (error) {
      this._connected = false;
      throw new Error(`Failed to connect to PostgreSQL: ${(error as Error).message}`);
    }
  }

  async disconnect(): Promise<void> {
    await this.pool.end();
    this._connected = false;
  }

  isConnected(): boolean {
    return this._connected;
  }

  async executeQuery(query: string, params: any[] = []): Promise<QueryResult> {
    this.queryCount++;
    const client = transactionContext.getStore();
    const { sql, values } = prepareQuery(query, params);

    try {
      // For INSERT statements without RETURNING, add RETURNING id
      let finalSql = sql;
      if (/^\s*INSERT\s+INTO/i.test(sql) && !/RETURNING/i.test(sql)) {
        finalSql = sql.trimEnd().replace(/;?\s*$/, '') + ' RETURNING id';
      }

      const pgResult = client
        ? await client.query(finalSql, values)
        : await this.pool.query(finalSql, values);

      return {
        changes: pgResult.rowCount ?? 0,
        lastInsertRowid: pgResult.rows[0]?.id ?? 0
      };
    } catch (error) {
      // If RETURNING id failed (e.g. trigger, no id column), retry without RETURNING
      const errMsg = (error as Error).message || '';
      if (errMsg.includes('RETURNING') || errMsg.includes('column "id"')) {
        const pgResult = client
          ? await client.query(sql, values)
          : await this.pool.query(sql, values);
        return {
          changes: pgResult.rowCount ?? 0,
          lastInsertRowid: 0
        };
      }
      console.error('PostgreSQL query error:', error);
      console.error('Query:', query);
      console.error('Params:', params);
      throw new Error(`Database operation failed: ${(error as Error).message}`);
    }
  }

  async getOne<T = Record<string, unknown>>(query: string, params: unknown[] = []): Promise<T | null> {
    this.queryCount++;
    const client = transactionContext.getStore();
    const { sql, values } = prepareQuery(query, params as any[]);

    try {
      const pgResult = client
        ? await client.query(sql, values)
        : await this.pool.query(sql, values);
      return (pgResult.rows[0] as T) || null;
    } catch (error) {
      console.error('PostgreSQL getOne error:', error);
      console.error('Query:', query);
      console.error('Params:', params);
      throw new Error(`Database fetch operation failed: ${(error as Error).message}`);
    }
  }

  async getMany<T = Record<string, unknown>>(query: string, params: unknown[] = []): Promise<T[]> {
    this.queryCount++;
    const client = transactionContext.getStore();
    const { sql, values } = prepareQuery(query, params as any[]);

    try {
      const pgResult = client
        ? await client.query(sql, values)
        : await this.pool.query(sql, values);
      return pgResult.rows as T[];
    } catch (error) {
      console.error('PostgreSQL getMany error:', error);
      console.error('Query:', query);
      console.error('Params:', params);
      throw new Error(`Database fetch operation failed: ${(error as Error).message}`);
    }
  }

  async getWithPagination<T = Record<string, unknown>>(
    query: string,
    params: unknown[] = [],
    options: QueryOptions = {}
  ): Promise<SelectResult<T>> {
    const { limit = 50, offset = 0, page, sort = [] } = options;
    const actualOffset = page ? (page - 1) * limit : offset;

    let finalQuery = query;
    if (sort.length > 0) {
      const sortClause = sort.map(s => `${s.column} ${s.direction}`).join(', ');
      finalQuery += ` ORDER BY ${sortClause}`;
    }
    finalQuery += ` LIMIT ${limit} OFFSET ${actualOffset}`;

    const data = await this.getMany<T>(finalQuery, params);

    const countQuery = `SELECT COUNT(*) as total FROM (${query}) as count_query`;
    const totalResult = await this.getOne<{ total: string | number }>(countQuery, params);
    const total = Number(totalResult?.total || 0);

    return { data, total };
  }

  async beginTransaction(): Promise<void> {
    // No-op for AsyncLocalStorage approach; use transaction() instead
  }

  async commit(): Promise<void> {
    // No-op for AsyncLocalStorage approach
  }

  async rollback(): Promise<void> {
    // No-op for AsyncLocalStorage approach
  }

  async transaction<T>(callback: () => Promise<T>): Promise<T> {
    const existingClient = transactionContext.getStore();
    if (existingClient) {
      // Already in a transaction, just run the callback
      return callback();
    }

    const client = await this.pool.connect();
    return transactionContext.run(client, async () => {
      try {
        await client.query('BEGIN');
        const result = await callback();
        await client.query('COMMIT');
        return result;
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    });
  }

  async createTable(tableName: string, definition: string): Promise<void> {
    const { sql } = prepareQuery(`CREATE TABLE IF NOT EXISTS ${tableName} (${definition})`);
    const client = transactionContext.getStore();
    try {
      if (client) {
        await client.query(sql);
      } else {
        await this.pool.query(sql);
      }
    } catch (error) {
      throw new Error(`Failed to create table ${tableName}: ${(error as Error).message}`);
    }
  }

  async dropTable(tableName: string): Promise<void> {
    await this.executeQuery(`DROP TABLE IF EXISTS ${tableName}`);
  }

  async tableExists(tableName: string): Promise<boolean> {
    const result = await this.getOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1`,
      [tableName]
    );
    return Number(result?.count || 0) > 0;
  }

  async backup(_path: string): Promise<void> {
    console.warn('PostgreSQL backup must be done via pg_dump, not via application');
  }

  async vacuum(): Promise<void> {
    await this.pool.query('VACUUM');
  }

  async pragma(_setting: string, _value?: string | number): Promise<any> {
    // PostgreSQL doesn't have PRAGMA - silently ignore
    return null;
  }

  getHealth() {
    const uptime = Date.now() - this.connectionTime;
    return {
      isConnected: this._connected,
      uptime,
      totalQueries: this.queryCount,
      avgQueryTime: this.queryCount > 0 ? uptime / this.queryCount : 0,
      diskUsage: 0
    };
  }
}

// Only export a singleton if DATABASE_URL is set
export const postgresDatabase = databaseConfig.usePostgres ? new PostgreSQLDatabase() : null;

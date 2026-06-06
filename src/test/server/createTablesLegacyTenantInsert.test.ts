import { describe, expect, it, vi } from 'vitest';
import { createTables } from '../../../server/database/schemas/tables.schema.js';
import { seedBootstrapData } from '../../../server/database/seeds/initial.seed.js';
import type { IDatabase, QueryResult, SelectResult } from '../../../server/types/database.types.js';

const createMockDatabase = (executeQuery: ReturnType<typeof vi.fn>): IDatabase => ({
  connect: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn().mockResolvedValue(undefined),
  isConnected: vi.fn().mockReturnValue(true),
  executeQuery: executeQuery as unknown as IDatabase['executeQuery'],
  getOne: vi.fn().mockResolvedValue(null),
  getMany: vi.fn().mockResolvedValue([]),
  getWithPagination: vi.fn().mockResolvedValue({ data: [], total: 0 } as SelectResult),
  beginTransaction: vi.fn().mockResolvedValue(undefined),
  commit: vi.fn().mockResolvedValue(undefined),
  rollback: vi.fn().mockResolvedValue(undefined),
  transaction: vi.fn().mockImplementation(async <T>(callback: () => Promise<T>) => callback()),
  createTable: vi.fn().mockResolvedValue(undefined),
  dropTable: vi.fn().mockResolvedValue(undefined),
  tableExists: vi.fn().mockResolvedValue(false),
  backup: vi.fn().mockResolvedValue(undefined),
  vacuum: vi.fn().mockResolvedValue(undefined),
  pragma: vi.fn().mockResolvedValue(null),
});

describe('database bootstrap data seeding', () => {
  it('createTables no longer seeds tenant rows (handled by seedBootstrapData after migrations)', async () => {
    const executedSql: string[] = [];
    const executeQuery = vi.fn().mockImplementation(async (sql: string) => {
      executedSql.push(sql);
      return { changes: 1, lastInsertRowid: 1 } as QueryResult;
    });

    const db = createMockDatabase(executeQuery);

    await createTables(db);

    expect(executedSql.some((sql) => sql.includes('INSERT INTO tenants'))).toBe(false);
  });

  it('seedBootstrapData inserts the default tenant using the current schema (with public_id)', async () => {
    const executedSql: string[] = [];
    const executeQuery = vi.fn().mockImplementation(async (sql: string) => {
      executedSql.push(sql);
      return { changes: 1, lastInsertRowid: 1 } as QueryResult;
    });

    const db = createMockDatabase(executeQuery);

    await seedBootstrapData(db);

    expect(
      executedSql.some((sql) => sql.includes('INSERT INTO tenants (id, public_id, name, slug, status)'))
    ).toBe(true);
    // No catch-and-ignore fallback to a public_id-less insert anymore.
    expect(executedSql.some((sql) => sql.includes('INSERT INTO tenants (id, name, slug, status)'))).toBe(false);
  });
});

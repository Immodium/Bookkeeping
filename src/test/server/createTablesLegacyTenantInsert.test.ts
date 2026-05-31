import { describe, expect, it, vi } from 'vitest';
import { createTables } from '../../../server/database/schemas/tables.schema.js';
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

describe('createTables tenant bootstrap compatibility', () => {
  it('falls back to legacy tenant insert when public_id column is missing', async () => {
    const executedSql: string[] = [];
    const executeQuery = vi.fn().mockImplementation(async (sql: string) => {
      executedSql.push(sql);

      if (sql.includes('INSERT INTO tenants (id, public_id, name, slug, status)')) {
        throw new Error('column "public_id" of relation "tenants" does not exist');
      }

      return { changes: 1, lastInsertRowid: 1 } as QueryResult;
    });

    const db = createMockDatabase(executeQuery);

    await createTables(db);

    expect(executedSql.some((sql) => sql.includes('INSERT INTO tenants (id, name, slug, status)'))).toBe(true);
  });
});

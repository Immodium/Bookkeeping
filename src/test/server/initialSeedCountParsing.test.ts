import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  initializeAdminUser,
  initializeCounters,
  initializeSettings,
} from '../../../server/database/seeds/initial.seed.js';
import type { IDatabase, QueryResult, SelectResult } from '../../../server/types/database.types.js';

type MockDatabaseOptions = {
  getOneResult?: unknown;
};

const createMockDatabase = (options: MockDatabaseOptions = {}): {
  db: IDatabase;
  getOne: ReturnType<typeof vi.fn>;
  executeQuery: ReturnType<typeof vi.fn>;
} => {
  const getOne = vi.fn().mockResolvedValue(options.getOneResult ?? null);
  const executeQuery = vi.fn().mockResolvedValue({ changes: 1, lastInsertRowid: 1 } as QueryResult);

  const db: IDatabase = {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    isConnected: vi.fn().mockReturnValue(true),
    executeQuery,
    getOne,
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
  };

  return { db, getOne, executeQuery };
};

describe('seed COUNT(*) parsing', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubEnv('ADMIN_PASSWORD', 'password');
  });

  it('creates admin user when PostgreSQL returns COUNT(*) as string', async () => {
    const { db, executeQuery } = createMockDatabase({ getOneResult: { count: '0' } });

    await initializeAdminUser(db);

    expect(executeQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO users'),
      expect.any(Array),
    );
  });

  it('initializes counters when PostgreSQL returns COUNT(*) as string', async () => {
    const { db, executeQuery } = createMockDatabase({ getOneResult: { count: '0' } });

    await initializeCounters(db);

    expect(executeQuery).toHaveBeenCalled();
    expect(executeQuery.mock.calls[0][0]).toContain('INSERT INTO counters');
  });

  it('initializes settings when PostgreSQL returns COUNT(*) as string', async () => {
    const { db, executeQuery } = createMockDatabase({ getOneResult: { count: '0' } });

    await initializeSettings(db);

    expect(executeQuery).toHaveBeenCalled();
    expect(executeQuery.mock.calls[0][0]).toContain('INSERT INTO settings');
  });
});

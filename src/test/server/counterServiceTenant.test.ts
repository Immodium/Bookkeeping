import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../server/core/DatabaseService.js', () => ({
  databaseService: {
    getOne: vi.fn(),
    getMany: vi.fn(),
    executeQuery: vi.fn(),
    executeTransaction: vi.fn((callback: () => void) => callback())
  }
}));

import { counterService } from '../../../server/services/CounterService.js';
import { databaseService } from '../../../server/core/DatabaseService.js';

describe('CounterService tenant scoping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates tenant-scoped counter name for next ID', async () => {
    const getOneMock = databaseService.getOne as unknown as ReturnType<typeof vi.fn>;
    getOneMock.mockReturnValue({ value: 4 });

    const executeMock = databaseService.executeQuery as unknown as ReturnType<typeof vi.fn>;
    executeMock.mockReturnValue({ changes: 1, lastInsertRowid: 1 });

    const nextId = await counterService.getNextCounterId('invoices', 2);

    expect(nextId).toBe(5);
    expect(executeMock).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE counters'),
      [5, 2, 'invoices__tenant_2']
    );
  });

  it('returns de-scoped names from tenant counters list', async () => {
    const getManyMock = databaseService.getMany as unknown as ReturnType<typeof vi.fn>;
    getManyMock.mockReturnValue([{ name: 'reports__tenant_2', value: 7 }]);

    const counters = await counterService.getAllCounters(2);

    expect(counters).toEqual([{ name: 'reports', value: 7 }]);
  });
});

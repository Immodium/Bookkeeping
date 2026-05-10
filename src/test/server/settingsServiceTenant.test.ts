import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../server/core/DatabaseService.js', () => ({
  databaseService: {
    getOne: vi.fn(),
    getMany: vi.fn(),
    executeQuery: vi.fn(),
    executeTransaction: vi.fn((callback: () => void) => callback())
  }
}));

import { settingsService } from '../../../server/services/SettingsService.js';
import { databaseService } from '../../../server/core/DatabaseService.js';

describe('SettingsService tenant-safe upsert behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates existing tenant setting without replace semantics', async () => {
    const executeMock = databaseService.executeQuery as unknown as ReturnType<typeof vi.fn>;
    executeMock.mockReturnValue({ changes: 1, lastInsertRowid: 0 });

    await settingsService.saveSetting('timezone', 'UTC', 'general', 2);

    expect(executeMock).toHaveBeenCalledTimes(1);
    expect(executeMock).toHaveBeenCalledWith(
      expect.stringContaining('WHERE tenant_id = ? AND key = ?'),
      ['UTC', 'general', 2, 'general.timezone']
    );
  });

  it('inserts new tenant setting when update affects zero rows', async () => {
    const executeMock = databaseService.executeQuery as unknown as ReturnType<typeof vi.fn>;
    executeMock
      .mockReturnValueOnce({ changes: 0, lastInsertRowid: 0 })
      .mockReturnValueOnce({ changes: 1, lastInsertRowid: 10 });

    await settingsService.saveSetting('invoice_prefix', 'INV', 'general', 3);

    expect(executeMock).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('UPDATE settings SET value = ?, category = ?'),
      ['INV', 'general', 3, 'general.invoice_prefix']
    );
    expect(executeMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('INSERT INTO settings'),
      [3, 'general.invoice_prefix', 'INV', 'general']
    );
  });
});

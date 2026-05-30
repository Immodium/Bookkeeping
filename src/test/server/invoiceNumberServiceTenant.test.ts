import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../server/core/DatabaseService.js', () => ({
  databaseService: {
    getOne: vi.fn(),
    executeQuery: vi.fn()
  }
}));

vi.mock('../../../server/services/SettingsService.js', () => ({
  settingsService: {
    getSettingByKey: vi.fn()
  }
}));

import { invoiceNumberService } from '../../../server/services/InvoiceNumberService.js';
import { databaseService } from '../../../server/core/DatabaseService.js';
import { settingsService } from '../../../server/services/SettingsService.js';

describe('InvoiceNumberService tenant scoping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('generates tenant-specific invoice numbers and counter keys', async () => {
    const settingsMock = settingsService.getSettingByKey as unknown as ReturnType<typeof vi.fn>;
    settingsMock.mockResolvedValue({ prefix: 'INV' });

    const dbGetOneMock = databaseService.getOne as unknown as ReturnType<typeof vi.fn>;
    dbGetOneMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ value: 1 });

    const number = await invoiceNumberService.generateInvoiceNumber(2);

    expect(number).toMatch(/^INV-T2-\d{6}-0001$/);
    expect(dbGetOneMock).toHaveBeenCalledWith(
      expect.stringContaining('ON CONFLICT (tenant_id, name)'),
      expect.arrayContaining([2, 'invoice_counter__tenant_2'])
    );
  });

  it('previews next tenant-specific number without incrementing', async () => {
    const settingsMock = settingsService.getSettingByKey as unknown as ReturnType<typeof vi.fn>;
    settingsMock.mockResolvedValue({ prefix: 'INV' });

    const dbGetOneMock = databaseService.getOne as unknown as ReturnType<typeof vi.fn>;
    dbGetOneMock.mockResolvedValue({ value: 9 });

    const preview = await invoiceNumberService.getNextInvoiceNumber(3);

    expect(preview).toMatch(/^INV-T3-\d{6}-0010$/);
  });

  it('checks uniqueness scoped by tenant id', async () => {
    const dbGetOneMock = databaseService.getOne as unknown as ReturnType<typeof vi.fn>;
    dbGetOneMock.mockResolvedValue(null);

    const unique = await invoiceNumberService.isInvoiceNumberUnique('INV-202605-0001', 4);

    expect(unique).toBe(true);
    expect(dbGetOneMock).toHaveBeenCalledWith(
      expect.stringContaining('tenant_id = ?'),
      [4, 'INV-202605-0001']
    );
  });
});

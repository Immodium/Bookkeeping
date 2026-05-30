import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../server/core/DatabaseService.js', () => ({
  databaseService: {
    getOne: vi.fn(),
    getMany: vi.fn(),
    getNextId: vi.fn(),
    executeQuery: vi.fn(),
    executeTransaction: vi.fn((callback: () => void) => callback()),
    tableExists: vi.fn().mockReturnValue(false)
  }
}));

import { tenantService } from '../../../server/services/TenantService.js';
import { databaseService } from '../../../server/core/DatabaseService.js';

describe('TenantService provisioning flows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a tenant with bootstrapped admin and tenant counters', async () => {
    const getOneMock = databaseService.getOne as unknown as ReturnType<typeof vi.fn>;
    getOneMock.mockReturnValue(null);

    const getNextIdMock = databaseService.getNextId as unknown as ReturnType<typeof vi.fn>;
    getNextIdMock.mockReturnValue(42);

    const executeQueryMock = databaseService.executeQuery as unknown as ReturnType<typeof vi.fn>;
    executeQueryMock.mockImplementation((query: string) => {
      if (query.includes('INSERT INTO tenants')) {
        return { changes: 1, lastInsertRowid: 7 };
      }
      return { changes: 1, lastInsertRowid: 0 };
    });

    const result = await tenantService.createTenant({
      name: 'Acme Workspace',
      admin: {
        name: 'Acme Admin',
        email: 'admin@acme.test',
        password: 'StrongPass1!'
      }
    });

    expect(result).toMatchObject({
      tenantId: 7,
      adminUserId: 42,
      slug: 'acme-workspace'
    });
    expect(result.tenantPublicId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
    expect(executeQueryMock).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO tenants'),
      expect.arrayContaining(['Acme Workspace', 'acme-workspace'])
    );
    expect(executeQueryMock).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO users'),
      expect.arrayContaining([42, 7, 'Acme Admin', 'admin@acme.test'])
    );
  });

  it('prevents suspending the default platform tenant', async () => {
    await expect(tenantService.suspendTenant(1)).rejects.toThrow(
      'Default platform tenant cannot be suspended or deleted'
    );
  });

  it('blocks admin bootstrap for non-active tenants', async () => {
    const getOneMock = databaseService.getOne as unknown as ReturnType<typeof vi.fn>;
    getOneMock.mockReturnValue({
      id: 3,
      name: 'Suspended Tenant',
      slug: 'suspended-tenant',
      status: 'suspended',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    await expect(
      tenantService.bootstrapTenantAdmin(3, {
        name: 'Tenant Admin',
        email: 'owner@tenant.test',
        password: 'StrongPass1!'
      })
    ).rejects.toThrow('Cannot bootstrap admin for non-active tenant');
  });
});

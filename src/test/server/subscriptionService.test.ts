import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../server/core/DatabaseService.js', () => ({
  databaseService: {
    getOne: vi.fn(),
    getMany: vi.fn(),
    executeQuery: vi.fn(),
    executeTransaction: vi.fn((callback: () => void) => callback()),
    tableExists: vi.fn()
  }
}));

import { subscriptionService } from '../../../server/services/SubscriptionService.js';
import { databaseService } from '../../../server/core/DatabaseService.js';

describe('SubscriptionService entitlement lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('merges plan entitlements with tenant overrides', async () => {
    const getOneMock = databaseService.getOne as unknown as ReturnType<typeof vi.fn>;
    getOneMock.mockReturnValue({
      id: 1,
      tenant_id: 2,
      plan_id: 3,
      status: 'active',
      cancel_at_period_end: 0,
      provider: 'internal',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      plan_code: 'starter',
      plan_name: 'Starter',
      features_json: JSON.stringify({
        'reports.enabled': true,
        'billing.max_users': 10
      }),
      metadata_json: '{}'
    });

    const getManyMock = databaseService.getMany as unknown as ReturnType<typeof vi.fn>;
    getManyMock.mockReturnValue([
      { key: 'reports.enabled', value: 'false' },
      { key: 'billing.max_users', value: '25' }
    ]);

    const entitlements = await subscriptionService.getTenantEntitlements(2);

    expect(entitlements).toEqual({
      'reports.enabled': false,
      'billing.max_users': 25
    });
  });

  it('updates existing tenant subscription in place', async () => {
    const getOneMock = databaseService.getOne as unknown as ReturnType<typeof vi.fn>;
    getOneMock
      .mockReturnValueOnce({
        id: 99,
        code: 'starter',
        name: 'Starter',
        status: 'active',
        price_cents: 2900,
        currency: 'usd',
        billing_interval: 'monthly',
        trial_days: 0,
        features_json: '{}'
      })
      .mockReturnValueOnce({ id: 123 });

    const executeQueryMock = databaseService.executeQuery as unknown as ReturnType<typeof vi.fn>;
    executeQueryMock.mockReturnValue({ changes: 1, lastInsertRowid: 0 });

    const updated = await subscriptionService.setTenantSubscription(3, {
      planCode: 'starter',
      status: 'active',
      cancelAtPeriodEnd: false
    });

    expect(updated).toBe(true);
    expect(executeQueryMock).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE tenant_subscriptions'),
      expect.arrayContaining([99, 'active', 0, 3])
    );
  });

  it('skips bootstrap when subscription tables are unavailable', async () => {
    const tableExistsMock = databaseService.tableExists as unknown as ReturnType<typeof vi.fn>;
    tableExistsMock.mockReturnValue(false);

    await subscriptionService.bootstrapTenantSubscription(4);

    const executeQueryMock = databaseService.executeQuery as unknown as ReturnType<typeof vi.fn>;
    expect(executeQueryMock).not.toHaveBeenCalled();
  });

  it('normalizes webhook status and applies suspension update', async () => {
    const getOneMock = databaseService.getOne as unknown as ReturnType<typeof vi.fn>;
    getOneMock
      .mockReturnValueOnce({
        id: 88,
        code: 'starter',
        name: 'Starter',
        status: 'active',
        price_cents: 2900,
        currency: 'usd',
        billing_interval: 'monthly',
        trial_days: 0,
        features_json: '{}'
      })
      .mockReturnValueOnce({ id: 321 });

    const executeQueryMock = databaseService.executeQuery as unknown as ReturnType<typeof vi.fn>;
    executeQueryMock.mockReturnValue({ changes: 1, lastInsertRowid: 0 });

    const result = await subscriptionService.syncSubscriptionFromWebhook({
      provider: 'stripe',
      eventType: 'customer.subscription.updated',
      data: {
        tenantId: 9,
        planCode: 'starter',
        status: 'cancelled'
      }
    });

    expect(result).toEqual({ tenantId: 9 });
    expect(executeQueryMock).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE tenant_subscriptions'),
      expect.arrayContaining([88, 'canceled'])
    );
    expect(executeQueryMock).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE tenants SET status = 'suspended'"),
      [9]
    );
  });
});

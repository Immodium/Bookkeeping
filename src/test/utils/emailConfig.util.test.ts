import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authenticatedFetchMock, sqliteServiceMock } = vi.hoisted(() => ({
  authenticatedFetchMock: vi.fn(),
  sqliteServiceMock: {
    isReady: vi.fn(),
    initialize: vi.fn(),
    getSetting: vi.fn()
  }
}));

vi.mock('@/utils/api/http.util', () => ({
  authenticatedFetch: authenticatedFetchMock
}));

vi.mock('@/services/sqlite.svc', () => ({
  sqliteService: sqliteServiceMock
}));

import { getEmailConfigurationStatus } from '@/utils/emailConfig.util';

describe('getEmailConfigurationStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sqliteServiceMock.isReady.mockReturnValue(true);
    sqliteServiceMock.getSetting.mockResolvedValue(null);
  });

  it('uses project settings and allows resend when configured', async () => {
    authenticatedFetchMock.mockResolvedValue({
      json: async () => ({
        settings: {
          email: {
            enabled: true,
            provider: 'resend',
            resend_configured: true,
            configured: true
          }
        }
      })
    });

    const result = await getEmailConfigurationStatus();

    expect(result.canSendEmails).toBe(true);
    expect(result.isConfigured).toBe(true);
    expect(result.isEnabled).toBe(true);
  });

  it('falls back and returns not configured when project settings request fails', async () => {
    authenticatedFetchMock.mockRejectedValue(new Error('network down'));

    const result = await getEmailConfigurationStatus();

    expect(result.canSendEmails).toBe(false);
    expect(result.isConfigured).toBe(false);
  });
});

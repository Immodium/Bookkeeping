import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendMock = vi.fn();

vi.mock('resend', () => ({
  Resend: class {
    public emails = {
      send: sendMock
    };
  }
}));

import { EmailProviderService } from '../../../server/services/EmailProviderService.js';

describe('EmailProviderService resend sender address', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv, RESEND_API_KEY: 're_test_key' };
    sendMock.mockResolvedValue({ error: null });
  });

  it('always sends from tenant-scoped slimbooks.io address', async () => {
    const service = new EmailProviderService();
    const result = await service.sendEmail({
      tenantId: 42,
      to: 'client@example.com',
      subject: 'Invoice #1001',
      html: '<p>Invoice ready</p>'
    });

    expect(result.success).toBe(true);
    expect(sendMock).toHaveBeenCalledWith(expect.objectContaining({
      from: 'mail-42@slimbooks.io',
      to: 'client@example.com',
      subject: 'Invoice #1001'
    }));
  });
});

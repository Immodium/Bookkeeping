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
    // From address format is mail<tenantId>@slimbooks.io (no hyphen).
    expect(sendMock).toHaveBeenCalledWith(expect.objectContaining({
      from: 'mail42@slimbooks.io',
      to: 'client@example.com',
      subject: 'Invoice #1001'
    }));
  });

  // Regression: the header logo must be embedded inline (CID) so it renders in
  // email clients without a publicly reachable APP_URL.
  it('attaches the Slimbooks logo inline when the HTML references cid:slimbooks-logo', async () => {
    const service = new EmailProviderService();
    const result = await service.sendEmail({
      tenantId: 1,
      to: 'client@example.com',
      subject: 'Invoice',
      html: '<img src="cid:slimbooks-logo" alt="Slimbooks" /><p>Body</p>'
    });

    expect(result.success).toBe(true);
    const payload = sendMock.mock.calls[0][0];
    expect(Array.isArray(payload.attachments)).toBe(true);
    expect(payload.attachments).toHaveLength(1);
    expect(payload.attachments[0]).toMatchObject({
      filename: 'slimbooks-logo.png',
      contentId: 'slimbooks-logo',
      contentType: 'image/png'
    });
    expect(typeof payload.attachments[0].content).toBe('string');
    expect(payload.attachments[0].content.length).toBeGreaterThan(0);
  });

  it('does not attach the logo when the HTML does not reference it', async () => {
    const service = new EmailProviderService();
    await service.sendEmail({
      tenantId: 1,
      to: 'client@example.com',
      subject: 'No logo',
      html: '<p>plain</p>'
    });

    const payload = sendMock.mock.calls[0][0];
    expect(payload.attachments).toBeUndefined();
  });
});

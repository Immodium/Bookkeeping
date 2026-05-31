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

describe('Project settings secret redaction', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    process.env.GOOGLE_CLIENT_SECRET = 'env-google-secret';
    process.env.STRIPE_SECRET_KEY = 'sk_live_env_secret';
    process.env.SMTP_PASS = 'env-smtp-pass';
    process.env.JWT_SECRET = 'env-jwt-secret';
    process.env.SESSION_SECRET = 'env-session-secret';
  });

  it('does not return integration secrets in getProjectSettings', async () => {
    (databaseService.getMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { key: 'google_oauth.client_id', value: '"client-id"' },
      { key: 'google_oauth.client_secret', value: '"db-google-secret"' },
      { key: 'stripe.publishable_key', value: '"pk_test"' },
      { key: 'stripe.secret_key', value: '"sk_test_db"' },
      { key: 'email.smtp_pass', value: '"db-smtp-pass"' }
    ]);

    const settings = await settingsService.getProjectSettings(1);
    const serialized = JSON.stringify(settings);

    expect(serialized).not.toContain('env-google-secret');
    expect(serialized).not.toContain('db-google-secret');
    expect(serialized).not.toContain('sk_live_env_secret');
    expect(serialized).not.toContain('sk_test_db');
    expect(serialized).not.toContain('env-smtp-pass');
    expect(serialized).not.toContain('db-smtp-pass');
    expect(serialized).not.toContain('env-jwt-secret');
    expect(serialized).not.toContain('env-session-secret');
    expect(settings.google_oauth.configured).toBe(true);
    expect(settings.stripe.configured).toBe(true);
  });

  it('reports resend as configured when provider is resend and API key exists', async () => {
    process.env.EMAIL_PROVIDER = 'resend';
    process.env.EMAIL_ENABLED = 'true';
    process.env.RESEND_API_KEY = 're_test_key';
    (databaseService.getMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { key: 'email.provider', value: 'resend' },
      { key: 'email.enabled', value: 'true' }
    ]);

    const settings = await settingsService.getProjectSettings(1);

    expect(settings.email.provider).toBe('resend');
    expect(settings.email.enabled).toBe(true);
    expect(settings.email.resend_configured).toBe(true);
    expect(settings.email.configured).toBe(true);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Unit tests for the AES-256-GCM webhook-secret encryption helpers
 * (server/utils/webhookCrypto.ts).
 *
 * The encryption key is read from process.env.WEBHOOK_ENCRYPTION_KEY at config
 * load time, so the "with key" suite stubs the env var and re-imports the module
 * via vi.resetModules() to get a fresh config snapshot.
 */

// 64 hex chars = 32 bytes = valid AES-256 key.
const VALID_KEY = 'a'.repeat(64);

type WebhookCrypto = typeof import('../../../server/utils/webhookCrypto.js');

const importFresh = async (): Promise<WebhookCrypto> => {
  vi.resetModules();
  return import('../../../server/utils/webhookCrypto.js');
};

describe('webhookCrypto — encryption not configured (no key)', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv('WEBHOOK_ENCRYPTION_KEY', '');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('encryptWebhookSecret is a no-op passthrough', async () => {
    const { encryptWebhookSecret } = await importFresh();
    expect(encryptWebhookSecret('my-secret')).toBe('my-secret');
    expect(encryptWebhookSecret('')).toBe('');
  });

  it('isEncrypted is false for plaintext', async () => {
    const { isEncrypted } = await importFresh();
    expect(isEncrypted('plaintext')).toBe(false);
    expect(isEncrypted('')).toBe(false);
  });

  it('decryptWebhookSecret returns plaintext unchanged (pre-encryption era)', async () => {
    const { decryptWebhookSecret } = await importFresh();
    expect(decryptWebhookSecret('legacy-plaintext')).toBe('legacy-plaintext');
  });

  it('decrypting an enc: value without a key throws (cannot read encrypted secret)', async () => {
    const { decryptWebhookSecret } = await importFresh();
    expect(() => decryptWebhookSecret('enc:aa:bb:cc')).toThrow(/WEBHOOK_ENCRYPTION_KEY is required/);
  });
});

describe('webhookCrypto — encryption configured (valid key)', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv('WEBHOOK_ENCRYPTION_KEY', VALID_KEY);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('round-trips arbitrary plaintext (happy path)', async () => {
    const { encryptWebhookSecret, decryptWebhookSecret } = await importFresh();
    const secret = 'whsec_' + 'x'.repeat(40);
    const encrypted = encryptWebhookSecret(secret);
    expect(encrypted).not.toBe(secret);
    expect(decryptWebhookSecret(encrypted)).toBe(secret);
  });

  it('produces the documented enc:<iv>:<tag>:<ciphertext> format and isEncrypted=true', async () => {
    const { encryptWebhookSecret, isEncrypted } = await importFresh();
    const encrypted = encryptWebhookSecret('format-check');
    expect(isEncrypted(encrypted)).toBe(true);
    const parts = encrypted.split(':');
    expect(parts[0]).toBe('enc');
    expect(parts).toHaveLength(4); // 'enc' + iv + tag + ciphertext
    expect(parts[1]).toMatch(/^[0-9a-f]{24}$/); // 12-byte IV
    expect(parts[2]).toMatch(/^[0-9a-f]{32}$/); // 16-byte auth tag
  });

  it('uses a random IV so the same plaintext yields different ciphertext each time', async () => {
    const { encryptWebhookSecret, decryptWebhookSecret } = await importFresh();
    const a = encryptWebhookSecret('same-input');
    const b = encryptWebhookSecret('same-input');
    expect(a).not.toBe(b);
    expect(decryptWebhookSecret(a)).toBe('same-input');
    expect(decryptWebhookSecret(b)).toBe('same-input');
  });

  it('round-trips unicode plaintext (edge case)', async () => {
    const { encryptWebhookSecret, decryptWebhookSecret } = await importFresh();
    const value = 'café — 日本語 — 🔐';
    expect(decryptWebhookSecret(encryptWebhookSecret(value))).toBe(value);
  });

  // Regression: encrypting an empty string yields an empty ciphertext segment
  // ("enc:<iv>:<tag>:"). The decrypt guard must validate by segment count (4),
  // not by ciphertext truthiness, so an empty secret still round-trips.
  it('round-trips an empty string (empty ciphertext segment is valid)', async () => {
    const { encryptWebhookSecret, decryptWebhookSecret } = await importFresh();
    const encryptedEmpty = encryptWebhookSecret('');
    expect(encryptedEmpty.startsWith('enc:')).toBe(true);
    expect(decryptWebhookSecret(encryptedEmpty)).toBe('');
  });

  // Regression: GCM must reject tampered ciphertext via the auth tag. If this
  // ever passes silently, integrity protection on stored webhook secrets is broken.
  it('rejects tampered ciphertext (auth-tag integrity)', async () => {
    const { encryptWebhookSecret, decryptWebhookSecret } = await importFresh();
    const encrypted = encryptWebhookSecret('integrity-protected');
    const [prefix, iv, tag, ct] = encrypted.split(':');
    const flip = (hex: string) => (hex[0] === 'f' ? '0' : 'f') + hex.slice(1);
    const tamperedCiphertext = `${prefix}:${iv}:${tag}:${flip(ct)}`;
    const tamperedTag = `${prefix}:${iv}:${flip(tag)}:${ct}`;
    expect(() => decryptWebhookSecret(tamperedCiphertext)).toThrow();
    expect(() => decryptWebhookSecret(tamperedTag)).toThrow();
  });

  it('throws on a malformed encrypted payload (missing segments)', async () => {
    const { decryptWebhookSecret } = await importFresh();
    expect(() => decryptWebhookSecret('enc:onlyonesegment')).toThrow(/Malformed encrypted webhook secret/);
  });

  it('leaves legacy plaintext (no enc: prefix) untouched when decrypting', async () => {
    const { decryptWebhookSecret } = await importFresh();
    expect(decryptWebhookSecret('still-plaintext')).toBe('still-plaintext');
  });
});

describe('webhookCrypto — invalid key configuration', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('throws when the key is set but not exactly 64 hex chars', async () => {
    vi.unstubAllEnvs();
    vi.stubEnv('WEBHOOK_ENCRYPTION_KEY', 'too-short');
    const { encryptWebhookSecret } = await importFresh();
    expect(() => encryptWebhookSecret('whatever')).toThrow(/must be exactly 64 hex characters/);
  });
});

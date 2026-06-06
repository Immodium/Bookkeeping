import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { db } from '../../../server/database/index.js';

/**
 * Security regression test for the public user-by-email lookup.
 *
 * GET /api/users/email/admin@slimbooks.app is reachable WITHOUT authentication
 * (it backs the first-run "does an admin exist?" setup check when SAAS_MODE is
 * off). It must never expose credential material. This test asserts the
 * response contains no password_hash / two_factor_secret / backup_codes, even
 * when those columns are populated in the database.
 */

const ADMIN_EMAIL = 'admin@slimbooks.app';
// A bcrypt-shaped sentinel; value is irrelevant, it just must never appear in any response.
const SENTINEL_HASH = '$2a$12$sentinelsentinelsentinelsentinelsentinelsentinelse';
const SENTINEL_2FA = 'SENTINEL-TOTP-SECRET';
const SENTINEL_BACKUP = '["SENTINEL-BACKUP-CODE"]';

let app: Express | null = null;
let pgUnavailable = false;
let originalPasswordHash: string | null = null;
let adminExisted = false;

describe('GET /api/users/email/:email — no credential leakage', () => {
  beforeAll(async () => {
    try {
      const appModule = await import('../../../server/app.js');
      app = await appModule.createApp();
    } catch {
      pgUnavailable = true;
      return;
    }

    // Ensure the default-tenant admin exists and carries sensitive fields, so the
    // assertions below are meaningful (the endpoint must strip them out).
    const existing = await db.getOne<{ id: number; password_hash: string | null }>(
      'SELECT id, password_hash FROM users WHERE email = ? AND tenant_id = 1',
      [ADMIN_EMAIL]
    );

    if (existing) {
      adminExisted = true;
      originalPasswordHash = existing.password_hash ?? null;
      await db.executeQuery(
        'UPDATE users SET password_hash = ?, two_factor_secret = ?, backup_codes = ? WHERE email = ? AND tenant_id = 1',
        [SENTINEL_HASH, SENTINEL_2FA, SENTINEL_BACKUP, ADMIN_EMAIL]
      );
    } else {
      await db.executeQuery(
        `INSERT INTO users (
           tenant_id, name, email, username, password_hash, role, roles, email_verified,
           two_factor_secret, backup_codes, failed_login_attempts, created_at, updated_at
         ) VALUES (1, 'Administrator', ?, 'admin', ?, 'admin', '["admin"]', 1, ?, ?, 0, NOW(), NOW())`,
        [ADMIN_EMAIL, SENTINEL_HASH, SENTINEL_2FA, SENTINEL_BACKUP]
      );
    }
  });

  afterAll(async () => {
    if (pgUnavailable) return;
    // Restore the row to a non-sentinel state so other suites are unaffected.
    if (adminExisted) {
      await db.executeQuery(
        'UPDATE users SET password_hash = ?, two_factor_secret = NULL, backup_codes = NULL WHERE email = ? AND tenant_id = 1',
        [originalPasswordHash, ADMIN_EMAIL]
      );
    } else {
      await db.executeQuery('DELETE FROM users WHERE email = ? AND tenant_id = 1', [ADMIN_EMAIL]);
    }
  });

  it('returns the admin without password_hash, two_factor_secret, or backup_codes', async (ctx) => {
    if (pgUnavailable) return ctx.skip();

    const res = await request(app!).get(`/api/users/email/${encodeURIComponent(ADMIN_EMAIL)}`);

    expect(res.status).toBe(200);
    expect(res.body?.success).toBe(true);
    expect(res.body?.exists).toBe(true);
    expect(res.body?.data).toBeDefined();
    expect(res.body.data.role).toBe('admin');

    // Sensitive fields must be absent from the serialized user.
    expect(res.body.data).not.toHaveProperty('password_hash');
    expect(res.body.data).not.toHaveProperty('two_factor_secret');
    expect(res.body.data).not.toHaveProperty('backup_codes');

    // Defence in depth: the sentinel secrets must not appear anywhere in the body.
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain(SENTINEL_HASH);
    expect(serialized).not.toContain(SENTINEL_2FA);
    expect(serialized).not.toContain(SENTINEL_BACKUP);
  });
});

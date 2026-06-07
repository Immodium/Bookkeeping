import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { v7 as uuidv7 } from 'uuid';
import type { Express } from 'express';
import { db } from '../../../server/database/index.js';
import { provisionTenantSchema } from '../../../server/database/schemas/tenantSchema.js';
import { generateToken } from '../../../server/middleware/auth.js';

/**
 * Regression test: expense free-text fields must be stored verbatim, NOT
 * HTML-entity-escaped on input.
 *
 * Previously the createExpense/updateExpense validation chains called
 * validator's .escape(), which turned legitimate characters into entities — a
 * receipt date "05/14/2026" was stored as "05&#x2F;14&#x2F;2026" and shown that
 * way in the UI. These fields are rendered by React (UI) and React-rendered PDFs
 * (both escape on output) and are never injected into email HTML, so storing the
 * raw text is correct. This test locks that behavior in.
 */

const createdTenantIds: number[] = [];
let app: Express | null = null;
let pgUnavailable = false;
let token = '';
let tenantId = 0;

const RAW_DESCRIPTION = 'Date: 05/14/2026 — Tom & Jerry\'s supplies <co>';
const RAW_VENDOR = 'A/B & Co';

describe('Expense free-text fields are not HTML-escaped on input', () => {
  beforeAll(async () => {
    try {
      const appModule = await import('../../../server/app.js');
      app = await appModule.createApp();
    } catch {
      pgUnavailable = true;
      return;
    }

    const label = `exp-noescape-${Date.now()}`;
    const tenantInsert = await db.executeQuery(
      `INSERT INTO tenants (public_id, name, slug, status, created_at, updated_at)
       VALUES (?, ?, ?, 'active', NOW(), NOW())`,
      [uuidv7(), `Tenant ${label}`, label]
    );
    tenantId = tenantInsert.lastInsertRowid;
    createdTenantIds.push(tenantId);
    await provisionTenantSchema(db, tenantId);

    const email = `${label}@example.test`;
    const passwordHash = await bcrypt.hash('Pass-123!', 4);
    const userInsert = await db.executeQuery(
      `INSERT INTO users (tenant_id, name, email, username, password_hash, role, roles, email_verified, created_at, updated_at)
       VALUES (?, 'Admin', ?, ?, ?, 'admin', '["admin"]', 1, NOW(), NOW())`,
      [tenantId, email, email, passwordHash]
    );
    token = generateToken({ id: userInsert.lastInsertRowid, tenant_id: tenantId, email, role: 'admin', roles: ['admin'] });
  });

  afterAll(async () => {
    if (pgUnavailable) return;
    for (const id of createdTenantIds.reverse()) {
      await db.executeQuery('DELETE FROM tenants WHERE id = ?', [id]);
    }
  });

  it('stores and returns the description/vendor verbatim (no &#x2F; / &amp; / &lt;)', async (ctx) => {
    if (pgUnavailable) return ctx.skip();

    const createRes = await request(app!)
      .post('/api/expenses')
      .set('Authorization', `Bearer ${token}`)
      .send({
        expenseData: {
          date: '2026-05-14',
          category: 'Meals & Entertainment',
          vendor: RAW_VENDOR,
          amount: 29.14,
          description: RAW_DESCRIPTION
        }
      });

    expect(createRes.status).toBeGreaterThanOrEqual(200);
    expect(createRes.status).toBeLessThan(300);
    const expenseId = createRes.body?.data?.id ?? createRes.body?.result?.lastInsertRowid;
    expect(expenseId).toBeTruthy();

    const getRes = await request(app!)
      .get(`/api/expenses/${expenseId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(getRes.status).toBe(200);
    const expense = getRes.body?.data;
    expect(expense).toBeTruthy();

    // Verbatim values preserved.
    expect(expense.description).toBe(RAW_DESCRIPTION);
    expect(expense.vendor).toBe(RAW_VENDOR);
    expect(expense.category).toBe('Meals & Entertainment');

    // None of the HTML-entity corruption the old .escape() introduced.
    expect(expense.description).toContain('05/14/2026');
    expect(expense.description).not.toContain('&#x2F;');
    expect(expense.description).not.toContain('&amp;');
    expect(expense.category).not.toContain('&amp;');
  });
});

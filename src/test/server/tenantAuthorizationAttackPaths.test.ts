import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { v7 as uuidv7 } from 'uuid';
import type { Express } from 'express';
import { db } from '../../../server/database/index.js';
import { provisionTenantSchema } from '../../../server/database/schemas/tenantSchema.js';
import { generateToken } from '../../../server/middleware/auth.js';

interface TestTenantContext {
  tenantId: number;
  userId: number;
  token: string;
  email: string;
}

let app: Express | null = null;
let pgUnavailable = false;
const createdTenantIds: number[] = [];

const createTenantWithAdmin = async (label: string): Promise<TestTenantContext> => {
  const timestamp = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const slug = `tenant-${label}-${timestamp}`;
  const tenantInsert = await db.executeQuery(
    `
      INSERT INTO tenants (public_id, name, slug, status, created_at, updated_at)
      VALUES (?, ?, ?, 'active', datetime('now'), datetime('now'))
    `,
    [uuidv7(), `Tenant ${label}`, slug]
  );
  const tenantId = tenantInsert.lastInsertRowid;
  createdTenantIds.push(tenantId);
  await provisionTenantSchema(db, tenantId);

  const email = `${label}.${timestamp}@example.test`;
  const passwordHash = await bcrypt.hash(`Pass-${label}-123!`, 4);
  const userInsert = await db.executeQuery(
    `
      INSERT INTO users (
        tenant_id, name, email, username, password_hash, role, roles, email_verified, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'admin', '["admin"]', 1, datetime('now'), datetime('now'))
    `,
    [tenantId, `Admin ${label}`, email, email, passwordHash]
  );
  const userId = userInsert.lastInsertRowid;

  const token = generateToken({
    id: userId,
    tenant_id: tenantId,
    email,
    role: 'admin',
    roles: ['admin']
  });

  return { tenantId, userId, token, email };
};

const authHeader = (token: string): Record<string, string> => ({
  Authorization: `Bearer ${token}`
});

describe('Cross-tenant authorization attack-path regressions', () => {
  beforeAll(async () => {
    try {
      const appModule = await import('../../../server/app.js');
      app = await appModule.createApp();
    } catch {
      pgUnavailable = true;
    }
  });

  afterAll(async () => {
    if (pgUnavailable) return;
    for (const tenantId of createdTenantIds.reverse()) {
      await db.executeQuery('DELETE FROM tenants WHERE id = ?', [tenantId]);
    }
  });

  it('rejects forged JWT payload tenant mismatch', async (ctx) => {
    if (pgUnavailable) return ctx.skip();

    const tenantA = await createTenantWithAdmin('mismatch-a');
    const tenantB = await createTenantWithAdmin('mismatch-b');

    const forgedToken = generateToken({
      id: tenantA.userId,
      tenant_id: tenantB.tenantId,
      email: tenantA.email,
      role: 'admin',
      roles: ['admin']
    });

    const response = await request(app!)
      .get('/api/clients')
      .set(authHeader(forgedToken));

    expect(response.status).toBe(401);
    expect(response.body?.error).toContain('tenant mismatch');
  });

  it('blocks cross-tenant client and invoice access by resource ID', async (ctx) => {
    if (pgUnavailable) return ctx.skip();

    const tenantA = await createTenantWithAdmin('resource-a');
    const tenantB = await createTenantWithAdmin('resource-b');

    const createClientResponse = await request(app!)
      .post('/api/clients')
      .set(authHeader(tenantA.token))
      .send({
        clientData: {
          name: 'Tenant A Client',
          email: `client-${Date.now()}@tenant-a.test`
        }
      });
    expect(createClientResponse.status).toBe(201);
    const clientId = createClientResponse.body?.data?.id as number;

    const createInvoiceResponse = await request(app!)
      .post('/api/invoices')
      .set(authHeader(tenantA.token))
      .send({
        invoiceData: {
          client_id: clientId,
          amount: 250
        }
      });
    expect(createInvoiceResponse.status).toBe(201);
    const invoiceId = createInvoiceResponse.body?.data?.id as number;

    const crossTenantClientRead = await request(app!)
      .get(`/api/clients/${clientId}`)
      .set(authHeader(tenantB.token));
    expect(crossTenantClientRead.status).toBe(404);

    const crossTenantInvoiceRead = await request(app!)
      .get(`/api/invoices/${invoiceId}`)
      .set(authHeader(tenantB.token));
    expect(crossTenantInvoiceRead.status).toBe(404);

    const crossTenantInvoiceStatusUpdate = await request(app!)
      .patch(`/api/invoices/${invoiceId}/status`)
      .set(authHeader(tenantB.token))
      .send({ status: 'paid' });
    expect(crossTenantInvoiceStatusUpdate.status).toBe(404);
  });

  it('blocks tenant access when tenant is suspended', async (ctx) => {
    if (pgUnavailable) return ctx.skip();

    const tenant = await createTenantWithAdmin('webhook');

    await db.executeQuery(
      "UPDATE tenants SET status = 'suspended', updated_at = datetime('now') WHERE id = ?",
      [tenant.tenantId]
    );

    const blockedAfterSuspension = await request(app!)
      .get('/api/clients')
      .set(authHeader(tenant.token));

    expect(blockedAfterSuspension.status).toBe(403);
    expect(blockedAfterSuspension.body?.error).toContain('Tenant is suspended');
  });
});

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import type { Express } from 'express';
import { db } from '../../../server/database/index.js';
import { generateToken } from '../../../server/middleware/auth.js';
import { provisionTenantSchema } from '../../../server/database/schemas/tenantSchema.js';

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
      INSERT INTO public.tenants (name, slug, status, created_at, updated_at)
      VALUES (?, ?, 'active', datetime('now'), datetime('now'))
    `,
    [`Tenant ${label}`, slug]
  );
  const tenantId = tenantInsert.lastInsertRowid;
  createdTenantIds.push(tenantId);

  // Provision the tenant schema so per-tenant tables exist and cross-tenant
  // isolation works correctly in integration tests.
  await provisionTenantSchema(db, tenantId);

  const email = `${label}.${timestamp}@example.test`;
  const passwordHash = await bcrypt.hash(`Pass-${label}-123!`, 4);

  // Insert the user into public.users (used by requireAuth which runs outside
  // tenant context) and into the tenant schema (used by controllers that run
  // inside applyTenantSchema context).
  const userInsert = await db.executeQuery(
    `
      INSERT INTO public.users (
        tenant_id, name, email, username, password_hash, role, roles, email_verified, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'admin', '["admin"]', 1, datetime('now'), datetime('now'))
    `,
    [tenantId, `Admin ${label}`, email, email, passwordHash]
  );
  const userId = userInsert.lastInsertRowid;

  await db.executeQuery(
    `INSERT INTO "tenant_${tenantId}".users
       SELECT * FROM public.users WHERE id = ?
     ON CONFLICT DO NOTHING`,
    [userId]
  );

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

  it('applies billing webhook subscription suspension to tenant access', async (ctx) => {
    if (pgUnavailable) return ctx.skip();

    const tenant = await createTenantWithAdmin('webhook');

    const webhookResponse = await request(app!)
      .post('/api/billing/webhook')
      .send({
        provider: 'stripe',
        eventType: 'customer.subscription.updated',
        data: {
          tenantId: tenant.tenantId,
          planCode: 'starter',
          status: 'suspended',
          entitlements: {
            'reports.enabled': false
          }
        }
      });

    expect(webhookResponse.status).toBe(200);
    expect(webhookResponse.body?.success).toBe(true);
    expect(webhookResponse.body?.data?.tenantId).toBe(tenant.tenantId);

    const blockedAfterSuspension = await request(app!)
      .get('/api/clients')
      .set(authHeader(tenant.token));

    expect(blockedAfterSuspension.status).toBe(403);
    expect(blockedAfterSuspension.body?.error).toContain('Tenant is suspended');
  });
});

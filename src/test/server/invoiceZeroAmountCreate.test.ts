import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { v7 as uuidv7 } from 'uuid';
import type { Express } from 'express';
import { db } from '../../../server/database/index.js';
import { provisionTenantSchema } from '../../../server/database/schemas/tenantSchema.js';
import { generateToken } from '../../../server/middleware/auth.js';

interface TenantContext {
  tenantId: number;
  token: string;
}

const createdTenantIds: number[] = [];
let app: Express | null = null;
let pgUnavailable = false;

const createTenantWithAdmin = async (label: string): Promise<TenantContext> => {
  const timestamp = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const tenantInsert = await db.executeQuery(
    `
      INSERT INTO tenants (public_id, name, slug, status, created_at, updated_at)
      VALUES (?, ?, ?, 'active', datetime('now'), datetime('now'))
    `,
    [uuidv7(), `Tenant ${label}`, `tenant-${label}-${timestamp}`]
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

  const token = generateToken({
    id: userInsert.lastInsertRowid,
    tenant_id: tenantId,
    email,
    role: 'admin',
    roles: ['admin']
  });

  return { tenantId, token };
};

describe('Invoice zero-amount create flow', () => {
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

  it('allows creating a valid invoice with amount = 0', async (ctx) => {
    if (pgUnavailable) return ctx.skip();

    const tenant = await createTenantWithAdmin('invoice-zero-amount');

    const createClientResponse = await request(app!)
      .post('/api/clients')
      .set('Authorization', `Bearer ${tenant.token}`)
      .send({
        clientData: {
          name: 'Zero Amount Client',
          email: `client-${Date.now()}@example.test`
        }
      });

    expect(createClientResponse.status).toBe(201);
    const clientId = createClientResponse.body?.data?.id as number;

    const createInvoiceResponse = await request(app!)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${tenant.token}`)
      .send({
        invoiceData: {
          client_id: clientId,
          amount: 0,
          total_amount: 0,
          description: 'Complimentary service',
          line_items: JSON.stringify([
            {
              id: 1,
              description: 'Complimentary service',
              quantity: 1,
              unit_price: 0,
              total: 0
            }
          ])
        }
      });

    expect(createInvoiceResponse.status).toBe(201);
    expect(createInvoiceResponse.body?.success).toBe(true);
    expect(typeof createInvoiceResponse.body?.data?.id).toBe('number');
  });
});

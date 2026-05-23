import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import type { Express } from 'express';
import { db } from '../../../server/database/index.js';
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
      INSERT INTO tenants (name, slug, status, created_at, updated_at)
      VALUES (?, ?, 'active', datetime('now'), datetime('now'))
    `,
    [`Tenant ${label}`, `tenant-${label}-${timestamp}`]
  );
  const tenantId = tenantInsert.lastInsertRowid;
  createdTenantIds.push(tenantId);

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

describe('Invoice mark-as-paid flow', () => {
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

  it('creates payment and updates invoice status to paid', async (ctx) => {
    if (pgUnavailable) return ctx.skip();

    const tenant = await createTenantWithAdmin('invoice-paid-flow');

    const createClientResponse = await request(app!)
      .post('/api/clients')
      .set('Authorization', `Bearer ${tenant.token}`)
      .send({
        clientData: {
          name: 'Invoice Paid Flow Client',
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
          amount: 1250
        }
      });

    expect(createInvoiceResponse.status).toBe(201);
    const invoiceId = createInvoiceResponse.body?.data?.id as number;

    const createPaymentResponse = await request(app!)
      .post('/api/payments')
      .set('Authorization', `Bearer ${tenant.token}`)
      .send({
        paymentData: {
          date: '2026-05-10',
          client_name: 'Invoice Paid Flow Client',
          invoice_id: invoiceId,
          amount: 1250,
          method: 'bank_transfer',
          reference: `AUTO-${invoiceId}`,
          description: `Payment for invoice ${invoiceId}`,
          status: 'received'
        }
      });

    expect(createPaymentResponse.status).toBe(201);
    expect(createPaymentResponse.body?.success).toBe(true);
    expect(createPaymentResponse.body?.data?.invoice_id).toBe(invoiceId);

    const markPaidResponse = await request(app!)
      .patch(`/api/invoices/${invoiceId}/status`)
      .set('Authorization', `Bearer ${tenant.token}`)
      .send({ status: 'paid' });

    expect(markPaidResponse.status).toBe(200);
    expect(markPaidResponse.body?.success).toBe(true);

    const getInvoiceResponse = await request(app!)
      .get(`/api/invoices/${invoiceId}`)
      .set('Authorization', `Bearer ${tenant.token}`);

    expect(getInvoiceResponse.status).toBe(200);
    expect(getInvoiceResponse.body?.data?.status).toBe('paid');
  });
});

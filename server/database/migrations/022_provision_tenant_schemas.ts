// Migration 022: Provision per-tenant PostgreSQL schemas and copy public data
//
// 1. For each existing tenant, calls provisionTenantSchema (idempotent).
// 2. For any tables that have public data for that tenant, copies rows into
//    the tenant schema using INSERT ... ON CONFLICT DO NOTHING.
//
// This migration is safe to re-run (all operations are idempotent).

import type { IDatabase } from '../../types/database.types.js';
import { provisionTenantSchema } from '../schemas/tenantSchema.js';

// Tables with per-tenant data that should be copied from public to tenant schema.
// Order matters for FK-compatible inserts (parents before children).
const TENANT_TABLES = [
  'tenant_subscriptions',
  'tenant_entitlements',
  'users',
  'clients',
  'invoice_design_templates',
  'recurring_invoice_templates',
  'invoices',
  'invoice_items',
  'payments',
  'expenses',
  'retainers',
  'reports',
  'settings',
  'project_settings',
  'counters',
  'dunning_events',
  'audit_log',
  'api_keys',
  'webhook_endpoints',
  'webhook_deliveries',
  'usage_records',
  'report_schedules',
];

/**
 * Check whether a public table exists and has rows for the given tenant_id.
 */
async function tableHasTenantData(db: IDatabase, tableName: string, tenantId: number): Promise<boolean> {
  try {
    const result = await db.getOne<{ cnt: string }>(
      `SELECT COUNT(*) AS cnt FROM public.${tableName} WHERE tenant_id = $1`,
      [tenantId]
    );
    return Number(result?.cnt ?? 0) > 0;
  } catch {
    // Table may not exist on this deployment
    return false;
  }
}

/**
 * Copy rows for tenantId from the public table into the tenant-schema table.
 * Uses ON CONFLICT DO NOTHING so re-runs are safe.
 */
async function copyTableData(db: IDatabase, tableName: string, tenantId: number, schema: string): Promise<void> {
  try {
    await db.executeQuery(
      `INSERT INTO "${schema}".${tableName} SELECT * FROM public.${tableName} WHERE tenant_id = $1 ON CONFLICT DO NOTHING`,
      [tenantId]
    );
  } catch (err) {
    // Log and continue — a missing column or constraint mismatch should not block the whole migration
    console.warn(`Migration 022: skipping data copy for ${tableName} tenant ${tenantId}:`, (err as Error).message);
  }
}

export const up = async (db: IDatabase): Promise<void> => {
  // Fetch all non-deleted tenants
  let tenants: Array<{ id: number }> = [];
  try {
    tenants = await db.getMany<{ id: number }>(
      "SELECT id FROM tenants WHERE status != $1 ORDER BY id",
      ['deleted']
    );
  } catch (err) {
    console.warn('Migration 022: could not read tenants table, skipping:', (err as Error).message);
    return;
  }

  for (const tenant of tenants) {
    const tenantId = tenant.id;
    const schema = `tenant_${tenantId}`;

    console.log(`Migration 022: provisioning schema "${schema}"...`);

    // 1. Provision (or verify) the schema and all tables
    await provisionTenantSchema(db, tenantId);

    // 2. Copy data from public tables into the tenant schema
    for (const tableName of TENANT_TABLES) {
      const hasData = await tableHasTenantData(db, tableName, tenantId);
      if (hasData) {
        await copyTableData(db, tableName, tenantId, schema);
      }
    }

    console.log(`Migration 022: schema "${schema}" provisioned.`);
  }
};

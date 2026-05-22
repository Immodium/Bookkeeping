import type { IDatabase } from '../../types/database.types.js';

/**
 * Add indexes for FK columns that lack explicit indexes.
 * PostgreSQL does NOT auto-index FK columns; SQLite has no query planner that benefits
 * much, but idempotent CREATE INDEX IF NOT EXISTS is safe everywhere.
 *
 * Each statement is wrapped individually so a missing table doesn't block the rest.
 */
export const up = async (db: IDatabase): Promise<void> => {
  const indexes: Array<{ sql: string; desc: string }> = [
    // invoices
    { sql: 'CREATE INDEX IF NOT EXISTS idx_invoices_tenant_id ON invoices (tenant_id)', desc: 'idx_invoices_tenant_id' },
    { sql: 'CREATE INDEX IF NOT EXISTS idx_invoices_client_id ON invoices (client_id)', desc: 'idx_invoices_client_id' },
    { sql: 'CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices (status)', desc: 'idx_invoices_status' },

    // payments
    { sql: 'CREATE INDEX IF NOT EXISTS idx_payments_tenant_id ON payments (tenant_id)', desc: 'idx_payments_tenant_id' },
    { sql: 'CREATE INDEX IF NOT EXISTS idx_payments_invoice_id ON payments (invoice_id)', desc: 'idx_payments_invoice_id' },

    // expenses
    { sql: 'CREATE INDEX IF NOT EXISTS idx_expenses_tenant_id ON expenses (tenant_id)', desc: 'idx_expenses_tenant_id' },

    // clients
    { sql: 'CREATE INDEX IF NOT EXISTS idx_clients_tenant_id ON clients (tenant_id)', desc: 'idx_clients_tenant_id' },
    { sql: 'CREATE INDEX IF NOT EXISTS idx_clients_deleted_at ON clients (deleted_at)', desc: 'idx_clients_deleted_at' },

    // users
    { sql: 'CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON users (tenant_id)', desc: 'idx_users_tenant_id' },
    { sql: 'CREATE INDEX IF NOT EXISTS idx_users_email ON users (email)', desc: 'idx_users_email' },

    // webhook_endpoints
    { sql: 'CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_tenant_id ON webhook_endpoints (tenant_id)', desc: 'idx_webhook_endpoints_tenant_id' },

    // webhook_deliveries
    { sql: 'CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_endpoint_id ON webhook_deliveries (endpoint_id)', desc: 'idx_webhook_deliveries_endpoint_id' },
    { sql: 'CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_tenant_id ON webhook_deliveries (tenant_id)', desc: 'idx_webhook_deliveries_tenant_id' },

    // dunning_events
    { sql: 'CREATE INDEX IF NOT EXISTS idx_dunning_events_tenant_id ON dunning_events (tenant_id)', desc: 'idx_dunning_events_tenant_id' },

    // tenant_entitlements
    { sql: 'CREATE INDEX IF NOT EXISTS idx_tenant_entitlements_tenant_id ON tenant_entitlements (tenant_id)', desc: 'idx_tenant_entitlements_tenant_id' },

    // report_schedules (may not exist on all deployments)
    { sql: 'CREATE INDEX IF NOT EXISTS idx_report_schedules_tenant_id ON report_schedules (tenant_id)', desc: 'idx_report_schedules_tenant_id' },

    // retainers
    { sql: 'CREATE INDEX IF NOT EXISTS idx_retainers_tenant_id ON retainers (tenant_id)', desc: 'idx_retainers_tenant_id' },
    { sql: 'CREATE INDEX IF NOT EXISTS idx_retainers_client_id ON retainers (client_id)', desc: 'idx_retainers_client_id' },
  ];

  for (const { sql, desc } of indexes) {
    try {
      await db.executeQuery(sql);
    } catch (err) {
      // Non-fatal: table may not exist on older schema versions
      const msg = (err as Error).message || '';
      if (!msg.includes('no such table') && !msg.includes('does not exist')) {
        throw err;
      }
      console.warn(`Migration 021: skipping ${desc} — table not found`);
    }
  }
};

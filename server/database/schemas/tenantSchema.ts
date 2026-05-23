// Tenant Schema Provisioning
// Creates a complete PostgreSQL schema for a single tenant.
// All tables that previously lived in the public schema with tenant_id columns
// are recreated here, scoped to "tenant_{tenantId}".

import type { IDatabase } from '../../types/database.types.js';

/**
 * Minimal interface required by provisionTenantSchema.
 * Allows callers to pass either a full IDatabase or a DatabaseService
 * (which is a subset with the same method signatures).
 */
export interface SchemaProvisioner {
  executeQuery(query: string, params?: unknown[]): Promise<{ changes: number; lastInsertRowid: number }>;
}

// Tables that stay in the public schema (global/platform-level)
const PUBLIC_ONLY_TABLES = new Set([
  'tenants',
  'subscription_plans',
  'processed_webhook_events',
]);

/**
 * Provision a complete schema for the given tenant.
 * All DDL uses IF NOT EXISTS so this is idempotent and safe to call on
 * every startup or whenever a new tenant is created.
 *
 * Accepts either a full IDatabase or any object with a compatible executeQuery method
 * (e.g. DatabaseService) so the function can be called from service layer code that
 * uses a mockable database service.
 */
export async function provisionTenantSchema(db: SchemaProvisioner | IDatabase, tenantId: number): Promise<void> {
  const schema = `tenant_${tenantId}`;

  // 1. Create the schema
  await db.executeQuery(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);

  // 2. Ensure the updated_at trigger function exists in the public schema
  //    (re-create is idempotent via CREATE OR REPLACE)
  await db.executeQuery(`
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ language 'plpgsql'
  `);

  // Helper to create a trigger on a tenant-schema table
  const createUpdatedAtTrigger = async (tableName: string): Promise<void> => {
    await db.executeQuery(`
      DROP TRIGGER IF EXISTS update_${tableName}_updated_at ON "${schema}".${tableName}
    `);
    await db.executeQuery(`
      CREATE TRIGGER update_${tableName}_updated_at
        BEFORE UPDATE ON "${schema}".${tableName}
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
    `);
  };

  // Helper to create a tenant_id index
  const createTenantIdx = async (tableName: string): Promise<void> => {
    await db.executeQuery(
      `CREATE INDEX IF NOT EXISTS idx_${tableName}_tenant_id ON "${schema}".${tableName}(tenant_id)`
    );
  };

  // -------------------------------------------------------------------------
  // tenant_subscriptions
  // -------------------------------------------------------------------------
  await db.executeQuery(`
    CREATE TABLE IF NOT EXISTS "${schema}".tenant_subscriptions (
      id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      tenant_id INTEGER NOT NULL DEFAULT ${tenantId},
      plan_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      started_at TEXT,
      current_period_start TEXT,
      current_period_end TEXT,
      cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
      canceled_at TEXT,
      provider TEXT NOT NULL DEFAULT 'internal',
      provider_customer_id TEXT,
      provider_subscription_id TEXT,
      metadata_json TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (tenant_id)
    )
  `);
  await createTenantIdx('tenant_subscriptions');
  await createUpdatedAtTrigger('tenant_subscriptions');

  // -------------------------------------------------------------------------
  // tenant_entitlements
  // -------------------------------------------------------------------------
  await db.executeQuery(`
    CREATE TABLE IF NOT EXISTS "${schema}".tenant_entitlements (
      id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      tenant_id INTEGER NOT NULL DEFAULT ${tenantId},
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'manual',
      updated_by_user_id INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (tenant_id, key)
    )
  `);
  await createTenantIdx('tenant_entitlements');
  await createUpdatedAtTrigger('tenant_entitlements');

  // -------------------------------------------------------------------------
  // users
  // -------------------------------------------------------------------------
  await db.executeQuery(`
    CREATE TABLE IF NOT EXISTS "${schema}".users (
      id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      tenant_id INTEGER NOT NULL DEFAULT ${tenantId},
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT,
      role TEXT DEFAULT 'user',
      email_verified INTEGER DEFAULT 0,
      google_id TEXT UNIQUE,
      roles TEXT,
      two_factor_secret TEXT,
      backup_codes TEXT,
      last_login TEXT,
      failed_login_attempts INTEGER DEFAULT 0,
      account_locked_until TEXT,
      password_updated_at TEXT,
      email_verified_at TEXT,
      token_version INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await createTenantIdx('users');
  await db.executeQuery(
    `CREATE INDEX IF NOT EXISTS idx_users_email_${tenantId} ON "${schema}".users(email)`
  );
  await createUpdatedAtTrigger('users');

  // -------------------------------------------------------------------------
  // clients
  // -------------------------------------------------------------------------
  await db.executeQuery(`
    CREATE TABLE IF NOT EXISTS "${schema}".clients (
      id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      tenant_id INTEGER NOT NULL DEFAULT ${tenantId},
      name TEXT NOT NULL,
      first_name TEXT,
      last_name TEXT,
      email TEXT,
      phone TEXT,
      company TEXT,
      address TEXT,
      city TEXT,
      state TEXT,
      zip TEXT,
      country TEXT,
      tax_id TEXT,
      notes TEXT,
      stripe_customer_id TEXT,
      is_active INTEGER DEFAULT 1,
      deleted_at TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await createTenantIdx('clients');
  await db.executeQuery(
    `CREATE INDEX IF NOT EXISTS idx_clients_deleted_at_${tenantId} ON "${schema}".clients(deleted_at)`
  );
  await createUpdatedAtTrigger('clients');

  // -------------------------------------------------------------------------
  // invoice_design_templates (must exist before invoices due to FK-compatible ordering)
  // -------------------------------------------------------------------------
  await db.executeQuery(`
    CREATE TABLE IF NOT EXISTS "${schema}".invoice_design_templates (
      id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      tenant_id INTEGER NOT NULL DEFAULT ${tenantId},
      name TEXT NOT NULL,
      content TEXT NOT NULL,
      is_default INTEGER DEFAULT 0,
      variables TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await createTenantIdx('invoice_design_templates');
  await createUpdatedAtTrigger('invoice_design_templates');

  // -------------------------------------------------------------------------
  // recurring_invoice_templates
  // -------------------------------------------------------------------------
  await db.executeQuery(`
    CREATE TABLE IF NOT EXISTS "${schema}".recurring_invoice_templates (
      id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      tenant_id INTEGER NOT NULL DEFAULT ${tenantId},
      name TEXT NOT NULL,
      client_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      description TEXT,
      frequency TEXT NOT NULL,
      payment_terms TEXT NOT NULL,
      next_invoice_date TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      line_items TEXT,
      tax_amount REAL DEFAULT 0,
      tax_rate_id TEXT,
      shipping_amount REAL DEFAULT 0,
      shipping_rate_id TEXT,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await createTenantIdx('recurring_invoice_templates');
  await createUpdatedAtTrigger('recurring_invoice_templates');

  // -------------------------------------------------------------------------
  // invoices
  // -------------------------------------------------------------------------
  await db.executeQuery(`
    CREATE TABLE IF NOT EXISTS "${schema}".invoices (
      id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      tenant_id INTEGER NOT NULL DEFAULT ${tenantId},
      invoice_number TEXT NOT NULL,
      client_id INTEGER NOT NULL,
      design_template_id INTEGER,
      recurring_template_id INTEGER,
      amount REAL NOT NULL DEFAULT 0,
      tax_amount REAL DEFAULT 0,
      total_amount REAL NOT NULL DEFAULT 0,
      currency TEXT DEFAULT 'USD',
      status TEXT DEFAULT 'draft',
      due_date TEXT,
      issue_date TEXT,
      paid_date TEXT,
      description TEXT,
      items TEXT,
      notes TEXT,
      terms TEXT,
      payment_terms TEXT,
      footer TEXT,
      type TEXT DEFAULT 'one-time',
      client_name TEXT,
      client_email TEXT,
      client_phone TEXT,
      client_address TEXT,
      line_items TEXT,
      tax_rate_id TEXT,
      shipping_amount REAL DEFAULT 0,
      shipping_rate_id TEXT,
      stripe_invoice_id TEXT,
      stripe_payment_intent_id TEXT,
      email_status TEXT DEFAULT 'not_sent',
      email_sent_at TEXT,
      email_error TEXT,
      last_email_attempt TEXT,
      is_recurring INTEGER DEFAULT 0,
      recurring_frequency TEXT,
      next_due_date TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (tenant_id, invoice_number)
    )
  `);
  await createTenantIdx('invoices');
  await db.executeQuery(
    `CREATE INDEX IF NOT EXISTS idx_invoices_client_id_${tenantId} ON "${schema}".invoices(client_id)`
  );
  await db.executeQuery(
    `CREATE INDEX IF NOT EXISTS idx_invoices_status_${tenantId} ON "${schema}".invoices(status)`
  );
  await createUpdatedAtTrigger('invoices');

  // -------------------------------------------------------------------------
  // invoice_items
  // -------------------------------------------------------------------------
  await db.executeQuery(`
    CREATE TABLE IF NOT EXISTS "${schema}".invoice_items (
      id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      tenant_id INTEGER NOT NULL DEFAULT ${tenantId},
      invoice_id INTEGER NOT NULL,
      description TEXT NOT NULL,
      quantity REAL NOT NULL DEFAULT 1,
      unit_price REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      tax_rate REAL DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await createTenantIdx('invoice_items');
  await db.executeQuery(
    `CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id_${tenantId} ON "${schema}".invoice_items(invoice_id)`
  );

  // -------------------------------------------------------------------------
  // payments
  // -------------------------------------------------------------------------
  await db.executeQuery(`
    CREATE TABLE IF NOT EXISTS "${schema}".payments (
      id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      tenant_id INTEGER NOT NULL DEFAULT ${tenantId},
      invoice_id INTEGER,
      client_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      currency TEXT DEFAULT 'USD',
      method TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      transaction_id TEXT,
      stripe_payment_id TEXT,
      notes TEXT,
      date TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await createTenantIdx('payments');
  await db.executeQuery(
    `CREATE INDEX IF NOT EXISTS idx_payments_invoice_id_${tenantId} ON "${schema}".payments(invoice_id)`
  );
  await createUpdatedAtTrigger('payments');

  // -------------------------------------------------------------------------
  // expenses
  // -------------------------------------------------------------------------
  await db.executeQuery(`
    CREATE TABLE IF NOT EXISTS "${schema}".expenses (
      id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      tenant_id INTEGER NOT NULL DEFAULT ${tenantId},
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT DEFAULT 'USD',
      category TEXT,
      date TEXT NOT NULL,
      vendor TEXT,
      notes TEXT,
      receipt_url TEXT,
      is_billable INTEGER DEFAULT 0,
      client_id INTEGER,
      project TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await createTenantIdx('expenses');
  await createUpdatedAtTrigger('expenses');

  // -------------------------------------------------------------------------
  // retainers
  // -------------------------------------------------------------------------
  await db.executeQuery(`
    CREATE TABLE IF NOT EXISTS "${schema}".retainers (
      id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      tenant_id INTEGER NOT NULL DEFAULT ${tenantId},
      client_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      amount REAL NOT NULL,
      currency TEXT DEFAULT 'USD',
      billing_cycle TEXT NOT NULL DEFAULT 'monthly',
      start_date TEXT NOT NULL,
      next_invoice_date TEXT NOT NULL,
      end_date TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      auto_renew INTEGER NOT NULL DEFAULT 1,
      notes TEXT,
      deleted_at TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await createTenantIdx('retainers');
  await db.executeQuery(
    `CREATE INDEX IF NOT EXISTS idx_retainers_client_id_${tenantId} ON "${schema}".retainers(client_id)`
  );
  await createUpdatedAtTrigger('retainers');

  // -------------------------------------------------------------------------
  // reports
  // -------------------------------------------------------------------------
  await db.executeQuery(`
    CREATE TABLE IF NOT EXISTS "${schema}".reports (
      id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      tenant_id INTEGER NOT NULL DEFAULT ${tenantId},
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      date_range_start TEXT,
      date_range_end TEXT,
      data TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await createTenantIdx('reports');

  // -------------------------------------------------------------------------
  // settings
  // -------------------------------------------------------------------------
  await db.executeQuery(`
    CREATE TABLE IF NOT EXISTS "${schema}".settings (
      id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      tenant_id INTEGER NOT NULL DEFAULT ${tenantId},
      key TEXT NOT NULL,
      value TEXT,
      type TEXT DEFAULT 'string',
      description TEXT,
      is_public INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (tenant_id, key)
    )
  `);
  await createTenantIdx('settings');
  await createUpdatedAtTrigger('settings');

  // -------------------------------------------------------------------------
  // project_settings
  // -------------------------------------------------------------------------
  await db.executeQuery(`
    CREATE TABLE IF NOT EXISTS "${schema}".project_settings (
      id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      tenant_id INTEGER NOT NULL DEFAULT ${tenantId},
      key TEXT NOT NULL,
      value TEXT,
      enabled INTEGER DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (tenant_id, key)
    )
  `);
  await createTenantIdx('project_settings');
  await createUpdatedAtTrigger('project_settings');

  // -------------------------------------------------------------------------
  // counters
  // -------------------------------------------------------------------------
  await db.executeQuery(`
    CREATE TABLE IF NOT EXISTS "${schema}".counters (
      id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      tenant_id INTEGER NOT NULL DEFAULT ${tenantId},
      name TEXT NOT NULL,
      value INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (tenant_id, name)
    )
  `);
  await createTenantIdx('counters');
  await createUpdatedAtTrigger('counters');

  // -------------------------------------------------------------------------
  // dunning_events
  // -------------------------------------------------------------------------
  await db.executeQuery(`
    CREATE TABLE IF NOT EXISTS "${schema}".dunning_events (
      id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      tenant_id INTEGER NOT NULL DEFAULT ${tenantId},
      event_type TEXT NOT NULL,
      sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      metadata_json TEXT
    )
  `);
  await createTenantIdx('dunning_events');

  // -------------------------------------------------------------------------
  // audit_log
  // -------------------------------------------------------------------------
  await db.executeQuery(`
    CREATE TABLE IF NOT EXISTS "${schema}".audit_log (
      id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      tenant_id INTEGER,
      user_id INTEGER,
      action TEXT NOT NULL,
      resource_type TEXT,
      resource_id TEXT,
      ip_address TEXT,
      user_agent TEXT,
      metadata_json TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await createTenantIdx('audit_log');

  // -------------------------------------------------------------------------
  // api_keys
  // -------------------------------------------------------------------------
  await db.executeQuery(`
    CREATE TABLE IF NOT EXISTS "${schema}".api_keys (
      id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      tenant_id INTEGER NOT NULL DEFAULT ${tenantId},
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      key_hash TEXT NOT NULL UNIQUE,
      key_prefix TEXT NOT NULL,
      scopes TEXT NOT NULL DEFAULT '["read","write"]',
      last_used_at TEXT,
      expires_at TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await createTenantIdx('api_keys');
  await createUpdatedAtTrigger('api_keys');

  // -------------------------------------------------------------------------
  // webhook_endpoints
  // -------------------------------------------------------------------------
  await db.executeQuery(`
    CREATE TABLE IF NOT EXISTS "${schema}".webhook_endpoints (
      id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      tenant_id INTEGER NOT NULL DEFAULT ${tenantId},
      url TEXT NOT NULL,
      secret TEXT NOT NULL,
      events TEXT NOT NULL DEFAULT '["*"]',
      is_active INTEGER NOT NULL DEFAULT 1,
      description TEXT,
      last_triggered_at TEXT,
      failure_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await createTenantIdx('webhook_endpoints');
  await createUpdatedAtTrigger('webhook_endpoints');

  // -------------------------------------------------------------------------
  // webhook_deliveries
  // -------------------------------------------------------------------------
  await db.executeQuery(`
    CREATE TABLE IF NOT EXISTS "${schema}".webhook_deliveries (
      id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      endpoint_id INTEGER NOT NULL,
      tenant_id INTEGER NOT NULL DEFAULT ${tenantId},
      event_type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      response_status INTEGER,
      response_body TEXT,
      attempt_count INTEGER NOT NULL DEFAULT 1,
      delivered_at TEXT,
      failed_at TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await createTenantIdx('webhook_deliveries');
  await db.executeQuery(
    `CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_endpoint_id_${tenantId} ON "${schema}".webhook_deliveries(endpoint_id)`
  );

  // -------------------------------------------------------------------------
  // usage_records
  // -------------------------------------------------------------------------
  await db.executeQuery(`
    CREATE TABLE IF NOT EXISTS "${schema}".usage_records (
      id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      tenant_id INTEGER NOT NULL DEFAULT ${tenantId},
      metric TEXT NOT NULL,
      value INTEGER NOT NULL DEFAULT 0,
      period TEXT NOT NULL,
      period_type TEXT NOT NULL DEFAULT 'monthly',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (tenant_id, metric, period)
    )
  `);
  await createTenantIdx('usage_records');

  // -------------------------------------------------------------------------
  // report_schedules (created outside of tableSchemas in database/index.ts)
  // -------------------------------------------------------------------------
  await db.executeQuery(`
    CREATE TABLE IF NOT EXISTS "${schema}".report_schedules (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL DEFAULT ${tenantId},
      name TEXT NOT NULL,
      report_type TEXT NOT NULL,
      frequency TEXT NOT NULL,
      start_date TEXT NOT NULL,
      time_of_day TEXT NOT NULL DEFAULT '09:00',
      timezone TEXT NOT NULL DEFAULT 'UTC',
      date_range_start TEXT,
      date_range_end TEXT,
      config TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      last_run_at TEXT,
      next_run_at TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await createTenantIdx('report_schedules');
  await createUpdatedAtTrigger('report_schedules');
}

/**
 * Drop a tenant's entire schema (CASCADE drops all objects within it).
 * Used when permanently deleting a tenant.
 */
export async function dropTenantSchema(db: SchemaProvisioner | IDatabase, tenantId: number): Promise<void> {
  await db.executeQuery(`DROP SCHEMA IF EXISTS "tenant_${tenantId}" CASCADE`);
}

export { PUBLIC_ONLY_TABLES };

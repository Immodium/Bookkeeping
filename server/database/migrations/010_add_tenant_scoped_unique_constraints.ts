import type { IDatabase } from '../../types/database.types.js';

const hasTable = async (db: IDatabase, tableName: string): Promise<boolean> => {
  try {
    const result = await db.getMany<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1",
      [tableName]
    );
    return result.length > 0;
  } catch {
    return false;
  }
};

const hasColumn = async (db: IDatabase, tableName: string, columnName: string): Promise<boolean> => {
  if (!(await hasTable(db, tableName))) return false;
  try {
    const rows = await db.getMany<{ column_name: string }>(
      "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2",
      [tableName, columnName]
    );
    return rows.length > 0;
  } catch {
    return false;
  }
};

const recreateSettingsTable = async (db: IDatabase): Promise<void> => {
  if (!(await hasTable(db, 'settings'))) return;

  await db.executeQuery('ALTER TABLE settings RENAME TO settings_legacy_010');
  await db.executeQuery(`
    CREATE TABLE settings (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL DEFAULT 1,
      key TEXT NOT NULL,
      value TEXT,
      type TEXT DEFAULT 'string',
      description TEXT,
      is_public INTEGER DEFAULT 0,
      category TEXT DEFAULT 'general',
      created_at TEXT NOT NULL DEFAULT (NOW()),
      updated_at TEXT NOT NULL DEFAULT (NOW()),
      FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE,
      UNIQUE (tenant_id, key)
    )
  `);

  const categorySelect = (await hasColumn(db, 'settings_legacy_010', 'category'))
    ? "COALESCE(category, 'general')"
    : "'general'";

  await db.executeQuery(`
    INSERT INTO settings (
      id, tenant_id, key, value, type, description, is_public, category, created_at, updated_at
    )
    SELECT
      id, tenant_id, key, value, type, description, is_public, ${categorySelect}, created_at, updated_at
    FROM settings_legacy_010
  `);
  await db.executeQuery('DROP TABLE settings_legacy_010');
  await db.executeQuery('CREATE INDEX IF NOT EXISTS idx_settings_tenant_id ON settings(tenant_id)');
  await db.executeQuery('CREATE UNIQUE INDEX IF NOT EXISTS idx_settings_tenant_key ON settings(tenant_id, key)');
};

const recreateProjectSettingsTable = async (db: IDatabase): Promise<void> => {
  if (!(await hasTable(db, 'project_settings'))) return;

  await db.executeQuery('ALTER TABLE project_settings RENAME TO project_settings_legacy_010');
  await db.executeQuery(`
    CREATE TABLE project_settings (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL DEFAULT 1,
      key TEXT NOT NULL,
      value TEXT,
      enabled INTEGER DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (NOW()),
      updated_at TEXT NOT NULL DEFAULT (NOW()),
      FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE,
      UNIQUE (tenant_id, key)
    )
  `);
  await db.executeQuery(`
    INSERT INTO project_settings (id, tenant_id, key, value, enabled, created_at, updated_at)
    SELECT id, tenant_id, key, value, enabled, created_at, updated_at
    FROM project_settings_legacy_010
  `);
  await db.executeQuery('DROP TABLE project_settings_legacy_010');
  await db.executeQuery('CREATE INDEX IF NOT EXISTS idx_project_settings_tenant_id ON project_settings(tenant_id)');
  await db.executeQuery('CREATE UNIQUE INDEX IF NOT EXISTS idx_project_settings_tenant_key ON project_settings(tenant_id, key)');
};

const recreateCountersTable = async (db: IDatabase): Promise<void> => {
  if (!(await hasTable(db, 'counters'))) return;

  await db.executeQuery('ALTER TABLE counters RENAME TO counters_legacy_010');
  await db.executeQuery(`
    CREATE TABLE counters (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL DEFAULT 1,
      name TEXT NOT NULL,
      value INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (NOW()),
      updated_at TEXT NOT NULL DEFAULT (NOW()),
      FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE,
      UNIQUE (tenant_id, name)
    )
  `);
  await db.executeQuery(`
    INSERT INTO counters (id, tenant_id, name, value, created_at, updated_at)
    SELECT id, tenant_id, name, value, created_at, updated_at
    FROM counters_legacy_010
  `);
  await db.executeQuery('DROP TABLE counters_legacy_010');
  await db.executeQuery('CREATE INDEX IF NOT EXISTS idx_counters_tenant_id ON counters(tenant_id)');
  await db.executeQuery('CREATE UNIQUE INDEX IF NOT EXISTS idx_counters_tenant_name ON counters(tenant_id, name)');
};

const recreateInvoicesTable = async (db: IDatabase): Promise<void> => {
  if (!(await hasTable(db, 'invoices'))) return;

  await db.executeQuery('ALTER TABLE invoices RENAME TO invoices_legacy_010');
  await db.executeQuery(`
    CREATE TABLE invoices (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL DEFAULT 1,
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
      created_at TEXT NOT NULL DEFAULT (NOW()),
      updated_at TEXT NOT NULL DEFAULT (NOW()),
      FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE,
      FOREIGN KEY (client_id) REFERENCES clients (id) ON DELETE CASCADE,
      FOREIGN KEY (design_template_id) REFERENCES invoice_design_templates (id) ON DELETE SET NULL,
      FOREIGN KEY (recurring_template_id) REFERENCES recurring_invoice_templates (id) ON DELETE SET NULL,
      UNIQUE (tenant_id, invoice_number)
    )
  `);
  const hasStripe = await hasColumn(db, 'invoices_legacy_010', 'stripe_invoice_id');
  const stripeInvoiceId = hasStripe ? 'stripe_invoice_id' : 'NULL';
  const stripePaymentIntentId = hasStripe ? 'stripe_payment_intent_id' : 'NULL';

  await db.executeQuery(`
    INSERT INTO invoices (
      id, tenant_id, invoice_number, client_id, design_template_id, recurring_template_id,
      amount, tax_amount, total_amount, currency, status, due_date, issue_date, paid_date,
      description, items, notes, terms, payment_terms, footer, type, client_name, client_email,
      client_phone, client_address, line_items, tax_rate_id, shipping_amount, shipping_rate_id,
      stripe_invoice_id, stripe_payment_intent_id, email_status, email_sent_at, email_error,
      last_email_attempt, is_recurring, recurring_frequency, next_due_date, created_at, updated_at
    )
    SELECT
      id, tenant_id, invoice_number, client_id, design_template_id, recurring_template_id,
      amount, tax_amount, total_amount, currency, status, due_date, issue_date, paid_date,
      description, items, notes, terms, payment_terms, footer, type, client_name, client_email,
      client_phone, client_address, line_items, tax_rate_id, shipping_amount, shipping_rate_id,
      ${stripeInvoiceId}, ${stripePaymentIntentId}, email_status, email_sent_at, email_error,
      last_email_attempt, is_recurring, recurring_frequency, next_due_date, created_at, updated_at
    FROM invoices_legacy_010
  `);
  await db.executeQuery('DROP TABLE invoices_legacy_010 CASCADE');
  await db.executeQuery('CREATE INDEX IF NOT EXISTS idx_invoices_tenant_id ON invoices(tenant_id)');
  await db.executeQuery('CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_tenant_invoice_number ON invoices(tenant_id, invoice_number)');
};

export const up = async (db: IDatabase): Promise<void> => {
  // PostgreSQL: foreign key constraints cannot be disabled session-wide;
  // run table recreations directly in a transaction.
  await db.transaction(async () => {
    await recreateSettingsTable(db);
    await recreateProjectSettingsTable(db);
    await recreateCountersTable(db);
    await recreateInvoicesTable(db);
  });
};

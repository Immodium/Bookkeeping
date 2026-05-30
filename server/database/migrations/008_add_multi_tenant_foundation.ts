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

const addTenantColumnIfMissing = async (db: IDatabase, tableName: string): Promise<void> => {
  if (!(await hasTable(db, tableName))) return;

  try {
    const rows = await db.getMany(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND column_name = 'tenant_id'`,
      [tableName]
    );
    if (rows.length === 0) {
      await db.executeQuery(`ALTER TABLE ${tableName} ADD COLUMN tenant_id INTEGER NOT NULL DEFAULT 1`);
    }
  } catch {
    // Column may already exist
  }

  try {
    await db.executeQuery(`UPDATE ${tableName} SET tenant_id = 1 WHERE tenant_id IS NULL`);
    await db.executeQuery(`CREATE INDEX IF NOT EXISTS idx_${tableName}_tenant_id ON ${tableName}(tenant_id)`);
  } catch {
    // Index may already exist
  }
};

export const up = async (db: IDatabase): Promise<void> => {
  await db.executeQuery(`
    CREATE TABLE IF NOT EXISTS tenants (
      id SERIAL PRIMARY KEY,
      public_id TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      status TEXT DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT (NOW()),
      updated_at TEXT NOT NULL DEFAULT (NOW())
    )
  `);

  await db.executeQuery(`
    INSERT INTO tenants (id, public_id, name, slug, status)
    VALUES (1, '00000000-0000-7000-8000-000000000001', 'Default Tenant', 'default', 'active')
    ON CONFLICT (id) DO NOTHING
  `);

  const tablesToBackfill = [
    'users', 'clients', 'invoice_design_templates', 'recurring_invoice_templates',
    'invoices', 'invoice_items', 'payments', 'expenses', 'retainers',
    'reports', 'settings', 'project_settings', 'counters', 'report_schedules'
  ];

  for (const table of tablesToBackfill) {
    await addTenantColumnIfMissing(db, table);
  }
};

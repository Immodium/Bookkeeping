import type { IDatabase } from '../../types/database.types.js';

const hasTable = async (db: IDatabase, tableName: string): Promise<boolean> => {
  try {
    const result = await db.getMany<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
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
    const tableInfo = await db.getMany<{ name: string }>(`PRAGMA table_info(${tableName})`, []);
    const hasTenantId = tableInfo.some((col) => col.name === 'tenant_id');
    if (!hasTenantId) {
      await db.executeQuery(`ALTER TABLE ${tableName} ADD COLUMN tenant_id INTEGER NOT NULL DEFAULT 1`);
    }
  } catch {
    // PRAGMA not supported (PostgreSQL)
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
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      status TEXT DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await db.executeQuery(`
    INSERT OR IGNORE INTO tenants (id, name, slug, status)
    VALUES (1, 'Default Tenant', 'default', 'active')
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

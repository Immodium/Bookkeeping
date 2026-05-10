import type { IDatabase } from '../../types/database.types.js';

const hasTable = (db: IDatabase, tableName: string): boolean => {
  try {
    const result = db.getMany<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
      [tableName]
    );
    return result.length > 0;
  } catch {
    return false;
  }
};

const addTenantColumnIfMissing = (db: IDatabase, tableName: string): void => {
  if (!hasTable(db, tableName)) return;

  const tableInfo = db.getMany<{ name: string }>(`PRAGMA table_info(${tableName})`, []);
  const hasTenantId = tableInfo.some((col) => col.name === 'tenant_id');
  if (!hasTenantId) {
    db.executeQuery(`ALTER TABLE ${tableName} ADD COLUMN tenant_id INTEGER NOT NULL DEFAULT 1`);
  }

  db.executeQuery(`UPDATE ${tableName} SET tenant_id = 1 WHERE tenant_id IS NULL`);
  db.executeQuery(`CREATE INDEX IF NOT EXISTS idx_${tableName}_tenant_id ON ${tableName}(tenant_id)`);
};

export const up = (db: IDatabase): void => {
  // Create tenants table (idempotent).
  db.executeQuery(`
    CREATE TABLE IF NOT EXISTS tenants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      status TEXT DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Seed backward-compatible default tenant.
  db.executeQuery(`
    INSERT OR IGNORE INTO tenants (id, name, slug, status)
    VALUES (1, 'Default Tenant', 'default', 'active')
  `);

  const tablesToBackfill = [
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
    'report_schedules'
  ];

  tablesToBackfill.forEach((table) => addTenantColumnIfMissing(db, table));
};

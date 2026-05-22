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

const referencesLegacyInvoiceTable = async (db: IDatabase, tableName: string): Promise<boolean> => {
  if (!(await hasTable(db, tableName))) return false;
  try {
    const foreignKeys = await db.getMany<{ table: string }>(`PRAGMA foreign_key_list(${tableName})`);
    return foreignKeys.some((foreignKey) => foreignKey.table === 'invoices_legacy_010');
  } catch {
    return false;
  }
};

const recreateInvoiceItemsTable = async (db: IDatabase): Promise<void> => {
  if (!(await referencesLegacyInvoiceTable(db, 'invoice_items'))) return;

  await db.executeQuery('ALTER TABLE invoice_items RENAME TO invoice_items_legacy_012');
  await db.executeQuery(`
    CREATE TABLE invoice_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL DEFAULT 1,
      invoice_id INTEGER NOT NULL,
      description TEXT NOT NULL,
      quantity REAL NOT NULL DEFAULT 1,
      unit_price REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      tax_rate REAL DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE,
      FOREIGN KEY (invoice_id) REFERENCES invoices (id) ON DELETE CASCADE
    )
  `);
  await db.executeQuery(`
    INSERT INTO invoice_items (id, tenant_id, invoice_id, description, quantity, unit_price, total, tax_rate, sort_order, created_at)
    SELECT id, COALESCE(tenant_id, 1), invoice_id, description, COALESCE(quantity, 1), COALESCE(unit_price, 0),
           COALESCE(total, 0), COALESCE(tax_rate, 0), COALESCE(sort_order, 0), COALESCE(created_at, datetime('now'))
    FROM invoice_items_legacy_012
  `);
  await db.executeQuery('DROP TABLE invoice_items_legacy_012');
  await db.executeQuery('CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON invoice_items(invoice_id)');
  await db.executeQuery('CREATE INDEX IF NOT EXISTS idx_invoice_items_tenant_id ON invoice_items(tenant_id)');
};

const recreatePaymentsTable = async (db: IDatabase): Promise<void> => {
  if (!(await referencesLegacyInvoiceTable(db, 'payments'))) return;

  await db.executeQuery('ALTER TABLE payments RENAME TO payments_legacy_012');
  await db.executeQuery(`
    CREATE TABLE payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL DEFAULT 1,
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
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE,
      FOREIGN KEY (invoice_id) REFERENCES invoices (id) ON DELETE SET NULL,
      FOREIGN KEY (client_id) REFERENCES clients (id) ON DELETE CASCADE
    )
  `);
  await db.executeQuery(`
    INSERT INTO payments (id, tenant_id, invoice_id, client_id, amount, currency, method, status,
                          transaction_id, stripe_payment_id, notes, date, created_at, updated_at)
    SELECT id, COALESCE(tenant_id, 1), invoice_id, client_id, amount, COALESCE(currency, 'USD'), method,
           COALESCE(status, 'pending'), transaction_id, stripe_payment_id, notes, date,
           COALESCE(created_at, datetime('now')), COALESCE(updated_at, datetime('now'))
    FROM payments_legacy_012
  `);
  await db.executeQuery('DROP TABLE payments_legacy_012');
  await db.executeQuery('CREATE INDEX IF NOT EXISTS idx_payments_tenant_id ON payments(tenant_id)');
  await db.executeQuery('CREATE INDEX IF NOT EXISTS idx_payments_invoice_id ON payments(invoice_id)');
  await db.executeQuery('CREATE INDEX IF NOT EXISTS idx_payments_client_id ON payments(client_id)');
};

export const up = async (db: IDatabase): Promise<void> => {
  try {
    await db.executeQuery('PRAGMA foreign_keys = OFF');
  } catch {
    // PostgreSQL doesn't have PRAGMA
  }
  try {
    await db.transaction(async () => {
      await recreateInvoiceItemsTable(db);
      await recreatePaymentsTable(db);
    });
  } catch {
    // May fail safely on fresh databases or PostgreSQL
  } finally {
    try {
      await db.executeQuery('PRAGMA foreign_keys = ON');
    } catch {
      // PostgreSQL doesn't have PRAGMA
    }
  }
};

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

const referencesLegacyInvoiceTable = async (db: IDatabase, tableName: string): Promise<boolean> => {
  if (!(await hasTable(db, tableName))) return false;
  try {
    // Check if tableName references invoices_legacy_010 via information_schema
    const rows = await db.getMany<{ constraint_name: string }>(
      `SELECT tc.constraint_name
       FROM information_schema.table_constraints tc
       JOIN information_schema.referential_constraints rc ON rc.constraint_name = tc.constraint_name
       JOIN information_schema.table_constraints tc2 ON tc2.constraint_name = rc.unique_constraint_name
       WHERE tc.table_name = $1 AND tc2.table_name = 'invoices_legacy_010'`,
      [tableName]
    );
    return rows.length > 0;
  } catch {
    return false;
  }
};

const recreateInvoiceItemsTable = async (db: IDatabase): Promise<void> => {
  if (!(await referencesLegacyInvoiceTable(db, 'invoice_items'))) return;

  await db.executeQuery('ALTER TABLE invoice_items RENAME TO invoice_items_legacy_012');
  await db.executeQuery(`
    CREATE TABLE invoice_items (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL DEFAULT 1,
      invoice_id INTEGER NOT NULL,
      description TEXT NOT NULL,
      quantity REAL NOT NULL DEFAULT 1,
      unit_price REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      tax_rate REAL DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (NOW()),
      FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE,
      FOREIGN KEY (invoice_id) REFERENCES invoices (id) ON DELETE CASCADE
    )
  `);
  await db.executeQuery(`
    INSERT INTO invoice_items (id, tenant_id, invoice_id, description, quantity, unit_price, total, tax_rate, sort_order, created_at)
    SELECT id, COALESCE(tenant_id, 1), invoice_id, description, COALESCE(quantity, 1), COALESCE(unit_price, 0),
           COALESCE(total, 0), COALESCE(tax_rate, 0), COALESCE(sort_order, 0), COALESCE(created_at, NOW())
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
      id SERIAL PRIMARY KEY,
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
      created_at TEXT NOT NULL DEFAULT (NOW()),
      updated_at TEXT NOT NULL DEFAULT (NOW()),
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
           COALESCE(created_at, NOW()), COALESCE(updated_at, NOW())
    FROM payments_legacy_012
  `);
  await db.executeQuery('DROP TABLE payments_legacy_012');
  await db.executeQuery('CREATE INDEX IF NOT EXISTS idx_payments_tenant_id ON payments(tenant_id)');
  await db.executeQuery('CREATE INDEX IF NOT EXISTS idx_payments_invoice_id ON payments(invoice_id)');
  await db.executeQuery('CREATE INDEX IF NOT EXISTS idx_payments_client_id ON payments(client_id)');
};

export const up = async (db: IDatabase): Promise<void> => {
  // PostgreSQL: run table recreations in a transaction (no PRAGMA needed)
  try {
    await db.transaction(async () => {
      await recreateInvoiceItemsTable(db);
      await recreatePaymentsTable(db);
    });
  } catch {
    // May fail safely on fresh databases where legacy tables don't exist
  }
};

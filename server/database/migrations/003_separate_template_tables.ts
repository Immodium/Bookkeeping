import type { IDatabase } from '../../types/database.types.js';

export const up = async (db: IDatabase): Promise<void> => {
  // invoice_design_templates and recurring_invoice_templates are already
  // created as separate tables in the initial schema. This migration
  // exists for databases that were created before the table separation.
  await db.executeQuery(`
    CREATE TABLE IF NOT EXISTS invoice_design_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      content TEXT NOT NULL,
      is_default INTEGER DEFAULT 0,
      variables TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await db.executeQuery(`
    CREATE TABLE IF NOT EXISTS recurring_invoice_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (client_id) REFERENCES clients (id) ON DELETE CASCADE
    )
  `);
};

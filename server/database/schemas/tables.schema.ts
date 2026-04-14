// Database table schema definitions for Slimbooks
// Centralized table creation and schema management

import type { IDatabase, TableSchema } from '../../types/database.types.js';
import { createTokenTables } from './tokenTables.schema.js';

/**
 * User authentication and management table
 */
const usersSchema: TableSchema = {
  name: 'users',
  columns: [
    { name: 'id', type: 'INTEGER', constraints: ['PRIMARY KEY AUTOINCREMENT'] },
    { name: 'name', type: 'TEXT', constraints: ['NOT NULL'] },
    { name: 'email', type: 'TEXT', constraints: ['UNIQUE NOT NULL'] },
    { name: 'username', type: 'TEXT', constraints: ['UNIQUE NOT NULL'] },
    { name: 'password_hash', type: 'TEXT' },
    { name: 'role', type: 'TEXT', constraints: ["DEFAULT 'user'"] },
    { name: 'email_verified', type: 'INTEGER', constraints: ['DEFAULT 0'] },
    { name: 'google_id', type: 'TEXT', constraints: ['UNIQUE'] },
    { name: 'two_factor_secret', type: 'TEXT' },
    { name: 'backup_codes', type: 'TEXT' },
    { name: 'last_login', type: 'TEXT' },
    { name: 'failed_login_attempts', type: 'INTEGER', constraints: ['DEFAULT 0'] },
    { name: 'account_locked_until', type: 'TEXT' },
    { name: 'password_updated_at', type: 'TEXT' },
    { name: 'email_verified_at', type: 'TEXT' },
    { name: 'created_at', type: 'TEXT', constraints: ['NOT NULL DEFAULT (datetime(\'now\'))'] },
    { name: 'updated_at', type: 'TEXT', constraints: ['NOT NULL DEFAULT (datetime(\'now\'))'] }
  ]
};

/**
 * Client/customer management table
 */
const clientsSchema: TableSchema = {
  name: 'clients',
  columns: [
    { name: 'id', type: 'INTEGER', constraints: ['PRIMARY KEY AUTOINCREMENT'] },
    { name: 'name', type: 'TEXT', constraints: ['NOT NULL'] },
    { name: 'first_name', type: 'TEXT' },
    { name: 'last_name', type: 'TEXT' },
    { name: 'email', type: 'TEXT' },
    { name: 'phone', type: 'TEXT' },
    { name: 'company', type: 'TEXT' },
    { name: 'address', type: 'TEXT' },
    { name: 'city', type: 'TEXT' },
    { name: 'state', type: 'TEXT' },
    { name: 'zip', type: 'TEXT' },
    { name: 'country', type: 'TEXT' },
    { name: 'tax_id', type: 'TEXT' },
    { name: 'notes', type: 'TEXT' },
    { name: 'stripe_customer_id', type: 'TEXT' },
    { name: 'is_active', type: 'INTEGER', constraints: ['DEFAULT 1'] },
    { name: 'deleted_at', type: 'TEXT' },
    { name: 'created_at', type: 'TEXT', constraints: ['NOT NULL DEFAULT (datetime(\'now\'))'] },
    { name: 'updated_at', type: 'TEXT', constraints: ['NOT NULL DEFAULT (datetime(\'now\'))'] }
  ]
};

/**
 * Invoice management table
 */
const invoicesSchema: TableSchema = {
  name: 'invoices',
  columns: [
    { name: 'id', type: 'INTEGER', constraints: ['PRIMARY KEY AUTOINCREMENT'] },
    { name: 'invoice_number', type: 'TEXT', constraints: ['UNIQUE NOT NULL'] },
    { name: 'client_id', type: 'INTEGER', constraints: ['NOT NULL'] },
    { name: 'design_template_id', type: 'INTEGER' },
    { name: 'recurring_template_id', type: 'INTEGER' },
    { name: 'amount', type: 'REAL', constraints: ['NOT NULL DEFAULT 0'] },
    { name: 'tax_amount', type: 'REAL', constraints: ['DEFAULT 0'] },
    { name: 'total_amount', type: 'REAL', constraints: ['NOT NULL DEFAULT 0'] },
    { name: 'currency', type: 'TEXT', constraints: ['DEFAULT \'USD\''] },
    { name: 'status', type: 'TEXT', constraints: ['DEFAULT \'draft\''] },
    { name: 'due_date', type: 'TEXT' },
    { name: 'issue_date', type: 'TEXT' },
    { name: 'paid_date', type: 'TEXT' },
    { name: 'description', type: 'TEXT' },
    { name: 'items', type: 'TEXT' },
    { name: 'notes', type: 'TEXT' },
    { name: 'terms', type: 'TEXT' },
    { name: 'payment_terms', type: 'TEXT' },
    { name: 'footer', type: 'TEXT' },
    { name: 'type', type: 'TEXT', constraints: ['DEFAULT \'one-time\''] },
    { name: 'client_name', type: 'TEXT' },
    { name: 'client_email', type: 'TEXT' },
    { name: 'client_phone', type: 'TEXT' },
    { name: 'client_address', type: 'TEXT' },
    { name: 'line_items', type: 'TEXT' },
    { name: 'tax_rate_id', type: 'TEXT' },
    { name: 'shipping_amount', type: 'REAL', constraints: ['DEFAULT 0'] },
    { name: 'shipping_rate_id', type: 'TEXT' },
    { name: 'stripe_invoice_id', type: 'TEXT' },
    { name: 'stripe_payment_intent_id', type: 'TEXT' },
    { name: 'email_status', type: 'TEXT', constraints: ['DEFAULT \'not_sent\''] },
    { name: 'email_sent_at', type: 'TEXT' },
    { name: 'email_error', type: 'TEXT' },
    { name: 'last_email_attempt', type: 'TEXT' },
    { name: 'is_recurring', type: 'INTEGER', constraints: ['DEFAULT 0'] },
    { name: 'recurring_frequency', type: 'TEXT' },
    { name: 'next_due_date', type: 'TEXT' },
    { name: 'created_at', type: 'TEXT', constraints: ['NOT NULL DEFAULT (datetime(\'now\'))'] },
    { name: 'updated_at', type: 'TEXT', constraints: ['NOT NULL DEFAULT (datetime(\'now\'))'] }
  ],
  constraints: [
    'FOREIGN KEY (client_id) REFERENCES clients (id) ON DELETE CASCADE',
    'FOREIGN KEY (design_template_id) REFERENCES invoice_design_templates (id) ON DELETE SET NULL',
    'FOREIGN KEY (recurring_template_id) REFERENCES recurring_invoice_templates (id) ON DELETE SET NULL'
  ]
};

/**
 * Invoice line items table
 */
const invoiceItemsSchema: TableSchema = {
  name: 'invoice_items',
  columns: [
    { name: 'id', type: 'INTEGER', constraints: ['PRIMARY KEY AUTOINCREMENT'] },
    { name: 'invoice_id', type: 'INTEGER', constraints: ['NOT NULL'] },
    { name: 'description', type: 'TEXT', constraints: ['NOT NULL'] },
    { name: 'quantity', type: 'REAL', constraints: ['NOT NULL DEFAULT 1'] },
    { name: 'unit_price', type: 'REAL', constraints: ['NOT NULL DEFAULT 0'] },
    { name: 'total', type: 'REAL', constraints: ['NOT NULL DEFAULT 0'] },
    { name: 'tax_rate', type: 'REAL', constraints: ['DEFAULT 0'] },
    { name: 'sort_order', type: 'INTEGER', constraints: ['DEFAULT 0'] },
    { name: 'created_at', type: 'TEXT', constraints: ['NOT NULL DEFAULT (datetime(\'now\'))'] }
  ],
  constraints: [
    'FOREIGN KEY (invoice_id) REFERENCES invoices (id) ON DELETE CASCADE'
  ]
};

/**
 * Payment tracking table
 */
const paymentsSchema: TableSchema = {
  name: 'payments',
  columns: [
    { name: 'id', type: 'INTEGER', constraints: ['PRIMARY KEY AUTOINCREMENT'] },
    { name: 'invoice_id', type: 'INTEGER' },
    { name: 'client_id', type: 'INTEGER', constraints: ['NOT NULL'] },
    { name: 'amount', type: 'REAL', constraints: ['NOT NULL'] },
    { name: 'currency', type: 'TEXT', constraints: ['DEFAULT \'USD\''] },
    { name: 'method', type: 'TEXT', constraints: ['NOT NULL'] },
    { name: 'status', type: 'TEXT', constraints: ['DEFAULT \'pending\''] },
    { name: 'transaction_id', type: 'TEXT' },
    { name: 'stripe_payment_id', type: 'TEXT' },
    { name: 'notes', type: 'TEXT' },
    { name: 'date', type: 'TEXT', constraints: ['NOT NULL'] },
    { name: 'created_at', type: 'TEXT', constraints: ['NOT NULL DEFAULT (datetime(\'now\'))'] },
    { name: 'updated_at', type: 'TEXT', constraints: ['NOT NULL DEFAULT (datetime(\'now\'))'] }
  ],
  constraints: [
    'FOREIGN KEY (invoice_id) REFERENCES invoices (id) ON DELETE SET NULL',
    'FOREIGN KEY (client_id) REFERENCES clients (id) ON DELETE CASCADE'
  ]
};

/**
 * Expense tracking table
 */
const expensesSchema: TableSchema = {
  name: 'expenses',
  columns: [
    { name: 'id', type: 'INTEGER', constraints: ['PRIMARY KEY AUTOINCREMENT'] },
    { name: 'description', type: 'TEXT', constraints: ['NOT NULL'] },
    { name: 'amount', type: 'REAL', constraints: ['NOT NULL'] },
    { name: 'currency', type: 'TEXT', constraints: ['DEFAULT \'USD\''] },
    { name: 'category', type: 'TEXT' },
    { name: 'date', type: 'TEXT', constraints: ['NOT NULL'] },
    { name: 'vendor', type: 'TEXT' },
    { name: 'notes', type: 'TEXT' },
    { name: 'receipt_url', type: 'TEXT' },
    { name: 'is_billable', type: 'INTEGER', constraints: ['DEFAULT 0'] },
    { name: 'client_id', type: 'INTEGER' },
    { name: 'project', type: 'TEXT' },
    { name: 'created_at', type: 'TEXT', constraints: ['NOT NULL DEFAULT (datetime(\'now\'))'] },
    { name: 'updated_at', type: 'TEXT', constraints: ['NOT NULL DEFAULT (datetime(\'now\'))'] }
  ],
  constraints: [
    'FOREIGN KEY (client_id) REFERENCES clients (id) ON DELETE SET NULL'
  ]
};

/**
 * Invoice design templates table - for invoice layout/design templates
 */
const invoiceDesignTemplatesSchema: TableSchema = {
  name: 'invoice_design_templates',
  columns: [
    { name: 'id', type: 'INTEGER', constraints: ['PRIMARY KEY AUTOINCREMENT'] },
    { name: 'name', type: 'TEXT', constraints: ['NOT NULL'] },
    { name: 'content', type: 'TEXT', constraints: ['NOT NULL'] },
    { name: 'is_default', type: 'INTEGER', constraints: ['DEFAULT 0'] },
    { name: 'variables', type: 'TEXT' },
    { name: 'created_at', type: 'TEXT', constraints: ['NOT NULL DEFAULT (datetime(\'now\'))'] },
    { name: 'updated_at', type: 'TEXT', constraints: ['NOT NULL DEFAULT (datetime(\'now\'))'] }
  ]
};

/**
 * Recurring invoice templates table - for scheduled/recurring invoices
 */
const recurringInvoiceTemplatesSchema: TableSchema = {
  name: 'recurring_invoice_templates',
  columns: [
    { name: 'id', type: 'INTEGER', constraints: ['PRIMARY KEY AUTOINCREMENT'] },
    { name: 'name', type: 'TEXT', constraints: ['NOT NULL'] },
    { name: 'client_id', type: 'INTEGER', constraints: ['NOT NULL'] },
    { name: 'amount', type: 'REAL', constraints: ['NOT NULL'] },
    { name: 'description', type: 'TEXT' },
    { name: 'frequency', type: 'TEXT', constraints: ['NOT NULL'] },
    { name: 'payment_terms', type: 'TEXT', constraints: ['NOT NULL'] },
    { name: 'next_invoice_date', type: 'TEXT', constraints: ['NOT NULL'] },
    { name: 'is_active', type: 'INTEGER', constraints: ['DEFAULT 1'] },
    { name: 'line_items', type: 'TEXT' },
    { name: 'tax_amount', type: 'REAL', constraints: ['DEFAULT 0'] },
    { name: 'tax_rate_id', type: 'TEXT' },
    { name: 'shipping_amount', type: 'REAL', constraints: ['DEFAULT 0'] },
    { name: 'shipping_rate_id', type: 'TEXT' },
    { name: 'notes', type: 'TEXT' },
    { name: 'created_at', type: 'TEXT', constraints: ['NOT NULL DEFAULT (datetime(\'now\'))'] },
    { name: 'updated_at', type: 'TEXT', constraints: ['NOT NULL DEFAULT (datetime(\'now\'))'] }
  ],
  constraints: [
    'FOREIGN KEY (client_id) REFERENCES clients (id) ON DELETE CASCADE'
  ]
};

/**
 * Application settings table
 */
const settingsSchema: TableSchema = {
  name: 'settings',
  columns: [
    { name: 'id', type: 'INTEGER', constraints: ['PRIMARY KEY AUTOINCREMENT'] },
    { name: 'key', type: 'TEXT', constraints: ['UNIQUE NOT NULL'] },
    { name: 'value', type: 'TEXT' },
    { name: 'type', type: 'TEXT', constraints: ['DEFAULT \'string\''] },
    { name: 'description', type: 'TEXT' },
    { name: 'is_public', type: 'INTEGER', constraints: ['DEFAULT 0'] },
    { name: 'created_at', type: 'TEXT', constraints: ['NOT NULL DEFAULT (datetime(\'now\'))'] },
    { name: 'updated_at', type: 'TEXT', constraints: ['NOT NULL DEFAULT (datetime(\'now\'))'] }
  ]
};

/**
 * Project-specific settings table
 */
const projectSettingsSchema: TableSchema = {
  name: 'project_settings',
  columns: [
    { name: 'id', type: 'INTEGER', constraints: ['PRIMARY KEY AUTOINCREMENT'] },
    { name: 'key', type: 'TEXT', constraints: ['UNIQUE NOT NULL'] },
    { name: 'value', type: 'TEXT' },
    { name: 'enabled', type: 'INTEGER', constraints: ['DEFAULT 1'] },
    { name: 'created_at', type: 'TEXT', constraints: ['NOT NULL DEFAULT (datetime(\'now\'))'] },
    { name: 'updated_at', type: 'TEXT', constraints: ['NOT NULL DEFAULT (datetime(\'now\'))'] }
  ]
};

/**
 * Reports table for storing generated reports
 */
const reportsSchema: TableSchema = {
  name: 'reports',
  columns: [
    { name: 'id', type: 'INTEGER', constraints: ['PRIMARY KEY AUTOINCREMENT'] },
    { name: 'name', type: 'TEXT', constraints: ['NOT NULL'] },
    { name: 'type', type: 'TEXT', constraints: ['NOT NULL'] },
    { name: 'date_range_start', type: 'TEXT' },
    { name: 'date_range_end', type: 'TEXT' },
    { name: 'data', type: 'TEXT' },
    { name: 'created_at', type: 'TEXT', constraints: ['NOT NULL DEFAULT (datetime(\'now\'))'] }
  ]
};

/**
 * Counters for generating sequential numbers
 */
const countersSchema: TableSchema = {
  name: 'counters',
  columns: [
    { name: 'id', type: 'INTEGER', constraints: ['PRIMARY KEY AUTOINCREMENT'] },
    { name: 'name', type: 'TEXT', constraints: ['UNIQUE NOT NULL'] },
    { name: 'value', type: 'INTEGER', constraints: ['NOT NULL DEFAULT 0'] },
    { name: 'created_at', type: 'TEXT', constraints: ['NOT NULL DEFAULT (datetime(\'now\'))'] },
    { name: 'updated_at', type: 'TEXT', constraints: ['NOT NULL DEFAULT (datetime(\'now\'))'] }
  ]
};

// Export all schemas
export const tableSchemas: TableSchema[] = [
  usersSchema,
  clientsSchema,
  invoiceDesignTemplatesSchema, // Create design templates before invoices due to FK
  recurringInvoiceTemplatesSchema, // Create recurring templates
  invoicesSchema,
  invoiceItemsSchema,
  paymentsSchema,
  expensesSchema,
  reportsSchema,
  settingsSchema,
  projectSettingsSchema,
  countersSchema
];

/**
 * Create all database tables
 */
export const createTables = (db: IDatabase): void => {
  tableSchemas.forEach(schema => {
    const columnDefs = schema.columns
      .map(col => `${col.name} ${col.type} ${col.constraints?.join(' ') || ''}`)
      .join(', ');

    const constraints = schema.constraints
      ? ', ' + schema.constraints.join(', ')
      : '';

    const createTableSQL = `CREATE TABLE IF NOT EXISTS ${schema.name} (${columnDefs}${constraints})`;

    db.executeQuery(createTableSQL);
  });

  // Create token tables for password reset and email verification
  createTokenTables(db);
};

/**
 * Drop all tables (useful for testing)
 */
export const dropAllTables = (db: IDatabase): void => {
  // Drop in reverse order to handle foreign key constraints
  const reverseSchemas = [...tableSchemas].reverse();
  reverseSchemas.forEach(schema => {
    db.executeQuery(`DROP TABLE IF EXISTS ${schema.name}`);
  });
};
// Database table schema definitions for Slimbooks
// Centralized table creation and schema management

import type { IDatabase, TableSchema } from '../../types/database.types.js';
import { createTokenTables } from './tokenTables.schema.js';

/**
 * Tenant/organization table for SaaS multi-tenancy
 */
const tenantsSchema: TableSchema = {
  name: 'tenants',
  columns: [
    { name: 'id', type: 'INTEGER', constraints: ['PRIMARY KEY GENERATED ALWAYS AS IDENTITY'] },
    { name: 'public_id', type: 'TEXT', constraints: ['UNIQUE NOT NULL'] },
    { name: 'name', type: 'TEXT', constraints: ['NOT NULL'] },
    { name: 'slug', type: 'TEXT', constraints: ['UNIQUE NOT NULL'] },
    { name: 'status', type: 'TEXT', constraints: ["DEFAULT 'active'"] },
    { name: 'created_at', type: 'TIMESTAMPTZ', constraints: ['NOT NULL DEFAULT NOW()'] },
    { name: 'updated_at', type: 'TIMESTAMPTZ', constraints: ['NOT NULL DEFAULT NOW()'] }
  ]
};

/**
 * SaaS subscription plan catalog
 */
const subscriptionPlansSchema: TableSchema = {
  name: 'subscription_plans',
  columns: [
    { name: 'id', type: 'INTEGER', constraints: ['PRIMARY KEY GENERATED ALWAYS AS IDENTITY'] },
    { name: 'code', type: 'TEXT', constraints: ['UNIQUE NOT NULL'] },
    { name: 'name', type: 'TEXT', constraints: ['NOT NULL'] },
    { name: 'status', type: 'TEXT', constraints: ["NOT NULL DEFAULT 'active'"] },
    { name: 'price_cents', type: 'INTEGER', constraints: ['NOT NULL DEFAULT 0'] },
    { name: 'currency', type: 'TEXT', constraints: ["NOT NULL DEFAULT 'usd'"] },
    { name: 'billing_interval', type: 'TEXT', constraints: ["NOT NULL DEFAULT 'monthly'"] },
    { name: 'trial_days', type: 'INTEGER', constraints: ['NOT NULL DEFAULT 0'] },
    { name: 'features_json', type: 'TEXT' },
    { name: 'created_at', type: 'TIMESTAMPTZ', constraints: ['NOT NULL DEFAULT NOW()'] },
    { name: 'updated_at', type: 'TIMESTAMPTZ', constraints: ['NOT NULL DEFAULT NOW()'] }
  ]
};

/**
 * Tenant subscription lifecycle state
 */
const tenantSubscriptionsSchema: TableSchema = {
  name: 'tenant_subscriptions',
  columns: [
    { name: 'id', type: 'INTEGER', constraints: ['PRIMARY KEY GENERATED ALWAYS AS IDENTITY'] },
    { name: 'tenant_id', type: 'INTEGER', constraints: ['NOT NULL'] },
    { name: 'plan_id', type: 'INTEGER', constraints: ['NOT NULL'] },
    { name: 'status', type: 'TEXT', constraints: ["NOT NULL DEFAULT 'active'"] },
    { name: 'started_at', type: 'TEXT' },
    { name: 'current_period_start', type: 'TEXT' },
    { name: 'current_period_end', type: 'TEXT' },
    { name: 'cancel_at_period_end', type: 'INTEGER', constraints: ['NOT NULL DEFAULT 0'] },
    { name: 'canceled_at', type: 'TEXT' },
    { name: 'provider', type: 'TEXT', constraints: ["NOT NULL DEFAULT 'internal'"] },
    { name: 'provider_customer_id', type: 'TEXT' },
    { name: 'provider_subscription_id', type: 'TEXT' },
    { name: 'metadata_json', type: 'TEXT' },
    { name: 'created_at', type: 'TIMESTAMPTZ', constraints: ['NOT NULL DEFAULT NOW()'] },
    { name: 'updated_at', type: 'TIMESTAMPTZ', constraints: ['NOT NULL DEFAULT NOW()'] }
  ],
  constraints: [
    'FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE',
    'FOREIGN KEY (plan_id) REFERENCES subscription_plans (id) ON DELETE RESTRICT',
    'UNIQUE (tenant_id)'
  ]
};

/**
 * Tenant entitlement overrides (plan defaults can be overridden here)
 */
const tenantEntitlementsSchema: TableSchema = {
  name: 'tenant_entitlements',
  columns: [
    { name: 'id', type: 'INTEGER', constraints: ['PRIMARY KEY GENERATED ALWAYS AS IDENTITY'] },
    { name: 'tenant_id', type: 'INTEGER', constraints: ['NOT NULL'] },
    { name: 'key', type: 'TEXT', constraints: ['NOT NULL'] },
    { name: 'value', type: 'TEXT', constraints: ['NOT NULL'] },
    { name: 'source', type: 'TEXT', constraints: ["NOT NULL DEFAULT 'manual'"] },
    { name: 'updated_by_user_id', type: 'INTEGER' },
    { name: 'created_at', type: 'TIMESTAMPTZ', constraints: ['NOT NULL DEFAULT NOW()'] },
    { name: 'updated_at', type: 'TIMESTAMPTZ', constraints: ['NOT NULL DEFAULT NOW()'] }
  ],
  constraints: [
    'FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE',
    'UNIQUE (tenant_id, key)'
  ]
};

/**
 * User authentication and management table
 */
const usersSchema: TableSchema = {
  name: 'users',
  columns: [
    { name: 'id', type: 'INTEGER', constraints: ['PRIMARY KEY GENERATED ALWAYS AS IDENTITY'] },
    { name: 'tenant_id', type: 'INTEGER', constraints: ['NOT NULL DEFAULT 1'] },
    { name: 'name', type: 'TEXT', constraints: ['NOT NULL'] },
    { name: 'email', type: 'TEXT', constraints: ['UNIQUE NOT NULL'] },
    { name: 'username', type: 'TEXT', constraints: ['UNIQUE NOT NULL'] },
    { name: 'password_hash', type: 'TEXT' },
    { name: 'role', type: 'TEXT', constraints: ["DEFAULT 'user'"] },
    { name: 'email_verified', type: 'INTEGER', constraints: ['DEFAULT 0'] },
    { name: 'roles', type: 'TEXT' },
    { name: 'two_factor_secret', type: 'TEXT' },
    { name: 'backup_codes', type: 'TEXT' },
    { name: 'last_login', type: 'TEXT' },
    { name: 'failed_login_attempts', type: 'INTEGER', constraints: ['DEFAULT 0'] },
    { name: 'account_locked_until', type: 'TEXT' },
    { name: 'password_updated_at', type: 'TEXT' },
    { name: 'email_verified_at', type: 'TEXT' },
    { name: 'token_version', type: 'INTEGER', constraints: ['NOT NULL DEFAULT 0'] },
    { name: 'created_at', type: 'TIMESTAMPTZ', constraints: ['NOT NULL DEFAULT NOW()'] },
    { name: 'updated_at', type: 'TIMESTAMPTZ', constraints: ['NOT NULL DEFAULT NOW()'] }
  ],
  constraints: [
    'FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE'
  ]
};

/**
 * Client/customer management table
 */
const clientsSchema: TableSchema = {
  name: 'clients',
  columns: [
    { name: 'id', type: 'INTEGER', constraints: ['PRIMARY KEY GENERATED ALWAYS AS IDENTITY'] },
    { name: 'tenant_id', type: 'INTEGER', constraints: ['NOT NULL DEFAULT 1'] },
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
    { name: 'is_active', type: 'INTEGER', constraints: ['DEFAULT 1'] },
    { name: 'deleted_at', type: 'TEXT' },
    { name: 'created_at', type: 'TIMESTAMPTZ', constraints: ['NOT NULL DEFAULT NOW()'] },
    { name: 'updated_at', type: 'TIMESTAMPTZ', constraints: ['NOT NULL DEFAULT NOW()'] }
  ],
  constraints: [
    'FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE'
  ]
};

/**
 * Invoice management table
 */
const invoicesSchema: TableSchema = {
  name: 'invoices',
  columns: [
    { name: 'id', type: 'INTEGER', constraints: ['PRIMARY KEY GENERATED ALWAYS AS IDENTITY'] },
    { name: 'tenant_id', type: 'INTEGER', constraints: ['NOT NULL DEFAULT 1'] },
    { name: 'invoice_number', type: 'TEXT', constraints: ['NOT NULL'] },
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
    { name: 'email_status', type: 'TEXT', constraints: ['DEFAULT \'not_sent\''] },
    { name: 'email_sent_at', type: 'TEXT' },
    { name: 'email_error', type: 'TEXT' },
    { name: 'last_email_attempt', type: 'TEXT' },
    { name: 'is_recurring', type: 'INTEGER', constraints: ['DEFAULT 0'] },
    { name: 'recurring_frequency', type: 'TEXT' },
    { name: 'next_due_date', type: 'TEXT' },
    { name: 'created_at', type: 'TIMESTAMPTZ', constraints: ['NOT NULL DEFAULT NOW()'] },
    { name: 'updated_at', type: 'TIMESTAMPTZ', constraints: ['NOT NULL DEFAULT NOW()'] }
  ],
  constraints: [
    'FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE',
    'FOREIGN KEY (client_id) REFERENCES clients (id) ON DELETE CASCADE',
    'FOREIGN KEY (design_template_id) REFERENCES invoice_design_templates (id) ON DELETE SET NULL',
    'FOREIGN KEY (recurring_template_id) REFERENCES recurring_invoice_templates (id) ON DELETE SET NULL',
    'UNIQUE (tenant_id, invoice_number)'
  ]
};

/**
 * Invoice line items table
 */
const invoiceItemsSchema: TableSchema = {
  name: 'invoice_items',
  columns: [
    { name: 'id', type: 'INTEGER', constraints: ['PRIMARY KEY GENERATED ALWAYS AS IDENTITY'] },
    { name: 'tenant_id', type: 'INTEGER', constraints: ['NOT NULL DEFAULT 1'] },
    { name: 'invoice_id', type: 'INTEGER', constraints: ['NOT NULL'] },
    { name: 'description', type: 'TEXT', constraints: ['NOT NULL'] },
    { name: 'quantity', type: 'REAL', constraints: ['NOT NULL DEFAULT 1'] },
    { name: 'unit_price', type: 'REAL', constraints: ['NOT NULL DEFAULT 0'] },
    { name: 'total', type: 'REAL', constraints: ['NOT NULL DEFAULT 0'] },
    { name: 'tax_rate', type: 'REAL', constraints: ['DEFAULT 0'] },
    { name: 'sort_order', type: 'INTEGER', constraints: ['DEFAULT 0'] },
    { name: 'created_at', type: 'TIMESTAMPTZ', constraints: ['NOT NULL DEFAULT NOW()'] }
  ],
  constraints: [
    'FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE',
    'FOREIGN KEY (invoice_id) REFERENCES invoices (id) ON DELETE CASCADE'
  ]
};

/**
 * Payment tracking table
 */
const paymentsSchema: TableSchema = {
  name: 'payments',
  columns: [
    { name: 'id', type: 'INTEGER', constraints: ['PRIMARY KEY GENERATED ALWAYS AS IDENTITY'] },
    { name: 'tenant_id', type: 'INTEGER', constraints: ['NOT NULL DEFAULT 1'] },
    { name: 'invoice_id', type: 'INTEGER' },
    { name: 'client_id', type: 'INTEGER', constraints: ['NOT NULL'] },
    { name: 'amount', type: 'REAL', constraints: ['NOT NULL'] },
    { name: 'currency', type: 'TEXT', constraints: ['DEFAULT \'USD\''] },
    { name: 'method', type: 'TEXT', constraints: ['NOT NULL'] },
    { name: 'status', type: 'TEXT', constraints: ['DEFAULT \'pending\''] },
    { name: 'transaction_id', type: 'TEXT' },
    { name: 'notes', type: 'TEXT' },
    { name: 'date', type: 'TEXT', constraints: ['NOT NULL'] },
    { name: 'created_at', type: 'TIMESTAMPTZ', constraints: ['NOT NULL DEFAULT NOW()'] },
    { name: 'updated_at', type: 'TIMESTAMPTZ', constraints: ['NOT NULL DEFAULT NOW()'] }
  ],
  constraints: [
    'FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE',
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
    { name: 'id', type: 'INTEGER', constraints: ['PRIMARY KEY GENERATED ALWAYS AS IDENTITY'] },
    { name: 'tenant_id', type: 'INTEGER', constraints: ['NOT NULL DEFAULT 1'] },
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
    { name: 'status', type: 'TEXT', constraints: ['NOT NULL DEFAULT \'pending\''] },
    { name: 'created_at', type: 'TIMESTAMPTZ', constraints: ['NOT NULL DEFAULT NOW()'] },
    { name: 'updated_at', type: 'TIMESTAMPTZ', constraints: ['NOT NULL DEFAULT NOW()'] }
  ],
  constraints: [
    'FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE',
    'FOREIGN KEY (client_id) REFERENCES clients (id) ON DELETE SET NULL'
  ]
};

/**
 * Client retainer agreements table
 */
const retainersSchema: TableSchema = {
  name: 'retainers',
  columns: [
    { name: 'id', type: 'INTEGER', constraints: ['PRIMARY KEY GENERATED ALWAYS AS IDENTITY'] },
    { name: 'tenant_id', type: 'INTEGER', constraints: ['NOT NULL DEFAULT 1'] },
    { name: 'client_id', type: 'INTEGER', constraints: ['NOT NULL'] },
    { name: 'name', type: 'TEXT', constraints: ['NOT NULL'] },
    { name: 'description', type: 'TEXT' },
    { name: 'amount', type: 'REAL', constraints: ['NOT NULL'] },
    { name: 'currency', type: 'TEXT', constraints: ['DEFAULT \'USD\''] },
    { name: 'billing_cycle', type: 'TEXT', constraints: ['NOT NULL DEFAULT \'monthly\''] },
    { name: 'start_date', type: 'TEXT', constraints: ['NOT NULL'] },
    { name: 'next_invoice_date', type: 'TEXT', constraints: ['NOT NULL'] },
    { name: 'end_date', type: 'TEXT' },
    { name: 'status', type: 'TEXT', constraints: ['NOT NULL DEFAULT \'active\''] },
    { name: 'auto_renew', type: 'INTEGER', constraints: ['NOT NULL DEFAULT 1'] },
    { name: 'email_schedule_enabled', type: 'INTEGER', constraints: ['NOT NULL DEFAULT 0'] },
    { name: 'reminder_days_before', type: 'INTEGER', constraints: ['NOT NULL DEFAULT 3'] },
    { name: 'auto_overdue_reminders', type: 'INTEGER', constraints: ['NOT NULL DEFAULT 0'] },
    { name: 'overdue_reminder_interval_days', type: 'INTEGER', constraints: ['NOT NULL DEFAULT 7'] },
    { name: 'max_overdue_reminders', type: 'INTEGER', constraints: ['NOT NULL DEFAULT 3'] },
    { name: 'overdue_reminder_count', type: 'INTEGER', constraints: ['NOT NULL DEFAULT 0'] },
    { name: 'last_pre_due_reminder_for_date', type: 'TEXT' },
    { name: 'last_overdue_reminder_at', type: 'TIMESTAMPTZ' },
    { name: 'last_reminder_sent_at', type: 'TIMESTAMPTZ' },
    { name: 'last_reminder_type', type: 'TEXT' },
    { name: 'notes', type: 'TEXT' },
    { name: 'deleted_at', type: 'TEXT' },
    { name: 'created_at', type: 'TIMESTAMPTZ', constraints: ['NOT NULL DEFAULT NOW()'] },
    { name: 'updated_at', type: 'TIMESTAMPTZ', constraints: ['NOT NULL DEFAULT NOW()'] }
  ],
  constraints: [
    'FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE',
    'FOREIGN KEY (client_id) REFERENCES clients (id) ON DELETE CASCADE'
  ]
};

/**
 * Invoice design templates table - for invoice layout/design templates
 */
const invoiceDesignTemplatesSchema: TableSchema = {
  name: 'invoice_design_templates',
  columns: [
    { name: 'id', type: 'INTEGER', constraints: ['PRIMARY KEY GENERATED ALWAYS AS IDENTITY'] },
    { name: 'tenant_id', type: 'INTEGER', constraints: ['NOT NULL DEFAULT 1'] },
    { name: 'name', type: 'TEXT', constraints: ['NOT NULL'] },
    { name: 'content', type: 'TEXT', constraints: ['NOT NULL'] },
    { name: 'is_default', type: 'INTEGER', constraints: ['DEFAULT 0'] },
    { name: 'variables', type: 'TEXT' },
    { name: 'created_at', type: 'TIMESTAMPTZ', constraints: ['NOT NULL DEFAULT NOW()'] },
    { name: 'updated_at', type: 'TIMESTAMPTZ', constraints: ['NOT NULL DEFAULT NOW()'] }
  ],
  constraints: [
    'FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE'
  ]
};

/**
 * Recurring invoice templates table - for scheduled/recurring invoices
 */
const recurringInvoiceTemplatesSchema: TableSchema = {
  name: 'recurring_invoice_templates',
  columns: [
    { name: 'id', type: 'INTEGER', constraints: ['PRIMARY KEY GENERATED ALWAYS AS IDENTITY'] },
    { name: 'tenant_id', type: 'INTEGER', constraints: ['NOT NULL DEFAULT 1'] },
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
    { name: 'created_at', type: 'TIMESTAMPTZ', constraints: ['NOT NULL DEFAULT NOW()'] },
    { name: 'updated_at', type: 'TIMESTAMPTZ', constraints: ['NOT NULL DEFAULT NOW()'] }
  ],
  constraints: [
    'FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE',
    'FOREIGN KEY (client_id) REFERENCES clients (id) ON DELETE CASCADE'
  ]
};

/**
 * Application settings table
 */
const settingsSchema: TableSchema = {
  name: 'settings',
  columns: [
    { name: 'id', type: 'INTEGER', constraints: ['PRIMARY KEY GENERATED ALWAYS AS IDENTITY'] },
    { name: 'tenant_id', type: 'INTEGER', constraints: ['NOT NULL DEFAULT 1'] },
    { name: 'key', type: 'TEXT', constraints: ['NOT NULL'] },
    { name: 'value', type: 'TEXT' },
    { name: 'type', type: 'TEXT', constraints: ['DEFAULT \'string\''] },
    { name: 'description', type: 'TEXT' },
    { name: 'is_public', type: 'INTEGER', constraints: ['DEFAULT 0'] },
    { name: 'created_at', type: 'TIMESTAMPTZ', constraints: ['NOT NULL DEFAULT NOW()'] },
    { name: 'updated_at', type: 'TIMESTAMPTZ', constraints: ['NOT NULL DEFAULT NOW()'] }
  ],
  constraints: [
    'FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE',
    'UNIQUE (tenant_id, key)'
  ]
};

/**
 * Project-specific settings table
 */
const projectSettingsSchema: TableSchema = {
  name: 'project_settings',
  columns: [
    { name: 'id', type: 'INTEGER', constraints: ['PRIMARY KEY GENERATED ALWAYS AS IDENTITY'] },
    { name: 'tenant_id', type: 'INTEGER', constraints: ['NOT NULL DEFAULT 1'] },
    { name: 'key', type: 'TEXT', constraints: ['NOT NULL'] },
    { name: 'value', type: 'TEXT' },
    { name: 'enabled', type: 'INTEGER', constraints: ['DEFAULT 1'] },
    { name: 'created_at', type: 'TIMESTAMPTZ', constraints: ['NOT NULL DEFAULT NOW()'] },
    { name: 'updated_at', type: 'TIMESTAMPTZ', constraints: ['NOT NULL DEFAULT NOW()'] }
  ],
  constraints: [
    'FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE',
    'UNIQUE (tenant_id, key)'
  ]
};

/**
 * Reports table for storing generated reports
 */
const reportsSchema: TableSchema = {
  name: 'reports',
  columns: [
    { name: 'id', type: 'INTEGER', constraints: ['PRIMARY KEY GENERATED ALWAYS AS IDENTITY'] },
    { name: 'tenant_id', type: 'INTEGER', constraints: ['NOT NULL DEFAULT 1'] },
    { name: 'name', type: 'TEXT', constraints: ['NOT NULL'] },
    { name: 'type', type: 'TEXT', constraints: ['NOT NULL'] },
    { name: 'date_range_start', type: 'TEXT' },
    { name: 'date_range_end', type: 'TEXT' },
    { name: 'data', type: 'TEXT' },
    { name: 'created_at', type: 'TIMESTAMPTZ', constraints: ['NOT NULL DEFAULT NOW()'] }
  ],
  constraints: [
    'FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE'
  ]
};

/**
 * Counters for generating sequential numbers
 */
const countersSchema: TableSchema = {
  name: 'counters',
  columns: [
    { name: 'id', type: 'INTEGER', constraints: ['PRIMARY KEY GENERATED ALWAYS AS IDENTITY'] },
    { name: 'tenant_id', type: 'INTEGER', constraints: ['NOT NULL DEFAULT 1'] },
    { name: 'name', type: 'TEXT', constraints: ['NOT NULL'] },
    { name: 'value', type: 'INTEGER', constraints: ['NOT NULL DEFAULT 0'] },
    { name: 'created_at', type: 'TIMESTAMPTZ', constraints: ['NOT NULL DEFAULT NOW()'] },
    { name: 'updated_at', type: 'TIMESTAMPTZ', constraints: ['NOT NULL DEFAULT NOW()'] }
  ],
  constraints: [
    'FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE',
    'UNIQUE (tenant_id, name)'
  ]
};

/**
 * Audit log table for tracking user actions and system events
 */
const auditLogSchema: TableSchema = {
  name: 'audit_log',
  columns: [
    { name: 'id', type: 'INTEGER', constraints: ['PRIMARY KEY GENERATED ALWAYS AS IDENTITY'] },
    { name: 'tenant_id', type: 'INTEGER' },
    { name: 'user_id', type: 'INTEGER' },
    { name: 'action', type: 'TEXT', constraints: ['NOT NULL'] },
    { name: 'resource_type', type: 'TEXT' },
    { name: 'resource_id', type: 'TEXT' },
    { name: 'ip_address', type: 'TEXT' },
    { name: 'user_agent', type: 'TEXT' },
    { name: 'metadata_json', type: 'TEXT' },
    { name: 'created_at', type: 'TIMESTAMPTZ', constraints: ['NOT NULL DEFAULT NOW()'] }
  ],
  constraints: [
    'FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE SET NULL'
  ]
};

/**
 * Dunning events table for tracking payment failure follow-up emails
 */
const dunningEventsSchema: TableSchema = {
  name: 'dunning_events',
  columns: [
    { name: 'id', type: 'INTEGER', constraints: ['PRIMARY KEY GENERATED ALWAYS AS IDENTITY'] },
    { name: 'tenant_id', type: 'INTEGER', constraints: ['NOT NULL'] },
    { name: 'event_type', type: 'TEXT', constraints: ['NOT NULL'] },
    { name: 'sent_at', type: 'TIMESTAMPTZ', constraints: ['NOT NULL DEFAULT NOW()'] },
    { name: 'metadata_json', type: 'TEXT' }
  ],
  constraints: [
    'FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE'
  ]
};

/**
 * API keys table for programmatic access
 */
const apiKeysSchema: TableSchema = {
  name: 'api_keys',
  columns: [
    { name: 'id', type: 'INTEGER', constraints: ['PRIMARY KEY GENERATED ALWAYS AS IDENTITY'] },
    { name: 'tenant_id', type: 'INTEGER', constraints: ['NOT NULL'] },
    { name: 'user_id', type: 'INTEGER', constraints: ['NOT NULL'] },
    { name: 'name', type: 'TEXT', constraints: ['NOT NULL'] },
    { name: 'key_hash', type: 'TEXT', constraints: ['NOT NULL UNIQUE'] },
    { name: 'key_prefix', type: 'TEXT', constraints: ['NOT NULL'] },
    { name: 'scopes', type: 'TEXT', constraints: ["NOT NULL DEFAULT '[\"read\",\"write\"]'"] },
    { name: 'last_used_at', type: 'TEXT' },
    { name: 'expires_at', type: 'TEXT' },
    { name: 'created_at', type: 'TIMESTAMPTZ', constraints: ['NOT NULL DEFAULT NOW()'] },
    { name: 'updated_at', type: 'TIMESTAMPTZ', constraints: ['NOT NULL DEFAULT NOW()'] }
  ],
  constraints: [
    'FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE',
    'FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE'
  ]
};

/**
 * Outbound webhook endpoints table
 */
const webhookEndpointsSchema: TableSchema = {
  name: 'webhook_endpoints',
  columns: [
    { name: 'id', type: 'INTEGER', constraints: ['PRIMARY KEY GENERATED ALWAYS AS IDENTITY'] },
    { name: 'tenant_id', type: 'INTEGER', constraints: ['NOT NULL'] },
    { name: 'url', type: 'TEXT', constraints: ['NOT NULL'] },
    { name: 'secret', type: 'TEXT', constraints: ['NOT NULL'] },
    { name: 'events', type: 'TEXT', constraints: ["NOT NULL DEFAULT '[\"*\"]'"] },
    { name: 'is_active', type: 'INTEGER', constraints: ['NOT NULL DEFAULT 1'] },
    { name: 'description', type: 'TEXT' },
    { name: 'last_triggered_at', type: 'TEXT' },
    { name: 'failure_count', type: 'INTEGER', constraints: ['NOT NULL DEFAULT 0'] },
    { name: 'created_at', type: 'TIMESTAMPTZ', constraints: ['NOT NULL DEFAULT NOW()'] },
    { name: 'updated_at', type: 'TIMESTAMPTZ', constraints: ['NOT NULL DEFAULT NOW()'] }
  ],
  constraints: [
    'FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE'
  ]
};

/**
 * Webhook delivery log table
 */
const webhookDeliveriesSchema: TableSchema = {
  name: 'webhook_deliveries',
  columns: [
    { name: 'id', type: 'INTEGER', constraints: ['PRIMARY KEY GENERATED ALWAYS AS IDENTITY'] },
    { name: 'endpoint_id', type: 'INTEGER', constraints: ['NOT NULL'] },
    { name: 'tenant_id', type: 'INTEGER', constraints: ['NOT NULL'] },
    { name: 'event_type', type: 'TEXT', constraints: ['NOT NULL'] },
    { name: 'payload_json', type: 'TEXT', constraints: ['NOT NULL'] },
    { name: 'response_status', type: 'INTEGER' },
    { name: 'response_body', type: 'TEXT' },
    { name: 'attempt_count', type: 'INTEGER', constraints: ['NOT NULL DEFAULT 1'] },
    { name: 'delivered_at', type: 'TEXT' },
    { name: 'failed_at', type: 'TEXT' },
    { name: 'created_at', type: 'TIMESTAMPTZ', constraints: ['NOT NULL DEFAULT NOW()'] }
  ],
  constraints: [
    'FOREIGN KEY (endpoint_id) REFERENCES webhook_endpoints (id) ON DELETE CASCADE'
  ]
};

/**
 * Processed webhook event IDs for idempotency deduplication
 */
const processedWebhookEventsSchema: TableSchema = {
  name: 'processed_webhook_events',
  columns: [
    { name: 'id', type: 'INTEGER', constraints: ['PRIMARY KEY GENERATED ALWAYS AS IDENTITY'] },
    { name: 'event_id', type: 'TEXT', constraints: ['NOT NULL UNIQUE'] },
    { name: 'provider', type: 'TEXT', constraints: ["NOT NULL DEFAULT 'external'"] },
    { name: 'processed_at', type: 'TIMESTAMPTZ', constraints: ['NOT NULL DEFAULT NOW()'] }
  ]
};

/**
 * Usage records for metering per-tenant usage by month
 */
const usageRecordsSchema: TableSchema = {
  name: 'usage_records',
  columns: [
    { name: 'id', type: 'INTEGER', constraints: ['PRIMARY KEY GENERATED ALWAYS AS IDENTITY'] },
    { name: 'tenant_id', type: 'INTEGER', constraints: ['NOT NULL'] },
    { name: 'metric', type: 'TEXT', constraints: ['NOT NULL'] },
    { name: 'value', type: 'INTEGER', constraints: ['NOT NULL DEFAULT 0'] },
    { name: 'period', type: 'TEXT', constraints: ['NOT NULL'] },
    { name: 'period_type', type: 'TEXT', constraints: ["NOT NULL DEFAULT 'monthly'"] },
    { name: 'updated_at', type: 'TIMESTAMPTZ', constraints: ['NOT NULL DEFAULT NOW()'] }
  ],
  constraints: [
    'FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE',
    'UNIQUE (tenant_id, metric, period)'
  ]
};

// Export all schemas
export const tableSchemas: TableSchema[] = [
  tenantsSchema,
  subscriptionPlansSchema,
  tenantSubscriptionsSchema,
  tenantEntitlementsSchema,
  usersSchema,
  clientsSchema,
  invoiceDesignTemplatesSchema, // Create design templates before invoices due to FK
  recurringInvoiceTemplatesSchema, // Create recurring templates
  invoicesSchema,
  invoiceItemsSchema,
  paymentsSchema,
  expensesSchema,
  retainersSchema,
  reportsSchema,
  settingsSchema,
  projectSettingsSchema,
  countersSchema,
  dunningEventsSchema,
  auditLogSchema,
  apiKeysSchema,
  webhookEndpointsSchema,
  webhookDeliveriesSchema,
  usageRecordsSchema,
  processedWebhookEventsSchema
];

/**
 * Create all database tables
 */
export const createTables = async (db: IDatabase): Promise<void> => {
  for (const schema of tableSchemas) {
    const columnDefs = schema.columns
      .map(col => `${col.name} ${col.type} ${col.constraints?.join(' ') || ''}`)
      .join(', ');

    const constraints = schema.constraints
      ? ', ' + schema.constraints.join(', ')
      : '';

    const createTableSQL = `CREATE TABLE IF NOT EXISTS ${schema.name} (${columnDefs}${constraints})`;

    await db.executeQuery(createTableSQL);
  }

  // Ensure a default tenant exists for backwards-compatible single-tenant mode.
  // Legacy databases may not have tenants.public_id yet until migrations run.
  try {
    await db.executeQuery(`
      INSERT INTO tenants (id, public_id, name, slug, status)
      VALUES (1, '00000000-0000-7000-8000-000000000001', 'Default Tenant', 'default', 'active')
      ON CONFLICT (id) DO NOTHING
    `);
  } catch (error) {
    const message = (error as Error).message.toLowerCase();
    const missingPublicIdColumn =
      message.includes('public_id') &&
      message.includes('does not exist');
    if (!missingPublicIdColumn) {
      throw error;
    }

    await db.executeQuery(`
      INSERT INTO tenants (id, name, slug, status)
      VALUES (1, 'Default Tenant', 'default', 'active')
      ON CONFLICT (id) DO NOTHING
    `);
  }

  const trialFeatures = JSON.stringify({
    'reports.enabled': true,
    'billing.recurring_invoices': true,
    'billing.max_users': 3,
    'billing.max_clients': 25,
    'billing.max_invoices_per_month': 200
  });
  const starterFeatures = JSON.stringify({
    'reports.enabled': true,
    'billing.recurring_invoices': true,
    'billing.max_users': 25,
    'billing.max_clients': 1000,
    'billing.max_invoices_per_month': 10000
  });

  await db.executeQuery(
    `
      INSERT INTO subscription_plans (
        code, name, status, price_cents, currency, billing_interval, trial_days, features_json, created_at, updated_at
      ) VALUES (?, ?, 'active', ?, 'usd', 'monthly', ?, ?, NOW(), NOW())
      ON CONFLICT (code) DO NOTHING
    `,
    ['trial', 'Trial', 0, 14, trialFeatures]
  );
  await db.executeQuery(
    `
      INSERT INTO subscription_plans (
        code, name, status, price_cents, currency, billing_interval, trial_days, features_json, created_at, updated_at
      ) VALUES (?, ?, 'active', ?, 'usd', 'monthly', ?, ?, NOW(), NOW())
      ON CONFLICT (code) DO NOTHING
    `,
    ['starter', 'Starter', 2900, 0, starterFeatures]
  );

  await db.executeQuery(`
    INSERT INTO tenant_subscriptions (
      tenant_id,
      plan_id,
      status,
      started_at,
      current_period_start,
      current_period_end,
      cancel_at_period_end,
      provider,
      created_at,
      updated_at
    )
    SELECT
      1,
      sp.id,
      'active',
      NOW(),
      NOW(),
      NOW() + INTERVAL '1 month',
      0,
      'internal',
      NOW(),
      NOW()
    FROM subscription_plans sp
    WHERE sp.code = 'starter'
    LIMIT 1
    ON CONFLICT (tenant_id) DO NOTHING
  `);

  // Create token tables for password reset and email verification
  await createTokenTables(db);
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
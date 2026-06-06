// Initial seed data for Slimbooks
// Handles initialization of counters, admin user, and sample data

import bcrypt from 'bcryptjs';
import type { IDatabase, SeedData } from '../../types/database.types.js';

const parseCount = (value: number | string | null | undefined): number => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * Generic seed data insertion function
 */
export const seedData = async (db: IDatabase, seed: SeedData): Promise<void> => {
  if (seed.truncate) {
    await db.executeQuery(`DELETE FROM ${seed.table}`);
  }

  if (seed.data.length === 0) return;

  const firstRow = seed.data[0];
  if (!firstRow) return;

  const columns = Object.keys(firstRow);
  const placeholders = columns.map(() => '?').join(', ');
  const query = `INSERT INTO ${seed.table} (${columns.join(', ')}) VALUES (${placeholders})`;

  for (const row of seed.data) {
    const values = columns.map(col => row[col]);
    await db.executeQuery(query, values);
  }
};

/**
 * Seed baseline platform data: the default tenant, subscription plans, and the
 * default tenant's subscription.
 *
 * This runs AFTER migrations (see initializeAllSeeds), so the tenants table is
 * guaranteed to have its full current schema (including public_id). That lets us
 * insert the default tenant cleanly instead of catching-and-ignoring a missing
 * public_id column during table creation.
 */
export const seedBootstrapData = async (db: IDatabase): Promise<void> => {
  // Ensure a default tenant exists for backwards-compatible single-tenant mode.
  await db.executeQuery(`
    INSERT INTO tenants (id, public_id, name, slug, status)
    VALUES (1, '00000000-0000-7000-8000-000000000001', 'Default Tenant', 'default', 'active')
    ON CONFLICT (id) DO NOTHING
  `);

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
};

/**
 * Initialize application counters
 */
export const initializeCounters = async (db: IDatabase): Promise<void> => {
  const counterCheck = await db.getOne<{ count: number | string }>('SELECT COUNT(*) as count FROM counters');

  if (parseCount(counterCheck?.count) === 0) {
    const counters: SeedData = {
      table: 'counters',
      data: [
        { name: 'clients', value: 0 },
        { name: 'invoices', value: 0 },
        { name: 'templates', value: 0 },
        { name: 'expenses', value: 0 },
        { name: 'reports', value: 0 },
        { name: 'payments', value: 0 }
      ]
    };

    await seedData(db, counters);
  }
};

/**
 * Initialize admin user if none exists
 */
export const initializeAdminUser = async (db: IDatabase): Promise<void> => {
  const userCheck = await db.getOne<{ count: number | string }>('SELECT COUNT(*) as count FROM users');

  if (parseCount(userCheck?.count) === 0) {
    if (!process.env.ADMIN_PASSWORD) {
      throw new Error('ADMIN_PASSWORD environment variable must be set before seeding the database');
    }
    const defaultPassword = process.env.ADMIN_PASSWORD;
    const hashedPassword = await bcrypt.hash(defaultPassword, 12);

    const adminUser: SeedData = {
      table: 'users',
      data: [{
        name: 'Administrator',
        email: 'admin@slimbooks.app',
        username: 'admin',
        password_hash: hashedPassword,
        role: 'admin',
        email_verified: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }]
    };

    await seedData(db, adminUser);
    console.log('✓ Admin user created with email: admin@slimbooks.app');
  }
};

/**
 * Initialize default application settings
 */
export const initializeSettings = async (db: IDatabase): Promise<void> => {
  const settingsCheck = await db.getOne<{ count: number | string }>('SELECT COUNT(*) as count FROM settings');

  if (parseCount(settingsCheck?.count) === 0) {
    const defaultSettings: SeedData = {
      table: 'settings',
      data: [
        { key: 'app_name', value: 'Slimbooks', type: 'string', description: 'Application name', is_public: 1 },
        { key: 'app_version', value: '1.0.0', type: 'string', description: 'Application version', is_public: 1 },
        { key: 'default_currency', value: 'USD', type: 'string', description: 'Default currency code', is_public: 1 },
        { key: 'tax_rate', value: '0', type: 'number', description: 'Default tax rate percentage', is_public: 0 },
        { key: 'invoice_terms', value: 'Payment is due within 30 days of invoice date.', type: 'text', description: 'Default invoice terms', is_public: 0 },
        { key: 'company_name', value: 'Your Company Name', type: 'string', description: 'Company name for invoices', is_public: 0 },
        { key: 'company_email', value: 'contact@yourcompany.com', type: 'string', description: 'Company email address', is_public: 0 }
      ]
    };

    await seedData(db, defaultSettings);
  }
};

/**
 * Initialize sample clients for development
 */
export const initializeSampleClients = async (db: IDatabase): Promise<void> => {
  if (process.env.NODE_ENV === 'production') return;

  const clientCheck = await db.getOne<{ count: number | string }>('SELECT COUNT(*) as count FROM clients');
  if (parseCount(clientCheck?.count) > 0) return;

  const sampleClients: SeedData = {
    table: 'clients',
    data: [
      { name: 'Acme Corporation', email: 'contact@acme.com', phone: '(555) 123-4567', company: 'Acme Corporation', address: '123 Business St', city: 'Business City', state: 'CA', zip: '90210', country: 'USA', tax_id: 'TAX123456', is_active: 1 },
      { name: 'Tech Solutions LLC', email: 'info@techsolutions.com', phone: '(555) 987-6543', company: 'Tech Solutions LLC', address: '456 Innovation Ave', city: 'Tech Town', state: 'NY', zip: '10001', country: 'USA', is_active: 1 },
      { name: 'Global Enterprises', email: 'admin@global.com', phone: '(555) 456-7890', company: 'Global Enterprises Inc.', address: '789 Corporate Blvd', city: 'Metro City', state: 'TX', zip: '75201', country: 'USA', is_active: 1 }
    ]
  };

  await seedData(db, sampleClients);
};

/**
 * Initialize sample invoices for development
 */
export const initializeSampleInvoices = async (db: IDatabase): Promise<void> => {
  if (process.env.NODE_ENV === 'production') return;

  const invoiceCheck = await db.getOne<{ count: number | string }>('SELECT COUNT(*) as count FROM invoices');
  if (parseCount(invoiceCheck?.count) > 0) return;

  const sampleInvoices: SeedData = {
    table: 'invoices',
    data: [
      { invoice_number: 'INV-001', client_id: 1, amount: 1500.00, tax_amount: 120.00, total_amount: 1620.00, status: 'sent', due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), notes: 'Sample invoice for development', terms: 'Payment due within 30 days' },
      { invoice_number: 'INV-002', client_id: 2, amount: 2500.00, tax_amount: 200.00, total_amount: 2700.00, status: 'paid', due_date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), paid_date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), notes: 'Paid invoice sample' }
    ]
  };

  await seedData(db, sampleInvoices);
};

/**
 * Initialize sample payments for development
 */
export const initializeSamplePayments = async (db: IDatabase): Promise<void> => {
  if (process.env.NODE_ENV === 'production') return;

  const paymentCheck = await db.getOne<{ count: number | string }>('SELECT COUNT(*) as count FROM payments');
  if (parseCount(paymentCheck?.count) > 0) return;

  const samplePayments: SeedData = {
    table: 'payments',
    data: [
      { invoice_id: 2, client_id: 2, amount: 2700.00, method: 'bank_transfer', status: 'received', transaction_id: 'TXN-12345', date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), notes: 'Payment received via bank transfer' }
    ]
  };

  await seedData(db, samplePayments);
};

/**
 * Sync counters to match actual max IDs in each table after seeding
 */
const syncCountersWithData = async (db: IDatabase): Promise<void> => {
  const counterTables: Record<string, string> = {
    clients: 'clients',
    invoices: 'invoices',
    templates: 'recurring_invoice_templates',
    expenses: 'expenses',
    reports: 'reports',
    payments: 'payments',
  };

  for (const [counterName, tableName] of Object.entries(counterTables)) {
    try {
      const maxRow = await db.getOne<{ max_id: number | string }>(`SELECT COALESCE(MAX(id), 0) as max_id FROM ${tableName}`);
      const maxId = parseCount(maxRow?.max_id);
      if (maxId > 0) {
        await db.executeQuery('UPDATE counters SET value = ? WHERE name = ?', [maxId, counterName]);
      }
    } catch {
      // Table may not exist yet
    }
  }
};

/**
 * Initialize all seed data
 */
export const initializeAllSeeds = async (db: IDatabase, includeSampleData = false): Promise<void> => {
  try {
    // Bootstrap baseline platform data first — the default tenant must exist
    // before tenant-scoped rows (counters, admin user, settings) are seeded.
    await seedBootstrapData(db);

    // Always initialize these
    await initializeCounters(db);
    await initializeAdminUser(db);
    await initializeSettings(db);

    // Only in development
    if (includeSampleData && process.env.NODE_ENV !== 'production') {
      await initializeSampleClients(db);
      await initializeSampleInvoices(db);
      await initializeSamplePayments(db);
    }

    await syncCountersWithData(db);
  } catch (error) {
    console.error('❌ Seed data initialization failed:', error);
    throw error;
  }
};

import type { IDatabase } from '../../types/database.types.js';

const hasTable = (db: IDatabase, tableName: string): boolean => {
  const result = db.getMany<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
    [tableName]
  );
  return result.length > 0;
};

export const up = (db: IDatabase): void => {
  db.executeQuery(`
    CREATE TABLE IF NOT EXISTS subscription_plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      price_cents INTEGER NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'usd',
      billing_interval TEXT NOT NULL DEFAULT 'monthly',
      trial_days INTEGER NOT NULL DEFAULT 0,
      features_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.executeQuery(`
    CREATE TABLE IF NOT EXISTS tenant_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      plan_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      started_at TEXT,
      current_period_start TEXT,
      current_period_end TEXT,
      cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
      canceled_at TEXT,
      provider TEXT NOT NULL DEFAULT 'internal',
      provider_customer_id TEXT,
      provider_subscription_id TEXT,
      metadata_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE,
      FOREIGN KEY (plan_id) REFERENCES subscription_plans (id) ON DELETE RESTRICT,
      UNIQUE (tenant_id)
    )
  `);

  db.executeQuery(`
    CREATE TABLE IF NOT EXISTS tenant_entitlements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'manual',
      updated_by_user_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE,
      UNIQUE (tenant_id, key)
    )
  `);

  db.executeQuery('CREATE INDEX IF NOT EXISTS idx_tenant_subscriptions_tenant_id ON tenant_subscriptions(tenant_id)');
  db.executeQuery('CREATE INDEX IF NOT EXISTS idx_tenant_subscriptions_plan_id ON tenant_subscriptions(plan_id)');
  db.executeQuery('CREATE INDEX IF NOT EXISTS idx_tenant_entitlements_tenant_id ON tenant_entitlements(tenant_id)');
  db.executeQuery('CREATE INDEX IF NOT EXISTS idx_tenant_entitlements_key ON tenant_entitlements(key)');

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

  db.executeQuery(
    `
      INSERT OR IGNORE INTO subscription_plans (
        code, name, status, price_cents, currency, billing_interval, trial_days, features_json, created_at, updated_at
      ) VALUES (?, ?, 'active', ?, 'usd', 'monthly', ?, ?, datetime('now'), datetime('now'))
    `,
    ['trial', 'Trial', 0, 14, trialFeatures]
  );
  db.executeQuery(
    `
      INSERT OR IGNORE INTO subscription_plans (
        code, name, status, price_cents, currency, billing_interval, trial_days, features_json, created_at, updated_at
      ) VALUES (?, ?, 'active', ?, 'usd', 'monthly', ?, ?, datetime('now'), datetime('now'))
    `,
    ['starter', 'Starter', 2900, 0, starterFeatures]
  );

  if (hasTable(db, 'tenants')) {
    db.executeQuery(`
      INSERT OR IGNORE INTO tenant_subscriptions (
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
        t.id,
        sp.id,
        CASE WHEN sp.code = 'trial' THEN 'trialing' ELSE 'active' END,
        datetime('now'),
        datetime('now'),
        datetime('now', '+1 month'),
        0,
        'internal',
        datetime('now'),
        datetime('now')
      FROM tenants t
      INNER JOIN subscription_plans sp
        ON sp.code = 'starter'
    `);
  }
};

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

export const up = async (db: IDatabase): Promise<void> => {
  await db.executeQuery(`
    CREATE TABLE IF NOT EXISTS subscription_plans (
      id SERIAL PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      price_cents INTEGER NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'usd',
      billing_interval TEXT NOT NULL DEFAULT 'monthly',
      trial_days INTEGER NOT NULL DEFAULT 0,
      features_json TEXT,
      created_at TEXT NOT NULL DEFAULT (NOW()),
      updated_at TEXT NOT NULL DEFAULT (NOW())
    )
  `);

  await db.executeQuery(`
    CREATE TABLE IF NOT EXISTS tenant_subscriptions (
      id SERIAL PRIMARY KEY,
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
      created_at TEXT NOT NULL DEFAULT (NOW()),
      updated_at TEXT NOT NULL DEFAULT (NOW()),
      FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE,
      FOREIGN KEY (plan_id) REFERENCES subscription_plans (id) ON DELETE RESTRICT,
      UNIQUE (tenant_id)
    )
  `);

  await db.executeQuery(`
    CREATE TABLE IF NOT EXISTS tenant_entitlements (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'manual',
      updated_by_user_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (NOW()),
      updated_at TEXT NOT NULL DEFAULT (NOW()),
      FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE,
      UNIQUE (tenant_id, key)
    )
  `);

  await db.executeQuery('CREATE INDEX IF NOT EXISTS idx_tenant_subscriptions_tenant_id ON tenant_subscriptions(tenant_id)');
  await db.executeQuery('CREATE INDEX IF NOT EXISTS idx_tenant_subscriptions_plan_id ON tenant_subscriptions(plan_id)');
  await db.executeQuery('CREATE INDEX IF NOT EXISTS idx_tenant_entitlements_tenant_id ON tenant_entitlements(tenant_id)');
  await db.executeQuery('CREATE INDEX IF NOT EXISTS idx_tenant_entitlements_key ON tenant_entitlements(key)');

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
    `INSERT INTO subscription_plans (code, name, status, price_cents, currency, billing_interval, trial_days, features_json, created_at, updated_at) VALUES (?, ?, 'active', ?, 'usd', 'monthly', ?, ?, NOW(), NOW()) ON CONFLICT (code) DO NOTHING`,
    ['trial', 'Trial', 0, 14, trialFeatures]
  );
  await db.executeQuery(
    `INSERT INTO subscription_plans (code, name, status, price_cents, currency, billing_interval, trial_days, features_json, created_at, updated_at) VALUES (?, ?, 'active', ?, 'usd', 'monthly', ?, ?, NOW(), NOW()) ON CONFLICT (code) DO NOTHING`,
    ['starter', 'Starter', 2900, 0, starterFeatures]
  );

  if (await hasTable(db, 'tenants')) {
    await db.executeQuery(`
      INSERT INTO tenant_subscriptions (
        tenant_id, plan_id, status, started_at, current_period_start, current_period_end,
        cancel_at_period_end, provider, created_at, updated_at
      )
      SELECT
        t.id, sp.id,
        CASE WHEN sp.code = 'trial' THEN 'trialing' ELSE 'active' END,
        NOW(), NOW(), NOW() + INTERVAL '1 month',
        0, 'internal', NOW(), NOW()
      FROM tenants t
      INNER JOIN subscription_plans sp ON sp.code = 'starter'
      ON CONFLICT (tenant_id) DO NOTHING
    `);
  }
};

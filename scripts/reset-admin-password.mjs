#!/usr/bin/env node
/**
 * Reset a user's password (defaults to the admin account).
 *
 * The new password is read from the NEW_ADMIN_PASSWORD environment variable
 * (preferred) or the second CLI argument — it is never stored in this repo.
 *
 * Usage:
 *   DATABASE_URL=postgres://... NEW_ADMIN_PASSWORD='the-password' \
 *     node scripts/reset-admin-password.mjs [email]
 *
 *   # or pass the password as an argument (visible in shell history):
 *   DATABASE_URL=postgres://... node scripts/reset-admin-password.mjs admin@slimbooks.app 'the-password'
 *
 * Behaviour:
 *   - bcrypt-hashes the new password (BCRYPT_ROUNDS, default 12),
 *   - clears any failed-login lockout,
 *   - bumps token_version to invalidate existing sessions/JWTs,
 *   - updates public.users and any tenant_* schema row sharing the email
 *     (defensive against per-tenant search_path duplicates).
 */
import bcrypt from 'bcryptjs';
import pg from 'pg';

const { Pool } = pg;

const fail = (message) => {
  console.error(`\u274c ${message}`);
  process.exit(1);
};

const email = (process.argv[2] || process.env.ADMIN_EMAIL || 'admin@slimbooks.app').trim().toLowerCase();
const password = process.env.NEW_ADMIN_PASSWORD || process.argv[3];
const rounds = Number.parseInt(process.env.BCRYPT_ROUNDS || '12', 10) || 12;
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  fail('DATABASE_URL is required.');
}
if (!password) {
  fail('Provide the new password via the NEW_ADMIN_PASSWORD env var or as the second argument.');
}
if (password.length < 8 || password.length > 128) {
  fail('Password must be between 8 and 128 characters.');
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: databaseUrl.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined
});

const UPDATE_SQL = (schema) => `
  UPDATE "${schema}".users
     SET password_hash = $1,
         failed_login_attempts = 0,
         account_locked_until = NULL,
         token_version = COALESCE(token_version, 0) + 1,
         updated_at = NOW()
   WHERE LOWER(email) = $2
`;

const run = async () => {
  const passwordHash = bcrypt.hashSync(password, rounds);
  const client = await pool.connect();
  let totalRows = 0;

  try {
    const pub = await client.query(UPDATE_SQL('public'), [passwordHash, email]);
    if (pub.rowCount > 0) {
      console.log(`\u2713 public.users: updated ${pub.rowCount} row(s)`);
      totalRows += pub.rowCount;
    }

    // Defensive: also reset matching rows in per-tenant schemas (handles the
    // documented search_path-leakage case where auth queries can hit tenant_N.users).
    const schemas = await client.query(
      `SELECT table_schema
         FROM information_schema.tables
        WHERE table_name = 'users' AND table_schema LIKE 'tenant\\_%' ESCAPE '\\'
        ORDER BY table_schema`
    );

    for (const { table_schema: schema } of schemas.rows) {
      try {
        const res = await client.query(UPDATE_SQL(schema), [passwordHash, email]);
        if (res.rowCount > 0) {
          console.log(`\u2713 ${schema}.users: updated ${res.rowCount} row(s)`);
          totalRows += res.rowCount;
        }
      } catch (err) {
        console.warn(`\u26a0 Skipped ${schema}.users: ${err.message}`);
      }
    }
  } finally {
    client.release();
    await pool.end();
  }

  if (totalRows === 0) {
    fail(`No user found with email "${email}".`);
  }

  console.log(`\u2705 Password reset for ${email} (${totalRows} row(s)). Existing sessions were invalidated.`);
};

run().catch((err) => {
  fail(`Reset failed: ${err.message}`);
});

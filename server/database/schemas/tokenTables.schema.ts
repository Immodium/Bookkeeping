import type { IDatabase } from '../../types/database.types.js';

/**
 * Create token tables for password reset and email verification
 */
export async function createTokenTables(db: IDatabase): Promise<void> {
  // Password reset tokens table
  await db.executeQuery(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at DATETIME NOT NULL,
      used_at DATETIME DEFAULT NULL,
      created_at DATETIME DEFAULT (NOW()),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await db.executeQuery(`
    CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id
    ON password_reset_tokens(user_id)
  `);

  await db.executeQuery(`
    CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires_at
    ON password_reset_tokens(expires_at)
  `);

  // Email verification tokens table
  await db.executeQuery(`
    CREATE TABLE IF NOT EXISTS email_verification_tokens (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at DATETIME NOT NULL,
      used_at DATETIME DEFAULT NULL,
      created_at DATETIME DEFAULT (NOW()),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await db.executeQuery(`
    CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_user_id
    ON email_verification_tokens(user_id)
  `);

  await db.executeQuery(`
    CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_expires_at
    ON email_verification_tokens(expires_at)
  `);
}

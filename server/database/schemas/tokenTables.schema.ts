import type { IDatabase } from '../../types/database.types.js';

/**
 * Create token tables for password reset and email verification
 */
export function createTokenTables(db: IDatabase): void {
  // Password reset tokens table
  db.executeQuery(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at DATETIME NOT NULL,
      used_at DATETIME DEFAULT NULL,
      created_at DATETIME DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  db.executeQuery(`
    CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id 
    ON password_reset_tokens(user_id)
  `);

  db.executeQuery(`
    CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires_at 
    ON password_reset_tokens(expires_at)
  `);

  // Email verification tokens table
  db.executeQuery(`
    CREATE TABLE IF NOT EXISTS email_verification_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at DATETIME NOT NULL,
      used_at DATETIME DEFAULT NULL,
      created_at DATETIME DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  db.executeQuery(`
    CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_user_id 
    ON email_verification_tokens(user_id)
  `);

  db.executeQuery(`
    CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_expires_at 
    ON email_verification_tokens(expires_at)
  `);
}

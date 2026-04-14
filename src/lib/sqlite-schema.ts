// SQLite database schema for Slimbooks application

export const DATABASE_SCHEMA = {
  // Clients table
  clients: `
    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      first_name TEXT,
      last_name TEXT,
      email TEXT NOT NULL,
      phone TEXT,
      company TEXT,
      address TEXT,
      city TEXT,
      state TEXT,
      zipCode TEXT,
      country TEXT,
      stripe_customer_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `,

  // Invoices table
  invoices: `
    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_number TEXT NOT NULL UNIQUE,
      client_id INTEGER NOT NULL,
      design_template_id INTEGER,
      recurring_template_id INTEGER,
      amount REAL NOT NULL,
      tax_amount REAL DEFAULT 0,
      total_amount REAL NOT NULL,
      status TEXT NOT NULL,
      due_date TEXT NOT NULL,
      issue_date TEXT NOT NULL,
      description TEXT,
      stripe_invoice_id TEXT,
      type TEXT NOT NULL DEFAULT 'one-time',
      client_name TEXT,
      client_email TEXT,
      client_phone TEXT,
      client_address TEXT,
      line_items TEXT, -- JSON string
      tax_rate_id TEXT,
      shipping_amount REAL DEFAULT 0,
      shipping_rate_id TEXT,
      notes TEXT,
      email_status TEXT DEFAULT 'not_sent', -- not_sent, sending, sent, failed
      email_sent_at TEXT,
      email_error TEXT,
      last_email_attempt TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (client_id) REFERENCES clients (id),
      FOREIGN KEY (design_template_id) REFERENCES templates (id),
      FOREIGN KEY (recurring_template_id) REFERENCES recurring_invoice_templates (id)
    )
  `,

  // Templates table (for recurring invoices)
  templates: `
    CREATE TABLE IF NOT EXISTS templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      client_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      description TEXT,
      frequency TEXT NOT NULL,
      payment_terms TEXT NOT NULL,
      next_invoice_date TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      line_items TEXT, -- JSON string
      tax_amount REAL DEFAULT 0,
      tax_rate_id TEXT,
      shipping_amount REAL DEFAULT 0,
      shipping_rate_id TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (client_id) REFERENCES clients (id)
    )
  `,

  // Expenses table
  expenses: `
    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      merchant TEXT NOT NULL,
      category TEXT NOT NULL,
      amount REAL NOT NULL,
      description TEXT NOT NULL,
      receipt_url TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `,

  // Reports table
  reports: `
    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      date_range_start TEXT NOT NULL,
      date_range_end TEXT NOT NULL,
      data TEXT, -- JSON string
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `,

  // Settings table (for all application settings)
  settings: `
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,
      value TEXT, -- JSON string for complex values
      category TEXT NOT NULL, -- 'company', 'invoice', 'tax', 'shipping', 'general', etc.
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `,

  // Counters table (for auto-incrementing IDs)
  counters: `
    CREATE TABLE IF NOT EXISTS counters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      value INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `,

  // Users table
  users: `
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT,
      role TEXT DEFAULT 'user',
      email_verified INTEGER DEFAULT 0,
      google_id TEXT UNIQUE,
      two_factor_enabled INTEGER DEFAULT 0,
      two_factor_secret TEXT,
      backup_codes TEXT, -- JSON string
      last_login TEXT,
      failed_login_attempts INTEGER DEFAULT 0,
      account_locked_until TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `,

  // Email verification tokens table
  email_verification_tokens: `
    CREATE TABLE IF NOT EXISTS email_verification_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token TEXT UNIQUE NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    )
  `,

  // Password reset tokens table
  password_reset_tokens: `
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token TEXT UNIQUE NOT NULL,
      expires_at TEXT NOT NULL,
      used INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    )
  `,

  // Auth sessions table
  auth_sessions: `
    CREATE TABLE IF NOT EXISTS auth_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      session_token TEXT UNIQUE NOT NULL,
      refresh_token TEXT UNIQUE NOT NULL,
      expires_at TEXT NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    )
  `,

  // OAuth credentials table
  oauth_credentials: `
    CREATE TABLE IF NOT EXISTS oauth_credentials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL,
      client_id TEXT NOT NULL,
      client_secret TEXT NOT NULL,
      enabled INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `,

  // Email templates table
  email_templates: `
    CREATE TABLE IF NOT EXISTS email_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      subject TEXT NOT NULL,
      html_content TEXT NOT NULL,
      text_content TEXT,
      variables TEXT, -- JSON string
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `,

  // Stripe webhook logs table
  stripe_webhook_logs: `
    CREATE TABLE IF NOT EXISTS stripe_webhook_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      webhook_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('processed', 'failed', 'ignored')),
      error_message TEXT,
      event_data TEXT, -- JSON string
      processed_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `,

  // Stripe sync status table
  stripe_sync_status: `
    CREATE TABLE IF NOT EXISTS stripe_sync_status (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL, -- 'customer', 'invoice', 'subscription'
      local_id INTEGER NOT NULL,
      stripe_id TEXT NOT NULL,
      last_synced_at TEXT NOT NULL DEFAULT (datetime('now')),
      sync_status TEXT NOT NULL DEFAULT 'synced' CHECK (sync_status IN ('synced', 'pending', 'failed')),
      error_message TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(entity_type, local_id)
    )
  `
};

// Indexes for better performance
export const DATABASE_INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_clients_email ON clients (email)',
  'CREATE INDEX IF NOT EXISTS idx_invoices_client_id ON invoices (client_id)',
  'CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices (status)',
  'CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON invoices (due_date)',
  'CREATE INDEX IF NOT EXISTS idx_invoices_created_at ON invoices (created_at)',
  'CREATE INDEX IF NOT EXISTS idx_templates_client_id ON templates (client_id)',
  'CREATE INDEX IF NOT EXISTS idx_templates_is_active ON templates (is_active)',
  'CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses (date)',
  'CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses (category)',
  'CREATE INDEX IF NOT EXISTS idx_settings_key ON settings (key)',
  'CREATE INDEX IF NOT EXISTS idx_settings_category ON settings (category)',
  'CREATE INDEX IF NOT EXISTS idx_users_email ON users (email)',
  'CREATE INDEX IF NOT EXISTS idx_users_username ON users (username)',
  'CREATE INDEX IF NOT EXISTS idx_users_google_id ON users (google_id)',
  'CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_user_id ON email_verification_tokens (user_id)',
  'CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_token ON email_verification_tokens (token)',
  'CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON password_reset_tokens (user_id)',
  'CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token ON password_reset_tokens (token)',
  'CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id ON auth_sessions (user_id)',
  'CREATE INDEX IF NOT EXISTS idx_auth_sessions_session_token ON auth_sessions (session_token)',
  'CREATE INDEX IF NOT EXISTS idx_oauth_credentials_provider ON oauth_credentials (provider)',
  'CREATE INDEX IF NOT EXISTS idx_email_templates_name ON email_templates (name)',
  'CREATE INDEX IF NOT EXISTS idx_stripe_webhook_logs_webhook_id ON stripe_webhook_logs (webhook_id)',
  'CREATE INDEX IF NOT EXISTS idx_stripe_webhook_logs_event_type ON stripe_webhook_logs (event_type)',
  'CREATE INDEX IF NOT EXISTS idx_stripe_sync_status_entity ON stripe_sync_status (entity_type, local_id)',
  'CREATE INDEX IF NOT EXISTS idx_stripe_sync_status_stripe_id ON stripe_sync_status (stripe_id)'
];

// Triggers for updating updated_at timestamps
export const DATABASE_TRIGGERS = [
  `CREATE TRIGGER IF NOT EXISTS update_clients_updated_at 
   AFTER UPDATE ON clients 
   BEGIN 
     UPDATE clients SET updated_at = datetime('now') WHERE id = NEW.id; 
   END`,
  
  `CREATE TRIGGER IF NOT EXISTS update_invoices_updated_at 
   AFTER UPDATE ON invoices 
   BEGIN 
     UPDATE invoices SET updated_at = datetime('now') WHERE id = NEW.id; 
   END`,
  
  `CREATE TRIGGER IF NOT EXISTS update_templates_updated_at 
   AFTER UPDATE ON templates 
   BEGIN 
     UPDATE templates SET updated_at = datetime('now') WHERE id = NEW.id; 
   END`,
  
  `CREATE TRIGGER IF NOT EXISTS update_expenses_updated_at 
   AFTER UPDATE ON expenses 
   BEGIN 
     UPDATE expenses SET updated_at = datetime('now') WHERE id = NEW.id; 
   END`,
  
  `CREATE TRIGGER IF NOT EXISTS update_reports_updated_at 
   AFTER UPDATE ON reports 
   BEGIN 
     UPDATE reports SET updated_at = datetime('now') WHERE id = NEW.id; 
   END`,
  
  `CREATE TRIGGER IF NOT EXISTS update_settings_updated_at 
   AFTER UPDATE ON settings 
   BEGIN 
     UPDATE settings SET updated_at = datetime('now') WHERE id = NEW.id; 
   END`,
  
  `CREATE TRIGGER IF NOT EXISTS update_counters_updated_at
   AFTER UPDATE ON counters
   BEGIN
     UPDATE counters SET updated_at = datetime('now') WHERE id = NEW.id;
   END`,

  `CREATE TRIGGER IF NOT EXISTS update_users_updated_at
   AFTER UPDATE ON users
   BEGIN
     UPDATE users SET updated_at = datetime('now') WHERE id = NEW.id;
   END`,

  `CREATE TRIGGER IF NOT EXISTS update_oauth_credentials_updated_at
   AFTER UPDATE ON oauth_credentials
   BEGIN
     UPDATE oauth_credentials SET updated_at = datetime('now') WHERE id = NEW.id;
   END`,

  `CREATE TRIGGER IF NOT EXISTS update_email_templates_updated_at
   AFTER UPDATE ON email_templates
   BEGIN
     UPDATE email_templates SET updated_at = datetime('now') WHERE id = NEW.id;
   END`,

  `CREATE TRIGGER IF NOT EXISTS update_stripe_sync_status_updated_at
   AFTER UPDATE ON stripe_sync_status
   BEGIN
     UPDATE stripe_sync_status SET updated_at = datetime('now') WHERE id = NEW.id;
   END`
];

// Initial data for counters
export const INITIAL_COUNTERS = [
  { name: 'clients', value: 0 },
  { name: 'invoices', value: 0 },
  { name: 'templates', value: 0 },
  { name: 'expenses', value: 0 },
  { name: 'reports', value: 0 },
  { name: 'users', value: 0 }
];

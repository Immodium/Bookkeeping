/**
 * Table name validation to prevent SQL injection
 * Maintains whitelist of valid table names
 */

const VALID_TABLES = new Set([
  'users',
  'clients',
  'invoices',
  'invoice_items',
  'invoice_design_templates',
  'recurring_invoice_templates',
  'expenses',
  'payments',
  'settings',
  'project_settings',
  'reports',
  'counters',
  'password_reset_tokens',
  'email_verification_tokens',
  'audit_log',
  'sessions'
]);

export class TableValidationError extends Error {
  constructor(tableName: string) {
    super(`Invalid table name: "${tableName}". Table not in whitelist.`);
    this.name = 'TableValidationError';
  }
}

/**
 * Validates table name against whitelist
 * @throws {TableValidationError} if table name is invalid
 */
export function validateTableName(tableName: string): void {
  if (!tableName || typeof tableName !== 'string') {
    throw new TableValidationError(tableName);
  }

  if (!VALID_TABLES.has(tableName.toLowerCase())) {
    throw new TableValidationError(tableName);
  }
}

/**
 * Get list of valid table names (for documentation/testing)
 */
export function getValidTables(): string[] {
  return Array.from(VALID_TABLES);
}

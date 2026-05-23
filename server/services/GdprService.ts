// GdprService - GDPR data export and right-to-erasure support

import { databaseService } from '../core/DatabaseService.js';

class GdprService {
  /**
   * Export all personal data for a tenant as a structured JSON object.
   * Includes tenant metadata, users (sans sensitive fields), clients,
   * invoices, expenses, and payments.
   */
  async exportTenantData(tenantId: number): Promise<object> {
    const tenant = await databaseService.getOne(
      'SELECT id, name, slug, status, created_at, updated_at FROM tenants WHERE id = ?',
      [tenantId]
    );

    const users = await databaseService.getMany(
      `SELECT id, tenant_id, name, email, username, role, roles,
              email_verified, last_login, created_at, updated_at
       FROM users WHERE tenant_id = ?`,
      [tenantId]
    );

    const clients = await databaseService.getMany(
      'SELECT * FROM clients WHERE tenant_id = ?',
      [tenantId]
    );

    const invoices = await databaseService.getMany(
      'SELECT * FROM invoices WHERE tenant_id = ?',
      [tenantId]
    );

    const expenses = await databaseService.getMany(
      'SELECT * FROM expenses WHERE tenant_id = ?',
      [tenantId]
    );

    const payments = await databaseService.getMany(
      'SELECT * FROM payments WHERE tenant_id = ?',
      [tenantId]
    );

    return {
      exported_at: new Date().toISOString(),
      tenant,
      users,
      clients,
      invoices,
      expenses,
      payments
    };
  }

  /**
   * Anonymise a single user's PII in-place (right to erasure).
   * Verifies the user belongs to the given tenantId before erasing.
   * Does NOT delete the row — preserves referential integrity.
   */
  async eraseUser(userId: number, tenantId: number): Promise<void> {
    // Verify the user belongs to this tenant
    const user = await databaseService.getOne<{ id: number; tenant_id: number }>(
      'SELECT id, tenant_id FROM users WHERE id = ?',
      [userId]
    );

    if (!user) {
      throw new Error(`User ${userId} not found`);
    }

    if (user.tenant_id !== tenantId) {
      throw new Error(`User ${userId} does not belong to tenant ${tenantId}`);
    }

    await databaseService.executeQuery(
      `UPDATE users SET
         name = 'Deleted User',
         email = ?,
         username = ?,
         password_hash = NULL,
         google_id = NULL,
         two_factor_secret = NULL,
         backup_codes = NULL,
         updated_at = NOW()
       WHERE id = ?`,
      [`deleted-${userId}@erased.invalid`, `deleted-${userId}`, userId]
    );
  }
}

export const gdprService = new GdprService();

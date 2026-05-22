// AuditService - persistent audit log for compliance and security
// Never throws — all errors are swallowed so callers are never broken

import { databaseService } from '../core/DatabaseService.js';

export interface AuditEvent {
  tenantId?: number;
  userId?: number;
  action: string;           // e.g. 'auth.login', 'user.create', 'invoice.delete'
  resourceType?: string;    // e.g. 'user', 'invoice', 'client'
  resourceId?: string | number;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

export interface AuditLogFilter {
  tenantId?: number;
  userId?: number;
  action?: string;
  from?: string;   // ISO date
  to?: string;     // ISO date
  limit?: number;  // default 50, max 200
  offset?: number;
}

export interface AuditLogRow {
  id: number;
  tenant_id: number | null;
  user_id: number | null;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  metadata_json: string | null;
  created_at: string;
}

class AuditService {
  /**
   * Insert an audit event. Never throws — swallows all errors to avoid breaking
   * the calling code path.
   */
  async log(event: AuditEvent): Promise<void> {
    try {
      const metadataJson = event.metadata ? JSON.stringify(event.metadata) : null;
      const resourceId = event.resourceId != null ? String(event.resourceId) : null;

      await databaseService.executeQuery(
        `INSERT INTO audit_log
           (tenant_id, user_id, action, resource_type, resource_id, ip_address, user_agent, metadata_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          event.tenantId ?? null,
          event.userId ?? null,
          event.action,
          event.resourceType ?? null,
          resourceId,
          event.ipAddress ?? null,
          event.userAgent ?? null,
          metadataJson
        ]
      );
    } catch {
      // Intentionally swallowed — audit failures must never break the primary flow
    }
  }

  /**
   * Query audit log with optional filters.
   * Platform admin (no tenantId provided) can see all tenants.
   * Regular admins must always supply tenantId.
   */
  async getAuditLog(filter: AuditLogFilter): Promise<{ events: AuditLogRow[]; total: number }> {
    const limit = Math.min(filter.limit ?? 50, 200);
    const offset = filter.offset ?? 0;

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filter.tenantId !== undefined) {
      conditions.push('tenant_id = ?');
      params.push(filter.tenantId);
    }

    if (filter.userId !== undefined) {
      conditions.push('user_id = ?');
      params.push(filter.userId);
    }

    if (filter.action) {
      conditions.push('action LIKE ?');
      params.push(`${filter.action}%`);
    }

    if (filter.from) {
      conditions.push('created_at >= ?');
      params.push(filter.from);
    }

    if (filter.to) {
      conditions.push('created_at <= ?');
      params.push(filter.to);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRow = await databaseService.getOne<{ total: number }>(
      `SELECT COUNT(*) AS total FROM audit_log ${where}`,
      params
    );
    const total = countRow?.total ?? 0;

    const events = await databaseService.getMany<AuditLogRow>(
      `SELECT * FROM audit_log ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    return { events, total };
  }
}

export const auditService = new AuditService();

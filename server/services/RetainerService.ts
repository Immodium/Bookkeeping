import { databaseService } from '../core/DatabaseService.js';
import {
  Retainer,
  RetainerBillingCycle,
  RetainerStatus,
  ServiceOptions
} from '../types/index.js';

interface RetainerFilters {
  status?: RetainerStatus;
  billing_cycle?: RetainerBillingCycle;
  client_id?: number;
  search?: string;
}

interface RetainerStats {
  summary: {
    total: number;
    active: number;
    paused: number;
    ended: number;
    total_amount: number;
    monthly_value: number;
  };
  upcoming_next_30_days: number;
  by_billing_cycle: Array<{
    billing_cycle: RetainerBillingCycle;
    count: number;
    total_amount: number;
  }>;
}

const VALID_RETAINER_STATUSES: RetainerStatus[] = ['active', 'paused', 'ended'];
const VALID_BILLING_CYCLES: RetainerBillingCycle[] = ['weekly', 'monthly', 'quarterly', 'yearly'];

export class RetainerService {
  private normalizeTenantId(tenantId?: number): number {
    if (!tenantId || !Number.isInteger(tenantId) || tenantId <= 0) {
      throw new Error(`Invalid tenant context: tenantId must be a positive integer, got ${tenantId}`);
    }
    return tenantId;
  }

  private getRetainerSelectClause(): string {
    return `
      SELECT
        r.id,
        r.client_id,
        COALESCE(c.name, 'Unknown Client') AS client_name,
        c.email AS client_email,
        r.name,
        r.description,
        r.amount,
        r.currency,
        r.billing_cycle,
        r.start_date,
        r.next_invoice_date,
        r.end_date,
        r.status,
        r.auto_renew,
        r.email_schedule_enabled,
        r.reminder_days_before,
        r.auto_overdue_reminders,
        r.overdue_reminder_interval_days,
        r.max_overdue_reminders,
        r.overdue_reminder_count,
        r.last_pre_due_reminder_for_date,
        r.last_overdue_reminder_at,
        r.last_reminder_sent_at,
        r.last_reminder_type,
        r.notes,
        r.created_at,
        r.updated_at,
        r.deleted_at
      FROM retainers r
      LEFT JOIN clients c ON r.client_id = c.id
    `;
  }

  private isValidDate(dateString: string): boolean {
    if (!dateString) {
      return false;
    }

    const date = new Date(dateString);
    return !isNaN(date.getTime()) && /^\d{4}-\d{2}-\d{2}$/.test(dateString);
  }

  private async assertClientExists(clientId: number, tenantId: number): Promise<void> {
    const client = await databaseService.getOne<{ id: number }>(
      'SELECT id FROM clients WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL LIMIT 1',
      [clientId, tenantId]
    );

    if (!client?.id) {
      throw new Error(`Client ID "${clientId}" was not found`);
    }
  }

  private assertBillingCycle(value: string): asserts value is RetainerBillingCycle {
    if (!VALID_BILLING_CYCLES.includes(value as RetainerBillingCycle)) {
      throw new Error('Invalid billing cycle');
    }
  }

  private assertStatus(value: string): asserts value is RetainerStatus {
    if (!VALID_RETAINER_STATUSES.includes(value as RetainerStatus)) {
      throw new Error('Invalid retainer status');
    }
  }

  private toFlag(value: boolean | number | undefined, defaultValue: number): number {
    if (value === undefined) {
      return defaultValue;
    }

    if (typeof value === 'boolean') {
      return value ? 1 : 0;
    }

    return value === 0 ? 0 : 1;
  }

  private toIntegerSetting(
    value: number | undefined,
    defaultValue: number,
    fieldName: string,
    minimum = 0
  ): number {
    if (value === undefined || value === null) {
      return defaultValue;
    }

    if (!Number.isInteger(value) || value < minimum) {
      throw new Error(`${fieldName} must be an integer greater than or equal to ${minimum}`);
    }

    return value;
  }

  async getAllRetainers(
    filters: RetainerFilters = {},
    options: ServiceOptions = {},
    tenantId?: number
  ): Promise<{
    retainers: Retainer[];
    pagination: {
      total: number;
      limit: number;
      offset: number;
      hasMore: boolean;
    };
  }> {
    const { limit = 50, offset = 0 } = options;
    const { status, billing_cycle, client_id, search } = filters;
    const scopedTenantId = this.normalizeTenantId(tenantId);

    let query = this.getRetainerSelectClause();
    const conditions: string[] = ['r.tenant_id = ?', 'r.deleted_at IS NULL'];
    const params: Array<string | number> = [scopedTenantId];

    if (status) {
      conditions.push('r.status = ?');
      params.push(status);
    }

    if (billing_cycle) {
      conditions.push('r.billing_cycle = ?');
      params.push(billing_cycle);
    }

    if (client_id) {
      conditions.push('r.client_id = ?');
      params.push(client_id);
    }

    if (search) {
      const pattern = `%${search.trim()}%`;
      conditions.push(
        `(LOWER(r.name) LIKE LOWER(?) OR LOWER(COALESCE(r.description, '')) LIKE LOWER(?) OR LOWER(COALESCE(c.name, '')) LIKE LOWER(?))`
      );
      params.push(pattern, pattern, pattern);
    }

    query += ` WHERE ${conditions.join(' AND ')}`;
    query += ' ORDER BY r.next_invoice_date ASC, r.created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const retainers = await databaseService.getMany<Retainer>(query, params);

    const countQuery = `
      SELECT COUNT(*) as count
      FROM retainers r
      LEFT JOIN clients c ON r.client_id = c.id
      WHERE ${conditions.join(' AND ')}
    `;

    const totalResult = await databaseService.getOne<{ count: number }>(countQuery, params.slice(0, -2));
    const total = totalResult?.count || 0;

    return {
      retainers,
      pagination: {
        total,
        limit,
        offset,
        hasMore: total > offset + limit
      }
    };
  }

  async getRetainerById(id: number, tenantId?: number): Promise<Retainer | null> {
    if (!id || typeof id !== 'number') {
      throw new Error('Valid retainer ID is required');
    }

    const scopedTenantId = this.normalizeTenantId(tenantId);
    return await databaseService.getOne<Retainer>(
      `
        ${this.getRetainerSelectClause()}
        WHERE r.id = ? AND r.tenant_id = ? AND r.deleted_at IS NULL
        LIMIT 1
      `,
      [id, scopedTenantId]
    );
  }

  async createRetainer(retainerData: {
    client_id: number;
    name: string;
    description?: string;
    amount: number;
    currency?: string;
    billing_cycle?: RetainerBillingCycle;
    start_date: string;
    next_invoice_date: string;
    end_date?: string;
    status?: RetainerStatus;
    auto_renew?: boolean | number;
    email_schedule_enabled?: boolean | number;
    reminder_days_before?: number;
    auto_overdue_reminders?: boolean | number;
    overdue_reminder_interval_days?: number;
    max_overdue_reminders?: number;
    notes?: string;
  }, tenantId?: number): Promise<number> {
    if (
      !retainerData ||
      !retainerData.client_id ||
      !retainerData.name ||
      !retainerData.start_date ||
      !retainerData.next_invoice_date
    ) {
      throw new Error('Client, name, start date, and next invoice date are required');
    }

    if (typeof retainerData.amount !== 'number' || retainerData.amount <= 0) {
      throw new Error('Amount must be a positive number');
    }

    if (!this.isValidDate(retainerData.start_date) || !this.isValidDate(retainerData.next_invoice_date)) {
      throw new Error('Invalid date format');
    }

    if (retainerData.end_date && !this.isValidDate(retainerData.end_date)) {
      throw new Error('Invalid date format');
    }

    const scopedTenantId = this.normalizeTenantId(tenantId);
    await this.assertClientExists(retainerData.client_id, scopedTenantId);

    const billingCycle = retainerData.billing_cycle || 'monthly';
    this.assertBillingCycle(billingCycle);

    const status = retainerData.status || 'active';
    this.assertStatus(status);

    const autoRenew = this.toFlag(retainerData.auto_renew, 1);
    const emailScheduleEnabled = this.toFlag(retainerData.email_schedule_enabled, 0);
    const reminderDaysBefore = this.toIntegerSetting(
      retainerData.reminder_days_before,
      3,
      'reminder_days_before',
      0
    );
    const autoOverdueReminders = this.toFlag(retainerData.auto_overdue_reminders, 0);
    const overdueReminderIntervalDays = this.toIntegerSetting(
      retainerData.overdue_reminder_interval_days,
      7,
      'overdue_reminder_interval_days',
      1
    );
    const maxOverdueReminders = this.toIntegerSetting(
      retainerData.max_overdue_reminders,
      3,
      'max_overdue_reminders',
      1
    );

    const nextId = await databaseService.getNextId('retainers');
    const now = new Date().toISOString();

    await databaseService.executeQuery(
      `
        INSERT INTO retainers (
          id, tenant_id, client_id, name, description, amount, currency, billing_cycle, start_date,
          next_invoice_date, end_date, status, auto_renew, email_schedule_enabled, reminder_days_before,
          auto_overdue_reminders, overdue_reminder_interval_days, max_overdue_reminders, overdue_reminder_count,
          last_pre_due_reminder_for_date, last_overdue_reminder_at, last_reminder_sent_at, last_reminder_type,
          notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        nextId,
        scopedTenantId,
        retainerData.client_id,
        retainerData.name.trim(),
        retainerData.description || null,
        retainerData.amount,
        retainerData.currency || 'USD',
        billingCycle,
        retainerData.start_date,
        retainerData.next_invoice_date,
        retainerData.end_date || null,
        status,
        autoRenew,
        emailScheduleEnabled,
        reminderDaysBefore,
        autoOverdueReminders,
        overdueReminderIntervalDays,
        maxOverdueReminders,
        0,
        null,
        null,
        null,
        null,
        retainerData.notes || null,
        now,
        now
      ]
    );

    return nextId;
  }

  async updateRetainer(
    id: number,
    retainerData: Partial<{
      client_id: number;
      name: string;
      description: string;
      amount: number;
      currency: string;
      billing_cycle: RetainerBillingCycle;
      start_date: string;
      next_invoice_date: string;
      end_date: string;
      status: RetainerStatus;
      auto_renew: boolean | number;
      email_schedule_enabled: boolean | number;
      reminder_days_before: number;
      auto_overdue_reminders: boolean | number;
      overdue_reminder_interval_days: number;
      max_overdue_reminders: number;
      notes: string;
    }>,
    tenantId?: number
  ): Promise<number> {
    if (!id || typeof id !== 'number') {
      throw new Error('Valid retainer ID is required');
    }

    if (!retainerData || typeof retainerData !== 'object') {
      throw new Error('Retainer data is required');
    }

    const scopedTenantId = this.normalizeTenantId(tenantId);
    const existingRetainer = await this.getRetainerById(id, scopedTenantId);
    if (!existingRetainer) {
      throw new Error('Retainer not found');
    }

    if (retainerData.client_id !== undefined) {
      await this.assertClientExists(retainerData.client_id, scopedTenantId);
    }

    if (retainerData.amount !== undefined) {
      if (typeof retainerData.amount !== 'number' || retainerData.amount <= 0) {
        throw new Error('Amount must be a positive number');
      }
    }

    if (retainerData.billing_cycle !== undefined) {
      this.assertBillingCycle(retainerData.billing_cycle);
    }

    if (retainerData.status !== undefined) {
      this.assertStatus(retainerData.status);
    }

    if (retainerData.start_date !== undefined && !this.isValidDate(retainerData.start_date)) {
      throw new Error('Invalid date format');
    }

    if (retainerData.next_invoice_date !== undefined && !this.isValidDate(retainerData.next_invoice_date)) {
      throw new Error('Invalid date format');
    }

    if (retainerData.end_date !== undefined && retainerData.end_date && !this.isValidDate(retainerData.end_date)) {
      throw new Error('Invalid date format');
    }

    if (retainerData.reminder_days_before !== undefined) {
      this.toIntegerSetting(retainerData.reminder_days_before, 3, 'reminder_days_before', 0);
    }

    if (retainerData.overdue_reminder_interval_days !== undefined) {
      this.toIntegerSetting(
        retainerData.overdue_reminder_interval_days,
        7,
        'overdue_reminder_interval_days',
        1
      );
    }

    if (retainerData.max_overdue_reminders !== undefined) {
      this.toIntegerSetting(retainerData.max_overdue_reminders, 3, 'max_overdue_reminders', 1);
    }

    const updateData: Record<string, unknown> = {};

    if (retainerData.client_id !== undefined) updateData.client_id = retainerData.client_id;
    if (retainerData.name !== undefined) updateData.name = retainerData.name.trim();
    if (retainerData.description !== undefined) updateData.description = retainerData.description;
    if (retainerData.amount !== undefined) updateData.amount = retainerData.amount;
    if (retainerData.currency !== undefined) updateData.currency = retainerData.currency;
    if (retainerData.billing_cycle !== undefined) updateData.billing_cycle = retainerData.billing_cycle;
    if (retainerData.start_date !== undefined) updateData.start_date = retainerData.start_date;
    if (retainerData.next_invoice_date !== undefined) updateData.next_invoice_date = retainerData.next_invoice_date;
    if (retainerData.end_date !== undefined) updateData.end_date = retainerData.end_date || null;
    if (retainerData.status !== undefined) updateData.status = retainerData.status;
    if (retainerData.notes !== undefined) updateData.notes = retainerData.notes;

    if (retainerData.auto_renew !== undefined) {
      updateData.auto_renew = this.toFlag(retainerData.auto_renew, 1);
    }

    if (retainerData.email_schedule_enabled !== undefined) {
      updateData.email_schedule_enabled = this.toFlag(retainerData.email_schedule_enabled, 0);
    }

    if (retainerData.reminder_days_before !== undefined) {
      updateData.reminder_days_before = this.toIntegerSetting(
        retainerData.reminder_days_before,
        3,
        'reminder_days_before',
        0
      );
    }

    if (retainerData.auto_overdue_reminders !== undefined) {
      updateData.auto_overdue_reminders = this.toFlag(retainerData.auto_overdue_reminders, 0);
    }

    if (retainerData.overdue_reminder_interval_days !== undefined) {
      updateData.overdue_reminder_interval_days = this.toIntegerSetting(
        retainerData.overdue_reminder_interval_days,
        7,
        'overdue_reminder_interval_days',
        1
      );
    }

    if (retainerData.max_overdue_reminders !== undefined) {
      updateData.max_overdue_reminders = this.toIntegerSetting(
        retainerData.max_overdue_reminders,
        3,
        'max_overdue_reminders',
        1
      );
    }

    if (
      retainerData.next_invoice_date !== undefined &&
      retainerData.next_invoice_date !== existingRetainer.next_invoice_date
    ) {
      // New invoice cycle should reset reminder progress state.
      updateData.overdue_reminder_count = 0;
      updateData.last_pre_due_reminder_for_date = null;
      updateData.last_overdue_reminder_at = null;
      updateData.last_reminder_sent_at = null;
      updateData.last_reminder_type = null;
    }

    if (Object.keys(updateData).length === 0) {
      throw new Error('No valid fields to update');
    }

    const keys = Object.keys(updateData);
    const values = Object.values(updateData);
    const setClause = keys.map((key) => `${key} = ?`).join(', ');
    const result = await databaseService.executeQuery(
      `UPDATE retainers SET ${setClause}, updated_at = NOW() WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
      [...values, id, scopedTenantId]
    );
    return result.changes;
  }

  async deleteRetainer(id: number, tenantId?: number): Promise<number> {
    if (!id || typeof id !== 'number') {
      throw new Error('Valid retainer ID is required');
    }

    const scopedTenantId = this.normalizeTenantId(tenantId);
    const existingRetainer = await this.getRetainerById(id, scopedTenantId);
    if (!existingRetainer) {
      throw new Error('Retainer not found');
    }

    const result = await databaseService.executeQuery(
      "UPDATE retainers SET deleted_at = NOW(), updated_at = NOW() WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL",
      [id, scopedTenantId]
    );
    return result.changes;
  }

  async getRetainerStats(tenantId?: number): Promise<RetainerStats> {
    const scopedTenantId = this.normalizeTenantId(tenantId);
    const summary = await databaseService.getOne<RetainerStats['summary']>(
      `
        SELECT
          COUNT(*) AS total,
          COUNT(CASE WHEN status = 'active' THEN 1 END) AS active,
          COUNT(CASE WHEN status = 'paused' THEN 1 END) AS paused,
          COUNT(CASE WHEN status = 'ended' THEN 1 END) AS ended,
          COALESCE(SUM(amount), 0) AS total_amount,
          COALESCE(
            SUM(
              CASE
                WHEN status = 'active' AND billing_cycle = 'weekly' THEN (amount * 52.0) / 12.0
                WHEN status = 'active' AND billing_cycle = 'monthly' THEN amount
                WHEN status = 'active' AND billing_cycle = 'quarterly' THEN amount / 3.0
                WHEN status = 'active' AND billing_cycle = 'yearly' THEN amount / 12.0
                ELSE 0
              END
            ),
            0
          ) AS monthly_value
        FROM retainers
        WHERE tenant_id = ? AND deleted_at IS NULL
      `,
      [scopedTenantId]
    );

    const byBillingCycle = await databaseService.getMany<RetainerStats['by_billing_cycle'][number]>(
      `
        SELECT
          billing_cycle,
          COUNT(*) AS count,
          COALESCE(SUM(amount), 0) AS total_amount
        FROM retainers
        WHERE tenant_id = ? AND deleted_at IS NULL
        GROUP BY billing_cycle
        ORDER BY count DESC
      `,
      [scopedTenantId]
    );

    const upcomingResult = await databaseService.getOne<{ count: number }>(
      `
        SELECT COUNT(*) AS count
        FROM retainers
        WHERE tenant_id = ? AND deleted_at IS NULL
          AND status = 'active'
          AND next_invoice_date >= date('now')
          AND next_invoice_date <= date('now', '+30 days')
      `,
      [scopedTenantId]
    );

    return {
      summary: summary || {
        total: 0,
        active: 0,
        paused: 0,
        ended: 0,
        total_amount: 0,
        monthly_value: 0
      },
      upcoming_next_30_days: upcomingResult?.count || 0,
      by_billing_cycle: byBillingCycle
    };
  }
}

export const retainerService = new RetainerService();

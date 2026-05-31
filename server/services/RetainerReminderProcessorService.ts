import { databaseService } from '../core/DatabaseService.js';
import { emailTemplateService } from './EmailTemplateService.js';
import { emailProviderService } from './EmailProviderService.js';

type ReminderType = 'pre_due' | 'overdue';

interface RetainerReminderRow {
  id: number;
  tenant_id: number;
  schema_name: string;
  name: string;
  amount: number;
  currency: string | null;
  billing_cycle: string;
  next_invoice_date: string;
  client_name: string | null;
  client_email: string | null;
  email_schedule_enabled: number;
  reminder_days_before: number;
  auto_overdue_reminders: number;
  overdue_reminder_interval_days: number;
  max_overdue_reminders: number;
  overdue_reminder_count: number;
  last_pre_due_reminder_for_date: string | null;
  last_overdue_reminder_at: string | null;
}

interface ReminderProcessResult {
  processed: number;
  failed: number;
  skipped: number;
  errors: string[];
}

const DAY_IN_MS = 24 * 60 * 60 * 1000;

const toDateOnly = (value: string): Date | null => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
};

const toIsoDate = (date: Date): string => date.toISOString().split('T')[0] || '';

const daysBetween = (later: Date, earlier: Date): number => {
  return Math.floor((later.getTime() - earlier.getTime()) / DAY_IN_MS);
};

export class RetainerReminderProcessorService {
  private normalizeTenantId(tenantId?: number): number {
    if (!tenantId || !Number.isInteger(tenantId) || tenantId <= 0) {
      throw new Error(`Invalid tenant context: tenantId must be a positive integer, got ${tenantId}`);
    }
    return tenantId;
  }

  private async getActiveTenantIds(explicitTenantId?: number): Promise<number[]> {
    if (explicitTenantId !== undefined) {
      return [this.normalizeTenantId(explicitTenantId)];
    }

    const tenants = await databaseService.getMany<{ id: number }>(
      "SELECT id FROM tenants WHERE status != 'deleted' ORDER BY id"
    );
    return tenants.map((tenant) => tenant.id).filter((id) => Number.isInteger(id) && id > 0);
  }

  private async getRetainersForTenant(tenantId: number): Promise<RetainerReminderRow[]> {
    const schemaName = `tenant_${tenantId}`;
    return databaseService.getMany<RetainerReminderRow>(
      `
        SELECT
          r.id,
          r.tenant_id,
          '${schemaName}' AS schema_name,
          r.name,
          r.amount,
          r.currency,
          r.billing_cycle,
          r.next_invoice_date,
          COALESCE(c.name, 'Valued Client') AS client_name,
          c.email AS client_email,
          r.email_schedule_enabled,
          r.reminder_days_before,
          r.auto_overdue_reminders,
          r.overdue_reminder_interval_days,
          r.max_overdue_reminders,
          r.overdue_reminder_count,
          r.last_pre_due_reminder_for_date,
          r.last_overdue_reminder_at
        FROM "${schemaName}".retainers r
        LEFT JOIN "${schemaName}".clients c ON c.id = r.client_id
        WHERE r.deleted_at IS NULL
          AND r.status = 'active'
          AND r.email_schedule_enabled = 1
          AND COALESCE(c.email, '') <> ''
        ORDER BY r.next_invoice_date ASC, r.id ASC
      `
    );
  }

  private async sendReminderEmail(
    retainer: RetainerReminderRow,
    reminderType: ReminderType,
    reminderDate: string,
    daysValue: number
  ): Promise<boolean> {
    if (!retainer.client_email) {
      return false;
    }

    const portalUrl = `${process.env.APP_URL || process.env.CLIENT_URL || 'http://localhost:5173'}/retainers`;
    const templateName = reminderType === 'pre_due' ? 'retainer_due_soon' : 'retainer_overdue_reminder';
    const variables = {
      client_name: retainer.client_name || 'Valued Client',
      retainer_name: retainer.name,
      amount: `${retainer.currency || 'USD'} ${(Number(retainer.amount || 0)).toFixed(2)}`,
      billing_cycle: retainer.billing_cycle,
      next_invoice_date: reminderDate,
      days_until_due: daysValue,
      days_overdue: daysValue,
      portal_url: portalUrl
    };

    const rendered = await emailTemplateService.render(templateName, variables, retainer.tenant_id);
    const sendResult = await emailProviderService.sendEmail({
      to: retainer.client_email,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      tenantId: retainer.tenant_id
    });

    if (!sendResult.success) {
      return false;
    }

    if (reminderType === 'pre_due') {
      await databaseService.executeQuery(
        `UPDATE "${retainer.schema_name}".retainers
         SET last_pre_due_reminder_for_date = ?,
             last_reminder_sent_at = NOW(),
             last_reminder_type = 'pre_due',
             updated_at = NOW()
         WHERE id = ? AND tenant_id = ?`,
        [reminderDate, retainer.id, retainer.tenant_id]
      );
    } else {
      await databaseService.executeQuery(
        `UPDATE "${retainer.schema_name}".retainers
         SET overdue_reminder_count = COALESCE(overdue_reminder_count, 0) + 1,
             last_overdue_reminder_at = NOW(),
             last_reminder_sent_at = NOW(),
             last_reminder_type = 'overdue',
             updated_at = NOW()
         WHERE id = ? AND tenant_id = ?`,
        [retainer.id, retainer.tenant_id]
      );
    }

    return true;
  }

  async processAllDueReminders(tenantId?: number): Promise<ReminderProcessResult> {
    const tenantIds = await this.getActiveTenantIds(tenantId);
    const rowsByTenant = await Promise.all(tenantIds.map((id) => this.getRetainersForTenant(id)));
    const rows = rowsByTenant.flat();
    const result: ReminderProcessResult = {
      processed: 0,
      failed: 0,
      skipped: 0,
      errors: []
    };

    const today = toDateOnly(toIsoDate(new Date()));
    if (!today) {
      return result;
    }

    for (const retainer of rows) {
      const dueDate = toDateOnly(retainer.next_invoice_date);
      if (!dueDate) {
        result.skipped += 1;
        result.errors.push(`Retainer ${retainer.id}: invalid next invoice date`);
        continue;
      }

      const daysUntilDue = daysBetween(dueDate, today);
      const reminderDaysBefore = Number.isInteger(retainer.reminder_days_before)
        ? Math.max(0, retainer.reminder_days_before)
        : 0;

      try {
        if (daysUntilDue === reminderDaysBefore) {
          if (retainer.last_pre_due_reminder_for_date === retainer.next_invoice_date) {
            result.skipped += 1;
            continue;
          }

          const sent = await this.sendReminderEmail(
            retainer,
            'pre_due',
            retainer.next_invoice_date,
            reminderDaysBefore
          );
          if (sent) {
            result.processed += 1;
          } else {
            result.failed += 1;
            result.errors.push(`Retainer ${retainer.id}: failed to send pre-due reminder`);
          }
          continue;
        }

        if (daysUntilDue < 0 && retainer.auto_overdue_reminders === 1) {
          const maxOverdueReminders = Number.isInteger(retainer.max_overdue_reminders)
            ? Math.max(1, retainer.max_overdue_reminders)
            : 3;
          const currentCount = Number.isInteger(retainer.overdue_reminder_count)
            ? Math.max(0, retainer.overdue_reminder_count)
            : 0;

          if (currentCount >= maxOverdueReminders) {
            result.skipped += 1;
            continue;
          }

          const intervalDays = Number.isInteger(retainer.overdue_reminder_interval_days)
            ? Math.max(1, retainer.overdue_reminder_interval_days)
            : 7;

          if (retainer.last_overdue_reminder_at) {
            const lastOverdueDate = new Date(retainer.last_overdue_reminder_at);
            if (!Number.isNaN(lastOverdueDate.getTime())) {
              const daysSinceLastOverdueReminder = daysBetween(today, lastOverdueDate);
              if (daysSinceLastOverdueReminder < intervalDays) {
                result.skipped += 1;
                continue;
              }
            }
          }

          const daysOverdue = Math.abs(daysUntilDue);
          const sent = await this.sendReminderEmail(
            retainer,
            'overdue',
            retainer.next_invoice_date,
            daysOverdue
          );
          if (sent) {
            result.processed += 1;
          } else {
            result.failed += 1;
            result.errors.push(`Retainer ${retainer.id}: failed to send overdue reminder`);
          }
          continue;
        }

        result.skipped += 1;
      } catch (error) {
        result.failed += 1;
        result.errors.push(`Retainer ${retainer.id}: ${(error as Error).message}`);
      }
    }

    return result;
  }
}

export const retainerReminderProcessorService = new RetainerReminderProcessorService();

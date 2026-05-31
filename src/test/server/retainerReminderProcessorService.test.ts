import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getManyMock,
  executeQueryMock,
  renderMock,
  sendEmailMock
} = vi.hoisted(() => ({
  getManyMock: vi.fn(),
  executeQueryMock: vi.fn(),
  renderMock: vi.fn(),
  sendEmailMock: vi.fn()
}));

vi.mock('../../../server/core/DatabaseService.js', () => ({
  databaseService: {
    getMany: getManyMock,
    executeQuery: executeQueryMock
  }
}));

vi.mock('../../../server/services/EmailTemplateService.js', () => ({
  emailTemplateService: {
    render: renderMock
  }
}));

vi.mock('../../../server/services/EmailProviderService.js', () => ({
  emailProviderService: {
    sendEmail: sendEmailMock
  }
}));

import { retainerReminderProcessorService } from '../../../server/services/RetainerReminderProcessorService.js';

const addDays = (date: Date, amount: number): string => {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + amount);
  return next.toISOString().split('T')[0] || '';
};

describe('RetainerReminderProcessorService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    renderMock.mockResolvedValue({
      subject: 'Reminder',
      html: '<p>Reminder</p>',
      text: 'Reminder'
    });
    sendEmailMock.mockResolvedValue({ success: true, message: 'ok' });
  });

  it('sends pre-due reminder when due threshold is reached', async () => {
    const today = new Date();
    getManyMock
      .mockResolvedValueOnce([{ id: 1 }])
      .mockResolvedValueOnce([
        {
          id: 9,
          tenant_id: 1,
          schema_name: 'tenant_1',
          name: 'Website Support',
          amount: 1250,
          currency: 'USD',
          billing_cycle: 'monthly',
          next_invoice_date: addDays(today, 3),
          client_name: 'Acme Co',
          client_email: 'billing@acme.test',
          email_schedule_enabled: 1,
          reminder_days_before: 3,
          auto_overdue_reminders: 0,
          overdue_reminder_interval_days: 7,
          max_overdue_reminders: 3,
          overdue_reminder_count: 0,
          last_pre_due_reminder_for_date: null,
          last_overdue_reminder_at: null
        }
      ]);

    const result = await retainerReminderProcessorService.processAllDueReminders();

    expect(result.processed).toBe(1);
    expect(result.failed).toBe(0);
    expect(renderMock).toHaveBeenCalledWith(
      'retainer_due_soon',
      expect.objectContaining({
        retainer_name: 'Website Support',
        days_until_due: 3
      }),
      1
    );
    expect(sendEmailMock).toHaveBeenCalled();
    expect(executeQueryMock).toHaveBeenCalledWith(
      expect.stringContaining('last_pre_due_reminder_for_date'),
      [addDays(today, 3), 9, 1]
    );
  });

  it('sends overdue reminder when interval allows', async () => {
    const today = new Date();
    const lastOverdueSent = addDays(today, -8);
    getManyMock
      .mockResolvedValueOnce([{ id: 2 }])
      .mockResolvedValueOnce([
        {
          id: 10,
          tenant_id: 2,
          schema_name: 'tenant_2',
          name: 'SEO Retainer',
          amount: 900,
          currency: 'USD',
          billing_cycle: 'monthly',
          next_invoice_date: addDays(today, -6),
          client_name: 'Beta LLC',
          client_email: 'ap@beta.test',
          email_schedule_enabled: 1,
          reminder_days_before: 2,
          auto_overdue_reminders: 1,
          overdue_reminder_interval_days: 7,
          max_overdue_reminders: 3,
          overdue_reminder_count: 1,
          last_pre_due_reminder_for_date: null,
          last_overdue_reminder_at: `${lastOverdueSent}T00:00:00Z`
        }
      ]);

    const result = await retainerReminderProcessorService.processAllDueReminders();

    expect(result.processed).toBe(1);
    expect(result.failed).toBe(0);
    expect(renderMock).toHaveBeenCalledWith(
      'retainer_overdue_reminder',
      expect.objectContaining({
        retainer_name: 'SEO Retainer',
        days_overdue: 6
      }),
      2
    );
    expect(executeQueryMock).toHaveBeenCalledWith(
      expect.stringContaining('overdue_reminder_count'),
      [10, 2]
    );
  });
});

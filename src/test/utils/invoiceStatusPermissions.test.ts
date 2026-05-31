import { describe, expect, it } from 'vitest';
import { getInvoiceStatusPermissions } from '@/utils/business/invoice.util';

describe('getInvoiceStatusPermissions', () => {
  it('allows editing, saving, and emailing for paid invoices', () => {
    const permissions = getInvoiceStatusPermissions('paid');

    expect(permissions.canEdit).toBe(true);
    expect(permissions.canSave).toBe(true);
    expect(permissions.canSend).toBe(true);
    expect(permissions.canDelete).toBe(false);
  });

  it('allows emailing for sent invoices to support resend', () => {
    const permissions = getInvoiceStatusPermissions('sent');

    expect(permissions.canEdit).toBe(true);
    expect(permissions.canSave).toBe(true);
    expect(permissions.canSend).toBe(true);
    expect(permissions.canDelete).toBe(true);
  });
});

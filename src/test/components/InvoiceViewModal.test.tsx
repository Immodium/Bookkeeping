import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { InvoiceViewModal } from '@/components/invoices/InvoiceViewModal';
import type { Invoice } from '@/types';

const { getEmailConfigurationStatusMock } = vi.hoisted(() => ({
  getEmailConfigurationStatusMock: vi.fn()
}));

vi.mock('@/utils/emailConfig.util', () => ({
  getEmailConfigurationStatus: getEmailConfigurationStatusMock
}));

vi.mock('@/hooks/useSettings.hook', () => ({
  useCompanySettings: () => ({
    settings: {
      companyName: 'Slimbooks',
      address: '123 Main St',
      city: 'Dev City',
      state: 'CA',
      zipCode: '90000',
      brandingImage: ''
    },
    isLoading: false
  })
}));

const buildInvoice = (overrides: Partial<Invoice> = {}): Invoice => ({
  id: 1,
  invoice_number: 'INV-1',
  client_id: 1,
  amount: 100,
  tax_amount: 0,
  total_amount: 100,
  status: 'draft',
  due_date: '2026-06-01',
  issue_date: '2026-05-31',
  type: 'one-time',
  shipping_amount: 0,
  email_status: 'not_sent',
  created_at: '2026-05-31T00:00:00.000Z',
  updated_at: '2026-05-31T00:00:00.000Z',
  client_name: 'Client One',
  client_email: 'client@example.com',
  ...overrides
});

describe('InvoiceViewModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getEmailConfigurationStatusMock.mockResolvedValue({
      isConfigured: true,
      isEnabled: true,
      missingFields: [],
      canSendEmails: true
    });
  });

  it('shows enabled Email Invoice button when email config is ready', async () => {
    render(<InvoiceViewModal invoice={buildInvoice()} isOpen={true} onClose={() => {}} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Email Invoice' })).toBeEnabled();
    });
  });

  it('keeps Email Invoice visible but disabled without client email', async () => {
    render(
      <InvoiceViewModal
        invoice={buildInvoice({ client_email: '' })}
        isOpen={true}
        onClose={() => {}}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Email Invoice' })).toBeDisabled();
    });
  });
});

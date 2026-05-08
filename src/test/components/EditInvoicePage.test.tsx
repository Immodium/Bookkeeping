import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { EditInvoicePage } from '@/components/invoices/EditInvoicePage';

const { mockNavigate, mockAuthenticatedFetch, mockGetSetting } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockAuthenticatedFetch: vi.fn(),
  mockGetSetting: vi.fn()
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ id: '1' }),
    useNavigate: () => mockNavigate
  };
});

vi.mock('@/utils/api', () => ({
  authenticatedFetch: mockAuthenticatedFetch
}));

vi.mock('@/hooks/useFormNavigation', () => ({
  useFormNavigation: () => ({
    confirmNavigation: vi.fn(),
    NavigationGuard: () => null
  })
}));

vi.mock('@/components/invoices/ClientSelector', () => ({
  ClientSelector: () => <div>Client selector</div>
}));

vi.mock('@/components/invoices/CompanyHeader', () => ({
  CompanyHeader: () => <div>Company header</div>
}));

vi.mock('@/utils/data', () => ({
  validateInvoiceForSave: () => ({ isValid: true }),
  validateInvoiceForSend: () => ({ canSend: true }),
  autoFillInvoiceDefaults: vi.fn()
}));

vi.mock('@/utils/emailConfig.util', () => ({
  getEmailConfigurationStatus: vi.fn().mockResolvedValue({ canSendEmails: false })
}));

vi.mock('@/services/sqlite.svc', () => ({
  sqliteService: {
    isReady: () => true,
    getSetting: mockGetSetting
  }
}));

vi.mock('@/services/invoices.svc', () => ({
  invoiceService: {
    updateEmailStatus: vi.fn(),
    sendInvoiceEmail: vi.fn(),
    markInvoiceAsSent: vi.fn()
  }
}));

vi.mock('@/services/pdf.svc', () => ({
  pdfService: {
    downloadInvoicePDF: vi.fn()
  }
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn()
  }
}));

describe('EditInvoicePage', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockGetSetting.mockReset();
    mockAuthenticatedFetch.mockReset();
    mockGetSetting.mockResolvedValue(null);

    const invoiceRecord = {
      id: 1,
      invoice_number: 'INV-001',
      due_date: '2026-04-30',
      status: 'paid',
      client_id: 10,
      line_items: JSON.stringify([
        { id: 1, description: 'Consulting', quantity: 1, unit_price: 100, total: 100 }
      ]),
      notes: 'Thanks!',
      design_template_id: null,
      recurring_template_id: null
    };

    const clientsResponse = {
      data: [
        {
          id: 10,
          name: 'Acme Corp',
          email: 'billing@acme.com',
          phone: '555-0100',
          address: '123 Main St',
          city: 'Austin',
          state: 'TX',
          zipCode: '78701'
        }
      ]
    };

    mockAuthenticatedFetch.mockImplementation(async (url: string) => {
      if (url === '/api/invoices/1') {
        return {
          json: async () => ({ data: invoiceRecord })
        };
      }

      if (url === '/api/clients') {
        return {
          json: async () => clientsResponse
        };
      }

      return { data: null, json: async () => ({ data: [] }) };
    });
  });

  it('always renders Save Invoice while editing, including paid invoices', async () => {
    render(<EditInvoicePage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /save invoice/i })).toBeInTheDocument();
    });
  });
});

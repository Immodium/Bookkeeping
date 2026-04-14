// Invoice component prop types

import type { Invoice, InvoiceFormData, InvoiceTemplate, InvoiceTemplateFormData, Client } from '@/types';

export interface InvoiceFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (invoiceData: InvoiceFormData) => void;
  invoice?: Invoice | null;
}

export interface InvoiceViewModalProps {
  invoice: Invoice | null;
  isOpen: boolean;
  onClose: () => void;
  onMarkAsPaid?: (invoice: Invoice) => void;
}

export interface CreateInvoicePageProps {
  onBack: () => void;
  editingInvoice?: Invoice | null;
  viewOnly?: boolean;
}

export interface CreateRecurringInvoicePageProps {
  onBack: () => void;
  editingTemplate?: InvoiceTemplate | null;
}

export interface TemplateFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (templateData: InvoiceTemplateFormData) => void;
  template?: InvoiceTemplate | null;
}

export interface TemplatesTabProps {
  // Add props as needed
}

export interface CompanyHeaderProps {
  companyName?: string;
  companyAddress?: string;
  companyCity?: string;
  companyState?: string;
  companyZip?: string;
  companyPhone?: string;
  companyEmail?: string;
  logoUrl?: string;
}

export interface ClientSelectorProps {
  clients: Client[];
  selectedClientId?: number | null;
  onClientSelect: (clientId: number | null) => void;
  showAddButton?: boolean;
  onAddClient?: () => void;
}

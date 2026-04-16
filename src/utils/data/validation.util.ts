import type {
  Client,
  ClientValidationResult,
  ExpenseValidationResult,
  InvoiceItem
} from '@/types';

type InvoiceInput = {
  invoice_number?: string;
  due_date?: string;
  status?: string;
};

type GenericRecord = Record<string, unknown>;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const asString = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const hasLineItems = (lineItems: InvoiceItem[]): boolean =>
  lineItems.some(item =>
    asString(item.description).length > 0 &&
    Number(item.quantity) > 0 &&
    Number(item.unit_price) >= 0
  );

export interface InvoiceValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface InvoiceSendValidationResult {
  canSend: boolean;
  errors: string[];
  warnings: string[];
}

export interface PaymentValidationResult {
  isValid: boolean;
  errors: string[];
  warnings?: string[];
}

export interface InvoiceActionsAvailability {
  canSave: boolean;
  canSend: boolean;
  saveValidation: InvoiceValidationResult;
  sendValidation: InvoiceSendValidationResult;
}

export const validateClientData = (raw: GenericRecord): ClientValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];

  const name = asString(raw.name);
  const firstName = asString(raw.first_name);
  const lastName = asString(raw.last_name);
  const email = asString(raw.email);

  if (!name && !firstName && !lastName) {
    errors.push('Client name is required');
  }

  if (email && !EMAIL_REGEX.test(email)) {
    errors.push('Invalid email format');
  }

  if (!email) {
    warnings.push('Email is recommended for sending invoices');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
};

export const validateExpenseData = (raw: GenericRecord): ExpenseValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];

  const amount = Number(raw.amount ?? 0);
  const date = asString(raw.date);
  const merchant = asString(raw.merchant || raw.vendor);
  const description = asString(raw.description);

  if (amount <= 0 || Number.isNaN(amount)) {
    errors.push('Expense amount must be greater than zero');
  }

  if (!date) {
    errors.push('Expense date is required');
  }

  if (!merchant && !description) {
    errors.push('Expense merchant or description is required');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
};

export const validatePaymentData = (raw: GenericRecord): PaymentValidationResult => {
  const errors: string[] = [];

  const amount = Number(raw.amount ?? 0);
  const date = asString(raw.date);
  const method = asString(raw.method);

  if (amount <= 0 || Number.isNaN(amount)) {
    errors.push('Payment amount must be greater than zero');
  }

  if (!date) {
    errors.push('Payment date is required');
  }

  if (!method) {
    errors.push('Payment method is required');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

export const validateInvoiceForSave = (
  invoiceData: InvoiceInput,
  selectedClient: Client | null,
  lineItems: InvoiceItem[],
  isNewInvoice = false
): InvoiceValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!selectedClient) {
    errors.push('Please select a client');
  }

  if (!isNewInvoice && !asString(invoiceData.invoice_number)) {
    errors.push('Invoice number is required');
  }

  if (!hasLineItems(lineItems)) {
    errors.push('At least one valid line item is required');
  }

  if (!asString(invoiceData.due_date)) {
    warnings.push('Due date will default to today if left blank');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
};

export const validateInvoiceForSend = (
  invoiceData: InvoiceInput,
  selectedClient: Client | null,
  lineItems: InvoiceItem[],
  isNewInvoice = false
): InvoiceSendValidationResult => {
  const saveValidation = validateInvoiceForSave(invoiceData, selectedClient, lineItems, isNewInvoice);
  const errors = [...saveValidation.errors];
  const warnings = [...saveValidation.warnings];

  const clientEmail = asString(selectedClient?.email);
  if (!clientEmail || !EMAIL_REGEX.test(clientEmail)) {
    errors.push('A valid client email is required to send invoice');
  }

  return {
    canSend: errors.length === 0,
    errors,
    warnings
  };
};

export const getAvailableInvoiceActions = (
  invoiceData: InvoiceInput,
  selectedClient: Client | null,
  lineItems: InvoiceItem[],
  isNewInvoice = false
): InvoiceActionsAvailability => {
  const saveValidation = validateInvoiceForSave(invoiceData, selectedClient, lineItems, isNewInvoice);
  const sendValidation = validateInvoiceForSend(invoiceData, selectedClient, lineItems, isNewInvoice);

  return {
    canSave: saveValidation.isValid,
    canSend: sendValidation.canSend,
    saveValidation,
    sendValidation
  };
};

export const autoFillInvoiceDefaults = <T extends InvoiceInput>(invoiceData: T): T => {
  if (asString(invoiceData.due_date)) {
    return invoiceData;
  }

  return {
    ...invoiceData,
    due_date: new Date().toISOString().split('T')[0]
  };
};

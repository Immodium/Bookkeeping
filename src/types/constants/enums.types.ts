// Application enums and constant types

// Payment related enums
export const PaymentStatus = {
  RECEIVED: 'received',
  PENDING: 'pending',
  FAILED: 'failed',
  REFUNDED: 'refunded'
} as const;

export type PaymentStatus = typeof PaymentStatus[keyof typeof PaymentStatus];

export const PaymentMethod = {
  CASH: 'cash',
  CHECK: 'check',
  BANK_TRANSFER: 'bank_transfer',
  CREDIT_CARD: 'credit_card',
  PAYPAL: 'paypal',
  OTHER: 'other'
} as const;

export type PaymentMethod = typeof PaymentMethod[keyof typeof PaymentMethod];

// Payment method and status arrays for components
export const PAYMENT_METHODS: PaymentMethod[] = Object.values(PaymentMethod);
export const PAYMENT_STATUSES: PaymentStatus[] = Object.values(PaymentStatus);

// Expense status enum and arrays
export const ExpenseStatus = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  REIMBURSED: 'reimbursed'
} as const;

export type ExpenseStatus = typeof ExpenseStatus[keyof typeof ExpenseStatus];

export const EXPENSE_STATUSES: ExpenseStatus[] = Object.values(ExpenseStatus);

// Expense categories
export const EXPENSE_CATEGORIES = [
  'Office Supplies',
  'Travel',
  'Meals & Entertainment',
  'Marketing',
  'Software & Subscriptions',
  'Equipment',
  'Professional Services',
  'Utilities',
  'Rent',
  'Insurance',
  'Other'
] as const;

export type ExpenseCategory = typeof EXPENSE_CATEGORIES[number];

// Invoice related enums
export const InvoiceStatus = {
  DRAFT: 'draft',
  SENT: 'sent',
  PAID: 'paid',
  OVERDUE: 'overdue',
  CANCELLED: 'cancelled',
  REFUNDED: 'refunded'
} as const;

export type InvoiceStatus = typeof InvoiceStatus[keyof typeof InvoiceStatus];

// User roles
export const UserRole = {
  ADMIN: 'admin',
  USER: 'user',
  VIEWER: 'viewer'
} as const;

export type UserRole = typeof UserRole[keyof typeof UserRole];

// Application states
export const AppTheme = {
  LIGHT: 'light',
  DARK: 'dark',
  SYSTEM: 'system'
} as const;

export type AppTheme = typeof AppTheme[keyof typeof AppTheme];

// File types
export const SupportedFileType = {
  PDF: 'pdf',
  CSV: 'csv',
  XLSX: 'xlsx',
  JSON: 'json'
} as const;

export type SupportedFileType = typeof SupportedFileType[keyof typeof SupportedFileType];

// Currency codes (ISO 4217)
export const CurrencyCode = {
  USD: 'USD',
  EUR: 'EUR',
  GBP: 'GBP',
  CAD: 'CAD',
  AUD: 'AUD',
  JPY: 'JPY'
} as const;

export type CurrencyCode = typeof CurrencyCode[keyof typeof CurrencyCode];

// Date formats
export const DateFormat = {
  MM_DD_YYYY: 'MM/DD/YYYY',
  DD_MM_YYYY: 'DD/MM/YYYY',
  YYYY_MM_DD: 'YYYY-MM-DD',
  DD_MM_YYYY_DASH: 'DD-MM-YYYY'
} as const;

export type DateFormat = typeof DateFormat[keyof typeof DateFormat];

// Time formats
export const TimeFormat = {
  TWELVE_HOUR: '12h',
  TWENTY_FOUR_HOUR: '24h'
} as const;

export type TimeFormat = typeof TimeFormat[keyof typeof TimeFormat];

// Language codes (ISO 639-1)
export const LanguageCode = {
  EN: 'en',
  ES: 'es',
  FR: 'fr',
  DE: 'de',
  IT: 'it',
  PT: 'pt'
} as const;

export type LanguageCode = typeof LanguageCode[keyof typeof LanguageCode];

// Date and time formatting defaults and options
export const DEFAULT_DATE_TIME_SETTINGS = {
  dateFormat: 'MM/DD/YYYY',
  timeFormat: '12-hour'
} as const;

export const DATE_FORMAT_OPTIONS = [
  { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY (12/31/2024)' },
  { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY (31/12/2024)' },
  { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD (2024-12-31)' },
  { value: 'MMM DD, YYYY', label: 'MMM DD, YYYY (Dec 31, 2024)' },
  { value: 'DD MMM YYYY', label: 'DD MMM YYYY (31 Dec 2024)' },
  { value: 'MMMM DD, YYYY', label: 'MMMM DD, YYYY (December 31, 2024)' }
] as const;

export const TIME_FORMAT_OPTIONS = [
  { value: '12-hour', label: '12-hour (2:30 PM)' },
  { value: '24-hour', label: '24-hour (14:30)' }
] as const;

// Pagination defaults and options
export const DEFAULT_PAGINATION_SETTINGS: {
  defaultItemsPerPage: number;
  availablePageSizes: number[];
  maxItemsPerPage: number;
  showItemsPerPageSelector: boolean;
  showPageNumbers: boolean;
  maxPageNumbers: number;
} = {
  defaultItemsPerPage: 25,
  availablePageSizes: [10, 25, 50, 100],
  maxItemsPerPage: 500,
  showItemsPerPageSelector: true,
  showPageNumbers: true,
  maxPageNumbers: 5
};

export const DEFAULT_ITEMS_PER_PAGE_OPTIONS = [
  { value: 10, label: '10 items' },
  { value: 25, label: '25 items' },
  { value: 50, label: '50 items' },
  { value: 100, label: '100 items' }
] as const;

export const MAX_ITEMS_PER_PAGE_OPTIONS = [
  { value: 100, label: '100 items' },
  { value: 250, label: '250 items' },
  { value: 500, label: '500 items' },
  { value: 1000, label: '1000 items' }
] as const;

export const AVAILABLE_PAGE_SIZES_OPTIONS = [
  { value: [5, 10, 25], label: 'Small (5, 10, 25)' },
  { value: [10, 25, 50], label: 'Medium (10, 25, 50)' },
  { value: [10, 25, 50, 100], label: 'Standard (10, 25, 50, 100)' },
  { value: [25, 50, 100, 250], label: 'Large (25, 50, 100, 250)' }
] as const;

export const MAX_PAGE_NUMBERS_OPTIONS = [
  { value: 3, label: '3 pages' },
  { value: 5, label: '5 pages' },
  { value: 7, label: '7 pages' },
  { value: 10, label: '10 pages' }
] as const;

// Invoice numbering defaults and options
export const DEFAULT_INVOICE_NUMBER_SETTINGS = {
  prefix: 'INV'
} as const;

export const SUGGESTED_INVOICE_PREFIXES = [
  'INV',
  'INVOICE',
  'BILL',
  'REC',
  'RECEIPT'
] as const;
// API Request/Response Types
// Shared type definitions for API endpoints

// Import types from the server types index
import { 
  User, 
  UserPublic, 
  Client, 
  Invoice, 
  Template, 
  Expense, 
  Payment, 
  LineItem,
  InvoiceStatus, 
  PaymentMethod, 
  PaymentStatus 
} from './index.js';

// Authentication API types
export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  success: boolean;
  data: {
    user: UserPublic;
    token: string;
  };
  requires_email_verification: boolean;
  message: string;
}

export interface RegisterRequest {
  name: string;
  email: string;
  password: string;
}

export interface RegisterResponse {
  success: boolean;
  data: {
    id: number;
  };
  message: string;
}

export interface RefreshTokenRequest {
  token: string;
}

export interface RefreshTokenResponse {
  success: boolean;
  data: {
    user: UserPublic;
    token: string;
  };
  message: string;
}

// User management API types
export interface CreateUserRequest {
  userData: {
    name: string;
    email: string;
    username?: string;
    password_hash?: string;
    role?: 'user' | 'admin';
    email_verified?: boolean;
    google_id?: string;
    last_login?: string;
    failed_login_attempts?: number;
    account_locked_until?: string;
  };
}

export interface UpdateUserRequest {
  userData: Partial<Pick<User, 'name' | 'email' | 'username' | 'role' | 'email_verified' | 'google_id' | 'password_hash'>>;
}

export interface UpdateUserResponse {
  success: boolean;
  data: {
    changes: number;
  };
  message: string;
}

// Client API types
export interface CreateClientRequest {
  clientData: Omit<Client, 'id' | 'created_at' | 'updated_at'>;
}

export interface UpdateClientRequest {
  clientData: Partial<Omit<Client, 'id' | 'created_at' | 'updated_at'>>;
}

// Invoice API types
export interface CreateInvoiceRequest {
  invoiceData: {
    client_id: number;
    amount: number;
    due_date?: string;
    description?: string;
    notes?: string;
    line_items?: LineItem[];
    tax_amount?: number;
    tax_rate_id?: number;
    shipping_amount?: number;
    shipping_rate_id?: number;
    discount_amount?: number;
    payment_terms?: string;
    thank_you_message?: string;
  };
}

export interface UpdateInvoiceRequest {
  invoiceData: Partial<Omit<Invoice, 'id' | 'created_at' | 'updated_at' | 'invoice_number'>>;
}

export interface InvoiceStatusUpdateRequest {
  status: Invoice['status'];
  paid_date?: string;
}

// Template API types
export interface CreateTemplateRequest {
  templateData: {
    name: string;
    client_id?: number;
    amount: number;
    description?: string;
    frequency?: Template['frequency'];
    payment_terms?: string;
    next_invoice_date?: string;
    is_active?: boolean;
    line_items?: LineItem[];
    tax_amount?: number;
    tax_rate_id?: number;
    shipping_amount?: number;
    shipping_rate_id?: number;
    notes?: string;
  };
}

export interface UpdateTemplateRequest {
  templateData: Partial<Omit<Template, 'id' | 'created_at' | 'updated_at'>>;
}

// Expense API types
export interface CreateExpenseRequest {
  expenseData: Omit<Expense, 'id' | 'created_at' | 'updated_at'>;
}

export interface UpdateExpenseRequest {
  expenseData: Partial<Omit<Expense, 'id' | 'created_at' | 'updated_at'>>;
}

// Payment API types
export interface CreatePaymentRequest {
  paymentData: Omit<Payment, 'id' | 'created_at' | 'updated_at'>;
}

export interface UpdatePaymentRequest {
  paymentData: Partial<Omit<Payment, 'id' | 'created_at' | 'updated_at'>>;
}

// Settings API types
export interface UpdateSettingRequest {
  key: string;
  value: string | number | boolean | object | null; // Will be JSON stringified
  category: 'company' | 'appearance' | 'security' | 'notifications' | 'integrations';
  description?: string;
}

// PDF generation types
export interface GenerateInvoicePDFRequest {
  id: number;
  token?: string;
}

export interface GeneratePagePDFRequest {
  url: string;
  filename?: string;
}

export interface PDFGenerationResponse {
  success: boolean;
  message?: string;
  error?: string;
}

// File upload types
export interface FileUploadRequest {
  file: Express.Multer.File;
  type: 'receipt' | 'logo' | 'attachment';
  related_id?: number;
}

export interface FileUploadResponse {
  success: boolean;
  data: {
    filename: string;
    originalName: string;
    size: number;
    mimetype: string;
    url: string;
  };
  message: string;
}

// Database health types
export interface DatabaseHealthResponse {
  success: boolean;
  status: 'healthy' | 'error';
  statistics: {
    clients: number;
    invoices: number;
    templates: number;
    expenses: number;
    payments: number;
    users: number;
  };
  timestamp: string;
}

export interface DatabaseInfoResponse {
  success: boolean;
  schema: {
    tables: string[];
    tableCount: number;
    tableInfo: Record<string, {
      columns: number;
      columnNames: string[];
    }>;
  };
  message: string;
}

// Search and filtering types
export interface SearchParams {
  q?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  status?: string;
  client_id?: number;
  date_from?: string;
  date_to?: string;
}

export interface SearchResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
  filters: SearchParams;
}

// Bulk operations types
export interface BulkOperationRequest<T = any> {
  operation: 'create' | 'update' | 'delete';
  items: T[];
}

export interface BulkOperationResponse {
  success: boolean;
  data: {
    processed: number;
    errors: number;
    results: Array<{
      success: boolean;
      id?: number;
      error?: string;
    }>;
  };
  message: string;
}

// Export/Import types
export interface ExportRequest {
  format: 'csv' | 'json' | 'xlsx';
  type: 'clients' | 'invoices' | 'expenses' | 'payments';
  date_from?: string;
  date_to?: string;
  filters?: Record<string, any>;
}

export interface ImportRequest {
  file: Express.Multer.File;
  type: 'clients' | 'invoices' | 'expenses';
  options?: {
    skipHeaders?: boolean;
    mapping?: Record<string, string>;
  };
}

// Webhook types
export interface WebhookEvent {
  type: 'invoice.created' | 'invoice.updated' | 'payment.created' | 'user.created';
  data: Record<string, unknown>;
  timestamp: string;
  signature: string;
}

export interface WebhookEndpoint {
  id: number;
  url: string;
  events: string[];
  secret: string;
  is_active: boolean;
  created_at: string;
}

// Error response types
export interface ErrorResponse {
  success: false;
  error: string;
  message: string;
  code?: string;
  details?: Record<string, unknown>;
  timestamp: string;
}

/**
 * Settings save request interface
 */
export interface SettingsSaveRequest {
  settings: Record<string, {
    value: string | number | boolean | object | null;
    category?: string;
  }>;
}

/**
 * Individual setting save request interface
 */
export interface IndividualSettingSaveRequest {
  key: string;
  value: string | number | boolean | object | null;
  category?: string;
}

/**
 * Project settings update request interface
 */
export interface ProjectSettingsRequest {
  settings: {
    google_oauth?: {
      enabled?: boolean;
      client_id?: string;
      configured?: boolean;
    };
    stripe?: {
      enabled?: boolean;
      publishable_key?: string;
      configured?: boolean;
    };
    email?: {
      enabled?: boolean;
      smtp_host?: string;
      smtp_port?: number;
      smtp_user?: string;
      smtp_pass?: string;
      email_from?: string;
      configured?: boolean;
    };
    security?: {
      require_email_verification?: boolean;
      max_failed_login_attempts?: number;
      account_lockout_duration?: number;
    };
  };
}

/**
 * Invoice data request interface
 */
export interface InvoiceRequest {
  invoice_number: string;
  client_id: number;
  design_template_id?: number;
  recurring_template_id?: number;
  amount: number;
  tax_amount?: number;
  total_amount?: number;
  status?: InvoiceStatus;
  due_date?: string;
  issue_date?: string;
  description?: string;
  items?: string;
  notes?: string;
  payment_terms?: string;
  stripe_invoice_id?: string;
  stripe_payment_intent_id?: string;
  type?: string;
  client_name?: string;
  client_email?: string;
  client_phone?: string;
  client_address?: string;
  line_items?: string;
  tax_rate_id?: number;
  shipping_amount?: number;
  shipping_rate_id?: number;
  email_status?: string;
  email_sent_at?: string;
  email_error?: string;
  last_email_attempt?: string;
}

/**
 * Payment data request interface
 */
export interface PaymentRequest {
  date: string;
  client_name: string;
  invoice_id?: number;
  amount: number;
  method: PaymentMethod;
  reference?: string;
  description?: string;
  status?: PaymentStatus;
}

/**
 * Expense data request interface
 */
export interface ExpenseRequest {
  amount: number;
  description: string;
  category?: string;
  date: string;
  vendor?: string;
  notes?: string;
  receipt_url?: string;
  is_billable: boolean | undefined;
  client_id: number | undefined;
  project?: string;
}

// Express Request extensions
declare global {
  namespace Express {
    interface Request {
      user?: UserPublic;
      rateLimitInfo?: {
        limit: number;
        remaining: number;
        resetTime: Date;
      };
    }
  }
}
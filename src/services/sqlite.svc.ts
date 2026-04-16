// Database service that communicates with backend API
import {
  User,
  Client,
  Invoice,
  InvoiceTemplate,
  Expense,
  Payment,
  PaymentFormData,
  Report,
  ImportResult,
  ValidationError,
  ProjectSettings
} from '@/types';
import type { ApiResponse } from '@/types/shared/common.types';
import { parseProjectSettingsWithDefaults, validateProjectSettings } from '@/utils/settingsValidation';
import { getToken } from '@/utils/api';
class SQLiteService {
  private isInitialized = false;
  private initializationPromise: Promise<void> | null = null;
  private baseUrl = this.getApiBaseUrl();
  
  // Performance optimization: Settings cache
  private settingsCache = new Map<string, { value: unknown; timestamp: number; ttl: number }>();
  private readonly SETTINGS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  private getApiBaseUrl(): string {
    // Check if we're running on HTTPS
    if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
      return 'https://localhost:3002/api';
    }
    return 'http://localhost:3002/api';
  }

  async initialize(): Promise<void> {
    // If already initialized, return immediately
    if (this.isInitialized) return;
    
    // If initialization is in progress, return the existing promise
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    // Start new initialization
    this.initializationPromise = this.performInitialization();
    return this.initializationPromise;
  }

  private async performInitialization(): Promise<void> {
    try {
      // Test connection to backend with retry logic
      let retries = 3;
      let lastError: unknown;
      let delay = 2000; // Start with 2 seconds to avoid rate limiting

      while (retries > 0) {
        try {
          const response = await fetch(`${this.baseUrl}/health`, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
            },
          });

          if (!response.ok) {
            if (response.status === 429) {
              throw new Error('Rate limited - too many requests');
            }
            throw new Error(`Backend server responded with status: ${response.status}`);
          }

          this.isInitialized = true;
          this.initializationPromise = null; // Reset promise for future calls
          return;
        } catch (error) {
          lastError = error;
          retries--;

          if (retries > 0) {
            console.warn(`Failed to connect to backend (${error.message}), retrying in ${delay}ms... (${retries} attempts left)`);
            await new Promise(resolve => setTimeout(resolve, delay));
            delay *= 2; // Exponential backoff to avoid rate limiting
          }
        }
      }

      throw lastError;
    } catch (error) {
      this.initializationPromise = null; // Reset promise on failure
      console.error('Failed to initialize database service after retries:', error);
      throw new Error('Backend server not available');
    }
  }

  // API helper methods
  private async apiCall<TData = unknown, TResult = unknown>(endpoint: string, method: string = 'GET', body?: unknown): Promise<ApiResponse<TData, TResult>> {
    let url = `${this.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Add authorization header if token is available
    const token = getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const options: RequestInit = {
      method,
      headers,
    };

    if (method === 'GET' && body) {
      // For GET requests, convert body to query parameters
      const params = new URLSearchParams();
      Object.entries(body).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          params.append(key, String(value));
        }
      });
      if (params.toString()) {
        url += `?${params.toString()}`;
      }
    } else if (body) {
      options.body = JSON.stringify(body);
    }

    try {
      const response = await fetch(url, options);

      // Check if response is ok before trying to parse JSON
      if (!response.ok) {
        // Network or server error - this could indicate connection issues
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'API call failed');
      }

      return result;
    } catch (error) {
      // Re-throw with more context for connection monitoring
      if (error instanceof TypeError && error.message.includes('fetch')) {
        // Network error - likely connection issue
        throw new Error('Network connection failed');
      }

      // Re-throw other errors as-is
      throw error;
    }
  }

  // DEPRECATED: Generic query methods - use specific endpoints instead
  async get(_sql: string, _params: unknown[] = []): Promise<unknown> {
    throw new Error('Direct SQL queries are deprecated. Use specific API endpoints instead.');
  }

  async all(_sql: string, _params: unknown[] = []): Promise<unknown[]> {
    throw new Error('Direct SQL queries are deprecated. Use specific API endpoints instead.');
  }

  async run(_sql: string, _params: unknown[] = []): Promise<unknown> {
    throw new Error('Direct SQL execution is deprecated. Use specific API endpoints instead.');
  }

  // ===== USER API METHODS =====
  async getUsers(): Promise<User[]> {
    const result = await this.apiCall<User[]>('/users');
    return result.data || [];
  }

  async getUserById(id: number): Promise<User | null> {
    const result = await this.apiCall<User>(`/users/${id}`);
    return result.data || null;
  }

  async getUserByEmail(email: string): Promise<User | null> {
    try {
      const result = await this.apiCall<User>(`/users/email/${encodeURIComponent(email)}`);
      return result.data || null;
    } catch (error) {
      if (error.message.includes('User not found')) {
        return null;
      }
      throw error;
    }
  }

  async createUser(userData: Omit<User, 'id' | 'created_at' | 'updated_at'>): Promise<{ lastInsertRowid: number }> {
    const result = await this.apiCall<unknown, { lastInsertRowid: number }>('/users', 'POST', { userData });
    return result.result || { lastInsertRowid: 0 };
  }

  async getUserByGoogleId(googleId: string): Promise<User | null> {
    try {
      const result = await this.apiCall<User>(`/users/google/${encodeURIComponent(googleId)}`);
      return result.data || null;
    } catch (error) {
      if (error.message.includes('User not found')) {
        return null;
      }
      throw error;
    }
  }

  async updateUser(id: number, userData: Partial<User>): Promise<{ changes: number }> {
    const result = await this.apiCall<unknown, { changes: number }>(`/users/${id}`, 'PUT', { userData });
    return result.result || { changes: 0 };
  }

  async deleteUser(id: number): Promise<{ changes: number }> {
    const result = await this.apiCall<unknown, { changes: number }>(`/users/${id}`, 'DELETE');
    return result.result || { changes: 0 };
  }

  async updateUserLoginAttempts(id: number, attempts: number, lockedUntil?: string): Promise<void> {
    await this.apiCall(`/users/${id}/login-attempts`, 'PUT', { attempts, lockedUntil });
  }

  async updateUserLastLogin(id: number): Promise<void> {
    await this.apiCall(`/users/${id}/last-login`, 'PUT');
  }

  async verifyUserEmail(id: number): Promise<void> {
    await this.apiCall(`/users/${id}/verify-email`, 'PUT');
  }

  // ===== CLIENT API METHODS =====
  async getClients(): Promise<Client[]> {
    const result = await this.apiCall<Client[]>('/clients');
    return result.data || [];
  }

  async getClientById(id: number): Promise<Client | null> {
    try {
      const result = await this.apiCall<Client>(`/clients/${id}`);
      return result.data || null;
    } catch (error) {
      if (error.message.includes('Client not found')) {
        return null;
      }
      throw error;
    }
  }

  async createClient(clientData: Omit<Client, 'id' | 'created_at' | 'updated_at'>): Promise<{ lastInsertRowid: number }> {
    const result = await this.apiCall<unknown, { lastInsertRowid: number }>('/clients', 'POST', { clientData });
    return result.result || { lastInsertRowid: 0 };
  }

  async updateClient(id: number, clientData: Partial<Client>): Promise<{ changes: number }> {
    const result = await this.apiCall<unknown, { changes: number }>(`/clients/${id}`, 'PUT', { clientData });
    return result.result || { changes: 0 };
  }

  async deleteClient(id: number): Promise<{ changes: number }> {
    const result = await this.apiCall<unknown, { changes: number }>(`/clients/${id}`, 'DELETE');
    return result.result || { changes: 0 };
  }

  // Counter operations
  async getNextId(counterName: string): Promise<number> {
    const result = await this.apiCall<{ nextId: number }>(`/counters/${counterName}/next`);
    if (result.error) {
      throw new Error(result.error);
    }
    return result.data?.nextId || 0;
  }

  // Cache helper methods
  private getCachedSetting(key: string): unknown | null {
    const cached = this.settingsCache.get(key);
    if (!cached) return null;
    
    const now = Date.now();
    if (now - cached.timestamp > cached.ttl) {
      this.settingsCache.delete(key);
      return null;
    }
    
    return cached.value;
  }
  
  private setCachedSetting(key: string, value: unknown, ttl: number = this.SETTINGS_CACHE_TTL): void {
    this.settingsCache.set(key, {
      value,
      timestamp: Date.now(),
      ttl
    });
  }
  
  private clearSettingsCache(key?: string): void {
    if (key) {
      this.settingsCache.delete(key);
    } else {
      this.settingsCache.clear();
    }
  }

  // Settings operations
  async getSetting(key: string): Promise<unknown> {
    // Check cache first for performance
    const cached = this.getCachedSetting(key);
    if (cached !== null) {
      return cached;
    }

    // Map specific keys to new section-based routes
    const sectionMappings = {
      'company_settings': 'company',
      'notification_settings': 'notification', 
      'currency_format_settings': 'currency'
    } as const;
    
    let value: unknown;
    const section = sectionMappings[key as keyof typeof sectionMappings];
    if (section) {
      const result = await this.apiCall<{ settings?: { notification_settings?: unknown }; value?: unknown }>(`/settings/${section}`);
      // For notification settings, extract the nested value
      if (key === 'notification_settings' && result.data?.settings) {
        value = result.data?.settings.notification_settings;
      } else {
        value = result.data?.value;
      }
    } else {
      // Fall back to original route for other keys
      const result = await this.apiCall<{ value?: unknown }>(`/settings/${key}`);
      value = result.data?.value;
    }
    
    // Cache the result for future use
    this.setCachedSetting(key, value);
    return value;
  }

  async setSetting(key: string, value: unknown, category: string = 'general'): Promise<void> {
    // Unified approach: all settings use the generic endpoint
    await this.apiCall('/settings', 'POST', { key, value, category });
    // Clear cache for this key to ensure fresh data on next read
    this.clearSettingsCache(key);
  }

  async saveCompanySettings(settings: {
    companyName: string;
    ownerName: string;
    email: string;
    phone: string;
    address: string;
    city: string;
    state: string;
    zipCode: string;
    brandingImage: string;
  }): Promise<void> {
    // Use the specific company settings endpoint that expects individual fields
    await this.apiCall('/settings/company', 'POST', settings);
    // Clear cache for company_settings to ensure fresh data on next read
    this.clearSettingsCache('company_settings');
  }

  // Bulk settings operations
  async getAllSettings(category?: string): Promise<Record<string, unknown>> {
    try {
      // Map categories to new section-based routes
      if (category === 'appearance') {
        const result = await this.apiCall<{ settings?: Record<string, unknown> }>('/settings/appearance');
        return result.data?.settings || {};
      }
      if (category === 'general') {
        const result = await this.apiCall<{ settings?: Record<string, unknown> }>('/settings/general');
        return result.data?.settings || {};
      }
      
      // Fall back to original query parameter route for other categories
      const params = category ? { category } : {};
      const result = await this.apiCall<{ settings?: Record<string, unknown> }>('/settings', 'GET', params);
      return result.data?.settings || {};
    } catch (error) {
      console.error('sqliteService: Failed to load settings:', error);
      throw error;
    }
  }

  async setMultipleSettings(settings: Record<string, { value: unknown; category?: string }>): Promise<void> {
    try {
      // Unified approach: always use the generic bulk settings endpoint
      const result = await this.apiCall('/settings', 'PUT', { settings });
      // Clear cache for all updated settings to ensure fresh data
      Object.keys(settings).forEach(key => this.clearSettingsCache(key));
    } catch (error) {
      console.error('sqliteService: Failed to save settings:', error);
      throw error;
    }
  }

  // ===== INVOICE API METHODS =====
  async getInvoices(): Promise<(Invoice & { client_name: string })[]> {
    const result = await this.apiCall<{ invoices?: (Invoice & { client_name: string })[]; pagination?: any }>('/invoices');
    return result.data?.invoices || [];
  }

  async getInvoiceById(id: number): Promise<(Invoice & { client_name: string }) | null> {
    try {
      const result = await this.apiCall<Invoice & { client_name: string }>(`/invoices/${id}`);
      return result.data || null;
    } catch (error) {
      if (error.message.includes('Invoice not found')) {
        return null;
      }
      throw error;
    }
  }

  async createInvoice(invoiceData: Omit<Invoice, 'id' | 'created_at' | 'updated_at'>): Promise<{ lastInsertRowid: number }> {
    const result = await this.apiCall<unknown, { lastInsertRowid: number }>('/invoices', 'POST', { invoiceData });
    return result.result || { lastInsertRowid: 0 };
  }

  async updateInvoice(id: number, invoiceData: Partial<Invoice>): Promise<{ changes: number }> {
    const result = await this.apiCall<unknown, { changes: number }>(`/invoices/${id}`, 'PUT', { invoiceData });
    return result.result || { changes: 0 };
  }

  async deleteInvoice(id: number): Promise<{ changes: number }> {
    const result = await this.apiCall<unknown, { changes: number }>(`/invoices/${id}`, 'DELETE');
    return result.result || { changes: 0 };
  }

  // ===== EXPENSE API METHODS =====
  async getExpenses(startDate?: string, endDate?: string): Promise<Expense[]> {
    const params = startDate && endDate ? { date_from: startDate, date_to: endDate } : {};
    const result = await this.apiCall<{ data?: Expense[]; total?: number; page?: number; limit?: number }>('/expenses', 'GET', params);
    return result.data?.data || [];
  }

  async getExpenseById(id: number): Promise<Expense | null> {
    try {
      const result = await this.apiCall<Expense>(`/expenses/${id}`);
      return result.data || null;
    } catch (error) {
      if (error.message.includes('Expense not found')) {
        return null;
      }
      throw error;
    }
  }

  async createExpense(expenseData: Omit<Expense, 'id' | 'created_at' | 'updated_at'>): Promise<{ lastInsertRowid: number }> {
    const result = await this.apiCall<unknown, { lastInsertRowid: number }>('/expenses', 'POST', { expenseData });
    return result.result || { lastInsertRowid: 0 };
  }

  async bulkImportExpenses(expenses: Partial<Expense>[]): Promise<ImportResult<ValidationError>> {
    const result = await this.apiCall<ImportResult<ValidationError>>('/expenses/bulk-import', 'POST', { expenses });
    return result.data || { success: false, imported_count: 0, skipped_count: 0, error_count: 0, errors: [] };
  }

  async bulkDeleteExpenses(expenseIds: number[]): Promise<{ changes: number }> {
    const result = await this.apiCall<unknown, { changes: number }>('/expenses/bulk-delete', 'POST', { expense_ids: expenseIds });
    return result.result || { changes: 0 };
  }

  async bulkUpdateExpenseCategory(expenseIds: number[], category: string): Promise<{ changes: number }> {
    const result = await this.apiCall<unknown, { changes: number }>('/expenses/bulk-category', 'POST', { expense_ids: expenseIds, category });
    return result.result || { changes: 0 };
  }

  async bulkUpdateExpenseMerchant(expenseIds: number[], merchant: string): Promise<{ changes: number }> {
    const result = await this.apiCall<unknown, { changes: number }>('/expenses/bulk-merchant', 'POST', { expense_ids: expenseIds, merchant });
    return result.result || { changes: 0 };
  }

  async updateExpense(id: number, expenseData: Partial<Expense>): Promise<{ changes: number }> {
    const result = await this.apiCall<unknown, { changes: number }>(`/expenses/${id}`, 'PUT', { expenseData });
    return result.result || { changes: 0 };
  }

  async deleteExpense(id: number): Promise<{ changes: number }> {
    const result = await this.apiCall<unknown, { changes: number }>(`/expenses/${id}`, 'DELETE');
    return result.result || { changes: 0 };
  }

  // ===== PAYMENT API METHODS =====
  async getPayments(startDate?: string, endDate?: string): Promise<Payment[]> {
    const params = startDate && endDate ? { date_from: startDate, date_to: endDate } : {};
    const result = await this.apiCall<{ payments?: Payment[]; pagination?: any }>('/payments', 'GET', params);
    return result.data?.payments || [];
  }

  async createPayment(paymentData: PaymentFormData): Promise<Payment> {
    const result = await this.apiCall<Payment>('/payments', 'POST', { paymentData });
    if (!result.data) {
      throw new Error('Failed to create payment: No data returned');
    }
    return result.data;
  }

  async updatePayment(id: number, paymentData: Partial<PaymentFormData>): Promise<Payment> {
    const result = await this.apiCall<Payment>(`/payments/${id}`, 'PUT', { paymentData });
    if (!result.data) {
      throw new Error('Failed to update payment: No data returned');
    }
    return result.data;
  }

  async deletePayment(id: number): Promise<{ changes: number }> {
    const result = await this.apiCall<unknown, { changes: number }>(`/payments/${id}`, 'DELETE');
    return result.result || { changes: 0 };
  }

  async bulkDeletePayments(paymentIds: number[]): Promise<{ changes: number }> {
    const result = await this.apiCall<unknown, { changes: number }>('/payments/bulk-delete', 'POST', { payment_ids: paymentIds });
    return result.result || { changes: 0 };
  }

  // ===== TEMPLATE API METHODS =====
  async getTemplates(): Promise<(InvoiceTemplate & { client_name: string })[]> {
    const result = await this.apiCall<(InvoiceTemplate & { client_name: string })[]>('/recurring-templates');
    return result.data || [];
  }

  async getTemplateById(id: number): Promise<(InvoiceTemplate & { client_name: string }) | null> {
    try {
      const result = await this.apiCall<InvoiceTemplate & { client_name: string }>(`/recurring-templates/${id}`);
      return result.data || null;
    } catch (error) {
      if (error.message.includes('Template not found')) {
        return null;
      }
      throw error;
    }
  }

  async createTemplate(templateData: Omit<InvoiceTemplate, 'id' | 'created_at' | 'updated_at'>): Promise<{ lastInsertRowid: number }> {
    const result = await this.apiCall<unknown, { lastInsertRowid: number }>('/recurring-templates', 'POST', { templateData });
    return result.result || { lastInsertRowid: 0 };
  }

  async updateTemplate(id: number, templateData: Partial<InvoiceTemplate>): Promise<{ changes: number }> {
    const result = await this.apiCall<unknown, { changes: number }>(`/recurring-templates/${id}`, 'PUT', { templateData });
    return result.result || { changes: 0 };
  }

  async deleteTemplate(id: number): Promise<{ changes: number }> {
    const result = await this.apiCall<unknown, { changes: number }>(`/recurring-templates/${id}`, 'DELETE');
    return result.result || { changes: 0 };
  }

  // ===== REPORT API METHODS =====
  async getReports(): Promise<Report[]> {
    const result = await this.apiCall<Report[]>('/reports');
    return result.data || [];
  }

  async getReportById(id: number): Promise<Report | null> {
    try {
      const result = await this.apiCall<Report>(`/reports/${id}`);
      return result.data || null;
    } catch (error) {
      if (error.message.includes('Report not found')) {
        return null;
      }
      throw error;
    }
  }

  async createReport(reportData: Omit<Report, 'id' | 'created_at'>): Promise<{ lastInsertRowid: number }> {
    const result = await this.apiCall<unknown, { lastInsertRowid: number }>('/reports', 'POST', { reportData });
    return result.result || { lastInsertRowid: 0 };
  }

  async deleteReport(id: number): Promise<{ changes: number }> {
    const result = await this.apiCall<unknown, { changes: number }>(`/reports/${id}`, 'DELETE');
    return result.result || { changes: 0 };
  }

  // ===== PROJECT SETTINGS API METHODS =====
  async getProjectSettings(): Promise<ProjectSettings> {
    if (!this.isReady()) {
      await this.initialize();
    }
    const result = await this.apiCall<{ settings?: unknown }>('/project-settings');
    return parseProjectSettingsWithDefaults(result.data?.settings || {});
  }

  async updateProjectSettings(settings: ProjectSettings): Promise<void> {
    // Validate settings before sending to server
    validateProjectSettings(settings);
    await this.apiCall('/project-settings', 'PUT', { settings });
  }

  // Utility method to check if database is ready
  isReady(): boolean {
    return this.isInitialized;
  }

  // Export database to file
  async exportToFile(): Promise<Blob> {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/octet-stream'
      };

      // Add authorization header if token is available
      const { getToken } = await import('@/utils/api/auth.util');
      const token = getToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(`${this.baseUrl}/db/export`, {
        method: 'GET',
        headers
      });

      if (!response.ok) {
        throw new Error(`Export failed: ${response.statusText}`);
      }

      return await response.blob();
    } catch (error) {
      console.error('Database export error:', error);
      throw error;
    }
  }

  // Import database from file
  async importFromFile(file: File): Promise<void> {
    try {
      const formData = new FormData();
      formData.append('database', file);

      const headers: Record<string, string> = {};

      // Add authorization header if token is available
      const { getToken } = await import('@/utils/api/auth.util');
      const token = getToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(`${this.baseUrl}/db/import`, {
        method: 'POST',
        headers,
        body: formData
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Import failed: ${errorText}`);
      }

      // Reinitialize after import
      this.isInitialized = false;
      await this.initialize();
    } catch (error) {
      console.error('Database import error:', error);
      throw error;
    }
  }

  // Close database connection (no-op for API service)
  close(): void {
    this.isInitialized = false;
  }
}

// Create singleton instance
export const sqliteService = new SQLiteService();

// Initialize on module load (in browser environment)
if (typeof window !== 'undefined') {
  sqliteService.initialize().catch(console.error);
}

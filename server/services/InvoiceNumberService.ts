// Invoice Number Generation Service
// Centralized service for generating unique invoice numbers

import { databaseService } from '../core/DatabaseService.js';
import { settingsService } from './SettingsService.js';

/**
 * Service for generating unique invoice numbers
 * Uses database counter and settings for consistent numbering
 */
export class InvoiceNumberService {
  private static instance: InvoiceNumberService;

  static getInstance(): InvoiceNumberService {
    if (!InvoiceNumberService.instance) {
      InvoiceNumberService.instance = new InvoiceNumberService();
    }
    return InvoiceNumberService.instance;
  }

  private normalizeTenantId(tenantId?: number): number {
    return tenantId && Number.isInteger(tenantId) && tenantId > 0 ? tenantId : 1;
  }

  private getCounterKey(tenantId: number): string {
    return tenantId === 1 ? 'invoice_counter' : `invoice_counter__tenant_${tenantId}`;
  }

  private getInvoicePrefix(basePrefix: string, tenantId: number): string {
    if (tenantId === 1) {
      return basePrefix;
    }
    return `${basePrefix}-T${tenantId}`;
  }

  /**
   * Generate a unique invoice number based on settings
   * @returns Promise<string> - Generated invoice number
   */
  async generateInvoiceNumber(tenantId?: number): Promise<string> {
    try {
      const scopedTenantId = this.normalizeTenantId(tenantId);
      // Get user's invoice numbering settings
      const settings = await this.getInvoiceNumberSettings(scopedTenantId);

      // Get and increment counter
      const counter = await this.getNextCounter(scopedTenantId);

      // Format invoice number based on settings
      return this.formatInvoiceNumber(counter, this.getInvoicePrefix(settings.prefix, scopedTenantId));
    } catch (error) {
      console.error('Error generating invoice number:', error);
      throw new Error('Failed to generate invoice number');
    }
  }

  /**
   * Get invoice number settings from database
   */
  private async getInvoiceNumberSettings(tenantId: number): Promise<{ prefix: string }> {
    try {
      const settings = (
        await settingsService.getSettingByKey('general.invoice_number_settings', tenantId) ||
        await settingsService.getSettingByKey('invoice_number_settings', tenantId)
      ) as Record<string, unknown> | null;

      if (settings && typeof settings === 'object') {
        const prefix = typeof settings.prefix === 'string' ? settings.prefix : 'INV';
        return { prefix };
      }
    } catch (error) {
      console.warn('Could not load invoice number settings, using defaults:', error);
    }

    // Return default settings
    return { prefix: 'INV' };
  }

  /**
   * Get next counter value and increment it
   */
  private async getNextCounter(tenantId: number): Promise<number> {
    const counterKey = this.getCounterKey(tenantId);
    const updated = await databaseService.getOne<{ value: number }>(
      `UPDATE counters SET value = value + 1, updated_at = NOW()
       WHERE tenant_id = ? AND name = ?
       RETURNING value`,
      [tenantId, counterKey]
    );
    if (updated?.value !== undefined) {
      return updated.value;
    }

    const inserted = await databaseService.getOne<{ value: number }>(
      `INSERT INTO counters (tenant_id, name, value, created_at, updated_at)
       VALUES (?, ?, 1, NOW(), NOW())
       ON CONFLICT (tenant_id, name) DO UPDATE
         SET value = counters.value + 1, updated_at = NOW()
       RETURNING value`,
      [tenantId, counterKey]
    );

    if (inserted?.value === undefined) {
      throw new Error('Failed to increment invoice counter');
    }
    return inserted.value;
  }

  /**
   * Format invoice number according to pattern
   */
  private formatInvoiceNumber(counter: number, prefix: string): string {
    const year = new Date().getFullYear();
    const month = String(new Date().getMonth() + 1).padStart(2, '0');
    const paddedCounter = String(counter).padStart(4, '0');

    // Format: PREFIX-YYYYMM-XXXX (e.g., INV-202412-0001)
    return `${prefix}-${year}${month}-${paddedCounter}`;
  }

  /**
   * Check if invoice number already exists
   */
  async isInvoiceNumberUnique(invoiceNumber: string, tenantId?: number): Promise<boolean> {
    try {
      const scopedTenantId = this.normalizeTenantId(tenantId);
      const existing = await databaseService.getOne(
        'SELECT id FROM invoices WHERE tenant_id = ? AND invoice_number = ?',
        [scopedTenantId, invoiceNumber]
      );
      return !existing;
    } catch (error) {
      console.error('Error checking invoice number uniqueness:', error);
      return false;
    }
  }

  /**
   * Get next invoice number without incrementing counter (preview)
   */
  async getNextInvoiceNumber(tenantId?: number): Promise<string> {
    try {
      const scopedTenantId = this.normalizeTenantId(tenantId);
      const settings = await this.getInvoiceNumberSettings(scopedTenantId);
      const counterKey = this.getCounterKey(scopedTenantId);
      const counter = await databaseService.getOne<{ value: number }>(
        'SELECT value FROM counters WHERE tenant_id = ? AND name = ?',
        [scopedTenantId, counterKey]
      );

      const nextNumber = counter ? counter.value + 1 : 1;
      return this.formatInvoiceNumber(nextNumber, this.getInvoicePrefix(settings.prefix, scopedTenantId));
    } catch (error) {
      console.error('Error getting next invoice number:', error);
      throw new Error('Failed to get next invoice number');
    }
  }
}

export const invoiceNumberService = InvoiceNumberService.getInstance();
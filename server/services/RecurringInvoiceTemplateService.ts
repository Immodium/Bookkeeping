// Recurring Invoice Template Service - Domain-specific service for recurring invoice template operations
// Handles all recurring invoice template-related business logic and database operations

import { databaseService } from '../core/DatabaseService.js';

/**
 * Recurring Invoice Template interface
 */
interface RecurringInvoiceTemplate {
  id: number;
  tenant_id: number;
  name: string;
  client_id: number;
  client_name?: string;
  client_email?: string;
  amount: number;
  description?: string;
  frequency: 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'custom';
  payment_terms: string;
  next_invoice_date: string;
  is_active: boolean;
  line_items?: string;
  tax_amount: number;
  tax_rate_id?: string;
  shipping_amount: number;
  shipping_rate_id?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

/**
 * Recurring Invoice Template creation data interface
 */
interface RecurringInvoiceTemplateData {
  name: string;
  client_id: number;
  amount: number;
  description?: string;
  frequency: 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'custom';
  payment_terms: string;
  next_invoice_date: string;
  is_active?: boolean;
  line_items?: string;
  tax_amount?: number;
  tax_rate_id?: string;
  shipping_amount?: number;
  shipping_rate_id?: string;
  notes?: string;
}

/**
 * Recurring Invoice Template Service
 * Manages recurring invoice templates for automated invoice creation
 */
export class RecurringInvoiceTemplateService {
  private normalizeTenantId(tenantId?: number): number {
    return tenantId && Number.isInteger(tenantId) && tenantId > 0 ? tenantId : 1;
  }

  /**
   * Get all recurring invoice templates
   */
  async getAllRecurringTemplates(tenantId?: number): Promise<RecurringInvoiceTemplate[]> {
    const scopedTenantId = this.normalizeTenantId(tenantId);
    return databaseService.getMany<RecurringInvoiceTemplate>(
      `SELECT rt.*, c.name as client_name, c.email as client_email
       FROM recurring_invoice_templates rt
       LEFT JOIN clients c ON rt.client_id = c.id AND c.tenant_id = rt.tenant_id
       WHERE rt.tenant_id = ?
       ORDER BY rt.name ASC`
      , [scopedTenantId]
    );
  }

  /**
   * Get active recurring invoice templates
   */
  async getActiveRecurringTemplates(tenantId?: number): Promise<RecurringInvoiceTemplate[]> {
    const scopedTenantId = this.normalizeTenantId(tenantId);
    return databaseService.getMany<RecurringInvoiceTemplate>(
      `SELECT rt.*, c.name as client_name, c.email as client_email
       FROM recurring_invoice_templates rt
       LEFT JOIN clients c ON rt.client_id = c.id AND c.tenant_id = rt.tenant_id
       WHERE rt.tenant_id = ? AND rt.is_active = 1
       ORDER BY rt.name ASC`,
      [scopedTenantId]
    );
  }

  /**
   * Get recurring templates due for processing
   */
  async getTemplatesDueForProcessing(tenantId?: number): Promise<RecurringInvoiceTemplate[]> {
    if (tenantId) {
      const scopedTenantId = this.normalizeTenantId(tenantId);
      return databaseService.getMany<RecurringInvoiceTemplate>(
        'SELECT * FROM recurring_invoice_templates WHERE tenant_id = ? AND is_active = 1 AND next_invoice_date <= DATE(\'now\') ORDER BY next_invoice_date ASC',
        [scopedTenantId]
      );
    }
    return databaseService.getMany<RecurringInvoiceTemplate>(
      'SELECT * FROM recurring_invoice_templates WHERE is_active = 1 AND next_invoice_date <= DATE(\'now\') ORDER BY next_invoice_date ASC'
    );
  }

  /**
   * Get recurring invoice template by ID
   */
  async getRecurringTemplateById(id: number, tenantId?: number): Promise<RecurringInvoiceTemplate | null> {
    if (!id || typeof id !== 'number') {
      throw new Error('Valid recurring template ID is required');
    }

    const scopedTenantId = this.normalizeTenantId(tenantId);
    return databaseService.getOne<RecurringInvoiceTemplate>(
      'SELECT * FROM recurring_invoice_templates WHERE id = ? AND tenant_id = ?',
      [id, scopedTenantId]
    );
  }

  /**
   * Get recurring templates by client ID
   */
  async getRecurringTemplatesByClientId(clientId: number, tenantId?: number): Promise<RecurringInvoiceTemplate[]> {
    if (!clientId || typeof clientId !== 'number') {
      throw new Error('Valid client ID is required');
    }

    const scopedTenantId = this.normalizeTenantId(tenantId);
    return databaseService.getMany<RecurringInvoiceTemplate>(
      'SELECT * FROM recurring_invoice_templates WHERE tenant_id = ? AND client_id = ? ORDER BY name ASC',
      [scopedTenantId, clientId]
    );
  }

  /**
   * Create new recurring invoice template
   */
  async createRecurringTemplate(templateData: RecurringInvoiceTemplateData, tenantId?: number): Promise<number> {
    if (!templateData.name || typeof templateData.name !== 'string') {
      throw new Error('Template name is required');
    }

    if (!templateData.client_id || typeof templateData.client_id !== 'number') {
      throw new Error('Client ID is required');
    }

    if (!templateData.amount || typeof templateData.amount !== 'number' || templateData.amount <= 0) {
      throw new Error('Valid amount is required');
    }

    if (!templateData.frequency || !['weekly', 'monthly', 'quarterly', 'yearly', 'custom'].includes(templateData.frequency)) {
      throw new Error('Valid frequency is required');
    }

    if (!templateData.payment_terms || typeof templateData.payment_terms !== 'string') {
      throw new Error('Payment terms are required');
    }

    if (!templateData.next_invoice_date || typeof templateData.next_invoice_date !== 'string') {
      throw new Error('Next invoice date is required');
    }

    const scopedTenantId = this.normalizeTenantId(tenantId);
    // Validate client exists
    const clientExists = await databaseService.getOne(
      'SELECT id FROM clients WHERE id = ? AND tenant_id = ?',
      [templateData.client_id, scopedTenantId]
    );

    if (!clientExists) {
      throw new Error('Client not found');
    }

    const result = databaseService.executeQuery(
      `INSERT INTO recurring_invoice_templates (
        tenant_id, name, client_id, amount, description, frequency, payment_terms, 
        next_invoice_date, is_active, line_items, tax_amount, tax_rate_id, 
        shipping_amount, shipping_rate_id, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, DATETIME('now'), DATETIME('now'))`,
      [
        scopedTenantId,
        templateData.name,
        templateData.client_id,
        templateData.amount,
        templateData.description || null,
        templateData.frequency,
        templateData.payment_terms,
        templateData.next_invoice_date,
        templateData.is_active !== false ? 1 : 0,
        templateData.line_items || null,
        templateData.tax_amount || 0,
        templateData.tax_rate_id || null,
        templateData.shipping_amount || 0,
        templateData.shipping_rate_id || null,
        templateData.notes || null
      ]
    );

    return result.lastInsertRowid;
  }

  /**
   * Update recurring invoice template
   */
  async updateRecurringTemplate(id: number, templateData: Partial<RecurringInvoiceTemplateData>, tenantId?: number): Promise<boolean> {
    if (!id || typeof id !== 'number') {
      throw new Error('Valid recurring template ID is required');
    }

    if (!templateData || Object.keys(templateData).length === 0) {
      throw new Error('Template data is required');
    }

    const scopedTenantId = this.normalizeTenantId(tenantId);
    // Check if template exists
    const existingTemplate = await this.getRecurringTemplateById(id, scopedTenantId);
    if (!existingTemplate) {
      throw new Error('Recurring template not found');
    }

    // If client_id is being updated, validate it exists
    if (templateData.client_id) {
      const clientExists = await databaseService.getOne(
        'SELECT id FROM clients WHERE id = ? AND tenant_id = ?',
        [templateData.client_id, scopedTenantId]
      );

      if (!clientExists) {
        throw new Error('Client not found');
      }
    }

    const updates: string[] = [];
    const values: any[] = [];

    if (templateData.name !== undefined) {
      updates.push('name = ?');
      values.push(templateData.name);
    }

    if (templateData.client_id !== undefined) {
      updates.push('client_id = ?');
      values.push(templateData.client_id);
    }

    if (templateData.amount !== undefined) {
      updates.push('amount = ?');
      values.push(templateData.amount);
    }

    if (templateData.description !== undefined) {
      updates.push('description = ?');
      values.push(templateData.description);
    }

    if (templateData.frequency !== undefined) {
      updates.push('frequency = ?');
      values.push(templateData.frequency);
    }

    if (templateData.payment_terms !== undefined) {
      updates.push('payment_terms = ?');
      values.push(templateData.payment_terms);
    }

    if (templateData.next_invoice_date !== undefined) {
      updates.push('next_invoice_date = ?');
      values.push(templateData.next_invoice_date);
    }

    if (templateData.is_active !== undefined) {
      updates.push('is_active = ?');
      values.push(templateData.is_active ? 1 : 0);
    }

    if (templateData.line_items !== undefined) {
      updates.push('line_items = ?');
      values.push(templateData.line_items);
    }

    if (templateData.tax_amount !== undefined) {
      updates.push('tax_amount = ?');
      values.push(templateData.tax_amount);
    }

    if (templateData.tax_rate_id !== undefined) {
      updates.push('tax_rate_id = ?');
      values.push(templateData.tax_rate_id);
    }

    if (templateData.shipping_amount !== undefined) {
      updates.push('shipping_amount = ?');
      values.push(templateData.shipping_amount);
    }

    if (templateData.shipping_rate_id !== undefined) {
      updates.push('shipping_rate_id = ?');
      values.push(templateData.shipping_rate_id);
    }

    if (templateData.notes !== undefined) {
      updates.push('notes = ?');
      values.push(templateData.notes);
    }

    updates.push('updated_at = DATETIME(\'now\')');
    values.push(id);

    const result = databaseService.executeQuery(
      `UPDATE recurring_invoice_templates SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?`,
      [...values, scopedTenantId]
    );

    return result.changes > 0;
  }

  /**
   * Delete recurring invoice template
   */
  async deleteRecurringTemplate(id: number, tenantId?: number): Promise<boolean> {
    if (!id || typeof id !== 'number') {
      throw new Error('Valid recurring template ID is required');
    }

    const scopedTenantId = this.normalizeTenantId(tenantId);
    // Check if template is in use by any invoices
    const inUse = databaseService.getOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM invoices WHERE tenant_id = ? AND recurring_template_id = ?',
      [scopedTenantId, id]
    );

    if (inUse && inUse.count > 0) {
      throw new Error('Recurring template is currently in use by invoices and cannot be deleted');
    }

    const result = databaseService.executeQuery(
      'DELETE FROM recurring_invoice_templates WHERE id = ? AND tenant_id = ?',
      [id, scopedTenantId]
    );

    return result.changes > 0;
  }

  /**
   * Activate/deactivate recurring template
   */
  async toggleRecurringTemplate(id: number, isActive: boolean, tenantId?: number): Promise<boolean> {
    if (!id || typeof id !== 'number') {
      throw new Error('Valid recurring template ID is required');
    }

    const scopedTenantId = this.normalizeTenantId(tenantId);
    const result = databaseService.executeQuery(
      'UPDATE recurring_invoice_templates SET is_active = ?, updated_at = DATETIME(\'now\') WHERE id = ? AND tenant_id = ?',
      [isActive ? 1 : 0, id, scopedTenantId]
    );

    return result.changes > 0;
  }

  /**
   * Update next invoice date after processing
   */
  async updateNextInvoiceDate(id: number, nextDate: string, tenantId?: number): Promise<boolean> {
    if (!id || typeof id !== 'number') {
      throw new Error('Valid recurring template ID is required');
    }

    if (!nextDate || typeof nextDate !== 'string') {
      throw new Error('Valid next invoice date is required');
    }

    const scopedTenantId = this.normalizeTenantId(tenantId);
    const result = databaseService.executeQuery(
      'UPDATE recurring_invoice_templates SET next_invoice_date = ?, updated_at = DATETIME(\'now\') WHERE id = ? AND tenant_id = ?',
      [nextDate, id, scopedTenantId]
    );

    return result.changes > 0;
  }

  /**
   * Calculate next invoice date based on frequency
   */
  calculateNextInvoiceDate(currentDate: string, frequency: string): string {
    const date = new Date(currentDate);
    
    switch (frequency) {
      case 'weekly':
        date.setDate(date.getDate() + 7);
        break;
      case 'monthly':
        date.setMonth(date.getMonth() + 1);
        break;
      case 'quarterly':
        date.setMonth(date.getMonth() + 3);
        break;
      case 'yearly':
        date.setFullYear(date.getFullYear() + 1);
        break;
      default:
        // For custom frequency, don't auto-calculate
        return currentDate;
    }

    return date.toISOString().split('T')[0]!; // Return YYYY-MM-DD format
  }
}

// Export singleton instance
export const recurringInvoiceTemplateService = new RecurringInvoiceTemplateService();
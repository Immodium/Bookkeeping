// Template Service - Domain-specific service for template operations
// Handles all template-related business logic and database operations

import { databaseService } from '../core/DatabaseService.js';

/**
 * Template interface
 */
interface Template {
  id: number;
  name: string;
  content: string;
  is_default: boolean;
  variables?: string;
  created_at: string;
  updated_at: string;
}

/**
 * Template creation data interface
 */
interface TemplateData {
  name: string;
  content: string;
  is_default?: boolean;
  variables?: string;
}

/**
 * Template Service
 * Manages invoice design templates (layout/design templates)
 */
export class TemplateService {
  private normalizeTenantId(tenantId?: number): number {
    return tenantId && Number.isInteger(tenantId) && tenantId > 0 ? tenantId : 1;
  }

  /**
   * Get all templates
   */
  async getAllTemplates(tenantId?: number): Promise<Template[]> {
    const scopedTenantId = this.normalizeTenantId(tenantId);
    return await databaseService.getMany<Template>(
      'SELECT * FROM invoice_design_templates WHERE tenant_id = ? ORDER BY name ASC',
      [scopedTenantId]
    );
  }

  /**
   * Get template by ID
   */
  async getTemplateById(id: number, tenantId?: number): Promise<Template | null> {
    if (!id || typeof id !== 'number') {
      throw new Error('Valid template ID is required');
    }

    const scopedTenantId = this.normalizeTenantId(tenantId);
    return await databaseService.getOne<Template>(
      'SELECT * FROM invoice_design_templates WHERE id = ? AND tenant_id = ?',
      [id, scopedTenantId]
    );
  }

  /**
   * Create new template
   */
  async createTemplate(templateData: TemplateData, tenantId?: number): Promise<number> {
    if (!templateData.name || typeof templateData.name !== 'string') {
      throw new Error('Template name is required');
    }

    if (!templateData.content || typeof templateData.content !== 'string') {
      throw new Error('Template content is required');
    }

    const scopedTenantId = this.normalizeTenantId(tenantId);
    // If this is set as default, make sure no other template is default
    if (templateData.is_default) {
      await databaseService.executeQuery(
        'UPDATE invoice_design_templates SET is_default = 0 WHERE tenant_id = ? AND is_default = 1',
        [scopedTenantId]
      );
    }

    const result = await databaseService.executeQuery(
      'INSERT INTO invoice_design_templates (tenant_id, name, content, is_default, variables, created_at, updated_at) VALUES (?, ?, ?, ?, ?, DATETIME(\'now\'), DATETIME(\'now\'))',
      [
        scopedTenantId,
        templateData.name,
        templateData.content,
        templateData.is_default ? 1 : 0,
        templateData.variables || null
      ]
    );

    return result.lastInsertRowid;
  }

  /**
   * Update template
   */
  async updateTemplate(id: number, templateData: Partial<TemplateData>, tenantId?: number): Promise<boolean> {
    if (!id || typeof id !== 'number') {
      throw new Error('Valid template ID is required');
    }

    if (!templateData || Object.keys(templateData).length === 0) {
      throw new Error('Template data is required');
    }

    const scopedTenantId = this.normalizeTenantId(tenantId);
    // Check if template exists
    const existingTemplate = await this.getTemplateById(id, scopedTenantId);
    if (!existingTemplate) {
      throw new Error('Template not found');
    }

    // If this is set as default, make sure no other template is default
    if (templateData.is_default) {
      await databaseService.executeQuery(
        'UPDATE invoice_design_templates SET is_default = 0 WHERE tenant_id = ? AND is_default = 1 AND id != ?',
        [scopedTenantId, id]
      );
    }

    const updates: string[] = [];
    const values: any[] = [];

    if (templateData.name !== undefined) {
      updates.push('name = ?');
      values.push(templateData.name);
    }

    if (templateData.content !== undefined) {
      updates.push('content = ?');
      values.push(templateData.content);
    }

    if (templateData.is_default !== undefined) {
      updates.push('is_default = ?');
      values.push(templateData.is_default ? 1 : 0);
    }

    if (templateData.variables !== undefined) {
      updates.push('variables = ?');
      values.push(templateData.variables);
    }

    updates.push('updated_at = DATETIME(\'now\')');
    values.push(id);

    const result = await databaseService.executeQuery(
      `UPDATE invoice_design_templates SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?`,
      [...values, scopedTenantId]
    );

    return result.changes > 0;
  }

  /**
   * Delete template
   */
  async deleteTemplate(id: number, tenantId?: number): Promise<boolean> {
    if (!id || typeof id !== 'number') {
      throw new Error('Valid template ID is required');
    }

    const scopedTenantId = this.normalizeTenantId(tenantId);
    // Check if template is in use by any invoices
    const inUse = await databaseService.getOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM invoices WHERE tenant_id = ? AND design_template_id = ?',
      [scopedTenantId, id]
    );

    if (inUse && inUse.count > 0) {
      throw new Error('Template is currently in use by invoices and cannot be deleted');
    }

    const result = await databaseService.executeQuery(
      'DELETE FROM invoice_design_templates WHERE id = ? AND tenant_id = ?',
      [id, scopedTenantId]
    );

    return result.changes > 0;
  }

  /**
   * Get default template
   */
  async getDefaultTemplate(tenantId?: number): Promise<Template | null> {
    const scopedTenantId = this.normalizeTenantId(tenantId);
    return await databaseService.getOne<Template>(
      'SELECT * FROM invoice_design_templates WHERE tenant_id = ? AND is_default = 1 LIMIT 1',
      [scopedTenantId]
    );
  }

  /**
   * Set default template
   */
  async setDefaultTemplate(id: number, tenantId?: number): Promise<boolean> {
    if (!id || typeof id !== 'number') {
      throw new Error('Valid template ID is required');
    }

    const scopedTenantId = this.normalizeTenantId(tenantId);
    // Check if template exists
    const template = await this.getTemplateById(id, scopedTenantId);
    if (!template) {
      throw new Error('Template not found');
    }

    const operations = async () => {
      // Remove default from all templates
      await databaseService.executeQuery(
        'UPDATE invoice_design_templates SET is_default = 0 WHERE tenant_id = ? AND is_default = 1',
        [scopedTenantId]
      );

      // Set new default
      await databaseService.executeQuery(
        'UPDATE invoice_design_templates SET is_default = 1, updated_at = DATETIME(\'now\') WHERE id = ? AND tenant_id = ?',
        [id, scopedTenantId]
      );
    };

    await databaseService.executeTransaction(operations);
    return true;
  }
}

// Export singleton instance
export const templateService = new TemplateService();
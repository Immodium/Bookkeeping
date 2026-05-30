// Settings Service - Domain-specific service for settings operations
// Handles all settings-related business logic and database operations

import { databaseService } from '../core/DatabaseService.js';
import { Setting, ProjectSettings } from '../types/index.js';

/**
 * Settings Service
 * Manages application settings and project configuration
 */
export class SettingsService {
  private normalizeTenantId(tenantId?: number): number {
    if (!tenantId || !Number.isInteger(tenantId) || tenantId <= 0) {
      throw new Error(`Invalid tenant context: tenantId must be a positive integer, got ${tenantId}`);
    }
    return tenantId;
  }

  private async upsertSetting(tenantId: number, key: string, value: string, category: string): Promise<void> {
    const updateResult = await databaseService.executeQuery(
      "UPDATE settings SET value = ?, category = ?, updated_at = NOW() WHERE tenant_id = ? AND key = ?",
      [value, category, tenantId, key]
    );

    if (updateResult.changes === 0) {
      await databaseService.executeQuery(
        "INSERT INTO settings (tenant_id, key, value, category, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW())",
        [tenantId, key, value, category]
      );
    }
  }

  /**
   * Get all settings by category (using key prefix since table doesn't have category column)
   */
  async getAllSettings(category?: string, tenantId?: number): Promise<Record<string, unknown>> {
    const scopedTenantId = this.normalizeTenantId(tenantId);
    let query = 'SELECT key, value FROM settings WHERE tenant_id = ?';
    const params: (string | number)[] = [scopedTenantId];

    if (category) {
      // Use key prefix to simulate category filtering
      query += ' AND key LIKE ?';
      params.push(`${category}.%`);
    }

    query += ' ORDER BY key';

    const results = await databaseService.getMany<{key: string, value: string}>(query, params);
    
    const settings: Record<string, unknown> = {};

    results.forEach(row => {
      const normalizedKey = category && row.key.startsWith(`${category}.`)
        ? row.key.slice(category.length + 1)
        : row.key;

      try {
        settings[normalizedKey] = JSON.parse(row.value);
      } catch {
        settings[normalizedKey] = row.value;
      }
    });

    return settings;
  }

  /**
   * Get individual setting by key
   */
  async getSettingByKey(key: string, tenantId?: number): Promise<unknown> {
    if (!key || typeof key !== 'string') {
      throw new Error('Valid setting key is required');
    }
    const scopedTenantId = this.normalizeTenantId(tenantId);

    let result = await databaseService.getOne<{value: string}>(
      'SELECT value FROM settings WHERE tenant_id = ? AND key = ?',
      [scopedTenantId, key]
    );

    // Backward-compatible lookup: many frontend callers request bare keys
    // like "tax_rates", while persisted records are namespaced as
    // "<category>.<key>" (e.g. "tax.tax_rates").
    if (!result?.value && !key.includes('.')) {
      result = await databaseService.getOne<{ value: string }>(
        'SELECT value FROM settings WHERE tenant_id = ? AND key LIKE ? ORDER BY updated_at DESC LIMIT 1',
        [scopedTenantId, `%.${key}`]
      );
    }
    
    if (result?.value) {
      try {
        return JSON.parse(result.value);
      } catch {
        return result.value;
      }
    }
    
    return null;
  }

  /**
   * Save individual setting
   */
  async saveSetting(key: string, value: any, category: string = 'general', tenantId?: number): Promise<boolean> {
    if (!key || typeof key !== 'string') {
      throw new Error('Setting key is required');
    }
    const scopedTenantId = this.normalizeTenantId(tenantId);

    // Include category in the key if not already present
    const settingKey = key.includes('.') ? key : `${category}.${key}`;
    
    const jsonValue = typeof value === 'string' ? value : JSON.stringify(value);
    
    await this.upsertSetting(scopedTenantId, settingKey, jsonValue, category);
    
    return true;
  }

  /**
   * Update format-related settings (PDF format, date format, currency format, etc.)
   */
  async updateFormatSettings(settings: Record<string, any>, tenantId?: number): Promise<boolean> {
    if (!settings || typeof settings !== 'object') {
      throw new Error('Format settings object is required');
    }
    const scopedTenantId = this.normalizeTenantId(tenantId);

    const formatCategory = 'format';
    const operations = async () => {
      for (const [key, value] of Object.entries(settings)) {
        if (value === undefined) continue;
        
        const jsonValue = typeof value === 'string' ? value : JSON.stringify(value);
        
        await this.upsertSetting(scopedTenantId, key, jsonValue, formatCategory);
      }
    };

    await databaseService.executeTransaction(operations);
    return true;
  }

  /**
   * Save multiple settings in a transaction
   */
  async saveMultipleSettings(settings: Record<string, {
    value: any;
    category?: string;
  }>, tenantId?: number): Promise<boolean> {
    if (!settings || typeof settings !== 'object') {
      throw new Error('Settings object is required');
    }
    const scopedTenantId = this.normalizeTenantId(tenantId);

    const operations = async () => {
      for (const [key, data] of Object.entries(settings)) {
        if (!data || typeof data !== 'object') {
          throw new Error(`Invalid setting data for key: ${key}`);
        }

        const { value, category = 'general' } = data;
        const settingKey = key.includes('.') ? key : `${category}.${key}`;
        const jsonValue = typeof value === 'string' ? value : JSON.stringify(value);
        
        await this.upsertSetting(scopedTenantId, settingKey, jsonValue, category);
      }
    };

    await databaseService.executeTransaction(operations);
    return true;
  }

  /**
   * Get project settings with environment defaults
   */
  async getProjectSettings(tenantId?: number): Promise<ProjectSettings> {
    try {
      const scopedTenantId = this.normalizeTenantId(tenantId);
      // Get all project settings from database using settings table
      const dbSettings = await databaseService.getMany<{key: string, value: string}>(
        'SELECT key, value FROM settings WHERE tenant_id = ? AND (key LIKE ? OR key LIKE ? OR key LIKE ? OR key LIKE ?)',
        [scopedTenantId, 'google_oauth.%', 'stripe.%', 'email.%', 'security.%']
      );

      // Convert database settings to a map for easy lookup
      const settingsMap: Record<string, string> = {};
      dbSettings.forEach(setting => {
        settingsMap[setting.key] = setting.value;
      });

      // Create settings object with .env defaults and database overrides
      const projectSettings: ProjectSettings = {
        google_oauth: {
          enabled: settingsMap['google_oauth.enabled'] === 'true' || false,
          client_id: settingsMap['google_oauth.client_id'] || process.env.GOOGLE_CLIENT_ID || '',
          ...(settingsMap['google_oauth.client_secret'] && { client_secret: settingsMap['google_oauth.client_secret'] }),
          ...(process.env.GOOGLE_CLIENT_SECRET && { client_secret: process.env.GOOGLE_CLIENT_SECRET }),
          configured: !!(
            (settingsMap['google_oauth.client_id'] || process.env.GOOGLE_CLIENT_ID) && 
            (settingsMap['google_oauth.client_secret'] || process.env.GOOGLE_CLIENT_SECRET)
          )
        },
        stripe: {
          enabled: settingsMap['stripe.enabled'] === 'true' || false,
          publishable_key: settingsMap['stripe.publishable_key'] || process.env.STRIPE_PUBLISHABLE_KEY || '',
          ...(settingsMap['stripe.secret_key'] && { secret_key: settingsMap['stripe.secret_key'] }),
          ...(process.env.STRIPE_SECRET_KEY && { secret_key: process.env.STRIPE_SECRET_KEY }),
          configured: !!(
            (settingsMap['stripe.publishable_key'] || process.env.STRIPE_PUBLISHABLE_KEY) && 
            (settingsMap['stripe.secret_key'] || process.env.STRIPE_SECRET_KEY)
          )
        },
        email: {
          enabled: settingsMap['email.enabled'] === 'true' || false,
          smtp_host: settingsMap['email.smtp_host'] || process.env.SMTP_HOST || '',
          smtp_port: parseInt(settingsMap['email.smtp_port'] || process.env.SMTP_PORT || '587') || 587,
          smtp_user: settingsMap['email.smtp_user'] || process.env.SMTP_USER || '',
          ...(settingsMap['email.smtp_pass'] && { smtp_pass: settingsMap['email.smtp_pass'] }),
          ...(process.env.SMTP_PASS && { smtp_pass: process.env.SMTP_PASS }),
          email_from: settingsMap['email.email_from'] || process.env.EMAIL_FROM || '',
          configured: !!(
            (settingsMap['email.smtp_host'] || process.env.SMTP_HOST) && 
            (settingsMap['email.smtp_user'] || process.env.SMTP_USER) && 
            (settingsMap['email.email_from'] || process.env.EMAIL_FROM)
          )
        },
        security: {
          jwt_secret: process.env.JWT_SECRET || '',
          session_secret: process.env.SESSION_SECRET || '',
          require_email_verification: settingsMap['security.require_email_verification'] === 'true' || process.env.REQUIRE_EMAIL_VERIFICATION === 'true',
          max_failed_login_attempts: parseInt(settingsMap['security.max_failed_login_attempts'] || process.env.MAX_FAILED_LOGIN_ATTEMPTS || '5') || 5,
          account_lockout_duration: parseInt(settingsMap['security.account_lockout_duration'] || process.env.ACCOUNT_LOCKOUT_DURATION || '1800000') || 1800000,
          password_policy: {
            min_length: parseInt(settingsMap['security.password_policy.min_length'] || '8') || 8,
            require_uppercase: settingsMap['security.password_policy.require_uppercase'] === 'true' || false,
            require_lowercase: settingsMap['security.password_policy.require_lowercase'] === 'true' || false,
            require_numbers: settingsMap['security.password_policy.require_numbers'] === 'true' || false,
            require_special: settingsMap['security.password_policy.require_special'] === 'true' || false
          }
        }
      };

      return projectSettings;
    } catch (error) {
      console.error('SettingsService.getProjectSettings error:', error);
      throw new Error(`Failed to get project settings: ${(error as Error).message}`);
    }
  }

  /**
   * Update project settings
   */
  async updateProjectSettings(settings: Partial<ProjectSettings>, tenantId?: number): Promise<boolean> {
    if (!settings || typeof settings !== 'object') {
      throw new Error('Settings object is required');
    }
    const scopedTenantId = this.normalizeTenantId(tenantId);

    // Flatten the settings object for database storage
    const flattenSettings = (obj: any, prefix: string = '', parentEnabled: number | null = null): Setting[] => {
      const flattened: Setting[] = [];
      const currentEnabled = obj.enabled !== undefined ? (obj.enabled ? 1 : 0) : parentEnabled;
      
      for (const [key, value] of Object.entries(obj)) {
        const fullKey = prefix ? `${prefix}.${key}` : key;

        if (key === 'enabled') {
          // Skip enabled flag as it's handled as metadata
          continue;
        } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          // Recursively flatten nested objects
          flattened.push(...flattenSettings(value, fullKey, currentEnabled));
        } else {
          // Store primitive values with their enabled status
          flattened.push({
            key: fullKey,
            value: JSON.stringify(value),
            enabled: currentEnabled,
            id: 0, // Temporary ID, will be set by database
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
        }
      }
      return flattened;
    };

    const flatSettings = flattenSettings(settings);

    // Use transaction for bulk updates
    const operations = async () => {
      for (const setting of flatSettings) {
        await this.upsertSetting(scopedTenantId, setting.key, setting.value, 'project');
      }
    };

    await databaseService.executeTransaction(operations);
    return true;
  }

  /**
   * Get security setting value
   */
  async getSecuritySetting(settingName: string, tenantId?: number): Promise<any> {
    if (!settingName || typeof settingName !== 'string') {
      throw new Error('Setting name is required');
    }
    const scopedTenantId = this.normalizeTenantId(tenantId);

    const setting = await databaseService.getOne<{value: string}>(
      'SELECT value FROM settings WHERE tenant_id = ? AND key = ?', 
      [scopedTenantId, `security.${settingName}`]
    );
    
    if (setting) {
      try {
        return JSON.parse(setting.value);
      } catch {
        return setting.value;
      }
    }
    
    // Fallback to environment variables
    switch (settingName) {
      case 'require_email_verification':
        return process.env.REQUIRE_EMAIL_VERIFICATION === 'true';
      case 'max_failed_login_attempts':
        return parseInt(process.env.MAX_FAILED_LOGIN_ATTEMPTS || '5') || 5;
      case 'account_lockout_duration':
        return parseInt(process.env.ACCOUNT_LOCKOUT_DURATION || '1800000') || 1800000;
      default:
        return null;
    }
  }

  /**
   * Delete setting by key
   */
  async deleteSetting(key: string, tenantId?: number): Promise<boolean> {
    if (!key || typeof key !== 'string') {
      throw new Error('Valid setting key is required');
    }
    const scopedTenantId = this.normalizeTenantId(tenantId);

    const result = await databaseService.executeQuery(
      'DELETE FROM settings WHERE tenant_id = ? AND key = ?',
      [scopedTenantId, key]
    );
    return result.changes > 0;
  }

  /**
   * Delete settings by category (using key prefix)
   */
  async deleteSettingsByCategory(category: string, tenantId?: number): Promise<number> {
    if (!category || typeof category !== 'string') {
      throw new Error('Valid category is required');
    }
    const scopedTenantId = this.normalizeTenantId(tenantId);

    const result = await databaseService.executeQuery(
      'DELETE FROM settings WHERE tenant_id = ? AND key LIKE ?',
      [scopedTenantId, `${category}.%`]
    );
    return result.changes;
  }

  /**
   * Get all categories (extracted from key prefixes)
   */
  async getCategories(tenantId?: number): Promise<string[]> {
    const scopedTenantId = this.normalizeTenantId(tenantId);
    const results = await databaseService.getMany<{key: string}>(
      'SELECT DISTINCT key FROM settings WHERE tenant_id = ? AND key LIKE "%.%" ORDER BY key',
      [scopedTenantId]
    );
    
    // Extract categories from keys (everything before the first dot)
    const categories = new Set<string>();
    results.forEach(row => {
      const category = row.key.split('.')[0];
      if (category) {
        categories.add(category);
      }
    });
    
    return Array.from(categories).sort();
  }

  /**
   * Check if setting exists
   */
  async settingExists(key: string, tenantId?: number): Promise<boolean> {
    if (!key || typeof key !== 'string') {
      return false;
    }
    const scopedTenantId = this.normalizeTenantId(tenantId);

    const setting = await databaseService.getOne<{ key: string }>(
      'SELECT key FROM settings WHERE tenant_id = ? AND key = ?',
      [scopedTenantId, key]
    );
    return Boolean(setting);
  }

  /**
   * Get settings count by category (using key prefix)
   */
  async getSettingsCount(category?: string, tenantId?: number): Promise<number> {
    const scopedTenantId = this.normalizeTenantId(tenantId);
    let query = 'SELECT COUNT(*) as count FROM settings WHERE tenant_id = ?';
    const params: (string | number | null | boolean)[] = [scopedTenantId];

    if (category) {
      query += ' AND key LIKE ?';
      params.push(`${category}.%`);
    }

    const result = await databaseService.getOne<{count: number}>(query, params);
    return result?.count || 0;
  }

  /**
   * Reset settings to defaults (using key prefix for category)
   */
  async resetSettings(category?: string, tenantId?: number): Promise<boolean> {
    const scopedTenantId = this.normalizeTenantId(tenantId);
    let query = 'DELETE FROM settings WHERE tenant_id = ?';
    const params: (string | number | null | boolean)[] = [scopedTenantId];

    if (category) {
      query += ' AND key LIKE ?';
      params.push(`${category}.%`);
    }

    await databaseService.executeQuery(query, params);
    return true;
  }
}

// Export singleton instance
export const settingsService = new SettingsService();
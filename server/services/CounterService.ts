// Counter Service - Domain-specific service for ID counter management operations
// Handles counter management, next ID generation, and administrative operations

import { databaseService } from '../core/DatabaseService.js';

export interface Counter {
  name: string;
  value: number;
}

/**
 * Counter Management Service
 * Handles ID counter operations for various entities in the system
 */
export class CounterService {
  // Valid counter names
  private readonly validCounters = ['clients', 'invoices', 'expenses', 'templates', 'reports'];

  private normalizeTenantId(tenantId?: number): number {
    return tenantId && Number.isInteger(tenantId) && tenantId > 0 ? tenantId : 1;
  }

  private getScopedCounterName(counterName: string, tenantId: number): string {
    return tenantId === 1 ? counterName : `${counterName}__tenant_${tenantId}`;
  }

  /**
   * Get next ID for a counter and increment it
   */
  async getNextCounterId(counterName: string, tenantId?: number): Promise<number> {
    if (!counterName || typeof counterName !== 'string') {
      throw new Error('Counter name is required');
    }

    // Validate counter name
    if (!this.validCounters.includes(counterName)) {
      throw new Error(`Invalid counter name. Valid counters: ${this.validCounters.join(', ')}`);
    }
    const scopedTenantId = this.normalizeTenantId(tenantId);
    const scopedCounterName = this.getScopedCounterName(counterName, scopedTenantId);

    // Get current counter value
    const counterResult = await databaseService.getOne<{value: number}>(
      'SELECT value FROM counters WHERE tenant_id = ? AND name = ?', 
      [scopedTenantId, scopedCounterName]
    );
    
    const nextId = (counterResult?.value || 0) + 1;
    
    if (counterResult) {
      await databaseService.executeQuery(
        'UPDATE counters SET value = ?, updated_at = datetime(\'now\') WHERE tenant_id = ? AND name = ?', 
        [nextId, scopedTenantId, scopedCounterName]
      );
    } else {
      await databaseService.executeQuery(
        'INSERT INTO counters (tenant_id, name, value, created_at, updated_at) VALUES (?, ?, ?, datetime(\'now\'), datetime(\'now\'))',
        [scopedTenantId, scopedCounterName, nextId]
      );
    }
    
    return nextId;
  }

  /**
   * Get current counter value without incrementing
   */
  async getCurrentCounterValue(counterName: string, tenantId?: number): Promise<Counter | null> {
    if (!counterName || typeof counterName !== 'string') {
      throw new Error('Counter name is required');
    }

    const scopedTenantId = this.normalizeTenantId(tenantId);
    const scopedCounterName = this.getScopedCounterName(counterName, scopedTenantId);
    const counterResult = await databaseService.getOne<{value: number}>(
      'SELECT value FROM counters WHERE tenant_id = ? AND name = ?', 
      [scopedTenantId, scopedCounterName]
    );
    
    if (!counterResult) {
      return null;
    }
    
    return {
      name: counterName,
      value: counterResult.value
    };
  }

  /**
   * Reset counter value (admin operation)
   */
  async resetCounter(counterName: string, value: number = 0, tenantId?: number): Promise<boolean> {
    if (!counterName || typeof counterName !== 'string') {
      throw new Error('Counter name is required');
    }

    if (typeof value !== 'number' || value < 0) {
      throw new Error('Valid counter value is required');
    }

    // Validate counter name
    if (!this.validCounters.includes(counterName)) {
      throw new Error(`Invalid counter name. Valid counters: ${this.validCounters.join(', ')}`);
    }
    const scopedTenantId = this.normalizeTenantId(tenantId);
    const scopedCounterName = this.getScopedCounterName(counterName, scopedTenantId);

    const result = await databaseService.executeQuery(
      'UPDATE counters SET value = ?, updated_at = datetime(\'now\') WHERE tenant_id = ? AND name = ?', 
      [value, scopedTenantId, scopedCounterName]
    );
    
    if (result.changes === 0) {
      throw new Error('Counter not found');
    }
    
    return true;
  }

  /**
   * Initialize counter if it doesn't exist
   */
  async initializeCounter(counterName: string, initialValue: number = 0, tenantId?: number): Promise<boolean> {
    if (!counterName || typeof counterName !== 'string') {
      throw new Error('Counter name is required');
    }

    if (typeof initialValue !== 'number' || initialValue < 0) {
      throw new Error('Valid initial value is required');
    }

    // Validate counter name
    if (!this.validCounters.includes(counterName)) {
      throw new Error(`Invalid counter name. Valid counters: ${this.validCounters.join(', ')}`);
    }
    const scopedTenantId = this.normalizeTenantId(tenantId);
    const scopedCounterName = this.getScopedCounterName(counterName, scopedTenantId);

    // Check if counter already exists
    const exists = await this.counterExists(counterName, scopedTenantId);
    if (exists) {
      return false; // Counter already exists
    }

    // Create new counter
    await databaseService.executeQuery(
      'INSERT INTO counters (tenant_id, name, value, created_at, updated_at) VALUES (?, ?, ?, datetime(\'now\'), datetime(\'now\'))', 
      [scopedTenantId, scopedCounterName, initialValue]
    );
    
    return true;
  }

  /**
   * Check if counter exists
   */
  async counterExists(counterName: string, tenantId?: number): Promise<boolean> {
    if (!counterName || typeof counterName !== 'string') {
      return false;
    }
    const scopedTenantId = this.normalizeTenantId(tenantId);
    const scopedCounterName = this.getScopedCounterName(counterName, scopedTenantId);
    const counter = await databaseService.getOne<{ name: string }>(
      'SELECT name FROM counters WHERE tenant_id = ? AND name = ?',
      [scopedTenantId, scopedCounterName]
    );
    return Boolean(counter);
  }

  /**
   * Get all counters
   */
  async getAllCounters(tenantId?: number): Promise<Counter[]> {
    const scopedTenantId = this.normalizeTenantId(tenantId);
    const results = await databaseService.getMany<{name: string; value: number}>(
      'SELECT name, value FROM counters WHERE tenant_id = ? ORDER BY name',
      [scopedTenantId]
    );
    
    return results.map(row => ({
      name: row.name.replace(/__tenant_\d+$/, ''),
      value: row.value
    }));
  }

  /**
   * Get valid counter names
   */
  getValidCounterNames(): string[] {
    return [...this.validCounters];
  }

  /**
   * Validate counter name
   */
  isValidCounterName(counterName: string): boolean {
    return this.validCounters.includes(counterName);
  }

  /**
   * Set counter value (admin operation)
   */
  async setCounterValue(counterName: string, value: number, tenantId?: number): Promise<boolean> {
    if (!counterName || typeof counterName !== 'string') {
      throw new Error('Counter name is required');
    }

    if (typeof value !== 'number' || value < 0) {
      throw new Error('Valid counter value is required');
    }

    // Validate counter name
    if (!this.validCounters.includes(counterName)) {
      throw new Error(`Invalid counter name. Valid counters: ${this.validCounters.join(', ')}`);
    }
    const scopedTenantId = this.normalizeTenantId(tenantId);
    const scopedCounterName = this.getScopedCounterName(counterName, scopedTenantId);

    const result = await databaseService.executeQuery(
      'UPDATE counters SET value = ?, updated_at = datetime(\'now\') WHERE tenant_id = ? AND name = ?', 
      [value, scopedTenantId, scopedCounterName]
    );
    
    if (result.changes === 0) {
      throw new Error('Counter not found');
    }
    
    return true;
  }

  /**
   * Initialize all standard counters if they don't exist
   */
  async initializeStandardCounters(tenantId?: number): Promise<boolean> {
    const scopedTenantId = this.normalizeTenantId(tenantId);
    const operations = async () => {
      for (const counterName of this.validCounters) {
        const scopedCounterName = this.getScopedCounterName(counterName, scopedTenantId);
        // Use INSERT OR IGNORE to avoid errors if counter already exists
        await databaseService.executeQuery(
          'INSERT OR IGNORE INTO counters (tenant_id, name, value, created_at, updated_at) VALUES (?, ?, ?, datetime(\'now\'), datetime(\'now\'))',
          [scopedTenantId, scopedCounterName, 0]
        );
      }
    };

    await databaseService.executeTransaction(operations);
    return true;
  }
}

// Export singleton instance
export const counterService = new CounterService();
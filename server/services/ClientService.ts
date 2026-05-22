// Client Service - Domain-specific service for client operations
// Handles all client-related business logic and database operations

import { databaseService } from '../core/DatabaseService.js';
import { subscriptionService } from './SubscriptionService.js';
import { Client, ServiceOptions } from '../types/index.js';
import { usageService } from './UsageService.js';

/**
 * Client Service
 * Manages client-related operations with proper validation and security
 */
export class ClientService {
  private normalizeTenantId(tenantId?: number): number {
    if (!tenantId || !Number.isInteger(tenantId) || tenantId <= 0) {
      throw new Error(`Invalid tenant context: tenantId must be a positive integer, got ${tenantId}`);
    }
    return tenantId;
  }

  private normalizeClientRecord(client: Client & { zip?: string }): Client {
    const normalized: Client = { ...client };
    const resolvedZip = client.zipCode || client.zip;
    if (resolvedZip !== undefined) {
      normalized.zipCode = resolvedZip;
    }

    if (!normalized.first_name && normalized.name) {
      const [firstName, ...lastNameParts] = normalized.name.split(' ');
      normalized.first_name = firstName || '';
      normalized.last_name = lastNameParts.join(' ');
    } else if (normalized.last_name === undefined) {
      normalized.last_name = '';
    }
    return normalized;
  }

  /**
   * Get all clients
   */
  async getAllClients(options: ServiceOptions = {}, tenantId?: number): Promise<Client[]> {
    const { limit = 100, offset = 0 } = options;
    const scopedTenantId = this.normalizeTenantId(tenantId);

    const clients = await databaseService.getMany<Client>(`
      SELECT * FROM clients
      WHERE tenant_id = ? AND deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `, [scopedTenantId, limit, offset]);

    return clients.map(client => this.normalizeClientRecord(client));
  }

  /**
   * Get client by ID
   */
  async getClientById(id: number, tenantId?: number): Promise<Client | null> {
    if (!id || typeof id !== 'number') {
      throw new Error('Valid client ID is required');
    }

    const scopedTenantId = this.normalizeTenantId(tenantId);
    const client = await databaseService.getOne<Client>(
      'SELECT * FROM clients WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL',
      [id, scopedTenantId]
    );
    return client ? this.normalizeClientRecord(client) : null;
  }

  /**
   * Create new client
   */
  async createClient(clientData: {
    name: string;
    first_name?: string;
    last_name?: string;
    email?: string;
    phone?: string;
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
    zipCode?: string;
    country?: string;
    company?: string;
    tax_id?: string;
    notes?: string;
  }, tenantId?: number): Promise<number> {
    const scopedTenantId = this.normalizeTenantId(tenantId);
    if (!clientData) {
      throw new Error('Client data is required');
    }

    const firstName = (clientData.first_name || '').trim();
    const lastName = (clientData.last_name || '').trim();
    const combinedName = `${firstName} ${lastName}`.trim();
    const resolvedName = (clientData.name || '').trim() || combinedName;

    // Validate required fields
    if (!resolvedName) {
      throw new Error('Client name is required');
    }

    // Validate email format if provided
    if (clientData.email && !this.isValidEmail(clientData.email)) {
      throw new Error('Invalid email format');
    }

    // Enforce plan limits and create client inside a transaction to prevent TOCTOU race
    const nextId = await databaseService.executeTransaction(async () => {
      const clientCount = (await databaseService.getOne<{ count: number }>(
        'SELECT COUNT(*) as count FROM clients WHERE tenant_id = ? AND deleted_at IS NULL', [scopedTenantId]
      ))?.count || 0;
      await subscriptionService.assertWithinLimit(scopedTenantId, 'billing.max_clients', clientCount);

      // Check if client with same email already exists (if email provided)
      if (clientData.email) {
        const existingClient = await databaseService.getOne<{id: number}>(
          'SELECT id FROM clients WHERE tenant_id = ? AND email = ?',
          [scopedTenantId, clientData.email]
        );
        if (existingClient) {
          throw new Error('Client with this email already exists');
        }
      }

      const id = await databaseService.getNextId('clients');

      const now = new Date().toISOString();
      const zipValue = clientData.zipCode || clientData.zip || null;
      const clientRecord = {
        id,
        tenant_id: scopedTenantId,
        name: resolvedName,
        first_name: firstName || null,
        last_name: lastName || null,
        email: clientData.email || null,
        phone: clientData.phone || null,
        address: clientData.address || null,
        city: clientData.city || null,
        state: clientData.state || null,
        zip: zipValue,
        country: clientData.country || null,
        company: clientData.company || null,
        tax_id: clientData.tax_id || null,
        notes: clientData.notes || null,
        is_active: 1,
        created_at: now,
        updated_at: now
      };

      await databaseService.executeQuery(`
        INSERT INTO clients (
          id, tenant_id, name, first_name, last_name, email, phone, company, address, city, state,
          zip, country, tax_id, notes, is_active, stripe_customer_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        clientRecord.id, clientRecord.tenant_id, clientRecord.name, clientRecord.first_name, clientRecord.last_name,
        clientRecord.email, clientRecord.phone, clientRecord.company, clientRecord.address,
        clientRecord.city, clientRecord.state, clientRecord.zip, clientRecord.country,
        clientRecord.tax_id, clientRecord.notes, clientRecord.is_active,
        null, clientRecord.created_at, clientRecord.updated_at
      ]);

      return id;
    });

    // Fire-and-forget: usage metering
    usageService.increment(scopedTenantId, 'clients_created').catch(() => {});

    return nextId;
  }

  /**
   * Update client
   */
  async updateClient(id: number, clientData: Partial<{
    name: string;
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    address: string;
    city: string;
    state: string;
    zip: string;
    zipCode: string;
    country: string;
    company: string;
    tax_id: string;
    notes: string;
    is_active: number;
  }>, tenantId?: number): Promise<number> {
    const scopedTenantId = this.normalizeTenantId(tenantId);
    if (!id || typeof id !== 'number') {
      throw new Error('Valid client ID is required');
    }

    if (!clientData || typeof clientData !== 'object') {
      throw new Error('Client data is required');
    }

    // Check if client exists
    const existingClient = await this.getClientById(id, scopedTenantId);
    if (!existingClient) {
      throw new Error('Client not found');
    }

    // Validate email if being updated
    if (clientData.email) {
      if (!this.isValidEmail(clientData.email)) {
        throw new Error('Invalid email format');
      }

      // Check email uniqueness if email is being changed
      if (clientData.email !== existingClient.email) {
        const emailExists = await databaseService.getOne<{id: number}>(
          'SELECT id FROM clients WHERE tenant_id = ? AND email = ? AND id != ?', 
          [scopedTenantId, clientData.email, id]
        );
        if (emailExists) {
          throw new Error('Email is already in use by another client');
        }
      }
    }

    // Filter allowed fields
    const allowedFields = [
      'name', 'first_name', 'last_name', 'email', 'phone', 'company', 'address', 'city', 'state',
      'zip', 'country', 'tax_id', 'notes', 'is_active', 'stripe_customer_id'
    ];
    
    const updateData: Record<string, any> = {};
    allowedFields.forEach(field => {
      if (field === 'zip') {
        const zipValue = clientData.zip ?? clientData.zipCode;
        if (zipValue !== undefined) {
          updateData.zip = zipValue;
        }
        return;
      }

      if (clientData[field as keyof typeof clientData] !== undefined) {
        updateData[field] = clientData[field as keyof typeof clientData];
      }
    });

    const hasNameParts = clientData.first_name !== undefined || clientData.last_name !== undefined;
    if (hasNameParts) {
      const resolvedFirstName = (clientData.first_name ?? existingClient.first_name ?? '').trim();
      const resolvedLastName = (clientData.last_name ?? existingClient.last_name ?? '').trim();
      updateData.first_name = resolvedFirstName || null;
      updateData.last_name = resolvedLastName || null;

      // Keep full-name column in sync with first/last name edits.
      const combinedName = `${resolvedFirstName} ${resolvedLastName}`.trim();
      updateData.name = combinedName || updateData.name || existingClient.name;
    }

    if (Object.keys(updateData).length === 0) {
      throw new Error('No valid fields to update');
    }

    const keys = Object.keys(updateData);
    const values = Object.values(updateData);
    const setClause = keys.map((key) => `${key} = ?`).join(', ');
    const result = await databaseService.executeQuery(
      `UPDATE clients SET ${setClause}, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?`,
      [...values, id, scopedTenantId]
    );
    return result.changes;
  }

  /**
   * Delete client
   */
  async deleteClient(id: number, tenantId?: number): Promise<number> {
    const scopedTenantId = this.normalizeTenantId(tenantId);
    if (!id || typeof id !== 'number') {
      throw new Error('Valid client ID is required');
    }

    // Check if client exists
    const existingClient = await this.getClientById(id, scopedTenantId);
    if (!existingClient) {
      throw new Error('Client not found');
    }

    // Check if client has associated invoices
    const invoiceCount = await databaseService.getOne<{count: number}>(
      'SELECT COUNT(*) as count FROM invoices WHERE tenant_id = ? AND client_id = ?',
      [scopedTenantId, id]
    );

    if (invoiceCount && invoiceCount.count > 0) {
      throw new Error('Cannot delete client with existing invoices. Archive the client instead.');
    }

    // Use setting-based delete (checks data.clients_soft_delete_enabled setting)
    // Default is hard delete if setting doesn't exist
    const useSoftDelete = (await databaseService.getOne<{ value: string }>(
      'SELECT value FROM settings WHERE tenant_id = ? AND key = ?',
      [scopedTenantId, 'data.clients_soft_delete_enabled']
    ))?.value;

    if (useSoftDelete === 'true' || useSoftDelete === '1') {
      const result = await databaseService.executeQuery(
        "UPDATE clients SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND tenant_id = ?",
        [id, scopedTenantId]
      );
      return result.changes;
    }

    const result = await databaseService.executeQuery(
      'DELETE FROM clients WHERE id = ? AND tenant_id = ?',
      [id, scopedTenantId]
    );
    return result.changes;
  }

  /**
   * Search clients
   */
  async searchClients(searchTerm: string, options: ServiceOptions = {}, tenantId?: number): Promise<Client[]> {
    if (!searchTerm || typeof searchTerm !== 'string') {
      return [];
    }

    const { limit = 50, offset = 0 } = options;
    const scopedTenantId = this.normalizeTenantId(tenantId);
    const searchPattern = `%${searchTerm}%`;

    const clients = await databaseService.getMany<Client>(`
      SELECT * FROM clients
      WHERE tenant_id = ? AND (name LIKE ? OR email LIKE ? OR company LIKE ? OR phone LIKE ?)
        AND deleted_at IS NULL
      ORDER BY 
        CASE 
          WHEN name = ? THEN 1
          WHEN email = ? THEN 2
          WHEN company = ? THEN 3
          ELSE 4
        END,
        created_at DESC
      LIMIT ? OFFSET ?
    `, [
      scopedTenantId, searchPattern, searchPattern, searchPattern, searchPattern,
      searchTerm, searchTerm, searchTerm,
      limit, offset
    ]);
    return clients.map(client => this.normalizeClientRecord(client));
  }

  /**
   * Get active clients
   */
  async getActiveClients(options: ServiceOptions = {}, tenantId?: number): Promise<Client[]> {
    const { limit = 100, offset = 0 } = options;
    const scopedTenantId = this.normalizeTenantId(tenantId);

    const clients = await databaseService.getMany<Client>(`
      SELECT * FROM clients 
      WHERE tenant_id = ?
      ORDER BY name ASC
      LIMIT ? OFFSET ?
    `, [scopedTenantId, limit, offset]);
    return clients.map(client => this.normalizeClientRecord(client));
  }

  /**
   * Archive/Unarchive client
   */
  async toggleClientStatus(id: number, isActive: boolean): Promise<number> {
    // This function is kept for API compatibility but doesn't do anything
    // since we removed is_active column. Returns success.
    return 1;
  }

  /**
   * Get clients by country
   */
  async getClientsByCountry(country: string, options: ServiceOptions = {}, tenantId?: number): Promise<Client[]> {
    if (!country || typeof country !== 'string') {
      throw new Error('Valid country is required');
    }

    const { limit = 100, offset = 0 } = options;
    const scopedTenantId = this.normalizeTenantId(tenantId);

    const clients = await databaseService.getMany<Client>(`
      SELECT * FROM clients 
      WHERE tenant_id = ? AND country = ?
      ORDER BY name ASC
      LIMIT ? OFFSET ?
    `, [scopedTenantId, country, limit, offset]);
    return clients.map(client => this.normalizeClientRecord(client));
  }

  /**
   * Get client statistics
   */
  async getClientStats(tenantId?: number): Promise<{
    total: number;
    active: number;
    inactive: number;
    withEmail: number;
    withPhone: number;
    byCountry: Record<string, number>;
  }> {
    const scopedTenantId = this.normalizeTenantId(tenantId);
    const total = (await databaseService.getOne<{count: number}>(
      'SELECT COUNT(*) as count FROM clients WHERE tenant_id = ?',
      [scopedTenantId]
    ))?.count || 0;

    const active = total; // All clients are considered active now
    const inactive = 0;

    const withEmail = (await databaseService.getOne<{count: number}>(
      'SELECT COUNT(*) as count FROM clients WHERE tenant_id = ? AND email IS NOT NULL',
      [scopedTenantId]
    ))?.count || 0;

    const withPhone = (await databaseService.getOne<{count: number}>(
      'SELECT COUNT(*) as count FROM clients WHERE tenant_id = ? AND phone IS NOT NULL',
      [scopedTenantId]
    ))?.count || 0;

    // Get country distribution
    const countryData = await databaseService.getMany<{country: string; count: number}>(
      'SELECT country, COUNT(*) as count FROM clients WHERE tenant_id = ? AND country IS NOT NULL GROUP BY country ORDER BY count DESC',
      [scopedTenantId]
    );

    const byCountry: Record<string, number> = {};
    countryData.forEach(row => {
      if (row.country) {
        byCountry[row.country] = row.count;
      }
    });

    return {
      total,
      active,
      inactive,
      withEmail,
      withPhone,
      byCountry
    };
  }

  /**
   * Get clients with recent invoices
   */
  async getClientsWithRecentActivity(days: number = 30, options: ServiceOptions = {}, tenantId?: number): Promise<Client[]> {
    const { limit = 50, offset = 0 } = options;
    const scopedTenantId = this.normalizeTenantId(tenantId);

    const clients = await databaseService.getMany<Client>(`
      SELECT DISTINCT c.* FROM clients c
      INNER JOIN invoices i ON c.id = i.client_id
      WHERE c.tenant_id = ? AND i.tenant_id = ? AND i.created_at > datetime('now', '-${days} days')
      ORDER BY c.name ASC
      LIMIT ? OFFSET ?
    `, [scopedTenantId, scopedTenantId, limit, offset]);
    return clients.map(client => this.normalizeClientRecord(client));
  }

  /**
   * Check if client exists
   */
  async clientExists(id: number, tenantId?: number): Promise<boolean> {
    if (!id || typeof id !== 'number') {
      return false;
    }
    const scopedTenantId = this.normalizeTenantId(tenantId);
    const client = await databaseService.getOne<{ id: number }>(
      'SELECT id FROM clients WHERE id = ? AND tenant_id = ?',
      [id, scopedTenantId]
    );
    return Boolean(client);
  }

  /**
   * Check if email is already in use
   */
  async emailExists(email: string, excludeId?: number, tenantId?: number): Promise<boolean> {
    if (!email || typeof email !== 'string') {
      return false;
    }

    const scopedTenantId = this.normalizeTenantId(tenantId);
    if (excludeId) {
      const client = await databaseService.getOne<{id: number}>(
        'SELECT id FROM clients WHERE tenant_id = ? AND email = ? AND id != ?', 
        [scopedTenantId, email, excludeId]
      );
      return !!client;
    }
    const client = await databaseService.getOne<{ id: number }>(
      'SELECT id FROM clients WHERE tenant_id = ? AND email = ?',
      [scopedTenantId, email]
    );
    return Boolean(client);
  }

  /**
   * Validate email format
   */
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
}

// Export singleton instance
export const clientService = new ClientService();
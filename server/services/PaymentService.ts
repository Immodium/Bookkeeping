// Payment Service - Domain-specific service for payment operations
// Handles all payment-related business logic and database operations

import { databaseService } from '../core/DatabaseService.js';
import { Payment, ServiceOptions, PaymentStatus, PaymentMethod } from '../types/index.js';

/**
 * Payment Service
 * Manages payment-related operations with proper validation and security
 */
export class PaymentService {
  private getInvoiceClientId(invoiceId?: number): number | null {
    if (!invoiceId) {
      return null;
    }

    const invoice = databaseService.getOne<{ client_id: number }>(
      'SELECT client_id FROM invoices WHERE id = ? LIMIT 1',
      [invoiceId]
    );
    return invoice?.client_id || null;
  }

  private mapClientNameToId(clientName?: string): number | null {
    if (!clientName || typeof clientName !== 'string') {
      return null;
    }

    const exactMatch = databaseService.getOne<{ id: number }>(
      'SELECT id FROM clients WHERE LOWER(name) = LOWER(?) AND deleted_at IS NULL LIMIT 1',
      [clientName.trim()]
    );

    if (exactMatch?.id) {
      return exactMatch.id;
    }

    const fuzzyMatch = databaseService.getOne<{ id: number }>(
      'SELECT id FROM clients WHERE LOWER(name) LIKE LOWER(?) AND deleted_at IS NULL ORDER BY id ASC LIMIT 1',
      [`%${clientName.trim()}%`]
    );

    return fuzzyMatch?.id || null;
  }

  private getClientNameById(clientId?: number): string {
    if (!clientId) {
      return 'Unknown Client';
    }

    const client = databaseService.getOne<{ name: string }>(
      'SELECT name FROM clients WHERE id = ? LIMIT 1',
      [clientId]
    );

    return client?.name || 'Unknown Client';
  }

  private enrichPaymentRows<T extends Payment>(payments: T[]): T[] {
    return payments.map((payment) => ({
      ...payment,
      reference: payment.reference || payment.transaction_id,
      description: payment.description || payment.notes
    }));
  }

  private getPaymentSelectClause(): string {
    return `
      SELECT 
        p.id,
        p.date,
        COALESCE(c.name, 'Unknown Client') AS client_name,
        p.client_id,
        p.invoice_id,
        p.amount,
        p.method,
        p.status,
        p.transaction_id AS reference,
        p.notes AS description,
        p.created_at,
        p.updated_at
      FROM payments p
      LEFT JOIN clients c ON p.client_id = c.id
    `;
  }

  /**
   * Get all payments with filtering and pagination
   */
  async getAllPayments(filters: {
    status?: PaymentStatus;
    method?: PaymentMethod;
    date_from?: string;
    date_to?: string;
  } = {}, options: ServiceOptions = {}): Promise<{
    payments: Payment[];
    pagination: {
      total: number;
      limit: number;
      offset: number;
      hasMore: boolean;
    };
  }> {
    const { limit = 50, offset = 0 } = options;
    const { status, method, date_from, date_to } = filters;
    
    let query = this.getPaymentSelectClause();
    const conditions: string[] = [];
    const params: (string | number | null | boolean)[] = [];
    
    if (status) {
      conditions.push('p.status = ?');
      params.push(status);
    }
    
    if (method) {
      conditions.push('p.method = ?');
      params.push(method);
    }
    
    if (date_from) {
      conditions.push('p.date >= ?');
      params.push(date_from);
    }
    
    if (date_to) {
      conditions.push('p.date <= ?');
      params.push(date_to);
    }
    
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    
    query += ' ORDER BY p.date DESC, p.created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    
    const payments = this.enrichPaymentRows(databaseService.getMany<Payment>(query, params));
    
    // Get total count for pagination
    let countQuery = 'SELECT COUNT(*) as count FROM payments p';
    if (conditions.length > 0) {
      countQuery += ' WHERE ' + conditions.join(' AND ');
    }
    
    const totalResult = databaseService.getOne<{count: number}>(countQuery, params.slice(0, -2));
    const total = totalResult?.count || 0;
    
    return {
      payments,
      pagination: {
        total,
        limit,
        offset,
        hasMore: total > offset + limit
      }
    };
  }

  /**
   * Get payment by ID
   */
  async getPaymentById(id: number): Promise<Payment | null> {
    if (!id || typeof id !== 'number') {
      throw new Error('Valid payment ID is required');
    }

    return databaseService.getOne<Payment>(`
      ${this.getPaymentSelectClause()}
      WHERE p.id = ?
      LIMIT 1
    `, [id]);
  }

  /**
   * Create new payment
   */
  async createPayment(paymentData: {
    date: string;
    client_name?: string;
    client_id?: number;
    invoice_id?: number;
    amount: number;
    method: PaymentMethod;
    reference?: string;
    description?: string;
    status?: PaymentStatus;
  }): Promise<number> {
    if (!paymentData || !paymentData.date || !paymentData.amount || !paymentData.method) {
      throw new Error('Invalid payment data - date, client_name, amount, and method are required');
    }

    // Validate required fields
    if (typeof paymentData.amount !== 'number' || paymentData.amount <= 0) {
      throw new Error('Amount must be a positive number');
    }

    if ((!paymentData.client_name || typeof paymentData.client_name !== 'string') && !paymentData.client_id) {
      throw new Error('Valid client name or client ID is required');
    }

    if (!paymentData.date || typeof paymentData.date !== 'string') {
      throw new Error('Valid payment date is required');
    }

    // Validate date format
    if (!this.isValidDate(paymentData.date)) {
      throw new Error('Invalid date format');
    }

    // Validate invoice exists if invoice_id provided
    if (paymentData.invoice_id && !databaseService.exists('invoices', 'id', paymentData.invoice_id)) {
      throw new Error('Specified invoice does not exist');
    }

    let resolvedClientId: number | null = null;
    if (paymentData.client_id) {
      if (!databaseService.exists('clients', 'id', paymentData.client_id)) {
        throw new Error(`Client ID "${paymentData.client_id}" was not found`);
      }
      resolvedClientId = paymentData.client_id;
    } else {
      resolvedClientId = this.mapClientNameToId(paymentData.client_name);
    }

    if (!resolvedClientId && paymentData.invoice_id) {
      resolvedClientId = this.getInvoiceClientId(paymentData.invoice_id);
    }

    if (!resolvedClientId) {
      if (paymentData.client_name) {
        throw new Error(`Client "${paymentData.client_name}" was not found`);
      }
      throw new Error('Unable to resolve client for payment');
    }

    // Get next payment ID
    const nextId = databaseService.getNextId('payments');
    
    // Prepare payment data
    const now = new Date().toISOString();
    const paymentRecord = {
      id: nextId,
      date: paymentData.date,
      client_id: resolvedClientId,
      invoice_id: paymentData.invoice_id || null,
      amount: paymentData.amount,
      method: paymentData.method,
      transaction_id: paymentData.reference || null,
      notes: paymentData.description || '',
      status: paymentData.status || 'received',
      created_at: now,
      updated_at: now
    };

    // Create payment
    databaseService.executeQuery(`
      INSERT INTO payments (
        id, date, client_id, invoice_id, amount, method, transaction_id, 
        notes, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      paymentRecord.id, paymentRecord.date, paymentRecord.client_id,
      paymentRecord.invoice_id, paymentRecord.amount, paymentRecord.method,
      paymentRecord.transaction_id, paymentRecord.notes, paymentRecord.status,
      paymentRecord.created_at, paymentRecord.updated_at
    ]);

    return nextId;
  }

  /**
   * Update payment
   */
  async updatePayment(id: number, paymentData: Partial<{
    date: string;
    client_name: string;
    client_id: number;
    invoice_id: number;
    amount: number;
    method: PaymentMethod;
    reference: string;
    description: string;
    status: PaymentStatus;
  }>): Promise<number> {
    if (!id || typeof id !== 'number') {
      throw new Error('Valid payment ID is required');
    }

    if (!paymentData || typeof paymentData !== 'object') {
      throw new Error('Payment data is required');
    }

    // Check if payment exists
    const existingPayment = await this.getPaymentById(id);
    if (!existingPayment) {
      throw new Error('Payment not found');
    }

    // Validate amount if provided
    if (paymentData.amount !== undefined && 
        (typeof paymentData.amount !== 'number' || paymentData.amount <= 0)) {
      throw new Error('Amount must be a positive number');
    }

    // Validate date if provided
    if (paymentData.date && !this.isValidDate(paymentData.date)) {
      throw new Error('Invalid date format');
    }

    // Validate invoice exists if invoice_id provided
    if (paymentData.invoice_id && !databaseService.exists('invoices', 'id', paymentData.invoice_id)) {
      throw new Error('Specified invoice does not exist');
    }

    if (paymentData.client_id !== undefined && !databaseService.exists('clients', 'id', paymentData.client_id)) {
      throw new Error(`Client ID "${paymentData.client_id}" was not found`);
    }

    // Filter allowed fields
    const updateData: Record<string, any> = {};
    if (paymentData.date !== undefined) updateData.date = paymentData.date;
    if (paymentData.invoice_id !== undefined) updateData.invoice_id = paymentData.invoice_id;
    if (paymentData.amount !== undefined) updateData.amount = paymentData.amount;
    if (paymentData.method !== undefined) updateData.method = paymentData.method;
    if (paymentData.reference !== undefined) updateData.transaction_id = paymentData.reference;
    if (paymentData.description !== undefined) updateData.notes = paymentData.description;
    if (paymentData.status !== undefined) updateData.status = paymentData.status;

    if (paymentData.client_name !== undefined) {
      const resolvedClientId = this.mapClientNameToId(paymentData.client_name);
      if (!resolvedClientId) {
        throw new Error(`Client "${paymentData.client_name}" was not found`);
      }
      updateData.client_id = resolvedClientId;
    }

    if (paymentData.client_id !== undefined) {
      updateData.client_id = paymentData.client_id;
    }

    if (Object.keys(updateData).length === 0) {
      throw new Error('No valid fields to update');
    }

    const success = databaseService.updateById('payments', id, updateData);
    return success ? 1 : 0;
  }

  /**
   * Delete payment
   */
  async deletePayment(id: number): Promise<number> {
    if (!id || typeof id !== 'number') {
      throw new Error('Valid payment ID is required');
    }

    // Check if payment exists
    const existingPayment = await this.getPaymentById(id);
    if (!existingPayment) {
      throw new Error('Payment not found');
    }

    const success = databaseService.deleteById('payments', id);
    return success ? 1 : 0;
  }

  /**
   * Bulk delete payments
   */
  async bulkDeletePayments(paymentIds: number[]): Promise<number> {
    if (!paymentIds || !Array.isArray(paymentIds) || paymentIds.length === 0) {
      throw new Error('payment_ids must be a non-empty array');
    }

    if (paymentIds.length > 500) {
      throw new Error('Maximum 500 payments can be deleted at once');
    }

    // Validate all IDs are numbers
    paymentIds.forEach(id => {
      if (!id || typeof id !== 'number') {
        throw new Error('All payment IDs must be valid numbers');
      }
    });

    // Validate all payment IDs exist
    const placeholders = paymentIds.map(() => '?').join(',');
    const existingPayments = databaseService.getMany<{id: number}>(
      `SELECT id FROM payments WHERE id IN (${placeholders})`, 
      paymentIds
    );
    
    if (existingPayments.length !== paymentIds.length) {
      throw new Error('One or more payment IDs not found');
    }

    // Delete all payments
    const result = databaseService.executeQuery(
      `DELETE FROM payments WHERE id IN (${placeholders})`, 
      paymentIds
    );

    return result.changes;
  }

  /**
   * Get payment statistics
   */
  async getPaymentStats(filters: {
    year?: string;
    month?: string;
  } = {}): Promise<{
    summary: {
      total_payments: number;
      total_amount: number;
      average_amount: number;
      received_count: number;
      pending_count: number;
      failed_count: number;
      refunded_count: number;
      received_amount: number;
      pending_amount: number;
    };
    methods: Array<{
      method: PaymentMethod;
      count: number;
      total_amount: number;
      average_amount: number;
    }>;
    monthlyTrends: Array<{
      month: string;
      count: number;
      total_amount: number;
    }>;
  }> {
    const { year, month } = filters;
    
    let dateFilter = '';
    const params: (string | number | null | boolean)[] = [];
    
    if (year) {
      if (month) {
        dateFilter = "WHERE strftime('%Y-%m', date) = ?";
        params.push(`${year}-${month.padStart(2, '0')}`);
      } else {
        dateFilter = "WHERE strftime('%Y', date) = ?";
        params.push(year);
      }
    }
    
    const summaryStats = databaseService.getOne<{
      total_payments: number;
      total_amount: number;
      average_amount: number;
      received_count: number;
      pending_count: number;
      failed_count: number;
      refunded_count: number;
      received_amount: number;
      pending_amount: number;
    }>(`
      SELECT 
        COUNT(*) as total_payments,
        SUM(amount) as total_amount,
        AVG(amount) as average_amount,
        COUNT(CASE WHEN status = 'received' THEN 1 END) as received_count,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_count,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_count,
        COUNT(CASE WHEN status = 'refunded' THEN 1 END) as refunded_count,
        SUM(CASE WHEN status = 'received' THEN amount ELSE 0 END) as received_amount,
        SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END) as pending_amount
      FROM payments ${dateFilter}
    `, params);
    
    // Get method breakdown
    const methodStats = databaseService.getMany<{
      method: PaymentMethod;
      count: number;
      total_amount: number;
      average_amount: number;
    }>(`
      SELECT 
        method,
        COUNT(*) as count,
        SUM(amount) as total_amount,
        AVG(amount) as average_amount
      FROM payments ${dateFilter}
      GROUP BY method
      ORDER BY total_amount DESC
    `, params);
    
    // Get monthly trends (last 12 months)
    const monthlyTrends = databaseService.getMany<{
      month: string;
      count: number;
      total_amount: number;
    }>(`
      SELECT 
        strftime('%Y-%m', date) as month,
        COUNT(*) as count,
        SUM(amount) as total_amount
      FROM payments
      WHERE date >= date('now', '-12 months')
      GROUP BY strftime('%Y-%m', date)
      ORDER BY month ASC
    `);

    return {
      summary: summaryStats || {
        total_payments: 0,
        total_amount: 0,
        average_amount: 0,
        received_count: 0,
        pending_count: 0,
        failed_count: 0,
        refunded_count: 0,
        received_amount: 0,
        pending_amount: 0
      },
      methods: methodStats,
      monthlyTrends
    };
  }

  /**
   * Get payments by invoice ID
   */
  async getPaymentsByInvoiceId(invoiceId: number, options: ServiceOptions = {}): Promise<Payment[]> {
    if (!invoiceId || typeof invoiceId !== 'number') {
      throw new Error('Valid invoice ID is required');
    }

    const { limit = 100, offset = 0 } = options;

    return this.enrichPaymentRows(databaseService.getMany<Payment>(`
      ${this.getPaymentSelectClause()}
      WHERE p.invoice_id = ? 
      ORDER BY p.date DESC 
      LIMIT ? OFFSET ?
    `, [invoiceId, limit, offset]));
  }

  /**
   * Get payments by client name
   */
  async getPaymentsByClientName(clientName: string, options: ServiceOptions = {}): Promise<Payment[]> {
    if (!clientName || typeof clientName !== 'string') {
      throw new Error('Valid client name is required');
    }

    const { limit = 100, offset = 0 } = options;

    return this.enrichPaymentRows(databaseService.getMany<Payment>(`
      ${this.getPaymentSelectClause()}
      WHERE LOWER(COALESCE(c.name, '')) LIKE LOWER(?) 
      ORDER BY p.date DESC 
      LIMIT ? OFFSET ?
    `, [`%${clientName}%`, limit, offset]));
  }

  /**
   * Get payments by date range
   */
  async getPaymentsByDateRange(
    startDate: string, 
    endDate: string, 
    options: ServiceOptions = {}
  ): Promise<{
    payments: Payment[];
    summary: {
      count: number;
      total_amount: number;
      average_amount: number;
    };
  }> {
    if (!startDate || !endDate) {
      throw new Error('start_date and end_date are required');
    }

    if (!this.isValidDate(startDate) || !this.isValidDate(endDate)) {
      throw new Error('Invalid date format');
    }

    const { limit = 100, offset = 0 } = options;

    const payments = this.enrichPaymentRows(databaseService.getMany<Payment>(`
      ${this.getPaymentSelectClause()}
      WHERE p.date BETWEEN ? AND ?
      ORDER BY p.date DESC, p.created_at DESC
      LIMIT ? OFFSET ?
    `, [startDate, endDate, limit, offset]));

    const summaryResult = databaseService.getOne<{
      count: number;
      total_amount: number;
      average_amount: number;
    }>(`
      SELECT 
        COUNT(*) as count,
        SUM(amount) as total_amount,
        AVG(amount) as average_amount
      FROM payments p
      WHERE p.date BETWEEN ? AND ?
    `, [startDate, endDate]);

    const summary = summaryResult || {
      count: 0,
      total_amount: 0,
      average_amount: 0
    };

    return {
      payments,
      summary
    };
  }

  /**
   * Get recent payments
   */
  async getRecentPayments(limit: number = 10): Promise<Payment[]> {
    if (typeof limit !== 'number' || limit < 1) {
      limit = 10;
    }

    return this.enrichPaymentRows(databaseService.getMany<Payment>(`
      ${this.getPaymentSelectClause()}
      ORDER BY p.date DESC, p.created_at DESC
      LIMIT ?
    `, [limit]));
  }

  /**
   * Get total payments amount
   */
  async getTotalPaymentsAmount(filters: {
    status?: PaymentStatus;
    method?: PaymentMethod;
    date_from?: string;
    date_to?: string;
  } = {}): Promise<number> {
    const { status, method, date_from, date_to } = filters;
    
    let query = 'SELECT SUM(p.amount) as total FROM payments p';
    const conditions: string[] = [];
    const params: (string | number | null | boolean)[] = [];
    
    if (status) {
      conditions.push('p.status = ?');
      params.push(status);
    }
    
    if (method) {
      conditions.push('p.method = ?');
      params.push(method);
    }
    
    if (date_from) {
      conditions.push('p.date >= ?');
      params.push(date_from);
    }
    
    if (date_to) {
      conditions.push('p.date <= ?');
      params.push(date_to);
    }
    
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    
    const result = databaseService.getOne<{total: number}>(query, params);
    return result?.total || 0;
  }

  /**
   * Update payment status
   */
  async updatePaymentStatus(id: number, status: PaymentStatus): Promise<number> {
    if (!id || typeof id !== 'number') {
      throw new Error('Valid payment ID is required');
    }

    const validStatuses: PaymentStatus[] = ['received', 'pending', 'failed', 'refunded'];
    if (!status || !validStatuses.includes(status)) {
      throw new Error('Invalid status. Must be received, pending, failed, or refunded');
    }

    // Check if payment exists
    const paymentExists = databaseService.exists('payments', 'id', id);
    if (!paymentExists) {
      throw new Error('Payment not found');
    }

    const result = databaseService.executeQuery(`
      UPDATE payments 
      SET status = ?, updated_at = datetime('now')
      WHERE id = ?
    `, [status, id]);

    return result.changes;
  }

  /**
   * Get payment methods statistics
   */
  async getPaymentMethodsStats(): Promise<Array<{
    method: PaymentMethod;
    count: number;
    total_amount: number;
    average_amount: number;
    last_used: string;
  }>> {
    return databaseService.getMany<{
      method: PaymentMethod;
      count: number;
      total_amount: number;
      average_amount: number;
      last_used: string;
    }>(`
      SELECT 
        p.method,
        COUNT(*) as count,
        SUM(p.amount) as total_amount,
        AVG(p.amount) as average_amount,
        MAX(p.date) as last_used
      FROM payments p
      GROUP BY p.method
      ORDER BY count DESC
    `);
  }

  /**
   * Search payments
   */
  async searchPayments(searchTerm: string, options: ServiceOptions = {}): Promise<{
    payments: Payment[];
    pagination: {
      total: number;
      limit: number;
      offset: number;
      hasMore: boolean;
    };
  }> {
    if (!searchTerm || typeof searchTerm !== 'string' || searchTerm.trim().length < 2) {
      return {
        payments: [],
        pagination: {
          total: 0,
          limit: options.limit || 10,
          offset: options.offset || 0,
          hasMore: false
        }
      };
    }

    const { limit = 50, offset = 0 } = options;
    const searchPattern = `%${searchTerm.trim()}%`;

    const payments = this.enrichPaymentRows(databaseService.getMany<Payment>(`
      ${this.getPaymentSelectClause()}
      WHERE (
        COALESCE(p.transaction_id, '') LIKE ? 
        OR COALESCE(p.notes, '') LIKE ? 
        OR COALESCE(c.name, '') LIKE ?
      )
      ORDER BY 
        CASE 
          WHEN p.transaction_id = ? THEN 1
          WHEN c.name = ? THEN 2
          ELSE 3
        END,
        p.date DESC
      LIMIT ? OFFSET ?
    `, [
      searchPattern, searchPattern, searchPattern,
      searchTerm, searchTerm,
      limit, offset
    ]));

    const totalResult = databaseService.getOne<{count: number}>(`
      SELECT COUNT(*) as count 
      FROM payments p
      LEFT JOIN clients c ON p.client_id = c.id
      WHERE COALESCE(p.transaction_id, '') LIKE ? 
        OR COALESCE(p.notes, '') LIKE ? 
        OR COALESCE(c.name, '') LIKE ?
    `, [searchPattern, searchPattern, searchPattern]);

    const total = totalResult?.count || 0;

    return {
      payments,
      pagination: {
        total,
        limit,
        offset,
        hasMore: total > offset + limit
      }
    };
  }

  /**
   * Check if payment exists
   */
  async paymentExists(id: number): Promise<boolean> {
    if (!id || typeof id !== 'number') {
      return false;
    }

    return databaseService.exists('payments', 'id', id);
  }

  /**
   * Validate date format
   */
  private isValidDate(dateString: string): boolean {
    if (!dateString) return false;
    
    // Check for YYYY-MM-DD format
    const date = new Date(dateString);
    return !isNaN(date.getTime()) && /^\d{4}-\d{2}-\d{2}$/.test(dateString);
  }
}

// Export singleton instance
export const paymentService = new PaymentService();
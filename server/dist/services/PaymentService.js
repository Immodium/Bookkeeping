// Payment Service - Domain-specific service for payment operations
// Handles all payment-related business logic and database operations
import { appendFileSync } from 'fs';
import { databaseService } from '../core/DatabaseService.js';
const debugLog = (hypothesisId, location, message, data = {}) => {
    try {
        appendFileSync('/opt/cursor/logs/debug.log', JSON.stringify({ hypothesisId, location, message, data, timestamp: Date.now() }) + '\n');
    }
    catch { }
};
/**
 * Payment Service
 * Manages payment-related operations with proper validation and security
 */
export class PaymentService {
    mapPaymentRow(row) {
        if (!row) {
            return row;
        }
        const mapped = { ...row };
        mapped.client_name = mapped.client_name ?? null;
        mapped.reference = mapped.reference ?? mapped.transaction_id ?? null;
        mapped.description = mapped.description ?? mapped.notes ?? null;
        return mapped;
    }
    mapPaymentRows(rows) {
        return rows.map((row) => this.mapPaymentRow(row));
    }
    /**
     * Get all payments with filtering and pagination
     */
    async getAllPayments(filters = {}, options = {}) {
        const { limit = 50, offset = 0 } = options;
        const { status, method, date_from, date_to } = filters;
        let query = `
      SELECT p.*, c.name as client_name
      FROM payments p
      LEFT JOIN clients c ON c.id = p.client_id
    `;
        const conditions = [];
        const params = [];
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
        query += ' ORDER BY date DESC, created_at DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);
        const payments = this.mapPaymentRows(databaseService.getMany(query, params));
        // Get total count for pagination
        let countQuery = 'SELECT COUNT(*) as count FROM payments p';
        if (conditions.length > 0) {
            countQuery += ' WHERE ' + conditions.join(' AND ');
        }
        const totalResult = databaseService.getOne(countQuery, params.slice(0, -2));
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
    async getPaymentById(id) {
        if (!id || typeof id !== 'number') {
            throw new Error('Valid payment ID is required');
        }
        return this.mapPaymentRow(databaseService.getOne(`
      SELECT p.*, c.name as client_name
      FROM payments p
      LEFT JOIN clients c ON c.id = p.client_id
      WHERE p.id = ?
    `, [id]));
    }
    /**
     * Create new payment
     */
    async createPayment(paymentData) {
        // #region agent log
        debugLog('A', 'PaymentService.js:createPayment:entry', 'createPayment entry', {
            hasPaymentData: !!paymentData,
            date: paymentData?.date ?? null,
            clientName: paymentData?.client_name ?? null,
            clientId: paymentData?.client_id ?? null,
            amountType: typeof paymentData?.amount,
            amountValue: paymentData?.amount ?? null,
            method: paymentData?.method ?? null
        });
        // #endregion
        if (!paymentData || !paymentData.date || !paymentData.amount || !paymentData.method || (!paymentData.client_id && !paymentData.client_name)) {
            throw new Error('Invalid payment data - date, client_id/client_name, amount, and method are required');
        }
        // Validate required fields
        if (typeof paymentData.amount !== 'number' || paymentData.amount <= 0) {
            throw new Error('Amount must be a positive number');
        }
        if (paymentData.client_id !== undefined && paymentData.client_id !== null && (!Number.isInteger(paymentData.client_id) || paymentData.client_id <= 0)) {
            throw new Error('Valid client ID is required');
        }
        if (!paymentData.client_id && (!paymentData.client_name || typeof paymentData.client_name !== 'string')) {
            throw new Error('Valid client name is required');
        }
        if (!paymentData.date || typeof paymentData.date !== 'string') {
            throw new Error('Valid payment date is required');
        }
        // Validate date format
        if (!this.isValidDate(paymentData.date)) {
            throw new Error('Invalid date format');
        }
        // Validate invoice exists if invoice_id provided and resolve client_id
        let resolvedClientId = paymentData.client_id || null;
        if (paymentData.invoice_id) {
            const invoice = databaseService.getOne('SELECT id, client_id FROM invoices WHERE id = ?', [paymentData.invoice_id]);
            if (!invoice) {
                throw new Error('Specified invoice does not exist');
            }
            if (!resolvedClientId) {
                resolvedClientId = invoice.client_id;
            }
        }
        if (!resolvedClientId && paymentData.client_name) {
            const client = databaseService.getOne('SELECT id FROM clients WHERE name = ? LIMIT 1', [String(paymentData.client_name).trim()]);
            if (!client) {
                throw new Error('Valid client ID is required');
            }
            resolvedClientId = client.id;
        }
        if (!resolvedClientId) {
            throw new Error('Valid client ID is required');
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
            transaction_id: paymentData.reference || paymentData.transaction_id || null,
            notes: paymentData.notes || paymentData.description || null,
            status: paymentData.status || 'received',
            created_at: now,
            updated_at: now
        };
        // #region agent log
        debugLog('C', 'PaymentService.js:createPayment:beforeInsert', 'createPayment before insert', {
            id: paymentRecord.id,
            date: paymentRecord.date,
            clientId: paymentRecord.client_id,
            amount: paymentRecord.amount,
            method: paymentRecord.method
        });
        // #endregion
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
        // #region agent log
        debugLog('D', 'PaymentService.js:createPayment:exit', 'createPayment exit', {
            nextId
        });
        // #endregion
        return nextId;
    }
    /**
     * Update payment
     */
    async updatePayment(id, paymentData) {
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
        if (paymentData.client_id !== undefined &&
            (!Number.isInteger(paymentData.client_id) || paymentData.client_id <= 0)) {
            throw new Error('Valid client ID is required');
        }
        // Filter allowed fields
        const allowedFields = [
            'date', 'client_id', 'invoice_id', 'amount', 'method',
            'transaction_id', 'notes', 'status'
        ];
        const updateData = {};
        const mapped = {
            ...paymentData,
            transaction_id: paymentData.transaction_id ?? paymentData.reference,
            notes: paymentData.notes ?? paymentData.description
        };
        allowedFields.forEach(field => {
            if (mapped[field] !== undefined) {
                updateData[field] = mapped[field];
            }
        });
        if (Object.keys(updateData).length === 0) {
            throw new Error('No valid fields to update');
        }
        const success = databaseService.updateById('payments', id, updateData);
        return success ? 1 : 0;
    }
    /**
     * Delete payment
     */
    async deletePayment(id) {
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
    async bulkDeletePayments(paymentIds) {
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
        const existingPayments = databaseService.getMany(`SELECT id FROM payments WHERE id IN (${placeholders})`, paymentIds);
        if (existingPayments.length !== paymentIds.length) {
            throw new Error('One or more payment IDs not found');
        }
        // Delete all payments
        const result = databaseService.executeQuery(`DELETE FROM payments WHERE id IN (${placeholders})`, paymentIds);
        return result.changes;
    }
    /**
     * Get payment statistics
     */
    async getPaymentStats(filters = {}) {
        const { year, month } = filters;
        let dateFilter = '';
        const params = [];
        if (year) {
            if (month) {
                dateFilter = "WHERE strftime('%Y-%m', date) = ?";
                params.push(`${year}-${month.padStart(2, '0')}`);
            }
            else {
                dateFilter = "WHERE strftime('%Y', date) = ?";
                params.push(year);
            }
        }
        const summaryStats = databaseService.getOne(`
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
        const methodStats = databaseService.getMany(`
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
        const monthlyTrends = databaseService.getMany(`
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
    async getPaymentsByInvoiceId(invoiceId, options = {}) {
        if (!invoiceId || typeof invoiceId !== 'number') {
            throw new Error('Valid invoice ID is required');
        }
        const { limit = 100, offset = 0 } = options;
        return this.mapPaymentRows(databaseService.getMany(`
      SELECT p.*, c.name as client_name
      FROM payments p
      LEFT JOIN clients c ON c.id = p.client_id
      WHERE p.invoice_id = ?
      ORDER BY p.date DESC
      LIMIT ? OFFSET ?
    `, [invoiceId, limit, offset]));
    }
    /**
     * Get payments by client name
     */
    async getPaymentsByClientName(clientName, options = {}) {
        if (!clientName || typeof clientName !== 'string') {
            throw new Error('Valid client name is required');
        }
        const { limit = 100, offset = 0 } = options;
        return this.mapPaymentRows(databaseService.getMany(`
      SELECT p.*, c.name as client_name 
      FROM payments p
      LEFT JOIN clients c ON c.id = p.client_id
      WHERE c.name LIKE ? 
      ORDER BY p.date DESC 
      LIMIT ? OFFSET ?
    `, [`%${clientName}%`, limit, offset]));
    }
    /**
     * Get payments by date range
     */
    async getPaymentsByDateRange(startDate, endDate, options = {}) {
        if (!startDate || !endDate) {
            throw new Error('start_date and end_date are required');
        }
        if (!this.isValidDate(startDate) || !this.isValidDate(endDate)) {
            throw new Error('Invalid date format');
        }
        const { limit = 100, offset = 0 } = options;
        const payments = this.mapPaymentRows(databaseService.getMany(`
      SELECT p.*, c.name as client_name
      FROM payments p
      LEFT JOIN clients c ON c.id = p.client_id
      WHERE p.date BETWEEN ? AND ?
      ORDER BY p.date DESC, p.created_at DESC
      LIMIT ? OFFSET ?
    `, [startDate, endDate, limit, offset]));
        const summaryResult = databaseService.getOne(`
      SELECT 
        COUNT(*) as count,
        SUM(amount) as total_amount,
        AVG(amount) as average_amount
      FROM payments
      WHERE date BETWEEN ? AND ?
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
    async getRecentPayments(limit = 10) {
        if (typeof limit !== 'number' || limit < 1) {
            limit = 10;
        }
        return this.mapPaymentRows(databaseService.getMany(`
      SELECT p.*, c.name as client_name
      FROM payments p
      LEFT JOIN clients c ON c.id = p.client_id
      ORDER BY p.date DESC, p.created_at DESC
      LIMIT ?
    `, [limit]));
    }
    /**
     * Get total payments amount
     */
    async getTotalPaymentsAmount(filters = {}) {
        const { status, method, date_from, date_to } = filters;
        let query = 'SELECT SUM(amount) as total FROM payments';
        const conditions = [];
        const params = [];
        if (status) {
            conditions.push('status = ?');
            params.push(status);
        }
        if (method) {
            conditions.push('method = ?');
            params.push(method);
        }
        if (date_from) {
            conditions.push('date >= ?');
            params.push(date_from);
        }
        if (date_to) {
            conditions.push('date <= ?');
            params.push(date_to);
        }
        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }
        const result = databaseService.getOne(query, params);
        return result?.total || 0;
    }
    /**
     * Update payment status
     */
    async updatePaymentStatus(id, status) {
        if (!id || typeof id !== 'number') {
            throw new Error('Valid payment ID is required');
        }
        const validStatuses = ['received', 'pending', 'failed', 'refunded'];
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
    async getPaymentMethodsStats() {
        return databaseService.getMany(`
      SELECT 
        method,
        COUNT(*) as count,
        SUM(amount) as total_amount,
        AVG(amount) as average_amount,
        MAX(date) as last_used
      FROM payments
      GROUP BY method
      ORDER BY count DESC
    `);
    }
    /**
     * Search payments
     */
    async searchPayments(searchTerm, options = {}) {
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
        const payments = this.mapPaymentRows(databaseService.getMany(`
      SELECT p.*, c.name as client_name
      FROM payments p
      LEFT JOIN clients c ON c.id = p.client_id
      WHERE (p.transaction_id LIKE ? OR p.notes LIKE ? OR c.name LIKE ?)
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
        const totalResult = databaseService.getOne(`
      SELECT COUNT(*) as count FROM payments p
      LEFT JOIN clients c ON c.id = p.client_id
      WHERE p.transaction_id LIKE ? OR p.notes LIKE ? OR c.name LIKE ?
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
    async paymentExists(id) {
        if (!id || typeof id !== 'number') {
            return false;
        }
        return databaseService.exists('payments', 'id', id);
    }
    /**
     * Validate date format
     */
    isValidDate(dateString) {
        if (!dateString)
            return false;
        // Check for YYYY-MM-DD format
        const date = new Date(dateString);
        return !isNaN(date.getTime()) && /^\d{4}-\d{2}-\d{2}$/.test(dateString);
    }
}
// Export singleton instance
export const paymentService = new PaymentService();
//# sourceMappingURL=PaymentService.js.map
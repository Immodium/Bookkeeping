// Expense Service - Domain-specific service for expense operations
// Handles all expense-related business logic and database operations

import { databaseService } from '../core/DatabaseService.js';
import { Expense, ServiceOptions } from '../types/index.js';

/**
 * Expense Service
 * Manages expense-related operations with proper validation and security
 */
export class ExpenseService {
  private readonly validStatuses = new Set(['pending', 'approved', 'rejected', 'reimbursed']);

  private normalizeTenantId(tenantId?: number): number {
    if (!tenantId || !Number.isInteger(tenantId) || tenantId <= 0) {
      throw new Error(`Invalid tenant context: tenantId must be a positive integer, got ${tenantId}`);
    }
    return tenantId;
  }

  /**
   * Get all expenses with filtering and pagination
   */
  async getAllExpenses(filters: {
    category?: string | undefined;
    date_from?: string | undefined;
    date_to?: string | undefined;
    is_billable?: boolean | undefined;
    client_id?: number | undefined;
  } = {}, options: ServiceOptions = {}, tenantId?: number): Promise<{
    data: Expense[];
    total: number;
    page: number;
    limit: number;
  }> {
    const { limit = 50, offset = 0 } = options;
    const { category, date_from, date_to, is_billable, client_id } = filters;
    const scopedTenantId = this.normalizeTenantId(tenantId);
    
    let query = 'SELECT * FROM expenses';
    const conditions: string[] = [];
    const params: (string | number | null | boolean)[] = [];
    conditions.push('tenant_id = ?');
    params.push(scopedTenantId);
    
    if (category) {
      conditions.push('category = ?');
      params.push(category);
    }
    
    if (date_from) {
      conditions.push('date >= ?');
      params.push(date_from);
    }
    
    if (date_to) {
      conditions.push('date <= ?');
      params.push(date_to);
    }

    if (typeof is_billable === 'boolean') {
      conditions.push('is_billable = ?');
      params.push(is_billable ? 1 : 0);
    }

    if (client_id) {
      conditions.push('client_id = ?');
      params.push(client_id);
    }
    
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    
    query += ' ORDER BY date DESC, created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    
    const expenses = await databaseService.getMany<Expense>(query, params);
    
    // Get total count for pagination
    let countQuery = 'SELECT COUNT(*) as total FROM expenses';
    if (conditions.length > 0) {
      countQuery += ' WHERE ' + conditions.join(' AND ');
    }
    
    const totalResult = await databaseService.getOne<{total: number}>(
      countQuery, 
      params.slice(0, -2) // Remove limit and offset for count
    );
    
    const total = totalResult?.total || 0;
    
    return {
      data: expenses,
      total,
      page: Math.floor(offset / limit) + 1,
      limit
    };
  }

  /**
   * Get expense by ID
   */
  async getExpenseById(id: number, tenantId?: number): Promise<Expense | null> {
    if (!id || typeof id !== 'number') {
      throw new Error('Valid expense ID is required');
    }

    const scopedTenantId = this.normalizeTenantId(tenantId);
    return await databaseService.getOne<Expense>(
      'SELECT * FROM expenses WHERE id = ? AND tenant_id = ?',
      [id, scopedTenantId]
    );
  }

  /**
   * Create new expense
   */
  async createExpense(expenseData: {
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
    status?: string;
  }, tenantId?: number): Promise<number> {
    const scopedTenantId = this.normalizeTenantId(tenantId);
    if (!expenseData) {
      throw new Error('Expense data is required');
    }

    // Validate required fields
    if (!expenseData.amount || typeof expenseData.amount !== 'number' || expenseData.amount <= 0) {
      throw new Error('Valid expense amount is required');
    }

    if (!expenseData.description || typeof expenseData.description !== 'string') {
      throw new Error('Expense description is required');
    }

    if (!expenseData.date || typeof expenseData.date !== 'string') {
      throw new Error('Expense date is required');
    }

    // Validate date format
    if (!this.isValidDate(expenseData.date)) {
      throw new Error('Invalid date format');
    }

    // Validate client exists if client_id provided
    if (expenseData.client_id && !(await this.clientExists(expenseData.client_id, scopedTenantId))) {
      throw new Error('Specified client does not exist');
    }

    const normalizedStatus = (expenseData.status || 'pending').toLowerCase();
    if (!this.validStatuses.has(normalizedStatus)) {
      throw new Error('Invalid expense status');
    }

    // Get next expense ID
    const nextId = await databaseService.getNextId('expenses');
    
    // Prepare expense data
    const now = new Date().toISOString();
    const expenseRecord = {
      id: nextId,
      tenant_id: scopedTenantId,
      amount: expenseData.amount,
      description: expenseData.description,
      category: expenseData.category || null,
      date: expenseData.date,
      vendor: expenseData.vendor || null,
      notes: expenseData.notes || null,
      receipt_url: expenseData.receipt_url || null,
      is_billable: expenseData.is_billable ? 1 : 0,
      client_id: expenseData.client_id || null,
      project: expenseData.project || null,
      status: normalizedStatus,
      created_at: now,
      updated_at: now
    };

    // Create expense
    await databaseService.executeQuery(`
      INSERT INTO expenses (
        id, tenant_id, amount, description, category, date, vendor, notes, receipt_url,
        is_billable, client_id, project, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      expenseRecord.id, expenseRecord.tenant_id, expenseRecord.amount, expenseRecord.description, 
      expenseRecord.category, expenseRecord.date, expenseRecord.vendor,
      expenseRecord.notes, expenseRecord.receipt_url, expenseRecord.is_billable,
      expenseRecord.client_id, expenseRecord.project, expenseRecord.status, expenseRecord.created_at,
      expenseRecord.updated_at
    ]);

    return nextId;
  }

  /**
   * Update expense
   */
  async updateExpense(id: number, expenseData: Partial<{
    amount: number;
    description: string;
    category: string;
    date: string;
    vendor: string;
    notes: string;
    receipt_url: string;
    is_billable: boolean;
    client_id: number;
    project: string;
    status: string;
  }>, tenantId?: number): Promise<number> {
    const scopedTenantId = this.normalizeTenantId(tenantId);
    if (!id || typeof id !== 'number') {
      throw new Error('Valid expense ID is required');
    }

    if (!expenseData || typeof expenseData !== 'object') {
      throw new Error('Expense data is required');
    }

    // Check if expense exists
    const existingExpense = await this.getExpenseById(id, scopedTenantId);
    if (!existingExpense) {
      throw new Error('Expense not found');
    }

    // Validate amount if provided
    if (expenseData.amount !== undefined && 
        (typeof expenseData.amount !== 'number' || expenseData.amount <= 0)) {
      throw new Error('Valid expense amount is required');
    }

    // Validate date if provided
    if (expenseData.date && !this.isValidDate(expenseData.date)) {
      throw new Error('Invalid date format');
    }

    // Validate client exists if client_id provided
    if (expenseData.client_id && !(await this.clientExists(expenseData.client_id, scopedTenantId))) {
      throw new Error('Specified client does not exist');
    }

    if (expenseData.status !== undefined) {
      const normalizedStatus = expenseData.status.toLowerCase();
      if (!this.validStatuses.has(normalizedStatus)) {
        throw new Error('Invalid expense status');
      }
      expenseData.status = normalizedStatus;
    }

    // Filter allowed fields
    const allowedFields = [
      'amount', 'description', 'category', 'date', 'vendor', 'notes',
      'receipt_url', 'is_billable', 'client_id', 'project', 'status'
    ];
    
    const updateData: Record<string, any> = {};
    allowedFields.forEach(field => {
      if (expenseData[field as keyof typeof expenseData] !== undefined) {
        let value = expenseData[field as keyof typeof expenseData];
        
        // Handle boolean conversion for is_billable
        if (field === 'is_billable' && typeof value === 'boolean') {
          value = value ? 1 : 0;
        }
        
        updateData[field] = value;
      }
    });

    if (Object.keys(updateData).length === 0) {
      throw new Error('No valid fields to update');
    }

    const keys = Object.keys(updateData);
    const values = Object.values(updateData);
    const setClause = keys.map((key) => `${key} = ?`).join(', ');
    const result = await databaseService.executeQuery(
      `UPDATE expenses SET ${setClause}, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?`,
      [...values, id, scopedTenantId]
    );
    return result.changes;
  }

  /**
   * Delete expense
   */
  async deleteExpense(id: number, tenantId?: number): Promise<number> {
    const scopedTenantId = this.normalizeTenantId(tenantId);
    if (!id || typeof id !== 'number') {
      throw new Error('Valid expense ID is required');
    }

    // Check if expense exists
    const existingExpense = await this.getExpenseById(id, scopedTenantId);
    if (!existingExpense) {
      throw new Error('Expense not found');
    }

    const result = await databaseService.executeQuery(
      'DELETE FROM expenses WHERE id = ? AND tenant_id = ?',
      [id, scopedTenantId]
    );
    return result.changes;
  }

  /**
   * Get expenses by category
   */
  async getExpensesByCategory(category: string, options: ServiceOptions = {}, tenantId?: number): Promise<Expense[]> {
    if (!category || typeof category !== 'string') {
      throw new Error('Valid category is required');
    }

    const scopedTenantId = this.normalizeTenantId(tenantId);
    const { limit = 100, offset = 0 } = options;

    return await databaseService.getMany<Expense>(`
      SELECT * FROM expenses 
      WHERE tenant_id = ? AND category = ?
      ORDER BY date DESC
      LIMIT ? OFFSET ?
    `, [scopedTenantId, category, limit, offset]);
  }

  /**
   * Get billable expenses
   */
  async getBillableExpenses(clientId?: number, options: ServiceOptions = {}, tenantId?: number): Promise<Expense[]> {
    const { limit = 100, offset = 0 } = options;
    const scopedTenantId = this.normalizeTenantId(tenantId);
    
    let query = 'SELECT * FROM expenses WHERE tenant_id = ? AND is_billable = 1';
    const params: (string | number | null | boolean)[] = [scopedTenantId];

    if (clientId) {
      query += ' AND client_id = ?';
      params.push(clientId);
    }

    query += ' ORDER BY date DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    return await databaseService.getMany<Expense>(query, params);
  }

  /**
   * Get expenses by date range
   */
  async getExpensesByDateRange(
    startDate: string, 
    endDate: string, 
    options: ServiceOptions = {},
    tenantId?: number
  ): Promise<Expense[]> {
    if (!startDate || !endDate) {
      throw new Error('Start date and end date are required');
    }

    const { limit = 100, offset = 0 } = options;
    const scopedTenantId = this.normalizeTenantId(tenantId);

    return await databaseService.getMany<Expense>(`
      SELECT * FROM expenses 
      WHERE tenant_id = ? AND date >= ? AND date <= ?
      ORDER BY date DESC
      LIMIT ? OFFSET ?
    `, [scopedTenantId, startDate, endDate, limit, offset]);
  }

  /**
   * Get expense categories
   */
  async getExpenseCategories(tenantId?: number): Promise<Array<{category: string; count: number; total: number}>> {
    const scopedTenantId = this.normalizeTenantId(tenantId);
    return await databaseService.getMany<{category: string; count: number; total: number}>(`
      SELECT 
        category,
        COUNT(*) as count,
        SUM(amount) as total
      FROM expenses 
      WHERE tenant_id = ? AND category IS NOT NULL
      GROUP BY category
      ORDER BY total DESC
    `, [scopedTenantId]);
  }

  /**
   * Get expense statistics
   */
  async getExpenseStats(filters: {
    date_from?: string;
    date_to?: string;
  } = {}, tenantId?: number): Promise<{
    total: number;
    totalAmount: number;
    billableAmount: number;
    nonBillableAmount: number;
    byCategory: Record<string, {count: number; amount: number}>;
    monthlyTrend: Array<{month: string; count: number; amount: number}>;
  }> {
    const { date_from, date_to } = filters;
    const scopedTenantId = this.normalizeTenantId(tenantId);
    const conditions: string[] = ['tenant_id = ?'];
    const params: (string | number | null | boolean)[] = [scopedTenantId];

    if (date_from) {
      conditions.push('date >= ?');
      params.push(date_from);
    }

    if (date_to) {
      conditions.push('date <= ?');
      params.push(date_to);
    }

    const baseCondition = ` WHERE ${conditions.join(' AND ')}`;

    // Get basic stats
    const basicStats = await databaseService.getOne<{
      total: number;
      totalAmount: number;
      billableAmount: number;
      nonBillableAmount: number;
    }>(`
      SELECT 
        COUNT(*) as total,
        SUM(amount) as totalAmount,
        SUM(CASE WHEN is_billable = 1 THEN amount ELSE 0 END) as billableAmount,
        SUM(CASE WHEN is_billable = 0 THEN amount ELSE 0 END) as nonBillableAmount
      FROM expenses${baseCondition}
    `, params);

    // Get category breakdown
    const categoryData = await databaseService.getMany<{category: string; count: number; amount: number}>(`
      SELECT 
        category,
        COUNT(*) as count,
        SUM(amount) as amount
      FROM expenses${baseCondition}
      AND category IS NOT NULL
      GROUP BY category
      ORDER BY amount DESC
    `, params);

    const byCategory: Record<string, {count: number; amount: number}> = {};
    categoryData.forEach(row => {
      if (row.category) {
        byCategory[row.category] = {
          count: row.count,
          amount: row.amount
        };
      }
    });

    // Get monthly trend (last 12 months)
    const monthlyTrend = await databaseService.getMany<{month: string; count: number; amount: number}>(`
      SELECT 
        strftime('%Y-%m', date) as month,
        COUNT(*) as count,
        SUM(amount) as amount
      FROM expenses 
      ${baseCondition}
      AND date >= date('now', '-12 months')
      GROUP BY strftime('%Y-%m', date)
      ORDER BY month DESC
      LIMIT 12
    `, params);

    return {
      total: basicStats?.total || 0,
      totalAmount: basicStats?.totalAmount || 0,
      billableAmount: basicStats?.billableAmount || 0,
      nonBillableAmount: basicStats?.nonBillableAmount || 0,
      byCategory,
      monthlyTrend
    };
  }

  /**
   * Search expenses
   */
  async searchExpenses(searchTerm: string, options: ServiceOptions = {}, tenantId?: number): Promise<Expense[]> {
    if (!searchTerm || typeof searchTerm !== 'string') {
      return [];
    }

    const { limit = 50, offset = 0 } = options;
    const scopedTenantId = this.normalizeTenantId(tenantId);
    const searchPattern = `%${searchTerm}%`;

    return await databaseService.getMany<Expense>(`
      SELECT * FROM expenses
      WHERE tenant_id = ? AND (description LIKE ? OR vendor LIKE ? OR notes LIKE ? OR category LIKE ?)
      ORDER BY 
        CASE 
          WHEN description = ? THEN 1
          WHEN vendor = ? THEN 2
          ELSE 3
        END,
        date DESC
      LIMIT ? OFFSET ?
    `, [
      scopedTenantId, searchPattern, searchPattern, searchPattern, searchPattern,
      searchTerm, searchTerm,
      limit, offset
    ]);
  }

  /**
   * Check if expense exists
   */
  async expenseExists(id: number, tenantId?: number): Promise<boolean> {
    if (!id || typeof id !== 'number') {
      return false;
    }
    const scopedTenantId = this.normalizeTenantId(tenantId);
    return Boolean(await databaseService.getOne<{ id: number }>(
      'SELECT id FROM expenses WHERE id = ? AND tenant_id = ?',
      [id, scopedTenantId]
    ));
  }

  /**
   * Check if client exists (helper method)
   */
  private async clientExists(clientId: number, tenantId: number): Promise<boolean> {
    if (!clientId || typeof clientId !== 'number') {
      return false;
    }
    return Boolean(await databaseService.getOne<{ id: number }>(
      'SELECT id FROM clients WHERE id = ? AND tenant_id = ?',
      [clientId, tenantId]
    ));
  }

  /**
   * Validate date format
   */
  private isValidDate(dateString: string): boolean {
    if (!dateString) return false;
    
    // Check for YYYY-MM-DD format
    const date = new Date(dateString);

    if (isNaN(date.getTime())) {
      return false;
    }

    const result = dateString.match(/^\d{4}-\d{2}-\d{2}$/);

    return Boolean(result);
  }
}

// Export singleton instance
export const expenseService = new ExpenseService();
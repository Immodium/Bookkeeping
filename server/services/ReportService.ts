// Report Service - Domain-specific service for report management operations
// Handles all report-related business logic and database operations

import { databaseService } from '../core/DatabaseService.js';

export interface ReportData {
  name: string;
  type: string;
  date_range_start?: string;
  date_range_end?: string;
  data?: any;
}

export type ReportScheduleFrequency = 'daily' | 'weekly' | 'monthly' | 'quarterly';

export interface ReportScheduleData {
  name: string;
  report_type: string;
  frequency: ReportScheduleFrequency;
  start_date: string;
  time_of_day: string;
  timezone?: string;
  date_range_start?: string;
  date_range_end?: string;
  config?: Record<string, unknown>;
  is_active?: boolean;
}

export interface DatabaseReport {
  id: number;
  name: string;
  type: string;
  date_range_start: string;
  date_range_end: string;
  data: string | null;
  created_at: string;
}

export interface DatabaseReportSchedule {
  id: number;
  name: string;
  report_type: string;
  frequency: ReportScheduleFrequency;
  start_date: string;
  time_of_day: string;
  timezone: string;
  date_range_start: string | null;
  date_range_end: string | null;
  config: string | null;
  is_active: number;
  last_run_at: string | null;
  next_run_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReportSchedule extends Omit<DatabaseReportSchedule, 'config'> {
  config: Record<string, unknown> | null;
}

/**
 * Report Management Service
 * Handles report lifecycle management, data processing, and CRUD operations
 */
export class ReportService {
  private readonly tableColumnCache = new Map<string, Set<string>>();

  // Default and hard cap on rows returned by list queries, so an unbounded
  // history of saved reports/schedules can't be loaded into memory at once.
  static readonly MAX_LIST_LIMIT = 500;

  static clampListLimit(limit: number): number {
    if (!Number.isInteger(limit) || limit <= 0) {
      return ReportService.MAX_LIST_LIMIT;
    }
    return Math.min(limit, ReportService.MAX_LIST_LIMIT);
  }

  private normalizeTenantId(tenantId?: number): number {
    if (!tenantId || !Number.isInteger(tenantId) || tenantId <= 0) {
      throw new Error(`Invalid tenant context: tenantId must be a positive integer, got ${tenantId}`);
    }
    return tenantId;
  }

  private static readonly ALLOWED_TABLES = new Set([
    'invoices', 'clients', 'expenses', 'payments', 'retainers',
    'users', 'report_schedules', 'settings', 'counters',
  ]);

  private async getTableColumns(tableName: string): Promise<Set<string>> {
    if (!ReportService.ALLOWED_TABLES.has(tableName)) {
      throw new Error(`Table '${tableName}' is not allowed for schema inspection`);
    }
    const cached = this.tableColumnCache.get(tableName);
    if (cached) {
      return cached;
    }

    const rows = await databaseService.getMany<{ column_name: string }>(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
    `, [tableName]);
    const columns = new Set(rows.map((row) => row.column_name));
    this.tableColumnCache.set(tableName, columns);
    return columns;
  }

  private async tableHasColumn(tableName: string, columnName: string): Promise<boolean> {
    return (await this.getTableColumns(tableName)).has(columnName);
  }

  private normalizeScheduleFrequency(frequency: string): ReportScheduleFrequency {
    const normalized = String(frequency || '').trim().toLowerCase();
    if (normalized === 'daily' || normalized === 'weekly' || normalized === 'monthly' || normalized === 'quarterly') {
      return normalized;
    }
    throw new Error('Invalid schedule frequency');
  }

  private normalizeReportType(type: string): string {
    const normalized = String(type || '').trim();
    const validTypes = new Set(['profit-loss', 'expense', 'invoice', 'client']);
    if (!validTypes.has(normalized)) {
      throw new Error('Invalid report type');
    }
    return normalized;
  }

  private calculateNextRunAt(
    frequency: ReportScheduleFrequency,
    startDate: string,
    timeOfDay: string
  ): string {
    const [hours, minutes] = timeOfDay.split(':').map((value) => Number(value));
    if (!Number.isInteger(hours) || !Number.isInteger(minutes)) {
      throw new Error('Invalid schedule time');
    }

    const runAt = new Date(`${startDate}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`);
    if (Number.isNaN(runAt.getTime())) {
      throw new Error('Invalid schedule start date');
    }

    const now = new Date();
    while (runAt <= now) {
      switch (frequency) {
        case 'daily':
          runAt.setDate(runAt.getDate() + 1);
          break;
        case 'weekly':
          runAt.setDate(runAt.getDate() + 7);
          break;
        case 'monthly':
          runAt.setMonth(runAt.getMonth() + 1);
          break;
        case 'quarterly':
          runAt.setMonth(runAt.getMonth() + 3);
          break;
      }
    }

    return runAt.toISOString();
  }

  /**
   * Get all reports ordered by creation date
   */
  async getAllReports(tenantId?: number, limit = ReportService.MAX_LIST_LIMIT): Promise<DatabaseReport[]> {
    const scopedTenantId = this.normalizeTenantId(tenantId);
    const safeLimit = ReportService.clampListLimit(limit);
    return await databaseService.getMany<DatabaseReport>(`
      SELECT id, name, type, date_range_start, date_range_end, data, created_at
      FROM reports
      WHERE tenant_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `, [scopedTenantId, safeLimit]);
  }

  /**
   * Get report by ID with parsed data field
   */
  async getReportById(id: number, tenantId?: number): Promise<DatabaseReport | null> {
    if (!id || typeof id !== 'number') {
      throw new Error('Valid report ID is required');
    }

    const scopedTenantId = this.normalizeTenantId(tenantId);
    const report = await databaseService.getOne<DatabaseReport>(`
      SELECT id, name, type, date_range_start, date_range_end, data, created_at
      FROM reports
      WHERE id = ? AND tenant_id = ?
    `, [id, scopedTenantId]);

    if (!report) {
      return null;
    }

    // Parse JSON data field if it exists
    const parsedReport: any = { ...report };
    if (report.data) {
      try {
        parsedReport.data = JSON.parse(report.data);
      } catch (e) {
        console.warn('Failed to parse report data:', e);
        // Keep original data if parsing fails
      }
    }

    return parsedReport;
  }

  /**
   * Create new report
   */
  async createReport(reportData: ReportData, tenantId?: number): Promise<{ id: number; changes: number }> {
    if (!reportData || !reportData.name || !reportData.type) {
      throw new Error('Report name and type are required');
    }

    // Get next ID from counter service
    const nextId = await databaseService.getNextId('reports');
    const now = new Date().toISOString();

    const scopedTenantId = this.normalizeTenantId(tenantId);
    const result = await databaseService.executeQuery(`
      INSERT INTO reports (id, tenant_id, name, type, date_range_start, date_range_end, data, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      nextId,
      scopedTenantId,
      reportData.name,
      reportData.type,
      reportData.date_range_start || '',
      reportData.date_range_end || '',
      reportData.data ? JSON.stringify(reportData.data) : null,
      now
    ]);

    return {
      id: nextId,
      changes: result.changes
    };
  }

  /**
   * Update existing report
   */
  async updateReport(id: number, reportData: ReportData, tenantId?: number): Promise<{ id: number; changes: number }> {
    if (!id || typeof id !== 'number') {
      throw new Error('Valid report ID is required');
    }

    if (!reportData) {
      throw new Error('Report data is required');
    }

    const scopedTenantId = this.normalizeTenantId(tenantId);
    const result = await databaseService.executeQuery(`
      UPDATE reports
      SET name = ?, type = ?, date_range_start = ?, date_range_end = ?, data = ?
      WHERE id = ? AND tenant_id = ?
    `, [
      reportData.name,
      reportData.type,
      reportData.date_range_start || '',
      reportData.date_range_end || '',
      reportData.data ? JSON.stringify(reportData.data) : null,
      id,
      scopedTenantId
    ]);

    if (result.changes === 0) {
      throw new Error('Report not found');
    }

    return {
      id: id,
      changes: result.changes
    };
  }

  async createReportSchedule(scheduleData: ReportScheduleData, tenantId?: number): Promise<{ id: number; changes: number }> {
    if (!scheduleData || !scheduleData.name || !scheduleData.report_type) {
      throw new Error('Schedule name and report type are required');
    }

    const reportType = this.normalizeReportType(scheduleData.report_type);
    const frequency = this.normalizeScheduleFrequency(scheduleData.frequency);
    const timezone = scheduleData.timezone || 'UTC';
    const timeOfDay = scheduleData.time_of_day || '09:00';
    const nextRunAt = this.calculateNextRunAt(frequency, scheduleData.start_date, timeOfDay);

    const scopedTenantId = this.normalizeTenantId(tenantId);
    const hasTenantColumn = await this.tableHasColumn('report_schedules', 'tenant_id');
    const result = await databaseService.executeQuery(
      hasTenantColumn
        ? `
        INSERT INTO report_schedules (
          tenant_id,
          name,
          report_type,
          frequency,
          start_date,
          time_of_day,
          timezone,
          date_range_start,
          date_range_end,
          config,
          is_active,
          next_run_at,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
      `
        : `
        INSERT INTO report_schedules (
          name,
          report_type,
          frequency,
          start_date,
          time_of_day,
          timezone,
          date_range_start,
          date_range_end,
          config,
          is_active,
          next_run_at,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
      `,
      hasTenantColumn
        ? [
        scopedTenantId,
        scheduleData.name,
        reportType,
        frequency,
        scheduleData.start_date,
        timeOfDay,
        timezone,
        scheduleData.date_range_start || null,
        scheduleData.date_range_end || null,
        scheduleData.config ? JSON.stringify(scheduleData.config) : null,
        scheduleData.is_active === false ? 0 : 1,
        nextRunAt
      ]
        : [
        scheduleData.name,
        reportType,
        frequency,
        scheduleData.start_date,
        timeOfDay,
        timezone,
        scheduleData.date_range_start || null,
        scheduleData.date_range_end || null,
        scheduleData.config ? JSON.stringify(scheduleData.config) : null,
        scheduleData.is_active === false ? 0 : 1,
        nextRunAt
      ]
    );

    return {
      id: result.lastInsertRowid,
      changes: result.changes
    };
  }

  async getReportSchedules(reportType?: string, tenantId?: number): Promise<ReportSchedule[]> {
    const params: unknown[] = [];
    const hasTenantColumn = await this.tableHasColumn('report_schedules', 'tenant_id');
    const scopedTenantId = this.normalizeTenantId(tenantId);
    const whereClauses: string[] = [];
    if (hasTenantColumn) {
      whereClauses.push('tenant_id = ?');
      params.push(scopedTenantId);
    }
    if (reportType) {
      whereClauses.push('report_type = ?');
      params.push(this.normalizeReportType(reportType));
    }
    const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const schedules = await databaseService.getMany<DatabaseReportSchedule>(
      `
        SELECT
          id,
          name,
          report_type,
          frequency,
          start_date,
          time_of_day,
          timezone,
          date_range_start,
          date_range_end,
          config,
          is_active,
          last_run_at,
          next_run_at,
          created_at,
          updated_at
        FROM report_schedules
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT ${ReportService.MAX_LIST_LIMIT}
      `,
      params
    );

    return schedules.map((schedule) => {
      if (!schedule.config) {
        return { ...schedule, config: null };
      }
      try {
        return {
          ...schedule,
          config: JSON.parse(schedule.config) as Record<string, unknown>
        };
      } catch {
        return { ...schedule, config: null };
      }
    });
  }

  async deleteReportSchedule(id: number, tenantId?: number): Promise<{ id: number; changes: number }> {
    if (!id || typeof id !== 'number') {
      throw new Error('Valid schedule ID is required');
    }

    const hasTenantColumn = await this.tableHasColumn('report_schedules', 'tenant_id');
    const scopedTenantId = this.normalizeTenantId(tenantId);
    const result = await databaseService.executeQuery(
      hasTenantColumn
        ? 'DELETE FROM report_schedules WHERE id = ? AND tenant_id = ?'
        : 'DELETE FROM report_schedules WHERE id = ?',
      hasTenantColumn ? [id, scopedTenantId] : [id]
    );

    if (result.changes === 0) {
      throw new Error('Report schedule not found');
    }

    return {
      id,
      changes: result.changes
    };
  }

  /**
   * Delete report by ID
   */
  async deleteReport(id: number, tenantId?: number): Promise<{ id: number; changes: number }> {
    if (!id || typeof id !== 'number') {
      throw new Error('Valid report ID is required');
    }

    const scopedTenantId = this.normalizeTenantId(tenantId);
    const result = await databaseService.executeQuery('DELETE FROM reports WHERE id = ? AND tenant_id = ?', [id, scopedTenantId]);

    if (result.changes === 0) {
      throw new Error('Report not found');
    }

    return {
      id: id,
      changes: result.changes
    };
  }

  /**
   * Check if report exists
   */
  async reportExists(id: number, tenantId?: number): Promise<boolean> {
    if (!id || typeof id !== 'number') {
      return false;
    }
    const scopedTenantId = this.normalizeTenantId(tenantId);
    const report = await databaseService.getOne<{ id: number }>('SELECT id FROM reports WHERE id = ? AND tenant_id = ?', [id, scopedTenantId]);
    return Boolean(report);
  }

  /**
   * Get reports by type
   */
  async getReportsByType(type: string, tenantId?: number): Promise<DatabaseReport[]> {
    if (!type || typeof type !== 'string') {
      throw new Error('Valid report type is required');
    }

    const scopedTenantId = this.normalizeTenantId(tenantId);
    return await databaseService.getMany<DatabaseReport>(`
      SELECT id, name, type, date_range_start, date_range_end, data, created_at
      FROM reports
      WHERE tenant_id = ? AND type = ?
      ORDER BY created_at DESC
    `, [scopedTenantId, type]);
  }

  /**
   * Get reports within date range
   */
  async getReportsByDateRange(startDate: string, endDate: string, tenantId?: number): Promise<DatabaseReport[]> {
    if (!startDate || !endDate) {
      throw new Error('Valid date range is required');
    }

    const scopedTenantId = this.normalizeTenantId(tenantId);
    return await databaseService.getMany<DatabaseReport>(`
      SELECT id, name, type, date_range_start, date_range_end, data, created_at
      FROM reports
      WHERE tenant_id = ? AND created_at >= ? AND created_at <= ?
      ORDER BY created_at DESC
    `, [scopedTenantId, startDate, endDate]);
  }

  /**
   * Get report count
   */
  async getReportCount(tenantId?: number): Promise<number> {
    const scopedTenantId = this.normalizeTenantId(tenantId);
    const result = await databaseService.getOne<{count: number}>(
      'SELECT COUNT(*) as count FROM reports WHERE tenant_id = ?',
      [scopedTenantId]
    );
    return result?.count || 0;
  }

  /**
   * Get report count by type
   */
  async getReportCountByType(type: string, tenantId?: number): Promise<number> {
    if (!type || typeof type !== 'string') {
      throw new Error('Valid report type is required');
    }

    const scopedTenantId = this.normalizeTenantId(tenantId);
    const result = await databaseService.getOne<{count: number}>(
      'SELECT COUNT(*) as count FROM reports WHERE tenant_id = ? AND type = ?',
      [scopedTenantId, type]
    );
    return result?.count || 0;
  }

  /**
   * Generate Profit & Loss Report Data
   */
  async generateProfitLossData(
    startDate: string,
    endDate: string,
    accountingMethod: 'cash' | 'accrual' = 'accrual',
    preset?: string,
    breakdownPeriod: 'monthly' | 'quarterly' = 'quarterly',
    tenantId?: number
  ): Promise<any> {
    const scopedTenantId = this.normalizeTenantId(tenantId);
    const invoicesWhere = ['i.tenant_id = ?', 'i.created_at >= ?', 'i.created_at <= ?'];
    if (await this.tableHasColumn('invoices', 'deleted_at')) {
      invoicesWhere.push('i.deleted_at IS NULL');
    }

    const expensesWhere = ['tenant_id = ?', 'date >= ?', 'date <= ?'];
    if (await this.tableHasColumn('expenses', 'deleted_at')) {
      expensesWhere.push('deleted_at IS NULL');
    }

    // Get invoices in date range
    const invoices = await databaseService.getMany<any>(`
      SELECT i.*, c.name as client_name
      FROM invoices i
      LEFT JOIN clients c ON i.client_id = c.id
      WHERE ${invoicesWhere.join(' AND ')}
      ORDER BY i.created_at DESC
    `, [scopedTenantId, startDate, endDate + 'T23:59:59.999Z']);

    // Get expenses in date range
    const expenses = await databaseService.getMany<any>(`
      SELECT *
      FROM expenses
      WHERE ${expensesWhere.join(' AND ')}
      ORDER BY date DESC
    `, [scopedTenantId, startDate, endDate]);

    const toNumber = (value: unknown): number => {
      if (value === null || value === undefined) return 0;
      const num = typeof value === 'string' ? parseFloat(value) : Number(value);
      return isNaN(num) ? 0 : num;
    };

    // Calculate revenue
    const totalInvoiceRevenue = invoices.reduce((sum: number, inv: any) => sum + toNumber(inv.amount), 0);
    const paidRevenue = invoices
      .filter((inv: any) => inv.status === 'paid')
      .reduce((sum: number, inv: any) => sum + toNumber(inv.amount), 0);
    const pendingRevenue = invoices
      .filter((inv: any) => inv.status !== 'paid')
      .reduce((sum: number, inv: any) => sum + toNumber(inv.amount), 0);

    const recognizedRevenue = accountingMethod === 'cash' ? paidRevenue : totalInvoiceRevenue;

    // Calculate expenses
    const totalExpenses = expenses.reduce((sum: number, exp: any) => sum + toNumber(exp.amount), 0);
    const expensesByCategory = expenses.reduce((acc: Record<string, number>, exp: any) => {
      const category = exp.category || 'Uncategorized';
      acc[category] = (acc[category] || 0) + toNumber(exp.amount);
      return acc;
    }, {});

    const netProfit = recognizedRevenue - totalExpenses;

    return {
      revenue: {
        total: recognizedRevenue,
        paid: paidRevenue,
        pending: pendingRevenue,
        invoices: recognizedRevenue,
        otherIncome: 0
      },
      expenses: {
        total: totalExpenses,
        ...expensesByCategory
      },
      profit: {
        net: netProfit,
        gross: netProfit,
        margin: recognizedRevenue > 0 ? (netProfit / recognizedRevenue) * 100 : 0
      },
      netIncome: netProfit,
      accountingMethod,
      invoices,
      periodColumns: [],
      hasBreakdown: false,
      breakdownPeriod
    };
  }

  /**
   * Generate Expense Report Data
   */
  async generateExpenseData(startDate: string, endDate: string, tenantId?: number): Promise<any> {
    const scopedTenantId = this.normalizeTenantId(tenantId);
    const expensesWhere = ['tenant_id = ?', 'date >= ?', 'date <= ?'];
    if (await this.tableHasColumn('expenses', 'deleted_at')) {
      expensesWhere.push('deleted_at IS NULL');
    }

    const expenses = await databaseService.getMany<any>(`
      SELECT *
      FROM expenses
      WHERE ${expensesWhere.join(' AND ')}
      ORDER BY date DESC
    `, [scopedTenantId, startDate, endDate]);

    const toNumber = (value: unknown): number => {
      if (value === null || value === undefined) return 0;
      const num = typeof value === 'string' ? parseFloat(value) : Number(value);
      return isNaN(num) ? 0 : num;
    };

    const expensesByCategory = expenses.reduce((acc: any, exp: any) => {
      const category = exp.category || 'Uncategorized';
      acc[category] = (acc[category] || 0) + toNumber(exp.amount);
      return acc;
    }, {});
    const expensesByStatus = expenses.reduce((acc: Record<string, number>, exp: any) => {
      const status = exp.status || 'pending';
      acc[status] = (acc[status] || 0) + toNumber(exp.amount);
      return acc;
    }, {});

    const totalAmount = expenses.reduce((sum: number, exp: any) => sum + toNumber(exp.amount), 0);

    return {
      expenses,
      expensesByCategory,
      expensesByStatus,
      totalAmount,
      totalCount: expenses.length
    };
  }

  /**
   * Generate Invoice Report Data
   */
  async generateInvoiceData(startDate: string, endDate: string, tenantId?: number): Promise<any> {
    const scopedTenantId = this.normalizeTenantId(tenantId);
    const invoicesWhere = ['i.tenant_id = ?', 'i.created_at >= ?', 'i.created_at <= ?'];
    if (await this.tableHasColumn('invoices', 'deleted_at')) {
      invoicesWhere.push('i.deleted_at IS NULL');
    }

    const invoices = await databaseService.getMany<any>(`
      SELECT i.*, c.name as client_name
      FROM invoices i
      LEFT JOIN clients c ON i.client_id = c.id
      WHERE ${invoicesWhere.join(' AND ')}
      ORDER BY i.created_at DESC
    `, [scopedTenantId, startDate, endDate + 'T23:59:59.999Z']);

    const toNumber = (value: unknown): number => {
      if (value === null || value === undefined) return 0;
      const num = typeof value === 'string' ? parseFloat(value) : Number(value);
      return isNaN(num) ? 0 : num;
    };

    const invoicesByStatus = invoices.reduce((acc: any, inv: any) => {
      const status = inv.status || 'draft';
      acc[status] = (acc[status] || 0) + toNumber(inv.amount);
      return acc;
    }, {});

    const invoicesByClient = invoices.reduce((acc: any, inv: any) => {
      const clientName = inv.client_name || 'Unknown Client';
      acc[clientName] = (acc[clientName] || 0) + toNumber(inv.amount);
      return acc;
    }, {});

    const totalAmount = invoices.reduce((sum: number, inv: any) => sum + toNumber(inv.amount), 0);
    const paidAmount = invoices
      .filter((inv: any) => inv.status === 'paid')
      .reduce((sum: number, inv: any) => sum + toNumber(inv.amount), 0);
    const pendingAmount = invoices
      .filter((inv: any) => inv.status !== 'paid')
      .reduce((sum: number, inv: any) => sum + toNumber(inv.amount), 0);
    const overdueAmount = invoices
      .filter((inv: any) => inv.status === 'overdue')
      .reduce((sum: number, inv: any) => sum + toNumber(inv.amount), 0);

    return {
      invoices,
      invoicesByStatus,
      invoicesByClient,
      totalAmount,
      paidAmount,
      pendingAmount,
      overdueAmount,
      totalCount: invoices.length
    };
  }

  /**
   * Generate Client Report Data
   */
  async generateClientData(startDate?: string, endDate?: string, tenantId?: number): Promise<any> {
    const scopedTenantId = this.normalizeTenantId(tenantId);
    const clientsWhere = await this.tableHasColumn('clients', 'deleted_at')
      ? 'WHERE tenant_id = ? AND deleted_at IS NULL'
      : 'WHERE tenant_id = ?';

    const clients = await databaseService.getMany<any>(`
      SELECT *
      FROM clients
      ${clientsWhere}
      ORDER BY name ASC
    `, [scopedTenantId]);

    const invoiceFilters: string[] = ['i.tenant_id = ?'];
    const params: string[] = [String(scopedTenantId)];

    if (startDate && endDate) {
      invoiceFilters.push('i.created_at >= ?', 'i.created_at <= ?');
      params.push(startDate, endDate + 'T23:59:59.999Z');
    }
    if (await this.tableHasColumn('invoices', 'deleted_at')) {
      invoiceFilters.push('i.deleted_at IS NULL');
    }

    const invoiceFilterClause = invoiceFilters.length > 0
      ? `WHERE ${invoiceFilters.join(' AND ')}`
      : '';

    const invoices = await databaseService.getMany<any>(`
      SELECT i.*, c.name as client_name
      FROM invoices i
      LEFT JOIN clients c ON i.client_id = c.id
      ${invoiceFilterClause}
      ORDER BY i.created_at DESC
    `, params);

    const toNumber = (value: unknown): number => {
      if (value === null || value === undefined) return 0;
      const num = typeof value === 'string' ? parseFloat(value) : Number(value);
      return isNaN(num) ? 0 : num;
    };

    const clientStats = clients.map((client: any) => {
      const clientInvoices = invoices.filter((inv: any) => inv.client_id === client.id);
      const totalRevenue = clientInvoices.reduce((sum: number, inv: any) => sum + toNumber(inv.amount), 0);
      const paidRevenue = clientInvoices
        .filter((inv: any) => inv.status === 'paid')
        .reduce((sum: number, inv: any) => sum + toNumber(inv.amount), 0);
      const pendingRevenue = clientInvoices
        .filter((inv: any) => inv.status !== 'paid')
        .reduce((sum: number, inv: any) => sum + toNumber(inv.amount), 0);
      const overdueRevenue = clientInvoices
        .filter((inv: any) => inv.status === 'overdue')
        .reduce((sum: number, inv: any) => sum + toNumber(inv.amount), 0);

      return {
        ...client,
        totalInvoices: clientInvoices.length,
        totalRevenue,
        paidRevenue,
        pendingRevenue,
        overdueRevenue
      };
    }).filter((client: any) => client.totalInvoices > 0);

    const totalRevenue = clientStats.reduce((sum: number, client: any) => sum + client.totalRevenue, 0);
    const totalPaidRevenue = clientStats.reduce((sum: number, client: any) => sum + client.paidRevenue, 0);
    const totalPendingRevenue = clientStats.reduce((sum: number, client: any) => sum + client.pendingRevenue, 0);
    const totalOverdueRevenue = clientStats.reduce((sum: number, client: any) => sum + client.overdueRevenue, 0);

    return {
      clients: clientStats,
      totalClients: clientStats.length,
      totalRevenue,
      totalPaidRevenue,
      totalPendingRevenue,
      totalOverdueRevenue
    };
  }
}

// Export singleton instance
export const reportService = new ReportService();
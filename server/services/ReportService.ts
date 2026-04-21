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

  private getTableColumns(tableName: string): Set<string> {
    const cached = this.tableColumnCache.get(tableName);
    if (cached) {
      return cached;
    }

    const rows = databaseService.getMany<{ name: string }>(`PRAGMA table_info(${tableName})`);
    const columns = new Set(rows.map((row) => row.name));
    this.tableColumnCache.set(tableName, columns);
    return columns;
  }

  private tableHasColumn(tableName: string, columnName: string): boolean {
    return this.getTableColumns(tableName).has(columnName);
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
  async getAllReports(): Promise<DatabaseReport[]> {
    return databaseService.getMany<DatabaseReport>(`
      SELECT id, name, type, date_range_start, date_range_end, data, created_at
      FROM reports
      ORDER BY created_at DESC
    `);
  }

  /**
   * Get report by ID with parsed data field
   */
  async getReportById(id: number): Promise<DatabaseReport | null> {
    if (!id || typeof id !== 'number') {
      throw new Error('Valid report ID is required');
    }

    const report = databaseService.getOne<DatabaseReport>(`
      SELECT id, name, type, date_range_start, date_range_end, data, created_at
      FROM reports
      WHERE id = ?
    `, [id]);

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
  async createReport(reportData: ReportData): Promise<{ id: number; changes: number }> {
    if (!reportData || !reportData.name || !reportData.type) {
      throw new Error('Report name and type are required');
    }

    // Get next ID from counter service
    const nextId = databaseService.getNextId('reports');
    const now = new Date().toISOString();

    const result = databaseService.executeQuery(`
      INSERT INTO reports (id, name, type, date_range_start, date_range_end, data, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      nextId,
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
  async updateReport(id: number, reportData: ReportData): Promise<{ id: number; changes: number }> {
    if (!id || typeof id !== 'number') {
      throw new Error('Valid report ID is required');
    }

    if (!reportData) {
      throw new Error('Report data is required');
    }

    const result = databaseService.executeQuery(`
      UPDATE reports
      SET name = ?, type = ?, date_range_start = ?, date_range_end = ?, data = ?
      WHERE id = ?
    `, [
      reportData.name,
      reportData.type,
      reportData.date_range_start || '',
      reportData.date_range_end || '',
      reportData.data ? JSON.stringify(reportData.data) : null,
      id
    ]);

    if (result.changes === 0) {
      throw new Error('Report not found');
    }

    return {
      id: id,
      changes: result.changes
    };
  }

  async createReportSchedule(scheduleData: ReportScheduleData): Promise<{ id: number; changes: number }> {
    if (!scheduleData || !scheduleData.name || !scheduleData.report_type) {
      throw new Error('Schedule name and report type are required');
    }

    const reportType = this.normalizeReportType(scheduleData.report_type);
    const frequency = this.normalizeScheduleFrequency(scheduleData.frequency);
    const timezone = scheduleData.timezone || 'UTC';
    const timeOfDay = scheduleData.time_of_day || '09:00';
    const nextRunAt = this.calculateNextRunAt(frequency, scheduleData.start_date, timeOfDay);

    const result = databaseService.executeQuery(
      `
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
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `,
      [
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

  async getReportSchedules(reportType?: string): Promise<ReportSchedule[]> {
    const params: unknown[] = [];
    const whereClause = reportType ? 'WHERE report_type = ?' : '';
    if (reportType) {
      params.push(this.normalizeReportType(reportType));
    }

    const schedules = databaseService.getMany<DatabaseReportSchedule>(
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

  async deleteReportSchedule(id: number): Promise<{ id: number; changes: number }> {
    if (!id || typeof id !== 'number') {
      throw new Error('Valid schedule ID is required');
    }

    const result = databaseService.executeQuery(
      'DELETE FROM report_schedules WHERE id = ?',
      [id]
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
  async deleteReport(id: number): Promise<{ id: number; changes: number }> {
    if (!id || typeof id !== 'number') {
      throw new Error('Valid report ID is required');
    }

    const result = databaseService.executeQuery('DELETE FROM reports WHERE id = ?', [id]);

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
  async reportExists(id: number): Promise<boolean> {
    if (!id || typeof id !== 'number') {
      return false;
    }

    return databaseService.exists('reports', 'id', id);
  }

  /**
   * Get reports by type
   */
  async getReportsByType(type: string): Promise<DatabaseReport[]> {
    if (!type || typeof type !== 'string') {
      throw new Error('Valid report type is required');
    }

    return databaseService.getMany<DatabaseReport>(`
      SELECT id, name, type, date_range_start, date_range_end, data, created_at
      FROM reports
      WHERE type = ?
      ORDER BY created_at DESC
    `, [type]);
  }

  /**
   * Get reports within date range
   */
  async getReportsByDateRange(startDate: string, endDate: string): Promise<DatabaseReport[]> {
    if (!startDate || !endDate) {
      throw new Error('Valid date range is required');
    }

    return databaseService.getMany<DatabaseReport>(`
      SELECT id, name, type, date_range_start, date_range_end, data, created_at
      FROM reports
      WHERE created_at >= ? AND created_at <= ?
      ORDER BY created_at DESC
    `, [startDate, endDate]);
  }

  /**
   * Get report count
   */
  async getReportCount(): Promise<number> {
    const result = databaseService.getOne<{count: number}>(
      'SELECT COUNT(*) as count FROM reports'
    );
    return result?.count || 0;
  }

  /**
   * Get report count by type
   */
  async getReportCountByType(type: string): Promise<number> {
    if (!type || typeof type !== 'string') {
      throw new Error('Valid report type is required');
    }

    const result = databaseService.getOne<{count: number}>(
      'SELECT COUNT(*) as count FROM reports WHERE type = ?',
      [type]
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
    breakdownPeriod: 'monthly' | 'quarterly' = 'quarterly'
  ): Promise<any> {
    const invoicesWhere = ['i.created_at >= ?', 'i.created_at <= ?'];
    if (this.tableHasColumn('invoices', 'deleted_at')) {
      invoicesWhere.push('i.deleted_at IS NULL');
    }

    const expensesWhere = ['date >= ?', 'date <= ?'];
    if (this.tableHasColumn('expenses', 'deleted_at')) {
      expensesWhere.push('deleted_at IS NULL');
    }

    // Get invoices in date range
    const invoices = databaseService.getMany<any>(`
      SELECT i.*, c.name as client_name
      FROM invoices i
      LEFT JOIN clients c ON i.client_id = c.id
      WHERE ${invoicesWhere.join(' AND ')}
      ORDER BY i.created_at DESC
    `, [startDate, endDate + 'T23:59:59.999Z']);

    // Get expenses in date range
    const expenses = databaseService.getMany<any>(`
      SELECT *
      FROM expenses
      WHERE ${expensesWhere.join(' AND ')}
      ORDER BY date DESC
    `, [startDate, endDate]);

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
  async generateExpenseData(startDate: string, endDate: string): Promise<any> {
    const expensesWhere = ['date >= ?', 'date <= ?'];
    if (this.tableHasColumn('expenses', 'deleted_at')) {
      expensesWhere.push('deleted_at IS NULL');
    }

    const expenses = databaseService.getMany<any>(`
      SELECT *
      FROM expenses
      WHERE ${expensesWhere.join(' AND ')}
      ORDER BY date DESC
    `, [startDate, endDate]);

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
  async generateInvoiceData(startDate: string, endDate: string): Promise<any> {
    const invoicesWhere = ['i.created_at >= ?', 'i.created_at <= ?'];
    if (this.tableHasColumn('invoices', 'deleted_at')) {
      invoicesWhere.push('i.deleted_at IS NULL');
    }

    const invoices = databaseService.getMany<any>(`
      SELECT i.*, c.name as client_name
      FROM invoices i
      LEFT JOIN clients c ON i.client_id = c.id
      WHERE ${invoicesWhere.join(' AND ')}
      ORDER BY i.created_at DESC
    `, [startDate, endDate + 'T23:59:59.999Z']);

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
  async generateClientData(startDate?: string, endDate?: string): Promise<any> {
    const clientsWhere = this.tableHasColumn('clients', 'deleted_at')
      ? 'WHERE deleted_at IS NULL'
      : '';

    const clients = databaseService.getMany<any>(`
      SELECT *
      FROM clients
      ${clientsWhere}
      ORDER BY name ASC
    `);

    const invoiceFilters: string[] = [];
    const params: string[] = [];

    if (startDate && endDate) {
      invoiceFilters.push('i.created_at >= ?', 'i.created_at <= ?');
      params.push(startDate, endDate + 'T23:59:59.999Z');
    }
    if (this.tableHasColumn('invoices', 'deleted_at')) {
      invoiceFilters.push('i.deleted_at IS NULL');
    }

    const invoiceFilterClause = invoiceFilters.length > 0
      ? `WHERE ${invoiceFilters.join(' AND ')}`
      : '';

    const invoices = databaseService.getMany<any>(`
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
// Report component prop types

import type { ReportDateRange, InvoiceReportData, ExpenseReportData, ClientReportData, ProfitLossReportData } from '@/types';

export interface ReportsManagementProps {
  // Add props as needed
}

export interface ProfitLossReportProps {
  dateRange: ReportDateRange;
  reportData: ProfitLossReportData;
}

export interface InvoiceReportProps {
  dateRange: ReportDateRange;
  reportData: InvoiceReportData;
}

export interface ExpenseReportProps {
  dateRange: ReportDateRange;
  reportData: ExpenseReportData;
}

export interface ClientReportProps {
  dateRange: ReportDateRange;
  reportData: ClientReportData;
}

export interface DashboardChartProps {
  data: Array<{ label: string; value: number }>;
  title?: string;
  type?: 'line' | 'bar' | 'pie';
}

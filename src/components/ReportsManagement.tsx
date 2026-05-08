
import React, { useState, useEffect } from 'react';
import { BarChart, TrendingUp, FileText, Download, Calendar, Trash2, Clock3 } from 'lucide-react';
import { ProfitLossReport } from './reports/ProfitLossReport';
import { ExpenseReport } from './reports/ExpenseReport';
import { InvoiceReport } from './reports/InvoiceReport';
import { ClientReport } from './reports/ClientReport';
import { authenticatedFetch } from '@/utils/api';
import { themeClasses } from '@/utils/themeUtils.util';
import { toast } from 'sonner';
import { formatDateSync, formatDateRangeSync } from '@/utils/formatting';
import { Report, ReportType } from '@/types';
import {
  ReportDateRange,
  ReportScheduleFrequency,
  ReportScheduleInput
} from '@/types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';

export type { ReportType };
export type { ReportDateRange as DateRange }; // Re-export for backward compatibility

export const ReportsManagement: React.FC = () => {
  const [selectedReport, setSelectedReport] = useState<ReportType | null>(null);
  const [savedReports, setSavedReports] = useState<Report[]>([]);
  const [isScheduleDialogOpen, setIsScheduleDialogOpen] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [pendingSchedule, setPendingSchedule] = useState<{
    reportType: ReportType;
    dateRange: ReportDateRange;
    config?: Record<string, unknown>;
  } | null>(null);
  const [scheduleForm, setScheduleForm] = useState<ReportScheduleInput>(() => {
    const now = new Date();
    const startDate = now.toISOString().slice(0, 10);
    return {
      name: '',
      frequency: 'weekly',
      startDate,
      timeOfDay: '09:00',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
    };
  });

  useEffect(() => {
    loadSavedReports();
  }, []);

  const loadSavedReports = async () => {
    try {
      const response = await authenticatedFetch('/api/reports');
      const result = await response.json();
      if (result.success) {
        setSavedReports(result.data);
      } else {
        setSavedReports([]);
      }
    } catch (error) {
      console.error('Error loading saved reports:', error);
      setSavedReports([]);
    }
  };

  const reportTypes = [
    {
      id: 'profit-loss' as ReportType,
      name: 'Profit & Loss',
      description: 'Revenue, expenses, and net income overview',
      icon: TrendingUp,
      color: 'bg-green-600 dark:bg-green-500'
    },
    {
      id: 'expense' as ReportType,
      name: 'Expense Report',
      description: 'Detailed breakdown of company expenses',
      icon: FileText,
      color: 'bg-red-600 dark:bg-red-500'
    },
    {
      id: 'invoice' as ReportType,
      name: 'Invoice Report',
      description: 'Invoice status and payment tracking',
      icon: BarChart,
      color: 'bg-blue-600 dark:bg-blue-500'
    },
    {
      id: 'client' as ReportType,
      name: 'Client Report',
      description: 'Client activity and revenue analysis',
      icon: FileText,
      color: 'bg-purple-600 dark:bg-purple-500'
    }
  ];

  const handleSaveReport = async (reportData: any, reportType: ReportType, dateRange: ReportDateRange) => {
    try {
      const reportName = `${reportTypes.find(r => r.id === reportType)?.name} - ${formatDateRangeSync(dateRange.start, dateRange.end)}`;
      const response = await authenticatedFetch('/api/reports', {
        method: 'POST',
        body: JSON.stringify({
          reportData: {
            name: reportName,
            type: reportType,
            date_range_start: dateRange.start,
            date_range_end: dateRange.end,
            data: reportData
          }
        })
      });
      const result = await response.json();
      if (result.success) {
        toast.success('Report saved successfully');
        await loadSavedReports();
      } else {
        toast.error('Failed to save report');
      }
    } catch (error) {
      toast.error('Failed to save report');
      console.error('Error saving report:', error);
    }
  };

  const handleDeleteReport = async (id: number, name: string) => {
    if (window.confirm(`Are you sure you want to delete "${name}"?`)) {
      try {
        const response = await authenticatedFetch(`/api/reports/${id}`, {
          method: 'DELETE'
        });
        const result = await response.json();
        if (result.success) {
          toast.success('Report deleted successfully');
          await loadSavedReports();
        } else {
          toast.error('Failed to delete report');
        }
      } catch (error) {
        toast.error('Failed to delete report');
        console.error('Error deleting report:', error);
      }
    }
  };

  const getFormattedDateRange = (dateRange: ReportDateRange) => {
    return formatDateRangeSync(dateRange.start, dateRange.end);
  };

  const buildDefaultScheduleName = (reportType: ReportType, dateRange: ReportDateRange): string => {
    const reportLabel = reportTypes.find((item) => item.id === reportType)?.name || reportType;
    return `${reportLabel} (${getFormattedDateRange(dateRange)})`;
  };

  const openScheduleDialog = (
    reportType: ReportType,
    dateRange: ReportDateRange,
    config?: Record<string, unknown>
  ) => {
    setPendingSchedule({ reportType, dateRange, config });
    setScheduleForm((prev) => ({
      ...prev,
      name: buildDefaultScheduleName(reportType, dateRange)
    }));
    setIsScheduleDialogOpen(true);
  };

  const closeScheduleDialog = () => {
    setIsScheduleDialogOpen(false);
    setPendingSchedule(null);
  };

  const handleScheduleReport = async () => {
    if (!pendingSchedule) {
      return;
    }

    if (!scheduleForm.name.trim()) {
      toast.error('Schedule name is required');
      return;
    }

    setScheduling(true);
    try {
      const payload = {
        scheduleData: {
          name: scheduleForm.name.trim(),
          report_type: pendingSchedule.reportType,
          frequency: scheduleForm.frequency as ReportScheduleFrequency,
          start_date: scheduleForm.startDate,
          time_of_day: scheduleForm.timeOfDay,
          timezone: scheduleForm.timezone,
          date_range_start: pendingSchedule.dateRange.start,
          date_range_end: pendingSchedule.dateRange.end,
          config: pendingSchedule.config || {}
        }
      };

      const response = await authenticatedFetch('/api/reports/schedules', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      const result = await response.json();

      if (result.success) {
        toast.success('Report schedule created');
        closeScheduleDialog();
      } else {
        toast.error(result.error || 'Failed to create schedule');
      }
    } catch (error) {
      console.error('Error creating report schedule:', error);
      toast.error('Failed to create schedule');
    } finally {
      setScheduling(false);
    }
  };

  const renderReport = () => {
    switch (selectedReport) {
      case 'profit-loss':
        return (
          <ProfitLossReport
            onBack={() => setSelectedReport(null)}
            onSave={handleSaveReport}
            onSchedule={openScheduleDialog}
          />
        );
      case 'expense':
        return (
          <ExpenseReport
            onBack={() => setSelectedReport(null)}
            onSave={handleSaveReport}
            onSchedule={openScheduleDialog}
          />
        );
      case 'invoice':
        return (
          <InvoiceReport
            onBack={() => setSelectedReport(null)}
            onSave={handleSaveReport}
            onSchedule={openScheduleDialog}
          />
        );
      case 'client':
        return (
          <ClientReport
            onBack={() => setSelectedReport(null)}
            onSave={handleSaveReport}
            onSchedule={openScheduleDialog}
          />
        );
      default:
        return null;
    }
  };

  return (
    <>
      {selectedReport ? (
        renderReport()
      ) : (
        <div className={themeClasses.page}>
          <div className={themeClasses.pageContainer}>
            {/* Header */}
            <div className={themeClasses.pageHeader}>
              <h1 className={themeClasses.pageTitle}>Reports</h1>
              <p className={themeClasses.pageSubtitle}>Generate insights from your business data</p>
            </div>

            {/* Report Types Grid */}
            <div className={themeClasses.cardsGrid}>
              {reportTypes.map((report) => {
                const Icon = report.icon;
                return (
                  <div
                    key={report.id}
                    className={themeClasses.cardHover}
                    onClick={() => setSelectedReport(report.id)}
                  >
                    <div className="flex items-start space-x-4">
                      <div className={`p-3 rounded-lg ${report.color}`}>
                        <Icon className={`${themeClasses.iconMedium} text-white`} />
                      </div>
                      <div className="flex-1">
                        <h3 className={`${themeClasses.cardTitle} mb-2`}>{report.name}</h3>
                        <p className={`${themeClasses.mutedText} mb-4`}>{report.description}</p>
                        <button className="flex items-center text-primary hover:text-primary/80 font-medium">
                          Generate Report
                          <BarChart className={`${themeClasses.iconSmall} ml-1`} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Saved Reports */}
            <div className={themeClasses.card}>
              <div className={themeClasses.cardHeader}>
                <h3 className={themeClasses.cardTitle}>Saved Reports</h3>
              </div>
              <div>
                {savedReports.length > 0 ? (
                  <div className="space-y-4">
                    {savedReports.map((report) => (
                      <div key={report.id} className="flex items-center justify-between p-4 border border-border rounded-lg">
                        <div className="flex-1">
                          <h4 className={`font-medium ${themeClasses.bodyText}`}>{report.name}</h4>
                          <p className={themeClasses.smallText}>
                            Created: {formatDateSync(report.created_at)}
                          </p>
                        </div>
                        <div className="flex space-x-2">
                          <button className="text-primary hover:text-primary/80 p-2">
                            <Download className={themeClasses.iconSmall} />
                          </button>
                          <button
                            onClick={() => handleDeleteReport(report.id, report.name)}
                            className="text-destructive hover:text-destructive/80 p-2"
                          >
                            <Trash2 className={themeClasses.iconSmall} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Calendar className={`${themeClasses.iconLarge} ${themeClasses.mutedText} mx-auto mb-4`} />
                    <p className={themeClasses.mutedText}>No saved reports. Generate your first report above.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <Dialog
        open={isScheduleDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            closeScheduleDialog();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock3 className="h-4 w-4" />
              Schedule Report
            </DialogTitle>
            <DialogDescription>
              Create a recurring schedule from the currently generated report.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className={themeClasses.label}>Schedule Name</label>
              <input
                className={themeClasses.input}
                value={scheduleForm.name}
                onChange={(event) => setScheduleForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Monthly Profit & Loss"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={themeClasses.label}>Frequency</label>
                <select
                  className={themeClasses.select}
                  value={scheduleForm.frequency}
                  onChange={(event) =>
                    setScheduleForm((prev) => ({
                      ...prev,
                      frequency: event.target.value as ReportScheduleFrequency
                    }))
                  }
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                </select>
              </div>

              <div>
                <label className={themeClasses.label}>Time (24h)</label>
                <input
                  type="time"
                  className={themeClasses.input}
                  value={scheduleForm.timeOfDay}
                  onChange={(event) => setScheduleForm((prev) => ({ ...prev, timeOfDay: event.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={themeClasses.label}>Start Date</label>
                <input
                  type="date"
                  className={themeClasses.input}
                  value={scheduleForm.startDate}
                  onChange={(event) => setScheduleForm((prev) => ({ ...prev, startDate: event.target.value }))}
                />
              </div>

              <div>
                <label className={themeClasses.label}>Timezone</label>
                <input
                  className={themeClasses.input}
                  value={scheduleForm.timezone}
                  onChange={(event) => setScheduleForm((prev) => ({ ...prev, timezone: event.target.value }))}
                  placeholder="UTC"
                />
              </div>
            </div>
            <p className={`text-xs ${themeClasses.mutedText}`}>
              Scheduled reports are generated automatically and delivered in-app under Saved Reports for the selected report type.
            </p>
          </div>

          <DialogFooter>
            <button type="button" className="px-3 py-2 rounded-md border border-border" onClick={closeScheduleDialog} disabled={scheduling}>
              Cancel
            </button>
            <button type="button" className="px-3 py-2 rounded-md bg-primary text-primary-foreground" onClick={handleScheduleReport} disabled={scheduling}>
              {scheduling ? 'Scheduling...' : 'Schedule Report'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

// Report routes for Slimbooks
// Handles report generation and management endpoints

import { Router, Request, Response } from 'express';
import { requireAuth, requireEntitlement, requireRole } from '../middleware/index.js';
import { applyTenantSchema } from '../middleware/tenantSchema.js';
import {
  reportService,
  ReportData,
  ReportScheduleData
} from '../services/ReportService.js';
import { emailTemplateService } from '../services/EmailTemplateService.js';
import { emailProviderService } from '../services/EmailProviderService.js';

const router: Router = Router();

// All report routes require authentication
router.use(requireAuth);
router.use(applyTenantSchema);
router.use(requireRole(['admin', 'client_manager', 'project_manager']));
router.use(requireEntitlement('reports.enabled'));

// Get all reports
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const tenantId = req.tenantId || req.user?.tenant_id || 1;
    const reports = await reportService.getAllReports(tenantId);

    res.json({
      success: true,
      data: reports
    });
  } catch (error) {
    console.error('Error getting reports:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get reports'
    });
  }
});

// List report schedules
router.get('/schedules', async (req: Request, res: Response): Promise<void> => {
  try {
    const reportType = typeof req.query.reportType === 'string' ? req.query.reportType : undefined;
    const tenantId = req.tenantId || req.user?.tenant_id || 1;
    const data = await reportService.getReportSchedules(reportType, tenantId);
    res.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('Error getting report schedules:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get report schedules'
    });
  }
});

// Create report schedule
router.post('/schedules', async (req: Request, res: Response): Promise<void> => {
  try {
    const { scheduleData }: { scheduleData: ReportScheduleData } = req.body;
    if (!scheduleData) {
      res.status(400).json({
        success: false,
        error: 'Schedule data is required'
      });
      return;
    }

    const requiredFields: Array<keyof ReportScheduleData> = [
      'name',
      'report_type',
      'frequency',
      'start_date',
      'time_of_day'
    ];
    const missingField = requiredFields.find((field) => !scheduleData[field]);
    if (missingField) {
      res.status(400).json({
        success: false,
        error: `Missing required schedule field: ${missingField}`
      });
      return;
    }

    const tenantId = req.tenantId || req.user?.tenant_id || 1;
    const result = await reportService.createReportSchedule(scheduleData, tenantId);
    res.status(201).json({
      success: true,
      result
    });
  } catch (error) {
    console.error('Error creating report schedule:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create report schedule'
    });
  }
});

// Delete report schedule
router.delete('/schedules/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const scheduleId = parseInt(id || '', 10);
    if (isNaN(scheduleId)) {
      res.status(400).json({
        success: false,
        error: 'Invalid schedule ID'
      });
      return;
    }

    const tenantId = req.tenantId || req.user?.tenant_id || 1;
    const result = await reportService.deleteReportSchedule(scheduleId, tenantId);
    res.json({
      success: true,
      result
    });
  } catch (error) {
    console.error('Error deleting report schedule:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete report schedule'
    });
  }
});

// Get report by ID
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const reportId = parseInt(id!);

    if (isNaN(reportId)) {
      res.status(400).json({
        success: false,
        error: 'Invalid report ID'
      });
      return;
    }

    const tenantId = req.tenantId || req.user?.tenant_id || 1;
    const report = await reportService.getReportById(reportId, tenantId);

    if (!report) {
      res.status(404).json({
        success: false,
        error: 'Report not found'
      });
      return;
    }

    res.json({
      success: true,
      data: report
    });
  } catch (error) {
    console.error('Error getting report:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get report'
    });
  }
});

// Create new report
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { reportData }: { reportData: ReportData } = req.body;

    if (!reportData || !reportData.name || !reportData.type) {
      res.status(400).json({
        success: false,
        error: 'Report name and type are required'
      });
      return;
    }

    const tenantId = req.tenantId || req.user?.tenant_id || 1;
    const result = await reportService.createReport(reportData, tenantId);

    res.json({
      success: true,
      result: result
    });
  } catch (error) {
    console.error('Error creating report:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create report'
    });
  }
});

// Update report
router.put('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { reportData }: { reportData: ReportData } = req.body;
    const reportId = parseInt(id!);

    if (isNaN(reportId)) {
      res.status(400).json({
        success: false,
        error: 'Invalid report ID'
      });
      return;
    }

    if (!reportData) {
      res.status(400).json({
        success: false,
        error: 'Report data is required'
      });
      return;
    }

    const tenantId = req.tenantId || req.user?.tenant_id || 1;
    const result = await reportService.updateReport(reportId, reportData, tenantId);

    res.json({
      success: true,
      result: result
    });
  } catch (error) {
    console.error('Error updating report:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update report'
    });
  }
});

// Delete report
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const reportId = parseInt(id!);

    if (isNaN(reportId)) {
      res.status(400).json({
        success: false,
        error: 'Invalid report ID'
      });
      return;
    }

    const tenantId = req.tenantId || req.user?.tenant_id || 1;
    const result = await reportService.deleteReport(reportId, tenantId);

    res.json({
      success: true,
      result: result
    });
  } catch (error) {
    console.error('Error deleting report:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete report'
    });
  }
});

// Generate Profit & Loss Report
router.post('/generate/profit-loss', async (req: Request, res: Response): Promise<void> => {
  try {
    const { startDate, endDate, accountingMethod, preset, breakdownPeriod } = req.body;

    if (!startDate || !endDate) {
      res.status(400).json({
        success: false,
        error: 'Start date and end date are required'
      });
      return;
    }

    const tenantId = req.tenantId || req.user?.tenant_id || 1;
    const data = await reportService.generateProfitLossData(
      startDate,
      endDate,
      accountingMethod || 'accrual',
      preset,
      breakdownPeriod || 'quarterly',
      tenantId
    );

    res.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('Error generating profit & loss report:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate profit & loss report'
    });
  }
});

// Generate Expense Report
router.post('/generate/expense', async (req: Request, res: Response): Promise<void> => {
  try {
    const { startDate, endDate } = req.body;

    if (!startDate || !endDate) {
      res.status(400).json({
        success: false,
        error: 'Start date and end date are required'
      });
      return;
    }

    const tenantId = req.tenantId || req.user?.tenant_id || 1;
    const data = await reportService.generateExpenseData(startDate, endDate, tenantId);

    res.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('Error generating expense report:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate expense report'
    });
  }
});

// Generate Invoice Report
router.post('/generate/invoice', async (req: Request, res: Response): Promise<void> => {
  try {
    const { startDate, endDate } = req.body;

    if (!startDate || !endDate) {
      res.status(400).json({
        success: false,
        error: 'Start date and end date are required'
      });
      return;
    }

    const tenantId = req.tenantId || req.user?.tenant_id || 1;
    const data = await reportService.generateInvoiceData(startDate, endDate, tenantId);

    res.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('Error generating invoice report:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate invoice report'
    });
  }
});

// Generate Client Report
router.post('/generate/client', async (req: Request, res: Response): Promise<void> => {
  try {
    const { startDate, endDate } = req.body;
    const tenantId = req.tenantId || req.user?.tenant_id || 1;

    const data = await reportService.generateClientData(startDate, endDate, tenantId);

    res.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('Error generating client report:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate client report'
    });
  }
});

// Send a report via email
router.post('/email', async (req: Request, res: Response): Promise<void> => {
  try {
    const tenantId = req.tenantId || req.user?.tenant_id || 1;
    const { to, report_type, report_period, summary_html } = req.body as {
      to?: string;
      report_type?: string;
      report_period?: string;
      summary_html?: string;
    };

    if (!to) {
      res.status(400).json({ success: false, error: 'Recipient email is required' });
      return;
    }

    const emailContent = await emailTemplateService.render('report', {
      recipient_name: req.user?.name || 'there',
      report_type: report_type || 'Financial Report',
      report_period: report_period || '',
      summary_html: summary_html || '',
      app_url: process.env.APP_URL || 'http://localhost:5173'
    }, tenantId);

    const result = await emailProviderService.sendEmail({
      to,
      subject: emailContent.subject,
      html: emailContent.html,
      text: emailContent.text
    });

    res.json({ success: result.success, message: result.message });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

export default router;
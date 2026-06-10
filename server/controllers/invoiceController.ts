// Invoice controller for Slimbooks
// Handles all invoice-related business logic

import { Request, Response } from 'express';
import { invoiceService } from '../services/InvoiceService.js';
import { invoiceNumberService } from '../services/InvoiceNumberService.js';
import {
  AppError,
  NotFoundError,
  ValidationError,
  asyncHandler
} from '../middleware/index.js';
import { InvoiceStatus } from '../types/index.js';
import { InvoiceRequest } from '../types/api.types.js';
import { emailTemplateService } from '../services/EmailTemplateService.js';
import { emailProviderService } from '../services/EmailProviderService.js';

/**
 * Get all invoices
 */
export const getAllInvoices = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { status, client_id, limit = '50', offset = '0' } = req.query;
  
  const parsedLimit = parseInt(limit as string, 10);
  const parsedOffset = parseInt(offset as string, 10);

  if (isNaN(parsedLimit) || isNaN(parsedOffset)) {
    throw new ValidationError('Invalid limit or offset');
  }

  const parsedClientId = client_id ? parseInt(client_id as string, 10) : undefined;
  
  const filters: {
    status?: InvoiceStatus;
    client_id?: number;
  } = {
    ...(status && { status: status as InvoiceStatus }),
    ...(parsedClientId && !isNaN(parsedClientId) && { client_id: parsedClientId })
  };

  if (filters.client_id && isNaN(filters.client_id)) {
    throw new ValidationError('Invalid client ID');
  }

  const tenantId = req.tenantId || req.user?.tenant_id || 1;
  const results = await invoiceService.getAllInvoices(filters, { 
    limit: parsedLimit, 
    offset: parsedOffset 
  }, tenantId);
  
  res.json({ 
    success: true, 
    data: results
  });
});

/**
 * Get invoice by ID
 */
export const getInvoiceById = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  if (typeof id !== 'string') {
    throw new ValidationError('Invalid invoice ID');
  }

  const invoiceId = parseInt(id, 10);

  if (isNaN(invoiceId)) {
    throw new ValidationError('Invalid invoice ID');
  }
  
  const tenantId = req.tenantId || req.user?.tenant_id || 1;
  const invoice = await invoiceService.getInvoiceById(invoiceId, tenantId);

  if (!invoice) {
    throw new NotFoundError('Invoice');
  }

  res.json({ success: true, data: invoice });
});

/**
 * Get public invoice by ID with secure token validation
 * Security features:
 * - Cryptographically secure tokens
 * - Token expiration (24 hours)
 * - Rate limiting
 * - Consistent error responses (no information disclosure)
 */
export const getPublicInvoiceById = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { token } = req.query;

  if (typeof id !== 'string') {
    res.status(401).json({
      success: false,
      error: 'Invalid id'
    });
    return;
  }

  const invoiceId = parseInt(id, 10);

  if (isNaN(invoiceId)) {
    res.status(401).json({
      success: false,
      error: 'Invalid or expired invoice link'
    });
    return;
  }

  if (!token || typeof token !== 'string') {
    res.status(401).json({
      success: false,
      error: 'Invalid or expired invoice link'
    });
    return;
  }

  try {
    const invoiceData = await invoiceService.getPublicInvoiceById(invoiceId, token);
    res.status(200).json({ success: true, data: invoiceData });
  } catch (error) {
    // Don't leak error details for security
    res.status(401).json({
      success: false,
      error: 'Invalid or expired invoice link'
    });
  }
});

/**
 * Generate secure public token for invoice
 * Creates a JWT token with 24-hour expiration
 */
export const generatePublicInvoiceToken = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  if (typeof id !== 'string') {
    throw new ValidationError('Invalid invoice ID');
  }

  const invoiceId = parseInt(id, 10);

  if (isNaN(invoiceId)) {
    throw new ValidationError('Invalid invoice ID');
  }

  try {
    const tenantId = req.tenantId || req.user?.tenant_id || 1;
    const tokenData = await invoiceService.generatePublicInvoiceToken(invoiceId, tenantId);
    res.json({
      success: true,
      data: tokenData
    });
  } catch (error) {
    const errorMessage = (error as Error).message;
    if (errorMessage === 'Invoice not found') {
      throw new NotFoundError('Invoice');
    }
    throw new AppError(errorMessage, 500);
  }
});

/**
 * Create new invoice
 */
export const createInvoice = asyncHandler(async (req: Request<object, object, { invoiceData: InvoiceRequest }>, res: Response): Promise<void> => {
  const { invoiceData } = req.body;

  if (!invoiceData) {
    throw new ValidationError('Invoice data is required');
  }

  try {
    const tenantId = req.tenantId || req.user?.tenant_id || 1;
    const invoiceId = await invoiceService.createInvoice(invoiceData, tenantId);
    
    res.status(201).json({ 
      success: true, 
      data: { id: invoiceId },
      message: 'Invoice created successfully'
    });
  } catch (error) {
    const errorMessage = (error as Error).message;
    if (errorMessage.includes('invoice_number') && errorMessage.includes('required')) {
      throw new ValidationError('Invoice number, client ID, and amount are required');
    } else if (errorMessage.includes('Client not found')) {
      throw new ValidationError('Specified client does not exist');
    } else if (errorMessage.includes('already exists')) {
      throw new ValidationError('Invoice number already exists');
    } else if (errorMessage.includes('Valid invoice amount')) {
      throw new ValidationError('Valid invoice amount is required');
    } else if (errorMessage.includes('Valid client ID')) {
      throw new ValidationError('Valid client ID is required');
    }
    throw new ValidationError(errorMessage);
  }
});

/**
 * Update invoice
 */
export const updateInvoice = asyncHandler(async (req: Request<{ id: string }, Record<string, unknown>, { invoiceData: Partial<InvoiceRequest> }>, res: Response): Promise<void> => {
  const { id } = req.params;
  const { invoiceData } = req.body;
  const invoiceId = parseInt(id, 10);

  if (isNaN(invoiceId)) {
    throw new ValidationError('Invalid invoice ID');
  }

  if (!invoiceData) {
    throw new ValidationError('Invoice data is required');
  }

  try {
    const tenantId = req.tenantId || req.user?.tenant_id || 1;
    const changes = await invoiceService.updateInvoice(invoiceId, invoiceData, tenantId);
    
    res.json({ 
      success: true, 
      data: { changes },
      message: 'Invoice updated successfully'
    });
  } catch (error) {
    const errorMessage = (error as Error).message;
    if (errorMessage === 'Invoice not found') {
      throw new NotFoundError('Invoice');
    } else if (errorMessage === 'No valid fields to update') {
      throw new ValidationError('No valid fields to update');
    } else if (errorMessage.includes('already exists')) {
      throw new ValidationError('Another invoice with this number already exists');
    } else if (errorMessage === 'Client not found') {
      throw new ValidationError('Specified client does not exist');
    } else if (errorMessage.includes('Valid invoice amount')) {
      throw new ValidationError('Valid invoice amount is required');
    }
    throw new ValidationError(errorMessage);
  }
});

/**
 * Delete invoice
 */
export const deleteInvoice = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  if (typeof id !== 'string') {
    throw new ValidationError('Invalid invoice ID');
  }

  const invoiceId = parseInt(id, 10);

  if (isNaN(invoiceId)) {
    throw new ValidationError('Invalid invoice ID');
  }
  
  try {
    const tenantId = req.tenantId || req.user?.tenant_id || 1;
    const changes = await invoiceService.deleteInvoice(invoiceId, tenantId);
    
    res.json({ 
      success: true, 
      data: { changes },
      message: 'Invoice deleted successfully'
    });
  } catch (error) {
    const errorMessage = (error as Error).message;
    if (errorMessage === 'Invoice not found') {
      throw new NotFoundError('Invoice');
    } else if (errorMessage.includes('Cannot delete paid invoices')) {
      throw new ValidationError('Cannot delete paid invoices');
    }
    throw new ValidationError(errorMessage);
  }
});

/**
 * Get invoice statistics
 */
export const getInvoiceStats = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const tenantId = req.tenantId || req.user?.tenant_id || 1;
  const stats = await invoiceService.getInvoiceStats(tenantId);
  res.json({ success: true, data: stats });
});

/**
 * Update invoice status
 */
export const updateInvoiceStatus = asyncHandler(async (req: Request<{ id: string }, Record<string, unknown>, { status: InvoiceStatus }>, res: Response): Promise<void> => {
  const { id } = req.params;
  const { status } = req.body;
  const invoiceId = parseInt(id, 10);

  if (isNaN(invoiceId)) {
    throw new ValidationError('Invalid invoice ID');
  }

  if (!status) {
    throw new ValidationError('Status is required');
  }

  try {
    const tenantId = req.tenantId || req.user?.tenant_id || 1;
    const changes = await invoiceService.updateInvoiceStatus(invoiceId, status, tenantId);
    
    res.json({ 
      success: true, 
      data: { changes },
      message: `Invoice status updated to ${status}`
    });
  } catch (error) {
    const errorMessage = (error as Error).message;
    if (errorMessage === 'Invoice not found') {
      throw new NotFoundError('Invoice');
    } else if (errorMessage === 'Invalid status') {
      throw new ValidationError('Invalid status');
    }
    throw new ValidationError(errorMessage);
  }
});

/**
 * Mark invoice as sent
 */
export const markInvoiceAsSent = asyncHandler(async (req: Request<{ id: string }, Record<string, unknown>, { email_sent_at?: string }>, res: Response): Promise<void> => {
  const { id } = req.params;
  const { email_sent_at } = req.body;
  const invoiceId = parseInt(id, 10);

  if (isNaN(invoiceId)) {
    throw new ValidationError('Invalid invoice ID');
  }

  try {
    const tenantId = req.tenantId || req.user?.tenant_id || 1;
    const changes = await invoiceService.markInvoiceAsSent(invoiceId, email_sent_at, tenantId);

    res.json({ 
      success: true, 
      data: { changes },
      message: 'Invoice marked as sent'
    });
  } catch (error) {
    const errorMessage = (error as Error).message;
    if (errorMessage === 'Valid invoice ID is required') {
      throw new ValidationError('Valid invoice ID is required');
    }
    throw new ValidationError(errorMessage);
  }
});

/**
 * Get overdue invoices
 */
export const getOverdueInvoices = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const tenantId = req.tenantId || req.user?.tenant_id || 1;
  const overdueInvoices = await invoiceService.getOverdueInvoices(tenantId);
  res.json({ success: true, data: overdueInvoices });
});

/**
 * Get invoices by client ID
 */
export const getInvoicesByClientId = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { client_id } = req.params;
  const { limit = '100', offset = '0' } = req.query;

  if (typeof client_id !== 'string') {
    throw new ValidationError('Invalid client ID');
  }

  const clientId = parseInt(client_id, 10);

  if (isNaN(clientId)) {
    throw new ValidationError('Invalid client ID');
  }

  const parsedLimit = parseInt(limit as string, 10);
  const parsedOffset = parseInt(offset as string, 10);

  if (isNaN(parsedLimit) || isNaN(parsedOffset)) {
    throw new ValidationError('Invalid limit or offset');
  }

  const tenantId = req.tenantId || req.user?.tenant_id || 1;
  const invoices = await invoiceService.getInvoicesByClientId(clientId, { 
    limit: parsedLimit, 
    offset: parsedOffset 
  }, tenantId);
  
  res.json({ success: true, data: invoices });
});

/**
 * Get recent invoices
 */
export const getRecentInvoices = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { limit = '10' } = req.query;
  const parsedLimit = parseInt(limit as string, 10);

  if (isNaN(parsedLimit) || parsedLimit < 1) {
    throw new ValidationError('Invalid limit');
  }

  const tenantId = req.tenantId || req.user?.tenant_id || 1;
  const invoices = await invoiceService.getRecentInvoices(parsedLimit, tenantId);
  res.json({ success: true, data: invoices });
});

/**
 * Check if invoice number exists
 */
export const checkInvoiceNumberExists = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { invoice_number } = req.params;
  const { exclude_id } = req.query;

  if (!invoice_number) {
    throw new ValidationError('Invoice number parameter is required');
  }

  let excludeId: number | undefined;
  if (exclude_id) {
    excludeId = parseInt(exclude_id as string, 10);
    if (isNaN(excludeId)) {
      throw new ValidationError('Invalid exclude_id');
    }
  }

  const tenantId = req.tenantId || req.user?.tenant_id || 1;
  const exists = await invoiceService.invoiceNumberExists(invoice_number, excludeId, tenantId);
  res.json({ success: true, data: { exists } });
});

/**
 * Generate next invoice number
 */
export const generateInvoiceNumber = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  try {
    const tenantId = req.tenantId || req.user?.tenant_id || 1;
    const invoiceNumber = await invoiceNumberService.generateInvoiceNumber(tenantId);

    res.json({
      success: true,
      data: { invoice_number: invoiceNumber }
    });
  } catch (error) {
    console.error('Error generating invoice number:', error);
    throw new ValidationError('Failed to generate invoice number');
  }
});

/**
 * Preview next invoice number (without incrementing counter)
 */
export const previewNextInvoiceNumber = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  try {
    const tenantId = req.tenantId || req.user?.tenant_id || 1;
    const invoiceNumber = await invoiceNumberService.getNextInvoiceNumber(tenantId);

    res.json({
      success: true,
      data: { invoice_number: invoiceNumber }
    });
  } catch (error) {
    console.error('Error previewing invoice number:', error);

    // Fallback: generate a default invoice number if service fails
    try {
      const fallbackNumber = `INV-${Date.now()}`;
      console.log('Using fallback invoice number:', fallbackNumber);

      res.json({
        success: true,
        data: { invoice_number: fallbackNumber }
      });
    } catch (fallbackError) {
      console.error('Fallback invoice number generation failed:', fallbackError);
      throw new ValidationError('Failed to preview invoice number');
    }
  }
});

/**
 * Send invoice via email
 */
export const sendInvoiceEmail = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const invoiceId = parseInt(req.params.id!, 10);
  const tenantId = req.tenantId || req.user?.tenant_id || 1;

  if (isNaN(invoiceId)) throw new ValidationError('Invalid invoice ID');

  const invoice = await invoiceService.getInvoiceById(invoiceId, tenantId);
  if (!invoice) throw new NotFoundError('Invoice');

  const toEmail = req.body?.to || invoice.client_email;
  if (!toEmail) throw new ValidationError('No recipient email address. Please set a client email.');

  // Build line items HTML
  let lineItemsHtml = '';
  if (invoice.line_items || (invoice as unknown as Record<string, unknown>).items) {
    try {
      const rawItems = invoice.line_items || (invoice as unknown as Record<string, unknown>).items || '[]';
      const items = JSON.parse(String(rawItems)) as Record<string, unknown>[];
      if (Array.isArray(items) && items.length > 0) {
        const rows = items.map((item: Record<string, unknown>) =>
          `<tr>
            <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;">${item.description || item.name || ''}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;text-align:center;">${item.quantity || 1}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;text-align:right;">${item.unit_price || item.price || ''}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;text-align:right;">${item.total || item.amount || ''}</td>
          </tr>`
        ).join('');
        lineItemsHtml = `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:20px 0;">
          <thead><tr style="background-color:#f5f5f5;">
            <th style="padding:10px 12px;text-align:left;font-size:12px;text-transform:uppercase;color:#666;">Description</th>
            <th style="padding:10px 12px;text-align:center;font-size:12px;text-transform:uppercase;color:#666;">Qty</th>
            <th style="padding:10px 12px;text-align:right;font-size:12px;text-transform:uppercase;color:#666;">Rate</th>
            <th style="padding:10px 12px;text-align:right;font-size:12px;text-transform:uppercase;color:#666;">Amount</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>`;
      }
    } catch { /* ignore parse errors */ }
  }

  const currency = invoice.currency || 'USD';
  const { publicUrl: invoiceUrl } = await invoiceService.generatePublicInvoiceToken(invoiceId, tenantId);

  const emailContent = await emailTemplateService.render('invoice', {
    client_name: invoice.client_name || 'Valued Client',
    invoice_number: invoice.invoice_number,
    invoice_date: invoice.issue_date || (invoice.created_at ? String(invoice.created_at).split('T')[0] : ''),
    due_date: invoice.due_date || 'N/A',
    total_amount: `${currency} ${(Number(invoice.total_amount || (invoice as unknown as Record<string, unknown>).amount || 0)).toFixed(2)}`,
    currency,
    invoice_url: invoiceUrl,
    line_items_html: lineItemsHtml
  }, tenantId);

  const result = await emailProviderService.sendEmail({
    to: toEmail,
    subject: emailContent.subject,
    html: emailContent.html,
    text: emailContent.text,
    tenantId
  });

  if (result.success) {
    await invoiceService.markInvoiceAsSent(invoiceId, undefined, tenantId);
  }

  res.json({ success: result.success, message: result.message });
});
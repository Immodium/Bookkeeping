import { Request, Response } from 'express';
import { retainerService } from '../services/RetainerService.js';
import {
  AppError,
  NotFoundError,
  ValidationError,
  asyncHandler
} from '../middleware/index.js';
import { RetainerBillingCycle, RetainerStatus } from '../types/index.js';
import { RetainerRequest } from '../types/api.types.js';
import { emailTemplateService } from '../services/EmailTemplateService.js';
import { emailProviderService } from '../services/EmailProviderService.js';

export const getAllRetainers = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const {
    status,
    billing_cycle,
    client_id,
    search,
    limit = '50',
    offset = '0'
  } = req.query;

  const parsedLimit = parseInt(limit as string, 10);
  const parsedOffset = parseInt(offset as string, 10);

  if (isNaN(parsedLimit) || isNaN(parsedOffset)) {
    throw new ValidationError('Invalid limit or offset');
  }

  const parsedClientId = client_id ? parseInt(client_id as string, 10) : undefined;
  if (client_id && isNaN(parsedClientId as number)) {
    throw new ValidationError('Invalid client_id');
  }

  const filters: {
    status?: RetainerStatus;
    billing_cycle?: RetainerBillingCycle;
    client_id?: number;
    search?: string;
  } = {};

  if (status) {
    filters.status = status as RetainerStatus;
  }

  if (billing_cycle) {
    filters.billing_cycle = billing_cycle as RetainerBillingCycle;
  }

  if (parsedClientId !== undefined) {
    filters.client_id = parsedClientId;
  }

  if (search) {
    filters.search = search as string;
  }

  const tenantId = req.tenantId || req.user?.tenant_id || 1;
  const results = await retainerService.getAllRetainers(filters, {
    limit: parsedLimit,
    offset: parsedOffset
  }, tenantId);

  res.json({
    success: true,
    data: results
  });
});

export const getRetainerById = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  if (typeof id !== 'string') {
    throw new ValidationError('Invalid retainer ID');
  }

  const retainerId = parseInt(id, 10);
  if (isNaN(retainerId)) {
    throw new ValidationError('Invalid retainer ID');
  }

  const tenantId = req.tenantId || req.user?.tenant_id || 1;
  const retainer = await retainerService.getRetainerById(retainerId, tenantId);
  if (!retainer) {
    throw new NotFoundError('Retainer');
  }

  res.json({
    success: true,
    data: retainer
  });
});

export const createRetainer = asyncHandler(
  async (req: Request<object, object, { retainerData: RetainerRequest }>, res: Response): Promise<void> => {
    const { retainerData } = req.body;

    if (!retainerData) {
      throw new ValidationError('Retainer data is required');
    }

    try {
      const tenantId = req.tenantId || req.user?.tenant_id || 1;
      const retainerId = await retainerService.createRetainer(retainerData, tenantId);
      const createdRetainer = await retainerService.getRetainerById(retainerId, tenantId);

      res.status(201).json({
        success: true,
        data: createdRetainer || { id: retainerId },
        message: 'Retainer created successfully'
      });
    } catch (error) {
      const errorMessage = (error as Error).message;
      if (errorMessage.includes('required')) {
        throw new ValidationError('Client, name, start date, and next invoice date are required');
      } else if (errorMessage.includes('positive')) {
        throw new ValidationError('Amount must be a positive number');
      } else if (errorMessage.includes('Invalid date')) {
        throw new ValidationError('Invalid date format');
      } else if (errorMessage.includes('Client ID')) {
        throw new ValidationError(errorMessage);
      } else if (errorMessage.includes('Invalid billing cycle')) {
        throw new ValidationError('Invalid billing cycle');
      } else if (errorMessage.includes('Invalid retainer status')) {
        throw new ValidationError('Invalid retainer status');
      }

      throw new ValidationError(errorMessage);
    }
  }
);

export const updateRetainer = asyncHandler(
  async (
    req: Request<{ id: string }, object, { retainerData: Partial<RetainerRequest> }>,
    res: Response
  ): Promise<void> => {
    const { id } = req.params;
    const { retainerData } = req.body;
    const retainerId = parseInt(id, 10);

    if (isNaN(retainerId)) {
      throw new ValidationError('Invalid retainer ID');
    }

    if (!retainerData) {
      throw new ValidationError('Retainer data is required');
    }

    try {
      const tenantId = req.tenantId || req.user?.tenant_id || 1;
      const changes = await retainerService.updateRetainer(retainerId, retainerData, tenantId);
      const updatedRetainer = await retainerService.getRetainerById(retainerId, tenantId);

      res.json({
        success: true,
        data: updatedRetainer || { changes },
        message: 'Retainer updated successfully'
      });
    } catch (error) {
      const errorMessage = (error as Error).message;
      if (errorMessage === 'Retainer not found') {
        throw new NotFoundError('Retainer');
      } else if (errorMessage === 'No valid fields to update') {
        throw new ValidationError('No valid fields to update');
      } else if (errorMessage.includes('positive')) {
        throw new ValidationError('Amount must be a positive number');
      } else if (errorMessage.includes('Invalid date')) {
        throw new ValidationError('Invalid date format');
      } else if (errorMessage.includes('Client ID')) {
        throw new ValidationError(errorMessage);
      } else if (errorMessage.includes('Invalid billing cycle')) {
        throw new ValidationError('Invalid billing cycle');
      } else if (errorMessage.includes('Invalid retainer status')) {
        throw new ValidationError('Invalid retainer status');
      }

      throw new ValidationError(errorMessage);
    }
  }
);

export const deleteRetainer = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  if (typeof id !== 'string') {
    throw new ValidationError('Invalid retainer ID');
  }

  const retainerId = parseInt(id, 10);
  if (isNaN(retainerId)) {
    throw new ValidationError('Invalid retainer ID');
  }

  try {
    const tenantId = req.tenantId || req.user?.tenant_id || 1;
    const changes = await retainerService.deleteRetainer(retainerId, tenantId);
    res.json({
      success: true,
      data: { changes },
      message: 'Retainer deleted successfully'
    });
  } catch (error) {
    const errorMessage = (error as Error).message;
    if (errorMessage === 'Retainer not found') {
      throw new NotFoundError('Retainer');
    }
    throw new AppError(errorMessage, 500);
  }
});

export const getRetainerStats = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const tenantId = req.tenantId || req.user?.tenant_id || 1;
  const stats = await retainerService.getRetainerStats(tenantId);
  res.json({
    success: true,
    data: stats
  });
});

export const sendRetainerEmail = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const retainerId = parseInt(req.params.id!, 10);
  const tenantId = req.tenantId || req.user?.tenant_id || 1;

  if (isNaN(retainerId)) throw new ValidationError('Invalid retainer ID');

  const retainer = await retainerService.getRetainerById(retainerId, tenantId);
  if (!retainer) throw new NotFoundError('Retainer');

  const toEmail = req.body?.to || retainer.client_email;
  if (!toEmail) throw new ValidationError('No recipient email address. Please set a client email.');

  const currency = retainer.currency || 'USD';
  const portalUrl = `${process.env.APP_URL || process.env.CLIENT_URL || 'http://localhost:5173'}/retainers`;

  const emailContent = await emailTemplateService.render('retainer', {
    client_name: retainer.client_name || 'Valued Client',
    retainer_name: retainer.name,
    amount: `${currency} ${(Number(retainer.amount || 0)).toFixed(2)}`,
    currency,
    billing_cycle: retainer.billing_cycle || 'monthly',
    start_date: retainer.start_date || (retainer.created_at ? String(retainer.created_at).split('T')[0] : ''),
    portal_url: portalUrl
  }, tenantId);

  const result = await emailProviderService.sendEmail({
    to: toEmail,
    subject: emailContent.subject,
    html: emailContent.html,
    text: emailContent.text,
    tenantId
  });

  res.json({ success: result.success, message: result.message });
});

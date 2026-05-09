import { Request, Response } from 'express';
import { asyncHandler, NotFoundError, ValidationError } from '../middleware/index.js';
import { tenantService } from '../services/TenantService.js';
import type { Tenant } from '../types/index.js';

type TenantStatus = Tenant['status'];

const parseTenantId = (value: string | undefined): number => {
  if (!value) {
    throw new ValidationError('Tenant ID is required');
  }
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 1) {
    throw new ValidationError('Tenant ID must be a positive integer');
  }
  return parsed;
};

export const listTenants = asyncHandler(async (_req: Request, res: Response): Promise<void> => {
  const tenants = await tenantService.getAllTenants();
  res.json({ success: true, data: tenants });
});

export const getTenantById = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const tenantId = parseTenantId(req.params.id);
  const tenant = await tenantService.getTenantById(tenantId);
  if (!tenant) {
    throw new NotFoundError('Tenant');
  }
  res.json({ success: true, data: tenant });
});

export const createTenant = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const body = req.body as {
    tenantData?: {
      name?: string;
      slug?: string;
      admin?: { name?: string; email?: string; password?: string };
    };
  };

  const payload = body?.tenantData || req.body;
  if (!payload || typeof payload !== 'object') {
    throw new ValidationError('Tenant payload is required');
  }

  try {
    const result = await tenantService.createTenant({
      name: payload.name || '',
      slug: payload.slug,
      admin: {
        name: payload.admin?.name || '',
        email: payload.admin?.email || '',
        password: payload.admin?.password || ''
      }
    });

    res.status(201).json({
      success: true,
      data: result,
      message: 'Tenant created successfully'
    });
  } catch (error) {
    throw new ValidationError((error as Error).message);
  }
});

export const bootstrapTenantAdmin = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const tenantId = parseTenantId(req.params.id);
  const body = req.body as {
    admin?: { name?: string; email?: string; password?: string };
  };
  const adminPayload = body?.admin || req.body;

  if (!adminPayload || typeof adminPayload !== 'object') {
    throw new ValidationError('Admin bootstrap payload is required');
  }

  try {
    const result = await tenantService.bootstrapTenantAdmin(tenantId, {
      name: adminPayload.name || '',
      email: adminPayload.email || '',
      password: adminPayload.password || ''
    });

    res.status(201).json({
      success: true,
      data: result,
      message: 'Tenant admin bootstrapped successfully'
    });
  } catch (error) {
    const message = (error as Error).message;
    if (message === 'Tenant not found') {
      throw new NotFoundError('Tenant');
    }
    throw new ValidationError(message);
  }
});

export const updateTenantStatus = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const tenantId = parseTenantId(req.params.id);
  const status = (req.body?.status || '') as TenantStatus;

  try {
    await tenantService.updateTenantStatus(tenantId, status);
    res.json({
      success: true,
      message: `Tenant status updated to ${status}`
    });
  } catch (error) {
    const message = (error as Error).message;
    if (message === 'Tenant not found') {
      throw new NotFoundError('Tenant');
    }
    throw new ValidationError(message);
  }
});

export const suspendTenant = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const tenantId = parseTenantId(req.params.id);
  try {
    await tenantService.suspendTenant(tenantId);
    res.json({ success: true, message: 'Tenant suspended successfully' });
  } catch (error) {
    const message = (error as Error).message;
    if (message === 'Tenant not found') {
      throw new NotFoundError('Tenant');
    }
    throw new ValidationError(message);
  }
});

export const activateTenant = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const tenantId = parseTenantId(req.params.id);
  try {
    await tenantService.activateTenant(tenantId);
    res.json({ success: true, message: 'Tenant activated successfully' });
  } catch (error) {
    const message = (error as Error).message;
    if (message === 'Tenant not found') {
      throw new NotFoundError('Tenant');
    }
    throw new ValidationError(message);
  }
});

export const deleteTenant = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const tenantId = parseTenantId(req.params.id);
  try {
    await tenantService.deleteTenant(tenantId);
    res.json({ success: true, message: 'Tenant deleted successfully' });
  } catch (error) {
    const message = (error as Error).message;
    if (message === 'Tenant not found') {
      throw new NotFoundError('Tenant');
    }
    throw new ValidationError(message);
  }
});

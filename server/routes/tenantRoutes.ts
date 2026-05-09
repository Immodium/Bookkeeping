import { Router, Request, Response, NextFunction } from 'express';
import {
  activateTenant,
  bootstrapTenantAdmin,
  createTenant,
  deleteTenant,
  getTenantById,
  listTenants,
  suspendTenant,
  updateTenantStatus
} from '../controllers/tenantController.js';
import { serverConfig } from '../config/index.js';
import {
  requireAuth,
  requireRole,
  validateRequest,
  validationRules,
  validationSets
} from '../middleware/index.js';

const router: Router = Router();

const requireSaasMode = (_req: Request, res: Response, next: NextFunction): void => {
  if (!serverConfig.saasMode) {
    res.status(404).json({
      success: false,
      error: 'Endpoint unavailable when SAAS_MODE is disabled'
    });
    return;
  }
  next();
};

const requirePlatformAdmin = (req: Request, res: Response, next: NextFunction): void => {
  const tenantId = req.tenantId || req.user?.tenant_id || 1;
  if (tenantId !== 1) {
    res.status(403).json({
      success: false,
      error: 'Platform admin access required'
    });
    return;
  }
  next();
};

router.use(requireAuth);
router.use(requireRole('admin'));
router.use(requireSaasMode);
router.use(requirePlatformAdmin);

router.get('/', listTenants);
router.get('/:id', [validationRules.id], validateRequest, getTenantById);
router.post('/', validationSets.createTenant, validateRequest, createTenant);
router.post('/:id/bootstrap-admin', validationSets.bootstrapTenantAdmin, validateRequest, bootstrapTenantAdmin);
router.patch('/:id/status', validationSets.updateTenantStatus, validateRequest, updateTenantStatus);
router.patch('/:id/suspend', [validationRules.id], validateRequest, suspendTenant);
router.patch('/:id/activate', [validationRules.id], validateRequest, activateTenant);
router.delete('/:id', [validationRules.id], validateRequest, deleteTenant);

export default router;

import { Router } from 'express';
import {
  getAllRetainers,
  getRetainerById,
  createRetainer,
  updateRetainer,
  deleteRetainer,
  getRetainerStats,
  sendRetainerEmail
} from '../controllers/retainerController.js';
import {
  requireAuth,
  requireRole,
  validateRequest,
  validationSets
} from '../middleware/index.js';
import { applyTenantSchema } from '../middleware/tenantSchema.js';

const router: Router = Router();

router.use(requireAuth);
router.use(applyTenantSchema);
router.use(requireRole(['admin', 'client_manager', 'project_manager']));

router.get('/', getAllRetainers);
router.get('/stats', getRetainerStats);

router.get(
  '/:id',
  validationSets.getRetainerById,
  validateRequest,
  getRetainerById
);

router.post(
  '/',
  validationSets.createRetainer,
  validateRequest,
  createRetainer
);

router.put(
  '/:id',
  validationSets.updateRetainer,
  validateRequest,
  updateRetainer
);

router.delete(
  '/:id',
  validationSets.getRetainerById,
  validateRequest,
  deleteRetainer
);

router.post(
  '/:id/email',
  validationSets.getRetainerById,
  validateRequest,
  sendRetainerEmail
);

export default router;

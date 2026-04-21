import { Router } from 'express';
import {
  getAllRetainers,
  getRetainerById,
  createRetainer,
  updateRetainer,
  deleteRetainer,
  getRetainerStats
} from '../controllers/retainerController.js';
import {
  requireAuth,
  requireRole,
  validateRequest,
  validationSets
} from '../middleware/index.js';

const router: Router = Router();

router.use(requireAuth);
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

export default router;

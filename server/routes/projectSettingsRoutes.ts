// Project settings routes for Slimbooks
// Handles project configuration endpoints

import { Router } from 'express';
import {
  getProjectSettings,
  updateProjectSettings
} from '../controllers/settingsController.js';
import { requireAuth, requireAdmin } from '../middleware/index.js';

const router: Router = Router();

// Get project configuration (combines .env defaults with database overrides)
router.get('/', getProjectSettings);

// Update project settings
router.put('/', requireAuth, requireAdmin, updateProjectSettings);

export default router;
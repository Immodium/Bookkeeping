// Project settings routes for Slimbooks
// Handles project configuration endpoints

import { Router } from 'express';
import {
  getProjectSettings,
  updateProjectSettings
} from '../controllers/settingsController.js';
import { requireAuth, requireRole } from '../middleware/index.js';

const router: Router = Router();

// Get project configuration (combines .env defaults with database overrides)
router.get('/', requireAuth, requireRole(['admin', 'project_manager']), getProjectSettings);

// Update project settings
router.put('/', requireAuth, requireRole(['admin', 'project_manager']), updateProjectSettings);

export default router;
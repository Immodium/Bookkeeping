// Database routes - handles database backup and restore operations
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import * as databaseController from '../controllers/databaseController.js';

const router: Router = Router();

// Export database
router.get('/export', requireAuth, databaseController.exportDatabase);

// Import database
router.post('/import', requireAuth, databaseController.importDatabase);

export default router;
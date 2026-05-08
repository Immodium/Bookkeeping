// Database routes - handles database backup and restore operations
import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { serverConfig } from '../config/index.js';
import * as databaseController from '../controllers/databaseController.js';

const router: Router = Router();

const requireDatabaseImportExportEnabled = (_req: Request, res: Response, next: NextFunction): void => {
  if (serverConfig.allowDatabaseImportExport) {
    next();
    return;
  }
  res.status(403).json({
    success: false,
    error: 'Database import/export is disabled in hosted mode'
  });
};

// Export database
router.get('/export', requireAuth, requireAdmin, requireDatabaseImportExportEnabled, databaseController.exportDatabase);

// Import database
router.post('/import', requireAuth, requireAdmin, requireDatabaseImportExportEnabled, databaseController.importDatabase);

export default router;
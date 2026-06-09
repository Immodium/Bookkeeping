// Database controller - handles database backup and restore operations
import { Request, Response } from 'express';
import multer from 'multer';

// Configure multer for file uploads (kept for route compatibility, but import is not accepted)
const upload = multer({
  dest: '/tmp/',
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit
  },
  fileFilter: (_req, _file, cb) => {
    cb(new Error('Database file import is not supported with PostgreSQL. Use pg_restore instead.'));
  }
});

// Export database
export const exportDatabase = async (_req: Request, res: Response): Promise<void> => {
  res.status(501).json({
    success: false,
    error: 'Database export is not supported with PostgreSQL. Use pg_dump to export the database.'
  });
};

// Import database
export const importDatabase = [
  upload.single('database'),
  async (_req: Request, res: Response): Promise<void> => {
    res.status(501).json({
      success: false,
      error: 'Database import is not supported with PostgreSQL. Use pg_restore to import the database.'
    });
  }
];

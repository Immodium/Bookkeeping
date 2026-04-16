import { Router } from 'express';
import { mkdirSync } from 'fs';
import multer from 'multer';
import { join, resolve } from 'path';
import {
  createProject,
  createProjectTask,
  deleteProject,
  deleteProjectDocument,
  deleteProjectTask,
  getProjectById,
  getProjectDocuments,
  getProjects,
  getProjectTasks,
  updateProject,
  updateProjectTask,
  uploadProjectDocument
} from '../controllers/index.js';
import { requireAuth } from '../middleware/index.js';

const router: Router = Router();

const projectUploadPath = resolve(join(process.cwd(), 'public', 'uploads', 'projects'));
mkdirSync(projectUploadPath, { recursive: true });

const upload = multer({
  dest: projectUploadPath,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  },
  fileFilter: (_req, file, cb) => {
    const allowedMimeTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'image/png',
      'image/jpeg',
      'image/webp'
    ];
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
      return;
    }
    cb(new Error('Unsupported file type'));
  }
});

router.use(requireAuth);

router.get('/', getProjects);
router.get('/:id', getProjectById);
router.post('/', createProject);
router.put('/:id', updateProject);
router.delete('/:id', deleteProject);

router.get('/:id/tasks', getProjectTasks);
router.post('/:id/tasks', createProjectTask);
router.put('/:id/tasks/:taskId', updateProjectTask);
router.delete('/:id/tasks/:taskId', deleteProjectTask);

router.get('/:id/documents', getProjectDocuments);
router.post('/:id/documents', upload.single('document'), uploadProjectDocument);
router.delete('/:id/documents/:documentId', deleteProjectDocument);

export default router;

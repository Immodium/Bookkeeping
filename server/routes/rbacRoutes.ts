import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/index.js';
import { getCurrentUserRoles, getRoleCatalog } from '../controllers/index.js';

const router: Router = Router();

router.use(requireAuth);

router.get('/me', getCurrentUserRoles);
router.get('/catalog', requireAdmin, getRoleCatalog);

export default router;

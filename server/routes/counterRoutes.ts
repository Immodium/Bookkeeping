// Counter routes for Slimbooks
// Handles ID counter management endpoints

import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/index.js';
import { applyTenantSchema } from '../middleware/tenantSchema.js';
import { userHasRole } from '../auth/roles.js';
import { counterService } from '../services/CounterService.js';

interface AuthenticatedRequest extends Request {
  user?: any;
}

const router: Router = Router();

// All counter routes require authentication
router.use(requireAuth);
router.use(applyTenantSchema);

// Get next ID for a counter
router.get('/:counterName/next', async (req: Request, res: Response): Promise<void> => {
  try {
    const { counterName } = req.params;
    const tenantId = req.tenantId || req.user?.tenant_id || 1;
    
    if (!counterName) {
      res.status(400).json({
        success: false,
        error: 'Counter name is required'
      });
      return;
    }
    
    const nextId = await counterService.getNextCounterId(counterName, tenantId);
    
    res.json({
      success: true,
      nextId: nextId
    });
  } catch (error) {
    console.error('Error getting next counter ID:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get next counter ID'
    });
  }
});

// Get current counter value
router.get('/:counterName', async (req: Request, res: Response): Promise<void> => {
  try {
    const { counterName } = req.params;
    const tenantId = req.tenantId || req.user?.tenant_id || 1;
    
    const counter = await counterService.getCurrentCounterValue(counterName!, tenantId);
    
    if (!counter) {
      res.status(404).json({
        success: false,
        error: 'Counter not found'
      });
      return;
    }
    
    res.json({
      success: true,
      data: counter
    });
  } catch (error) {
    console.error('Error getting counter:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get counter'
    });
  }
});

// Reset counter (admin only)
router.put('/:counterName/reset', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { counterName } = req.params;
    const { value = 0 } = req.body;
    const tenantId = req.tenantId || req.user?.tenant_id || 1;
    
    // Check if user has admin role
    if (!userHasRole(req.user?.roles, 'admin')) {
      res.status(403).json({
        success: false,
        error: 'Admin access required'
      });
      return;
    }
    
    await counterService.resetCounter(counterName!, value, tenantId);
    
    res.json({
      success: true,
      message: `Counter ${counterName} reset to ${value}`
    });
  } catch (error) {
    console.error('Error resetting counter:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to reset counter'
    });
  }
});

export default router;
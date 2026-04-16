import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/index.js';
import { rbacService } from '../services/RbacService.js';

export const getRoleCatalog = asyncHandler(async (_req: Request, res: Response): Promise<void> => {
  res.json({
    success: true,
    data: rbacService.getAppRoles()
  });
});

export const getCurrentUserRoles = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const user = req.user;
  if (!user) {
    res.status(401).json({ success: false, error: 'Authentication required' });
    return;
  }

  const roles = rbacService.getUserRoles(user.id);
  res.json({
    success: true,
    data: {
      user_id: user.id,
      roles
    }
  });
});

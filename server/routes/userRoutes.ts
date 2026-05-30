// User routes for Slimbooks API
// Handles all user-related endpoints

import { Router, Request, Response, NextFunction } from 'express';
import {
  getAllUsers,
  getUserById,
  getUserByEmail,
  getUserByGoogleId,
  createUser,
  inviteUser,
  updateUser,
  deleteUser,
  updateUserLoginAttempts,
  updateUserLastLogin,
  updateLoginAttemptsByUserId,
  updateLastLoginByUserId,
  verifyUserEmail,
  resetUserPasswordByAdmin
} from '../controllers/index.js';
import {
  requireAuth,
  requirePermission,
  validateRequest,
  validationSets
} from '../middleware/index.js';
import { serverConfig } from '../config/index.js';

const router: Router = Router();

const requireUsersRead = requirePermission('users.read');
const requireUsersWrite = requirePermission('users.write');
const requireUsersResetPassword = requirePermission('users.reset_password');

// Check if admin user exists (public endpoint for initialization)
router.get('/admin-exists', async (req: Request, res: Response) => {
  try {
    if (serverConfig.saasMode) {
      res.status(404).json({
        success: false,
        error: 'Endpoint unavailable in SaaS mode'
      });
      return;
    }
    const { userService } = await import('../services/UserService.js');
    const adminUser = await userService.getUserByEmail('admin@slimbooks.app', 1);
    const adminExists = adminUser && adminUser.role === 'admin';
    res.json({
      success: true,
      exists: !!adminExists,
      adminConfigured: !!adminExists
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
      exists: false,
      adminConfigured: false
    });
  }
});

// Get all users (admin only)
router.get('/',
  requireAuth,
  requireUsersRead,
  getAllUsers
);

// Get user by ID (admin only)
router.get('/:id', 
  requireAuth, 
  requireUsersRead, 
  validationSets.updateUser.slice(0, 1), // Just ID validation
  validateRequest,
  getUserById
);

// Get user by email (public for admin check, otherwise admin only)
router.get('/email/:email', async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  const { email } = req.params;

  // Allow public access for admin user check during initialization
  if (!serverConfig.saasMode && email === 'admin@slimbooks.app') {
    try {
      const { userService } = await import('../services/UserService.js');
      const user = await userService.getUserByEmail(email, 1);

      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found',
          exists: false
        });
      }

      return res.json({
        success: true,
        data: user,
        exists: true
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: (error as Error).message,
        exists: false
      });
    }
  } else {
    // For all other emails, require authentication and admin privileges
    requireAuth(req, res, (err: any) => {
      if (err) return next(err);
      requireUsersRead(req, res, (err: any) => {
        if (err) return next(err);
        getUserByEmail(req, res, next);
      });
    });
  }
});

// Get user by Google ID (admin only)
router.get('/google/:googleId', 
  requireAuth, 
  requireUsersRead, 
  getUserByGoogleId
);

// Create new user (admin only)
router.post('/', 
  requireAuth, 
  requireUsersWrite, 
  validationSets.createUser,
  validateRequest,
  createUser
);

// Alternative create user endpoint (legacy support)
router.post('/create', 
  requireAuth, 
  requireUsersWrite, 
  validationSets.createUser,
  validateRequest,
  createUser
);

// Invite user (create account + optional invitation email)
router.post('/invite',
  requireAuth,
  requireUsersWrite,
  validationSets.inviteUser,
  validateRequest,
  inviteUser
);

// Update user (admin only)
router.put('/:id', 
  requireAuth, 
  requireUsersWrite, 
  validationSets.updateUser,
  validateRequest,
  updateUser
);

// Delete user (admin only)
router.delete('/:id', 
  requireAuth, 
  requireUsersWrite, 
  validationSets.updateUser.slice(0, 1), // Just ID validation
  validateRequest,
  deleteUser
);

// Update user login attempts (internal use)
router.post('/update-login-attempts', 
  requireAuth,
  requireUsersWrite,
  updateUserLoginAttempts
);

// Update user last login (internal use)
router.post('/update-last-login', 
  requireAuth,
  requireUsersWrite,
  updateUserLastLogin
);

// Update user login attempts by ID (public for login process)
router.put('/:id/login-attempts',
  requireAuth,
  requireUsersWrite,
  updateLoginAttemptsByUserId
);

// Update user last login by ID (public for login process)
router.put('/:id/last-login',
  requireAuth,
  requireUsersWrite,
  updateLastLoginByUserId
);

// Verify user email (admin only)
router.put('/:id/verify-email', 
  requireAuth, 
  requireUsersWrite, 
  verifyUserEmail
);

// Admin password reset for a user account
router.post('/:id/reset-password',
  requireAuth,
  requireUsersResetPassword,
  validationSets.adminResetPassword,
  validateRequest,
  resetUserPasswordByAdmin
);

export default router;
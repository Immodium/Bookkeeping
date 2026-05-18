// Authentication routes for Slimbooks API
// Handles login, registration, password reset, and email verification

import { Router } from 'express';
import {
  login,
  register,
  requestPasswordReset,
  resetPassword,
  verifyEmail,
  refreshToken,
  getProfile,
  updateProfile,
  changePassword,
  logout
} from '../controllers/index.js';
import {
  requireAuth,
  createLoginRateLimit,
  validateRequest,
  validationSets
} from '../middleware/index.js';

const router: Router = Router();

// Apply login rate limiting to authentication endpoints
const loginRateLimit = createLoginRateLimit();

// User login
router.post('/login', 
  loginRateLimit,
  validationSets.login,
  validateRequest,
  login
);

// User registration
router.post('/register', 
  validationSets.register,
  validateRequest,
  register
);

// Request password reset email
router.post('/forgot-password',
  validationSets.forgotPassword,
  validateRequest,
  requestPasswordReset
);

// Reset password with token
router.post('/reset-password', 
  validationSets.resetPassword,
  validateRequest,
  resetPassword
);

// Verify email with token
router.post('/verify-email', 
  verifyEmail
);

// Refresh JWT token
router.post('/refresh-token', 
  refreshToken
);

// Get current user profile (requires authentication)
router.get('/profile', 
  requireAuth,
  getProfile
);

// Update user profile (requires authentication)
router.put('/profile', 
  requireAuth,
  updateProfile
);

// Change password (requires authentication)
router.post('/change-password',
  requireAuth,
  changePassword
);

// Logout - invalidates all sessions via token_version bump
router.post('/logout',
  requireAuth,
  logout
);

export default router;
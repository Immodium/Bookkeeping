// Authentication routes for Slimbooks API
// Handles login, registration, password reset, and email verification

import { Router, Request, Response } from 'express';
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
  logout,
  registerTenant
} from '../controllers/index.js';
import {
  requireAuth,
  createLoginRateLimit,
  validateRequest,
  validationSets
} from '../middleware/index.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { apiKeyService } from '../services/ApiKeyService.js';
import { auditService } from '../services/AuditService.js';

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

// Tenant self-service registration (public)
router.post('/register-tenant', registerTenant);

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

// --- API Key management ---

/**
 * GET /api/auth/api-keys
 * List caller's API keys (no key hashes returned).
 */
router.get(
  '/api-keys',
  requireAuth,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tenantId = req.tenantId || req.user?.tenant_id || 1;
    const userId = req.user!.id;
    const keys = await apiKeyService.listKeys(tenantId, userId);
    res.json({ success: true, data: keys });
  })
);

/**
 * POST /api/auth/api-keys
 * Create a new API key.
 * Body: { name, scopes?, expiresAt? }
 * Returns { record, rawKey } — rawKey shown once only.
 */
router.post(
  '/api-keys',
  requireAuth,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tenantId = req.tenantId || req.user?.tenant_id || 1;
    const userId = req.user!.id;
    const { name, scopes, expiresAt } = req.body || {};

    if (!name || typeof name !== 'string') {
      res.status(400).json({ success: false, error: 'name is required' });
      return;
    }

    const result = await apiKeyService.createKey(
      tenantId,
      userId,
      name,
      Array.isArray(scopes) ? scopes : undefined,
      typeof expiresAt === 'string' ? expiresAt : undefined
    );

    auditService.log({
      action: 'apikey.created',
      tenantId,
      userId,
      metadata: { keyName: name, keyId: result.record.id }
    });

    res.status(201).json({ success: true, data: result });
  })
);

/**
 * DELETE /api/auth/api-keys/:id
 * Revoke an API key (scoped to caller's tenant+user).
 */
router.delete(
  '/api-keys/:id',
  requireAuth,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tenantId = req.tenantId || req.user?.tenant_id || 1;
    const userId = req.user!.id;
    const id = parseInt(req.params.id!, 10);

    if (isNaN(id)) {
      res.status(400).json({ success: false, error: 'Invalid API key ID' });
      return;
    }

    // Verify the key belongs to this user before revoking
    const keys = await apiKeyService.listKeys(tenantId, userId);
    const keyBelongsToUser = keys.some(k => k.id === id);
    if (!keyBelongsToUser) {
      res.status(404).json({ success: false, error: 'API key not found' });
      return;
    }

    const revoked = await apiKeyService.revokeKey(id, tenantId);
    if (!revoked) {
      res.status(404).json({ success: false, error: 'API key not found' });
      return;
    }

    auditService.log({
      action: 'apikey.revoked',
      tenantId,
      userId,
      metadata: { keyId: id }
    });

    res.json({ success: true, message: 'API key revoked' });
  })
);

export default router;
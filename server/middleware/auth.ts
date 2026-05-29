// Authentication middleware for Slimbooks
// Handles JWT verification, role-based access control, and session management

import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { authConfig } from '../config/index.js';
import { authService } from '../services/AuthService.js';
import { subscriptionService } from '../services/SubscriptionService.js';
import { tenantService } from '../services/TenantService.js';
import { databaseService } from '../core/DatabaseService.js';
import { User, UserPublic, UserRole } from '../types/index.js';
import { hasRole as roleListHasRole, hasAnyRole } from '../auth/roles.js';
import { apiKeyService } from '../services/ApiKeyService.js';
import { usageService } from '../services/UsageService.js';

// Extend the Request interface to include user property
declare global {
  namespace Express {
    interface Request {
      user?: UserPublic;
      tenantId?: number;
    }
  }
}

interface JWTPayload {
  userId: number;
  tenantId?: number;
  email: string;
  role: UserRole;
  roles?: UserRole[];
  type: string;
  tokenVersion?: number;
  iat: number;
}

interface TokenGenerationUser {
  id: number;
  tenant_id?: number;
  email: string;
  role: UserRole;
  roles?: UserRole[];
  token_version?: number;
}

interface AccountLockoutSettings {
  maxAttempts: number;
  lockoutDuration: number;
}

/**
 * Middleware to require authentication
 * Verifies JWT token and attaches user to request
 */
export const requireAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const apiKeyHeader = req.headers['x-api-key'] as string | undefined;
    const token = req.headers.authorization?.replace('Bearer ', '');

    // --- API Key authentication (only if no Bearer token present) ---
    if (!token && apiKeyHeader) {
      try {
        const keyResult = await apiKeyService.verifyKey(apiKeyHeader);
        if (!keyResult) {
          res.status(401).json({ success: false, error: 'Invalid API key' });
          return;
        }

        const user = await authService.getUserById(keyResult.userId);
        if (!user) {
          res.status(401).json({ success: false, error: 'Invalid API key - user not found' });
          return;
        }

        const resolvedTenantId = keyResult.tenantId;
        const tenantIsActive = await tenantService.isTenantActive(resolvedTenantId);
        if (!tenantIsActive) {
          res.status(403).json({ success: false, error: 'Tenant is suspended or unavailable' });
          return;
        }

        req.user = user;
        req.tenantId = resolvedTenantId;

        // Increment api_calls usage (fire-and-forget)
        usageService.increment(resolvedTenantId, 'api_calls').catch(() => {});

        next();
        return;
      } catch {
        res.status(401).json({ success: false, error: 'Invalid API key' });
        return;
      }
    }

    if (!token) {
      res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
      return;
    }

    // Verify JWT token — try current secret first, then previous secret (rotation grace period)
    try {
      let decoded: JWTPayload;
      try {
        decoded = jwt.verify(token, authConfig.jwtSecret, { algorithms: ['HS256'] }) as JWTPayload;
      } catch (primaryErr) {
        if (authConfig.jwtSecretPrevious) {
          decoded = jwt.verify(token, authConfig.jwtSecretPrevious, { algorithms: ['HS256'] }) as JWTPayload;
        } else {
          throw primaryErr;
        }
      }

      // Get user from database via service
      const user = await authService.getUserById(decoded.userId);

      if (!user) {
        res.status(401).json({
          success: false,
          error: 'Invalid token - user not found'
        });
        return;
      }

      // Validate token version to support session invalidation
      if (decoded.tokenVersion !== undefined) {
        const tokenVersionRow = await databaseService.getOne<{ token_version: number }>(
          'SELECT token_version FROM users WHERE id = ?', [decoded.userId]
        );
        const currentVersion = tokenVersionRow?.token_version ?? 0;
        if (decoded.tokenVersion < currentVersion) {
          res.status(401).json({
            success: false,
            error: 'Token has been invalidated'
          });
          return;
        }
      }

      // Check if user account is locked
      if (user.account_locked_until && new Date(user.account_locked_until) > new Date()) {
        res.status(423).json({
          success: false,
          error: 'Account is temporarily locked'
        });
        return;
      }
      
      // Check if email verification is required
      try {
        const requireEmailVerification = await authService.isEmailVerificationRequired(user.tenant_id || 1);
        
        if (requireEmailVerification && !user.email_verified) {
          res.status(403).json({
            success: false,
            error: 'Email verification required',
            requires_email_verification: true
          });
          return;
        }
      } catch (error) {
        console.error('Error checking email verification setting:', error);
        // Continue with default behavior if setting check fails
      }
      
      // Attach user to request
      req.user = user;
      const resolvedTenantId = user.tenant_id || 1;
      const tenantIsActive = await tenantService.isTenantActive(resolvedTenantId);
      if (!tenantIsActive) {
        res.status(403).json({
          success: false,
          error: 'Tenant is suspended or unavailable'
        });
        return;
      }
      if (decoded.tenantId && decoded.tenantId !== resolvedTenantId) {
        res.status(401).json({
          success: false,
          error: 'Invalid token - tenant mismatch'
        });
        return;
      }
      req.tenantId = resolvedTenantId;
      next();
      
    } catch (jwtError) {
      res.status(401).json({
        success: false,
        error: 'Invalid or expired token'
      });
      return;
    }
    
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({
      success: false,
      error: 'Authentication service error'
    });
    return;
  }
};

/**
 * Middleware to require admin role
 * Must be used after requireAuth
 */
export const requireAdmin = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Authentication required'
    });
    return;
  }
  
  if (!roleListHasRole(req.user.roles, 'admin')) {
    res.status(403).json({
      success: false,
      error: 'Admin access required'
    });
    return;
  }
  
  next();
};

/**
 * Middleware to require specific role
 * @param roles - Required role(s)
 */
export const requireRole = (roles: UserRole | UserRole[]) => {
  const allowedRoles = Array.isArray(roles) ? roles : [roles];
  
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
      return;
    }
    
    if (!hasAnyRole(req.user.roles, allowedRoles)) {
      res.status(403).json({
        success: false,
        error: `Access denied. Required role: ${allowedRoles.join(' or ')}`
      });
      return;
    }
    
    next();
  };
};

/**
 * Middleware to require email verification
 * Must be used after requireAuth
 */
export const requireEmailVerified = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Authentication required'
    });
    return;
  }
  
  if (!req.user.email_verified) {
    res.status(403).json({
      success: false,
      error: 'Email verification required'
    });
    return;
  }
  
  next();
};

/**
 * Optional authentication middleware
 * Attaches user to request if token is valid, but doesn't require it
 */
export const optionalAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (token) {
      try {
        let decoded: JWTPayload;
        try {
          decoded = jwt.verify(token, authConfig.jwtSecret, { algorithms: ['HS256'] }) as JWTPayload;
        } catch {
          if (authConfig.jwtSecretPrevious) {
            decoded = jwt.verify(token, authConfig.jwtSecretPrevious, { algorithms: ['HS256'] }) as JWTPayload;
          } else {
            throw new Error('Invalid token');
          }
        }
        const user = await authService.getUserById(decoded.userId);
        
        const tenantIsActive = user
          ? await tenantService.isTenantActive(user.tenant_id || 1)
          : false;
        if (
          user &&
          (!user.account_locked_until || new Date(user.account_locked_until) <= new Date()) &&
          tenantIsActive
        ) {
          req.user = user;
          req.tenantId = user.tenant_id || 1;
        }
      } catch (jwtError) {
        // Invalid token, but that's okay for optional auth
        console.log('Optional auth: Invalid token provided');
      }
    }
    
    next();
  } catch (error) {
    console.error('Optional authentication error:', error);
    next(); // Continue without authentication
  }
};

/**
 * Generate JWT token for user
 * @param user - User object
 * @returns JWT token
 */
export const generateToken = (user: TokenGenerationUser): string => {
  const payload: JWTPayload = {
    userId: user.id,
    tenantId: user.tenant_id || 1,
    email: user.email,
    role: user.role,
    ...(user.roles ? { roles: user.roles } : {}),
    type: 'access',
    tokenVersion: user.token_version ?? 0,
    iat: Math.floor(Date.now() / 1000)
  };

  return jwt.sign(payload, authConfig.jwtSecret, {
    expiresIn: Math.floor(authConfig.accessTokenExpiry / 1000) // Convert ms to seconds
  });
};

/**
 * Verify JWT token
 * @param token - JWT token
 * @returns Decoded token payload
 */
export const verifyToken = (token: string): JWTPayload => {
  try {
    return jwt.verify(token, authConfig.jwtSecret, { algorithms: ['HS256'] }) as JWTPayload;
  } catch (err) {
    if (authConfig.jwtSecretPrevious) {
      return jwt.verify(token, authConfig.jwtSecretPrevious, { algorithms: ['HS256'] }) as JWTPayload;
    }
    throw err;
  }
};

/**
 * Check if user account is locked
 * @param user - User object
 * @returns True if account is locked
 */
export const isAccountLocked = (user: User | UserPublic): boolean => {
  return user.account_locked_until ? new Date(user.account_locked_until) > new Date() : false;
};

export const userHasRole = (user: UserPublic | undefined, role: UserRole): boolean => {
  return roleListHasRole(user?.roles, role);
};

export const requireAnyRole = (roles: UserRole[]) => requireRole(roles);
export const requireRoles = (roles: UserRole[]) => requireRole(roles);

export type PermissionKey =
  | 'users.read'
  | 'users.write'
  | 'users.reset_password'
  | 'clients.manage'
  | 'reports.view'
  | 'projects.manage'
  | 'settings.manage'
  | 'all';

const PERMISSION_ROLE_MAP: Record<PermissionKey, UserRole[]> = {
  'users.read': ['admin', 'user_manager'],
  'users.write': ['admin', 'user_manager'],
  'users.reset_password': ['admin', 'user_manager'],
  'clients.manage': ['admin', 'client_manager', 'project_manager'],
  'reports.view': ['admin', 'client_manager', 'project_manager'],
  'projects.manage': ['admin', 'project_manager'],
  'settings.manage': ['admin'],
  all: ['admin']
};

export const requirePermission = (permission: PermissionKey) => {
  const roles = PERMISSION_ROLE_MAP[permission] || PERMISSION_ROLE_MAP.all;
  return requireRole(roles);
};

export const requireEntitlement = (
  entitlementKey: string,
  options: { allowAdminBypass?: boolean } = {}
) => {
  const { allowAdminBypass = false } = options;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
      return;
    }

    if (allowAdminBypass && roleListHasRole(req.user.roles, 'admin')) {
      next();
      return;
    }

    const tenantId = req.tenantId || req.user.tenant_id || 1;
    try {
      const enabled = await subscriptionService.isFeatureEnabled(tenantId, entitlementKey);
      if (!enabled) {
        res.status(403).json({
          success: false,
          error: `Feature disabled by subscription entitlement: ${entitlementKey}`
        });
        return;
      }
      next();
    } catch (error) {
      console.error('Entitlement check error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to validate feature entitlement'
      });
    }
  };
};

/**
 * Get account lockout settings from project settings
 */
const getAccountLockoutSettings = (): AccountLockoutSettings => {
  try {
    // Note: This would need to be replaced with proper database access
    // For now, return default values from config
    return { 
      maxAttempts: authConfig.maxLoginAttempts, 
      lockoutDuration: authConfig.lockoutDuration 
    };
  } catch (error) {
    console.error('Error getting lockout settings:', error);
    // Return defaults if settings cannot be retrieved
    return { 
      maxAttempts: authConfig.maxLoginAttempts, 
      lockoutDuration: authConfig.lockoutDuration 
    };
  }
};

/**
 * Middleware to require platform admin access (tenant_id === 1).
 * Must be used after requireAuth.
 */
export const requirePlatformAdmin = (req: Request, res: Response, next: NextFunction): void => {
  const tenantId = req.tenantId ?? req.user?.tenant_id ?? 1;
  if (tenantId !== 1) {
    res.status(403).json({
      success: false,
      error: 'Platform admin access required'
    });
    return;
  }
  next();
};

/**
 * Middleware that asserts the tenant_id URL param (or body field) matches the
 * authenticated user's tenant. Use on routes where a tenantId flows through
 * the URL or request body to prevent cross-tenant IDOR.
 *
 * Example:
 *   router.get('/tenants/:tenantId/invoices', requireAuth, requireTenantMatch, listInvoices)
 */
export const requireTenantMatch = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Authentication required' });
    return;
  }

  const paramTenantId = req.params.tenantId ? parseInt(req.params.tenantId, 10) : undefined;
  const bodyTenantId = req.body?.tenant_id ? parseInt(String(req.body.tenant_id), 10) : undefined;
  const candidate = paramTenantId ?? bodyTenantId;

  if (candidate === undefined) {
    // No tenant ID in request — nothing to check
    next();
    return;
  }

  const userTenantId = req.tenantId ?? req.user.tenant_id ?? 1;
  const isPlatformAdmin = roleListHasRole(req.user.roles, 'admin') && userTenantId === 1;

  if (!isPlatformAdmin && candidate !== userTenantId) {
    res.status(403).json({ success: false, error: 'Tenant access denied' });
    return;
  }

  next();
};

// updateLoginAttempts has been removed - use authService.updateLoginAttempts directly
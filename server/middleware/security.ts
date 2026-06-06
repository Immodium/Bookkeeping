// Security middleware for Slimbooks server
// Implements rate limiting, input validation, and security headers

import rateLimit, { RateLimitRequestHandler } from 'express-rate-limit';
import helmet, { HelmetOptions } from 'helmet';
import { Request, Response, NextFunction } from 'express';
import { serverConfig } from '../config/index.js';
import { logger } from '../utils/logger.js';

interface RateLimitConfig {
  windowMs?: number;
  max?: number;
}

interface RateLimitResponse {
  error: string;
  retryAfter: number;
}

interface CorsOptions {
  origin: string | boolean | string[];
  credentials: boolean;
  methods: string[];
  allowedHeaders: string[];
  maxAge: number;
}

// Rate limiting configurations
export const createGeneralRateLimit = (
  windowMs = serverConfig.rateLimiting.windowMs,
  max = serverConfig.rateLimiting.maxRequests
): RateLimitRequestHandler => {
  return rateLimit({
    windowMs,
    max,
    message: {
      error: 'Too many requests from this IP, please try again later.',
      retryAfter: Math.ceil(windowMs / 1000)
    } as RateLimitResponse,
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    // Skip rate limiting for health checks
    skip: (req: Request): boolean => {
      return req.path === '/api/health' || req.path === '/health';
    },
    handler: (_req: Request, res: Response): void => {
      res.status(429).json({
        success: false,
        error: 'Too many requests from this IP, please try again later.',
        retryAfter: Math.ceil(windowMs / 1000)
      });
    }
  });
};

export const createLoginRateLimit = (
  windowMs = serverConfig.rateLimiting.loginWindowMs,
  max = serverConfig.rateLimiting.loginMaxRequests
): RateLimitRequestHandler => {
  return rateLimit({
    windowMs,
    max,
    message: {
      error: 'Too many login attempts from this IP, please try again later.',
      retryAfter: Math.ceil(windowMs / 1000)
    } as RateLimitResponse,
    skipSuccessfulRequests: true, // Don't count successful requests
    handler: (_req: Request, res: Response): void => {
      res.status(429).json({
        success: false,
        error: 'Too many login attempts from this IP, please try again later.',
        retryAfter: Math.ceil(windowMs / 1000)
      });
    }
  });
};

// Security headers configuration
export const createSecurityHeaders = (corsOrigin = 'http://localhost:8080') => {
  const helmetOptions: HelmetOptions = {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
        baseUri: ["'self'"],
        upgradeInsecureRequests: []
      },
    },
    crossOriginEmbedderPolicy: false, // Disabled for compatibility
    frameguard: { action: 'deny' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    noSniff: true,
    xssFilter: true,
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    }
  };

  return helmet(helmetOptions);
};

// CORS configuration
export const createCorsOptions = (
  origin = serverConfig.corsOrigin,
  credentials = serverConfig.corsCredentials
): CorsOptions => {
  if (process.env.NODE_ENV === 'production' && (!origin || origin === '*')) {
    throw new Error('CORS_ORIGIN must be explicitly set to a specific domain in production');
  }
  return {
    origin: origin,
    credentials: credentials,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400 // 24 hours
  };
};

/**
 * CSRF protection via Origin/Referer header enforcement.
 *
 * State-changing requests (POST/PUT/PATCH/DELETE) must originate from the
 * configured CORS origin. Browsers always send the Origin header for
 * cross-origin requests, so this blocks CSRF attacks regardless of whether
 * the caller uses cookies or Authorization headers.
 *
 * Exempted paths (receive legitimate cross-origin calls):
 *   - /api/auth/register-tenant — public self-service signup
 */
export const csrfProtection = (req: Request, res: Response, next: NextFunction): void => {
  const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
  const EXEMPT_PATHS = ['/api/auth/register-tenant'];

  if (SAFE_METHODS.has(req.method)) {
    return next();
  }

  if (EXEMPT_PATHS.some(p => req.path.startsWith(p))) {
    return next();
  }

  // In development skip enforcement but log for visibility
  const isProd = serverConfig.isProduction;

  const allowedOrigin = serverConfig.corsOrigin;
  const origin = req.headers.origin as string | undefined;
  const referer = req.headers.referer as string | undefined;

  const source = origin || referer;

  if (!source) {
    // No Origin/Referer header. Browsers always send Origin on state-changing
    // cross-origin requests, so a missing Origin from a cookie/browser client
    // is a CSRF red flag. Allow explicit API-key (server-to-server) callers;
    // in production, reject everything else.
    const hasApiKey = Boolean(req.headers['x-api-key']);
    if (hasApiKey) {
      return next();
    }
    if (isProd) {
      logger.warn({ method: req.method, path: req.path }, 'CSRF: rejected state-changing request with no Origin/Referer and no API key');
      res.status(403).json({ success: false, error: 'CSRF check failed: missing Origin/Referer header' });
      return;
    }
    return next();
  }

  const normalise = (s: string) => s.replace(/\/$/, '').toLowerCase();
  const allowed = normalise(allowedOrigin);
  const incoming = normalise(source.split('/').slice(0, 3).join('/'));

  if (incoming !== allowed) {
    logger.warn({ method: req.method, path: req.path, incoming, allowed }, 'CSRF: origin mismatch — request blocked');
    res.status(403).json({ success: false, error: 'CSRF check failed: origin not allowed' });
    return;
  }

  next();
};
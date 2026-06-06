// Error handling middleware for Slimbooks
// Centralized error handling and logging

import { Request, Response, NextFunction } from 'express';
import { Server } from 'http';
import { loggingConfig } from '../config/index.js';
import { logger } from '../utils/logger.js';

interface PgError extends Error {
  code: string;
  errno?: number;
}

interface MulterError extends Error {
  code: string;
  field?: string;
}

interface JWTError extends Error {
  name: 'JsonWebTokenError' | 'TokenExpiredError';
}

interface ParseError extends Error {
  type: 'entity.parse.failed';
}

interface ErrorLogInfo {
  timestamp: string;
  method: string;
  url: string;
  ip: string | undefined;
  userAgent?: string;
  error: {
    message: string;
    stack: string | undefined;
    type: any;
    statusCode: any;
  };
}

/**
 * Custom error class for application errors
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly timestamp: string;
  public readonly type?: string;

  constructor(message: string, statusCode = 500, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.timestamp = new Date().toISOString();
    
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Database error class
 */
export class DatabaseError extends AppError {
  public readonly type: string = 'DATABASE_ERROR';
  public readonly originalError: Error | null;

  constructor(message: string, originalError: Error | null = null) {
    super(message, 500);
    this.originalError = originalError;
  }
}

/**
 * Validation error class
 */
export class ValidationError extends AppError {
  public readonly type: string = 'VALIDATION_ERROR';
  public readonly details: unknown;

  constructor(message: string, details: unknown = null) {
    super(message, 400);
    this.details = details;
  }
}

/**
 * Authentication error class
 */
export class AuthenticationError extends AppError {
  public readonly type: string = 'AUTHENTICATION_ERROR';

  constructor(message = 'Authentication failed') {
    super(message, 401);
  }
}

/**
 * Authorization error class
 */
export class AuthorizationError extends AppError {
  public readonly type: string = 'AUTHORIZATION_ERROR';

  constructor(message = 'Access denied') {
    super(message, 403);
  }
}

/**
 * Not found error class
 */
export class NotFoundError extends AppError {
  public readonly type: string = 'NOT_FOUND_ERROR';

  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404);
  }
}

/**
 * Rate limit error class
 */
export class RateLimitError extends AppError {
  public readonly type: string = 'RATE_LIMIT_ERROR';

  constructor(message = 'Too many requests') {
    super(message, 429);
  }
}

/**
 * Main error handling middleware
 * Should be the last middleware in the chain
 */
export const errorHandler = (
  err: Error | AppError | DatabaseError | MulterError | JWTError | ParseError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Log error details
  logError(err, req);
  
  // Handle different types of errors
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: err.message,
      type: err.type,
      timestamp: err.timestamp,
      requestId: req?.headers?.['x-request-id'],
      ...(loggingConfig.level === 'debug' && { stack: err.stack }),
      ...('details' in err && err.details ? { details: err.details } : {})
    });
    return;
  }
  
  // Handle PostgreSQL errors (pg error codes are numeric strings like '23505')
  if ('code' in err && typeof err.code === 'string' && /^\d+$/.test(err.code)) {
    handlePostgreSQLError(err as PgError, res);
    return;
  }
  
  // Handle validation errors from express-validator
  if ('type' in err && err.type === 'entity.parse.failed') {
    res.status(400).json({
      success: false,
      error: 'Invalid JSON in request body',
      type: 'PARSE_ERROR'
    });
    return;
  }
  
  // Handle multer errors (file upload)
  if ('code' in err && err.code === 'LIMIT_FILE_SIZE') {
    res.status(400).json({
      success: false,
      error: 'File size too large',
      type: 'FILE_SIZE_ERROR'
    });
    return;
  }
  
  // Handle JWT errors
  if (err.name === 'JsonWebTokenError') {
    res.status(401).json({
      success: false,
      error: 'Invalid token',
      type: 'JWT_ERROR'
    });
    return;
  }
  
  if (err.name === 'TokenExpiredError') {
    res.status(401).json({
      success: false,
      error: 'Token expired',
      type: 'JWT_EXPIRED_ERROR'
    });
    return;
  }
  
  // Handle unexpected errors
  logger.error({ err, requestId: req?.headers?.['x-request-id'] }, 'Unexpected error');

  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message,
    type: 'INTERNAL_ERROR',
    requestId: req?.headers?.['x-request-id'],
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
};

/**
 * Handle PostgreSQL specific errors (pg error codes)
 * See: https://www.postgresql.org/docs/current/errcodes-appendix.html
 */
const handlePostgreSQLError = (err: PgError, res: Response): void => {
  logger.error({ err }, 'PostgreSQL error');

  switch (err.code) {
    case '23505': // unique_violation
      res.status(409).json({
        success: false,
        error: 'Resource already exists',
        type: 'DUPLICATE_ERROR'
      });
      break;

    case '23503': // foreign_key_violation
      res.status(400).json({
        success: false,
        error: 'Invalid reference to related resource',
        type: 'FOREIGN_KEY_ERROR'
      });
      break;

    case '23502': // not_null_violation
      res.status(400).json({
        success: false,
        error: 'Required field is missing',
        type: 'NULL_CONSTRAINT_ERROR'
      });
      break;

    default:
      res.status(500).json({
        success: false,
        error: 'Database operation failed',
        type: 'DATABASE_ERROR'
      });
      break;
  }
};

/**
 * Log error details
 */
const logError = (err: Error, req: Request): void => {
  const userAgent = req.get('User-Agent');
  const errorInfo: ErrorLogInfo = {
    timestamp: new Date().toISOString(),
    method: req.method,
    url: req.url,
    ip: req.ip,
    ...(userAgent && { userAgent }),
    error: {
      message: err.message,
      stack: err.stack,
      type: 'type' in err ? (err as any).type : err.name,
      statusCode: 'statusCode' in err ? (err as any).statusCode : undefined
    }
  };
  
  if (loggingConfig.enableErrorLogging) {
    logger.error({ requestId: req?.headers?.['x-request-id'], errorInfo }, 'Error occurred');
  }
  
  // TODO: Implement file logging or external logging service
  // writeToLogFile('error.log', errorInfo);
};

/**
 * Async error wrapper
 * Wraps async route handlers to catch errors automatically
 */
export const asyncHandler = <T extends Request, U extends Response>(
  fn: (req: T, res: U, next: NextFunction) => Promise<void>
) => {
  return (req: T, res: U, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * 404 handler for unmatched routes
 */
export const notFoundHandler = (req: Request, res: Response, next: NextFunction): void => {
  const error = new NotFoundError(`Route ${req.method} ${req.path}`);
  next(error);
};

/**
 * Request timeout handler
 */
export const timeoutHandler = (timeout = 30000) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const timer = setTimeout(() => {
      if (!res.headersSent) {
        const error = new AppError('Request timeout', 408);
        next(error);
      }
    }, timeout);
    
    res.on('finish', () => {
      clearTimeout(timer);
    });
    
    next();
  };
};

/**
 * Graceful shutdown handler
 */
export const gracefulShutdown = (
  server: Server,
  cleanup?: { close?: () => void | Promise<void> }
): void => {
  let shuttingDown = false;

  const shutdown = (signal: string): void => {
    // Guard against multiple signals triggering overlapping shutdowns.
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;

    logger.info(`${signal} received. Starting graceful shutdown...`);

    server.close(async (err) => {
      if (err) {
        logger.error({ err }, 'Error during server shutdown');
        process.exit(1);
      }

      logger.info('HTTP server closed.');

      // Run async cleanup (e.g. close the PDF browser and the DB pool).
      if (cleanup && typeof cleanup.close === 'function') {
        try {
          await cleanup.close();
          logger.info('Resource cleanup completed.');
        } catch (cleanupErr) {
          logger.error({ err: cleanupErr }, 'Error during resource cleanup');
        }
      }

      logger.info('Graceful shutdown completed.');
      process.exit(0);
    });
    
    // Force shutdown after 25 seconds
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 25000);
  };
  
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
};
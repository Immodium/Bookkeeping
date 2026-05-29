// Logging middleware for Slimbooks
// Handles request logging, performance monitoring, and audit trails

import { Request, Response, NextFunction } from 'express';
import { loggingConfig } from '../config/index.js';
import { auditService } from '../services/AuditService.js';
import { logger } from '../utils/logger.js';

interface RequestInfo {
  timestamp: string;
  method: string;
  url: string;
  ip: string;
  userAgent?: string;
  contentLength?: string;
  referer?: string;
  statusCode?: number;
  duration?: number;
  responseSize?: number;
}

interface LogEntry {
  timestamp: string;
  event?: string;
  details?: Record<string, unknown>;
  level?: string;
  operation?: string;
  table?: string;
}

interface SecurityLogEntry extends LogEntry {
  event: string;
  level: 'SECURITY';
}

interface UserActivityLogEntry extends LogEntry {
  action: string;
  userId: number;
  level: 'USER_ACTIVITY';
}

interface DBLogEntry extends LogEntry {
  operation: string;
  table: string;
}

interface PerformanceMetrics {
  requests: number;
  totalDuration: number;
  slowRequests: number;
  errors: number;
}

/**
 * Request logging middleware
 * Logs all incoming requests with timing information
 */
export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  if (!loggingConfig.enableRequestLogging) {
    return next();
  }

  const start = Date.now();
  const originalSend = res.send.bind(res);

  const userAgent = req.get('User-Agent');
  const contentLength = req.get('Content-Length');
  const referer = req.get('Referer');

  const requestInfo: RequestInfo = {
    timestamp: new Date().toISOString(),
    method: req.method,
    url: req.url,
    ip: req.ip || req.connection.remoteAddress || 'unknown',
    ...(userAgent && { userAgent }),
    ...(contentLength && { contentLength }),
    ...(referer && { referer })
  };

  res.send = function(data: any): Response {
    const duration = Date.now() - start;
    const responseSize = Buffer.isBuffer(data) ? data.length : Buffer.byteLength(data || '', 'utf8');

    logRequest({
      ...requestInfo,
      userAgent: requestInfo.userAgent || 'unknown',
      contentLength: requestInfo.contentLength || '0',
      referer: requestInfo.referer || '-',
      statusCode: res.statusCode,
      duration,
      responseSize
    });

    return originalSend(data);
  };

  next();
};

/**
 * Log request details
 */
const logRequest = (info: Required<RequestInfo>): void => {
  const { method, url, ip, statusCode, duration, responseSize } = info;

  const logFn = statusCode >= 500 ? logger.error.bind(logger)
    : statusCode >= 400 ? logger.warn.bind(logger)
    : logger.info.bind(logger);

  logFn({ method, url, ip, statusCode, duration, responseSize }, `${method} ${url} ${statusCode} ${duration}ms`);

  if (duration > 1000) {
    logger.warn({ method, url, duration }, 'Slow request detected');
  }
};

/**
 * Security audit logging
 * Logs security-related events as structured JSON via pino
 */
export const securityLogger = (event: string, details: Record<string, unknown> = {}): void => {
  const logEntry: SecurityLogEntry = {
    timestamp: new Date().toISOString(),
    event,
    details,
    level: 'SECURITY'
  };

  logger.warn({ security: true, event, ...details }, `SECURITY: ${event}`);

  // Persist high-severity events to audit log
  const highSeverityEvents = [
    'failed_login', 'account_locked', 'privilege_escalation',
    'invalid_token', 'unauthorized_access', 'suspicious_activity'
  ];
  if (highSeverityEvents.some(e => event.toLowerCase().includes(e.replace('_', '')))) {
    auditService.log({ action: `security.${event}`, metadata: details });
  }

  void logEntry;
};

/**
 * Database operation logging middleware
 * Logs database queries and operations (debug level only)
 */
export const dbLogger = (operation: string, table: string, details: Record<string, unknown> = {}): void => {
  if (loggingConfig.level !== 'debug') {
    return;
  }

  const logEntry: DBLogEntry = {
    timestamp: new Date().toISOString(),
    operation,
    table,
    details
  };

  logger.debug({ db: true, operation, table, ...details }, `DB: ${operation} on ${table}`);

  void logEntry;
};

/**
 * Performance monitoring middleware
 * Tracks application performance metrics and logs summaries every 5 minutes
 */
export const performanceMonitor = () => {
  const metrics: PerformanceMetrics = {
    requests: 0,
    totalDuration: 0,
    slowRequests: 0,
    errors: 0
  };

  setInterval(() => {
    if (metrics.requests > 0) {
      const avgDuration = metrics.totalDuration / metrics.requests;
      logger.info(
        { requests: metrics.requests, avgDurationMs: parseFloat(avgDuration.toFixed(2)), slowRequests: metrics.slowRequests, errors: metrics.errors },
        'Performance metrics (5min)'
      );

      if (metrics.errors / metrics.requests > 0.1) {
        logger.warn({ errorRate: (metrics.errors / metrics.requests).toFixed(3) }, 'Elevated error rate in last 5-minute window');
      }

      Object.keys(metrics).forEach(key => {
        metrics[key as keyof PerformanceMetrics] = 0;
      });
    }
  }, 5 * 60 * 1000);

  return (req: Request, res: Response, next: NextFunction): void => {
    const start = Date.now();

    res.on('finish', () => {
      const duration = Date.now() - start;
      metrics.requests++;
      metrics.totalDuration += duration;

      if (duration > 1000) {
        metrics.slowRequests++;
      }

      if (res.statusCode >= 400) {
        metrics.errors++;
      }
    });

    next();
  };
};

/**
 * Derive an audit action string from HTTP method and request path.
 * e.g. POST /api/invoices -> 'invoices.create'
 */
function deriveAction(method: string, path: string): string {
  const resource = (path.replace(/^\/api\//, '').split('/')[0] ?? '').replace(/-/g, '_');
  const verb = ({ POST: 'create', PUT: 'update', PATCH: 'update', DELETE: 'delete' } as Record<string, string>)[method] ?? 'mutate';
  return `${resource}.${verb}`;
}

/**
 * User activity logging middleware
 * Persists audit events for mutating requests that succeed (status < 400).
 * Also exposes a manual call signature for legacy callers.
 */
export function userActivityLogger(req: Request, res: Response, next: NextFunction): void;
export function userActivityLogger(action: string, userId: number, details?: Record<string, unknown>): void;
export function userActivityLogger(
  reqOrAction: Request | string,
  resOrUserId?: Response | number,
  nextOrDetails?: NextFunction | Record<string, unknown>
): void {
  // Legacy call: userActivityLogger(action, userId, details?)
  if (typeof reqOrAction === 'string') {
    const action = reqOrAction;
    const userId = resOrUserId as number;
    const details = (nextOrDetails as Record<string, unknown> | undefined) ?? {};
    const logEntry: UserActivityLogEntry = {
      timestamp: new Date().toISOString(),
      action,
      userId,
      details,
      level: 'USER_ACTIVITY'
    };
    logger.info({ userId, action, ...details }, `USER: ${action} by user ${userId}`);
    auditService.log({ action, userId, metadata: details });
    void logEntry;
    return;
  }

  // Middleware call: userActivityLogger(req, res, next)
  const req = reqOrAction as Request;
  const res = resOrUserId as Response;
  const next = nextOrDetails as NextFunction;

  res.on('finish', () => {
    const method = req.method;
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return;
    if (res.statusCode >= 400) return;

    const action = deriveAction(method, req.path);
    const tenantId = req.tenantId;
    const userId = (req.user as { id?: number } | undefined)?.id;
    const ipAddress = req.ip ?? undefined;
    const userAgent = req.get('user-agent') ?? undefined;

    auditService.log({ tenantId, userId, action, ipAddress, userAgent });
  });

  next();
}

/**
 * API endpoint usage tracking
 * Tracks which endpoints are being used and logs the top 10 every hour
 */
export const endpointTracker = () => {
  const endpointStats = new Map<string, number>();

  setInterval(() => {
    if (endpointStats.size > 0) {
      const sorted = Array.from(endpointStats.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

      logger.info({ endpoints: Object.fromEntries(sorted) }, 'Endpoint usage (1hr top-10)');
      endpointStats.clear();
    }
  }, 60 * 60 * 1000);

  return (req: Request, res: Response, next: NextFunction): void => {
    const endpoint = `${req.method} ${(req as any).route?.path || req.path}`;
    endpointStats.set(endpoint, (endpointStats.get(endpoint) || 0) + 1);
    next();
  };
};

/**
 * Error rate monitoring
 * Tracks error rates over a rolling window and logs a warning when > 10%
 */
export const errorRateMonitor = () => {
  const errorWindow: boolean[] = [];
  const windowSize = 100;
  const errorThreshold = 0.1;

  return (req: Request, res: Response, next: NextFunction): void => {
    res.on('finish', () => {
      const isError = res.statusCode >= 400;
      errorWindow.push(isError);

      if (errorWindow.length > windowSize) {
        errorWindow.shift();
      }

      if (errorWindow.length >= windowSize) {
        const errorCount = errorWindow.filter(Boolean).length;
        const errorRate = errorCount / windowSize;

        if (errorRate > errorThreshold) {
          logger.warn(
            { errorRate: errorRate.toFixed(3), errorCount, windowSize },
            'High error rate detected'
          );
        }
      }
    });

    next();
  };
};

/**
 * Health check logging
 * Logs system health information every 10 minutes
 */
export const healthLogger = (): void => {
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  setInterval(() => {
    const memUsage = process.memoryUsage();
    const uptime = process.uptime();
    logger.info(
      { uptimeSeconds: Math.floor(uptime), heapUsed: formatBytes(memUsage.heapUsed), heapTotal: formatBytes(memUsage.heapTotal) },
      'Health check'
    );
  }, 10 * 60 * 1000);
};

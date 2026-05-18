// Health check routes for Slimbooks API
// Provides system health and status information

import { Router, Request, Response } from 'express';
import { serverConfig } from '../config/index.js';
import { databaseService } from '../core/DatabaseService.js';

const router: Router = Router();

/**
 * Basic health check
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { databaseHealthService } = await import('../services/DatabaseHealthService.js');
    const isHealthy = await databaseHealthService.checkDatabaseHealth();
    
    res.json({ 
      status: 'ok', 
      database: isHealthy ? 'connected' : 'disconnected',
      timestamp: new Date().toISOString(),
      environment: serverConfig.nodeEnv
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'error', 
      database: 'disconnected',
      error: (error as Error).message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Detailed health check
 */
router.get('/detailed', async (req: Request, res: Response) => {
  try {
    const { databaseHealthService } = await import('../services/DatabaseHealthService.js');
    const healthData = await databaseHealthService.getDetailedHealthData();

    // System information
    const memUsage = process.memoryUsage();
    const uptime = process.uptime();

    let activeTenants: number | undefined;
    if (serverConfig.saasMode && healthData.status === 'healthy') {
      try {
        const row = await databaseService.getOne<{ count: number }>(
          `SELECT COUNT(*) AS count FROM tenants WHERE status = 'active'`
        );
        activeTenants = row?.count ?? 0;
      } catch {
        // Non-fatal
      }
    }

    res.json({
      status: healthData.status,
      timestamp: new Date().toISOString(),
      environment: serverConfig.nodeEnv,
      version: '1.0.0',
      saas_mode: serverConfig.saasMode,
      ...(activeTenants !== undefined && { active_tenants: activeTenants }),
      database: healthData.database,
      system: {
        uptime: Math.floor(uptime),
        memory: {
          used: Math.round(memUsage.heapUsed / 1024 / 1024),
          total: Math.round(memUsage.heapTotal / 1024 / 1024),
          external: Math.round(memUsage.external / 1024 / 1024)
        },
        node_version: process.version,
        platform: process.platform
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: (error as Error).message,
      database: {
        status: 'disconnected'
      }
    });
  }
});

/**
 * Readiness check (for container orchestration)
 */
router.get('/ready', async (req: Request, res: Response) => {
  try {
    const { databaseHealthService } = await import('../services/DatabaseHealthService.js');
    const isHealthy = await databaseHealthService.checkDatabaseHealth();
    
    if (isHealthy) {
      res.json({ 
        ready: true,
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(503).json({ 
        ready: false,
        error: 'Database not ready',
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    res.status(503).json({ 
      ready: false,
      error: (error as Error).message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Liveness check (for container orchestration)
 */
router.get('/live', (req: Request, res: Response) => {
  res.json({
    alive: true,
    timestamp: new Date().toISOString()
  });
});

/**
 * Prometheus-compatible metrics endpoint (unauthenticated)
 */
router.get('/metrics', async (_req: Request, res: Response) => {
  try {
    const memUsage = process.memoryUsage();
    const uptime = process.uptime();

    // Measure DB response time
    let dbStatus = 'ok';
    let dbResponseTimeMs = 0;
    let tenantTotal = 0;
    let tenantActive = 0;
    let tenantSuspended = 0;

    try {
      const dbStart = Date.now();
      const row = await databaseService.getOne<{ total: number; active: number; suspended: number }>(
        `SELECT
           COUNT(*) AS total,
           SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active,
           SUM(CASE WHEN status = 'suspended' THEN 1 ELSE 0 END) AS suspended
         FROM tenants`
      );
      dbResponseTimeMs = Date.now() - dbStart;
      tenantTotal = row?.total ?? 0;
      tenantActive = row?.active ?? 0;
      tenantSuspended = row?.suspended ?? 0;
    } catch {
      dbStatus = 'error';
    }

    res.json({
      timestamp: new Date().toISOString(),
      uptime_seconds: Math.floor(uptime),
      memory: {
        rss_mb: Math.round(memUsage.rss / 1024 / 1024),
        heap_used_mb: Math.round(memUsage.heapUsed / 1024 / 1024),
        heap_total_mb: Math.round(memUsage.heapTotal / 1024 / 1024)
      },
      database: {
        status: dbStatus,
        response_time_ms: dbResponseTimeMs
      },
      tenants: {
        total: tenantTotal,
        active: tenantActive,
        suspended: tenantSuspended
      },
      process: {
        node_version: process.version,
        pid: process.pid
      }
    });
  } catch (error) {
    res.status(500).json({
      timestamp: new Date().toISOString(),
      error: (error as Error).message
    });
  }
});

export default router;
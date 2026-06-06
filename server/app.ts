// Main application setup for Slimbooks server
// Clean, modular server configuration

import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import pinoHttp from 'pino-http';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import { dirname, isAbsolute, join, resolve } from 'path';
import { existsSync, readFileSync } from 'fs';
import https from 'https';
import http from 'http';

// Import configuration
import { serverConfig, validateConfig } from './config/index.js';

// Import logger
import { logger } from './utils/logger.js';

// Import database
import { initializeDatabase } from './database/index.js';

// Import middleware
import {
  createGeneralRateLimit,
  createSecurityHeaders,
  createCorsOptions,
  csrfProtection,
  requestLogger,
  errorHandler,
  notFoundHandler,
  performanceMonitor,
  healthLogger
} from './middleware/index.js';

// Import routes
import routes from './routes/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const resolveConfigPath = (configPath: string): string => {
  if (isAbsolute(configPath)) {
    return configPath;
  }
  return resolve(join(__dirname, '..'), configPath);
};

/**
 * Create and configure Express application
 */
export const createApp = async () => {
  // Validate configuration
  validateConfig();

  // Initialize database
  const includeSampleData = serverConfig.enableSampleData || serverConfig.isDevelopment;
  await initializeDatabase(includeSampleData);

  // Create Express app
  const app = express();
  app.set('trust proxy', 1);

  if (serverConfig.enforceHttpsRedirect) {
    app.use((req, res, next) => {
      const forwardedProto = req.get('x-forwarded-proto');
      const isSecureRequest = req.secure || forwardedProto === 'https';
      if (isSecureRequest) {
        return next();
      }

      const host = req.get('host');
      if (!host) {
        return next();
      }

      const statusCode = req.method === 'GET' || req.method === 'HEAD' ? 308 : 307;
      return res.redirect(statusCode, `https://${host}${req.originalUrl}`);
    });
  }

  // Request ID middleware — must be first
  app.use((req, res, next) => {
    const requestId = (req.headers['x-request-id'] as string) || randomUUID();
    req.headers['x-request-id'] = requestId;
    res.setHeader('X-Request-ID', requestId);
    next();
  });

  // Structured HTTP logging (skip health checks to reduce noise)
  app.use(pinoHttp({
    logger,
    customProps: (req) => ({ requestId: req.headers['x-request-id'] }),
    customSuccessMessage: (req, res) => `${req.method} ${req.url} ${res.statusCode}`,
    customErrorMessage: (req, res, err) => `${req.method} ${req.url} ${res.statusCode} — ${err.message}`,
    autoLogging: { ignore: (req) => req.url?.startsWith('/api/health') ?? false },
  }));

  // Security middleware
  app.use(createSecurityHeaders(serverConfig.corsOrigin));
  app.use(cors(createCorsOptions(serverConfig.corsOrigin)));
  app.use(createGeneralRateLimit());
  app.use(csrfProtection);

  // Logging and monitoring middleware
  app.use(requestLogger);
  app.use(performanceMonitor());

  // Response compression
  app.use(compression({ level: 6, threshold: 1024 }));

  // Body parsing middleware with size limits
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ limit: '10mb', extended: true }));
  app.use(cookieParser());

  // Static file serving (disable when CloudFront/S3 is handling assets in production)
  const distPath = join(__dirname, '..', 'dist');
  if (serverConfig.serveStaticFiles) {
    // Serve static files from uploads directory.
    // Harden against any file that slips through upload validation being used
    // for stored XSS: disable MIME sniffing and sandbox the response so the
    // browser never executes active content (scripts) served from /uploads.
    const uploadsPath = join(__dirname, '..', 'public', 'uploads');
    app.use('/uploads', express.static(uploadsPath, {
      setHeaders: (res) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
      }
    }));

    // Serve static files from dist directory (built frontend)
    app.use(express.static(distPath));
  }

  // API routes
  app.use('/', routes);

  // Serve index.html for client-side routing (must be after API routes)
  if (serverConfig.serveStaticFiles) {
    app.get('*', (req, res, next) => {
      // Skip API routes
      if (req.path.startsWith('/api/')) {
        return next();
      }
      res.sendFile(join(distPath, 'index.html'));
    });
  }

  // 404 handler for unmatched routes
  app.use(notFoundHandler);

  // Global error handler (must be last)
  app.use(errorHandler);

  return app;
};

/**
 * Start the server
 */
export const startServer = async () => {
  try {
    const app = await createApp();

    const protocol = serverConfig.enableHttps ? 'https' : 'http';

    let server: https.Server | http.Server;
    if (serverConfig.enableHttps) {
      const keyPath = resolveConfigPath(serverConfig.sslKeyPath);
      const certPath = resolveConfigPath(serverConfig.sslCertPath);

      if (!existsSync(keyPath) || !existsSync(certPath)) {
        throw new Error(
          `HTTPS is enabled but certificate files are missing (key: ${keyPath}, cert: ${certPath})`
        );
      }

      server = https.createServer(
        {
          key: readFileSync(keyPath),
          cert: readFileSync(certPath)
        },
        app
      );
      server.listen(serverConfig.port, serverConfig.host, () => {
        logger.info(`Slimbooks server running on ${protocol}://${serverConfig.host}:${serverConfig.port}`);
        logger.info(`TLS certificate loaded from ${certPath}`);
        logger.info(`Environment: ${serverConfig.nodeEnv} | CORS: ${serverConfig.corsOrigin} | Rate limit: ${serverConfig.rateLimiting.maxRequests}/${serverConfig.rateLimiting.windowMs / 1000}s`);

        const features = [];
        if (serverConfig.enforceHttpsRedirect) features.push('HTTPS redirect');
        if (serverConfig.enableDebugEndpoints) features.push('Debug');
        if (serverConfig.enableSampleData || serverConfig.isDevelopment) features.push('Sample data');
        if (features.length > 0) {
          logger.info(`Features: ${features.join(', ')}`);
        }
      });
    } else {
      server = app.listen(serverConfig.port, serverConfig.host, () => {
        logger.info(`Slimbooks server running on ${protocol}://${serverConfig.host}:${serverConfig.port}`);
        logger.info(`Environment: ${serverConfig.nodeEnv} | CORS: ${serverConfig.corsOrigin} | Rate limit: ${serverConfig.rateLimiting.maxRequests}/${serverConfig.rateLimiting.windowMs / 1000}s`);

        const features = [];
        if (serverConfig.enforceHttpsRedirect) features.push('HTTPS redirect');
        if (serverConfig.enableDebugEndpoints) features.push('Debug');
        if (serverConfig.enableSampleData || serverConfig.isDevelopment) features.push('Sample data');
        if (features.length > 0) {
          logger.info(`Features: ${features.join(', ')}`);
        }
      });
    }

    server.on('error', (error) => {
      logger.error({ err: error }, 'Server startup error');
    });

    if (!serverConfig.enableHttps) {
      logger.info('HTTPS is disabled (set ENABLE_HTTPS=true to enable TLS)');
    }

    if (serverConfig.enforceHttpsRedirect && !serverConfig.enableHttps) {
      logger.info('HTTPS redirect is enabled while app server is HTTP-only (expect TLS termination at proxy/load balancer)');
    }

    // Prominent production warning when HTTPS redirect is not enforced
    if (serverConfig.nodeEnv === 'production' && !serverConfig.enforceHttpsRedirect) {
      logger.warn('WARNING: ENFORCE_HTTPS_REDIRECT is disabled in production. Set ENFORCE_HTTPS_REDIRECT=true or ensure TLS is terminated at the load balancer.');
    }

    // Initialize health logging
    healthLogger();

    // Graceful shutdown handling
    const { gracefulShutdown } = await import('./middleware/index.js');
    const { db } = await import('./models/index.js');
    gracefulShutdown(server, { close: () => db.disconnect() });

    return server;
  } catch (error) {
    logger.error({ err: error }, 'Failed to start server');
    process.exit(1);
  }
};

export default { createApp, startServer };

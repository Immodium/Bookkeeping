// Main application setup for Slimbooks server
// Clean, modular server configuration
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import https from 'https';
import { execSync } from 'child_process';
// Import configuration
import { serverConfig, validateConfig } from './config/index.js';
// Import database
import { initializeDatabase } from './database/index.js';
// Import middleware
import { createGeneralRateLimit, createSecurityHeaders, createCorsOptions, requestLogger, errorHandler, notFoundHandler, performanceMonitor, healthLogger, validateFileUpload } from './middleware/index.js';
// Import routes
import routes from './routes/index.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ensureHttpsCertificate = () => {
    // Use configured certs when provided.
    if (serverConfig.httpsKeyPath && serverConfig.httpsCertPath &&
        existsSync(serverConfig.httpsKeyPath) &&
        existsSync(serverConfig.httpsCertPath)) {
        return {
            key: readFileSync(serverConfig.httpsKeyPath),
            cert: readFileSync(serverConfig.httpsCertPath)
        };
    }
    // Fall back to generating local self-signed cert for cloud/dev use.
    const certDir = join(__dirname, '..', 'data', 'certs');
    const keyPath = join(certDir, 'localhost-key.pem');
    const certPath = join(certDir, 'localhost-cert.pem');
    if (!existsSync(keyPath) || !existsSync(certPath)) {
        mkdirSync(certDir, { recursive: true });
        try {
            execSync(`openssl req -x509 -newkey rsa:2048 -sha256 -days 365 -nodes -keyout "${keyPath}" -out "${certPath}" -subj "/CN=localhost" -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"`, { stdio: 'ignore' });
        }
        catch (error) {
            // Final fallback if openssl is unavailable in runtime.
            const fallbackKey = process.env.HTTPS_KEY_PEM;
            const fallbackCert = process.env.HTTPS_CERT_PEM;
            if (fallbackKey && fallbackCert) {
                writeFileSync(keyPath, fallbackKey);
                writeFileSync(certPath, fallbackCert);
            }
            else {
                throw new Error('Unable to generate HTTPS certificate. Install openssl or set HTTPS_KEY_PEM/HTTPS_CERT_PEM.');
            }
        }
    }
    return {
        key: readFileSync(keyPath),
        cert: readFileSync(certPath)
    };
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
    // Security middleware
    app.use(createSecurityHeaders(serverConfig.corsOrigin));
    app.use(cors(createCorsOptions(serverConfig.corsOrigin)));
    app.use(createGeneralRateLimit());
    // Logging and monitoring middleware
    app.use(requestLogger);
    app.use(performanceMonitor());
    // Body parsing middleware with size limits
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ limit: '10mb', extended: true }));
    app.use(cookieParser());
    // Multer configuration for file uploads
    const projectRoot = join(__dirname, '..');
    const upload = multer({
        dest: resolve(projectRoot, serverConfig.uploadPath),
        limits: {
            fileSize: serverConfig.maxFileSize,
            files: 1,
            fieldSize: 1024 * 1024 // 1MB field size limit
        },
        fileFilter: (req, file, cb) => {
            const allowedMimes = [
                'application/octet-stream',
                'application/x-sqlite3',
                'application/vnd.sqlite3'
            ];
            if (allowedMimes.includes(file.mimetype) || file.originalname.endsWith('.db')) {
                cb(null, true);
            }
            else {
                cb(null, false);
                throw new Error('Invalid file type. Only database files are allowed.');
            }
        }
    });
    // File upload endpoint (if needed)
    app.post('/api/upload', upload.single('file'), validateFileUpload(), (req, res) => {
        res.json({
            success: true,
            message: 'File uploaded successfully',
            file: {
                filename: req.file?.filename,
                originalname: req.file?.originalname,
                size: req.file?.size
            }
        });
    });
    // Serve static files from uploads directory
    const uploadsPath = join(__dirname, '..', 'public', 'uploads');
    app.use('/uploads', express.static(uploadsPath));
    // Serve static files from dist directory (built frontend).
    // In this cloud workspace snapshot, frontend assets are under /workspace/dist
    // while backend runtime files are under /workspace/server/dist.
    const workspaceDistPath = join(__dirname, '..', '..', 'dist');
    const serverDistPath = join(__dirname, '..', 'dist');
    const distPath = existsSync(join(workspaceDistPath, 'index.html')) ? workspaceDistPath : serverDistPath;
    app.use(express.static(distPath));
    // API routes
    app.use('/', routes);
    // Serve index.html for client-side routing (must be after API routes)
    app.get('*', (req, res, next) => {
        // Skip API routes
        if (req.path.startsWith('/api/')) {
            return next();
        }
        res.sendFile(join(distPath, 'index.html'));
    });
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
        const tlsOptions = ensureHttpsCertificate();
        // HTTPS server
        const server = https.createServer(tlsOptions, app).listen(serverConfig.httpsPort, serverConfig.host, () => {
            console.log(`🚀 Slimbooks server running on https://${serverConfig.host}:${serverConfig.httpsPort}`);
            console.log(`📊 Environment: ${serverConfig.nodeEnv} | CORS: ${serverConfig.corsOrigin} | Rate limit: ${serverConfig.rateLimiting.maxRequests}/${serverConfig.rateLimiting.windowMs / 1000}s`);
            const features = [];
            if (serverConfig.enableDebugEndpoints)
                features.push('Debug');
            if (serverConfig.enableSampleData || serverConfig.isDevelopment)
                features.push('Sample data');
            features.push('HTTPS');
            if (features.length > 0) {
                console.log(`🔧 Features: ${features.join(', ')}`);
            }
        });
        // Initialize health logging
        healthLogger();
        // Graceful shutdown handling
        const { gracefulShutdown } = await import('./middleware/index.js');
        const { db } = await import('./models/index.js');
        gracefulShutdown(server, db);
        return server;
    }
    catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
};
export default { createApp, startServer };
//# sourceMappingURL=app.js.map
// Configuration management for Slimbooks server
// Centralizes all environment variables and app settings with TypeScript type safety
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// Load environment variables from project root
dotenv.config({ path: join(__dirname, '..', '..', '.env') });
/**
 * Server configuration
 */
export const serverConfig = {
    // Keep HTTP compatibility listener on 3002 by default.
    port: parseInt(process.env.PORT || '3002'),
    // Dedicated HTTPS listener.
    httpsPort: parseInt(process.env.HTTPS_PORT || '3443'),
    httpPort: parseInt(process.env.HTTP_PORT || '3002'),
    host: process.env.HOST || '0.0.0.0',
    nodeEnv: process.env.NODE_ENV || 'development',
    isDevelopment: process.env.NODE_ENV === 'development',
    isProduction: process.env.NODE_ENV === 'production',
    httpsKeyPath: process.env.HTTPS_KEY_PATH,
    httpsCertPath: process.env.HTTPS_CERT_PATH,
    // CORS configuration
    corsOrigin: process.env.CORS_ORIGIN || 'https://localhost:3443',
    corsCredentials: process.env.CORS_CREDENTIALS === 'true',
    // File upload configuration
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760'), // 10MB default
    uploadPath: process.env.UPLOAD_PATH || 'uploads',
    // Security configuration
    enableDebugEndpoints: process.env.ENABLE_DEBUG_ENDPOINTS === 'true',
    enableSampleData: process.env.ENABLE_SAMPLE_DATA === 'true',
    // Rate limiting configuration
    rateLimiting: {
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
        maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'), // requests per window
        loginWindowMs: parseInt(process.env.LOGIN_RATE_LIMIT_WINDOW_MS || '900000'),
        loginMaxRequests: parseInt(process.env.LOGIN_RATE_LIMIT_MAX_ATTEMPTS || '5') // login attempts per window
    }
};
/**
 * Database configuration
 */
export const databaseConfig = {
    // Database file path (relative to project root)
    dbPath: process.env.DB_PATH || 'data/slimbooks.db',
    backupPath: process.env.DB_BACKUP_PATH || 'data/backups',
    // Connection settings
    timeout: 5000,
    verbose: serverConfig.isDevelopment ? console.log : null,
    // SQLite pragmas
    pragmas: {
        foreign_keys: 'ON',
        journal_mode: 'WAL'
    }
};
/**
 * Authentication configuration
 */
export const authConfig = {
    // JWT configuration
    jwtSecret: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
    jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-change-in-production',
    sessionSecret: process.env.SESSION_SECRET || 'your-session-secret-change-in-production',
    // Token expiration (in milliseconds)
    accessTokenExpiry: parseInt(process.env.ACCESS_TOKEN_EXPIRY || '7200000'), // 2 hours
    refreshTokenExpiry: parseInt(process.env.REFRESH_TOKEN_EXPIRY || '604800000'), // 7 days
    emailTokenExpiry: parseInt(process.env.EMAIL_TOKEN_EXPIRY || '86400000'), // 24 hours
    passwordResetExpiry: parseInt(process.env.PASSWORD_RESET_EXPIRY || '3600000'), // 1 hour
    // Password hashing
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '12'),
    // Account lockout settings
    maxLoginAttempts: parseInt(process.env.MAX_FAILED_LOGIN_ATTEMPTS || '5'),
    lockoutDuration: parseInt(process.env.ACCOUNT_LOCKOUT_DURATION || '1800000'), // 30 minutes
    // Email verification
    requireEmailVerification: process.env.REQUIRE_EMAIL_VERIFICATION === 'true'
};
/**
 * Email configuration
 */
export const emailConfig = {
    provider: process.env.EMAIL_PROVIDER === 'sendgrid' ? 'sendgrid' : 'smtp',
    sendgridApiKey: process.env.SENDGRID_API_KEY,
    sendgridFrom: process.env.SENDGRID_FROM || process.env.EMAIL_FROM || 'noreply@slimbooks.app',
    smtp: {
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        }
    },
    // Email settings
    from: process.env.EMAIL_FROM || 'noreply@slimbooks.app',
    // Email templates
    templates: {
        verification: {
            subject: 'Verify your email address',
            from: process.env.EMAIL_FROM || 'noreply@slimbooks.app'
        },
        passwordReset: {
            subject: 'Reset your password',
            from: process.env.EMAIL_FROM || 'noreply@slimbooks.app'
        }
    },
    // Check if email is configured
    isConfigured: (process.env.EMAIL_PROVIDER === 'sendgrid'
        ? !!(process.env.SENDGRID_API_KEY && (process.env.SENDGRID_FROM || process.env.EMAIL_FROM))
        : !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS))
};
/**
 * Stripe configuration (for payment processing)
 */
export const stripeConfig = {
    secretKey: process.env.STRIPE_SECRET_KEY,
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    // Default currency
    currency: process.env.DEFAULT_CURRENCY || 'usd',
    // Check if Stripe is configured
    isConfigured: !!(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PUBLISHABLE_KEY)
};
/**
 * Google OAuth configuration
 */
export const googleConfig = {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: process.env.GOOGLE_REDIRECT_URI,
    // Check if Google OAuth is configured
    isConfigured: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
};
/**
 * Application metadata
 */
export const appConfig = {
    name: 'Slimbooks',
    version: '1.0.0',
    description: 'Simple invoicing and expense tracking application',
    // Default admin user credentials
    defaultAdmin: {
        email: 'admin@slimbooks.app',
        name: 'Administrator',
        role: 'admin'
    }
};
/**
 * Logging configuration
 */
export const loggingConfig = {
    level: process.env.LOG_LEVEL || (serverConfig.isDevelopment ? 'debug' : 'info'),
    enableRequestLogging: true,
    enableErrorLogging: true,
    // Log file paths
    logDir: 'logs',
    logFile: process.env.LOG_FILE || './logs/app.log',
    errorLogFile: 'error.log',
    accessLogFile: 'access.log'
};
/**
 * Validation configuration
 */
export const validationConfig = {
    // Password requirements
    password: {
        minLength: 8,
        maxLength: 128,
        requireUppercase: false,
        requireLowercase: false,
        requireNumbers: false,
        requireSpecialChars: false
    },
    // File upload restrictions
    allowedMimeTypes: [
        'application/octet-stream',
        'application/x-sqlite3',
        'application/vnd.sqlite3'
    ],
    // Input length limits
    maxFieldLengths: {
        name: 100,
        email: 255,
        description: 1000,
        notes: 2000
    }
};
/**
 * Get all configuration as a single object
 * @returns Complete configuration object
 */
export const getAllConfig = () => ({
    server: serverConfig,
    database: databaseConfig,
    auth: authConfig,
    email: emailConfig,
    stripe: stripeConfig,
    google: googleConfig,
    app: appConfig,
    logging: loggingConfig,
    validation: validationConfig
});
/**
 * Validate required environment variables
 * @throws {Error} If required environment variables are missing
 */
export const validateConfig = () => {
    const requiredVars = [];
    const warnings = [];
    // Always required variables
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'your-secret-key-change-in-production') {
        if (serverConfig.isProduction) {
            requiredVars.push('JWT_SECRET');
        }
        else {
            warnings.push('JWT_SECRET is using default value - change in production');
        }
    }
    // Check for missing required variables
    const missing = requiredVars.filter(varName => !process.env[varName]);
    if (missing.length > 0) {
        throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
    // Configuration warnings are disabled for cleaner logs
    // if (warnings.length > 0 && serverConfig.isDevelopment) {
    //   console.warn('⚠️  Configuration warnings:');
    //   warnings.forEach(warning => console.warn(`   - ${warning}`));
    // }
    // Log configuration status in a concise format
    const services = [];
    if (emailConfig.isConfigured)
        services.push('Email');
    if (stripeConfig.isConfigured)
        services.push('Stripe');
    if (googleConfig.isConfigured)
        services.push('OAuth');
    console.log(`✅ Config validated | Services: ${services.length > 0 ? services.join(', ') : 'None'} | Email verification: ${authConfig.requireEmailVerification ? 'On' : 'Off'}`);
};
// Export default configuration
const config = {
    server: serverConfig,
    database: databaseConfig,
    auth: authConfig,
    email: emailConfig,
    stripe: stripeConfig,
    google: googleConfig,
    app: appConfig,
    logging: loggingConfig,
    validation: validationConfig
};
export default config;
//# sourceMappingURL=index.js.map
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
 * Server configuration interface
 */
export interface ServerConfig {
  port: number;
  host: string;
  nodeEnv: string;
  isDevelopment: boolean;
  isProduction: boolean;
  saasMode: boolean;
  enableHttps: boolean;
  sslKeyPath: string;
  sslCertPath: string;
  enforceHttpsRedirect: boolean;
  corsOrigin: string;
  corsCredentials: boolean;
  maxFileSize: number;
  uploadPath: string;
  enableDebugEndpoints: boolean;
  enableSampleData: boolean;
  allowDatabaseImportExport: boolean;
  cronJobSecret: string | undefined;
  billingWebhookSecret: string | undefined;
  serveStaticFiles: boolean;
  rateLimiting: {
    windowMs: number;
    maxRequests: number;
    loginWindowMs: number;
    loginMaxRequests: number;
  };
}

/**
 * Database configuration interface
 */
export interface DatabaseConfig {
  databaseUrl: string;
  poolMax: number;
  poolMin: number;
  poolIdleTimeout: number;
  poolConnectionTimeout: number;
}

/**
 * Authentication configuration interface
 */
export interface AuthConfig {
  jwtSecret: string;
  jwtSecretPrevious: string | undefined;
  jwtRefreshSecret: string;
  sessionSecret: string;
  accessTokenExpiry: number;
  refreshTokenExpiry: number;
  emailTokenExpiry: number;
  passwordResetExpiry: number;
  bcryptRounds: number;
  maxLoginAttempts: number;
  lockoutDuration: number;
  requireEmailVerification: boolean;
}

/**
 * Email configuration interface
 */
export interface EmailConfig {
  provider: 'smtp' | 'sendgrid' | 'resend';
  sendgridApiKey: string | undefined;
  sendgridFrom: string;
  resendApiKey: string | undefined;
  smtp: {
    host: string | undefined;
    port: number;
    secure: boolean;
    auth: {
      user: string | undefined;
      pass: string | undefined;
    };
  };
  from: string;
  templates: {
    verification: {
      subject: string;
      from: string;
    };
    passwordReset: {
      subject: string;
      from: string;
    };
  };
  isConfigured: boolean;
}

/**
 * Stripe configuration interface
 */
export interface StripeConfig {
  secretKey: string | undefined;
  publishableKey: string | undefined;
  webhookSecret: string | undefined;
  currency: string;
  isConfigured: boolean;
}

/**
 * Google OAuth configuration interface
 */
export interface GoogleConfig {
  clientId: string | undefined;
  clientSecret: string | undefined;
  redirectUri: string | undefined;
  isConfigured: boolean;
}

/**
 * Application configuration interface
 */
export interface AppConfig {
  name: string;
  version: string;
  description: string;
  defaultAdmin: {
    email: string;
    name: string;
    role: string;
  };
}

/**
 * Logging configuration interface
 */
export interface LoggingConfig {
  level: string;
  enableRequestLogging: boolean;
  enableErrorLogging: boolean;
  logDir: string;
  logFile: string;
  errorLogFile: string;
  accessLogFile: string;
}

/**
 * Validation configuration interface
 */
export interface ValidationConfig {
  password: {
    minLength: number;
    maxLength: number;
    requireUppercase: boolean;
    requireLowercase: boolean;
    requireNumbers: boolean;
    requireSpecialChars: boolean;
  };
  allowedMimeTypes: string[];
  maxFieldLengths: {
    name: number;
    email: number;
    description: number;
    notes: number;
  };
}

/**
 * Complete application configuration interface
 */
export interface AppConfigComplete {
  server: ServerConfig;
  database: DatabaseConfig;
  auth: AuthConfig;
  email: EmailConfig;
  stripe: StripeConfig;
  google: GoogleConfig;
  app: AppConfig;
  logging: LoggingConfig;
  validation: ValidationConfig;
}

/**
 * Server configuration
 */
export const serverConfig: ServerConfig = {
  port: parseInt(process.env.PORT || '3002'),
  host: process.env.HOST || '0.0.0.0',
  nodeEnv: process.env.NODE_ENV || 'development',
  isDevelopment: process.env.NODE_ENV === 'development',
  isProduction: process.env.NODE_ENV === 'production',
  saasMode: process.env.SAAS_MODE === 'true',
  enableHttps: process.env.ENABLE_HTTPS === 'true',
  sslKeyPath: process.env.SSL_KEY_PATH || 'certs/server.key',
  sslCertPath: process.env.SSL_CERT_PATH || 'certs/server.crt',
  enforceHttpsRedirect: process.env.ENFORCE_HTTPS_REDIRECT === 'true',

  // CORS configuration
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:8080',
  corsCredentials: process.env.CORS_CREDENTIALS === 'true',

  // File upload configuration
  maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760'), // 10MB default
  uploadPath: process.env.UPLOAD_PATH || 'uploads',

  // Security configuration
  enableDebugEndpoints: process.env.ENABLE_DEBUG_ENDPOINTS === 'true',
  enableSampleData: process.env.ENABLE_SAMPLE_DATA === 'true',
  allowDatabaseImportExport:
    process.env.ALLOW_DATABASE_IMPORT_EXPORT === 'true' ||
    (process.env.NODE_ENV !== 'production' && process.env.SAAS_MODE !== 'true'),
  cronJobSecret: process.env.CRON_JOB_SECRET,
  billingWebhookSecret: process.env.BILLING_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET,
  serveStaticFiles: process.env.SERVE_STATIC_FILES !== 'false',

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
export const databaseConfig: DatabaseConfig = {
  databaseUrl: process.env.DATABASE_URL || '',
  poolMax: parseInt(process.env.DB_POOL_MAX || '20'),
  poolMin: parseInt(process.env.DB_POOL_MIN || '2'),
  poolIdleTimeout: parseInt(process.env.DB_POOL_IDLE_TIMEOUT || '30000'),
  poolConnectionTimeout: parseInt(process.env.DB_POOL_CONNECTION_TIMEOUT || '5000'),
};

/**
 * Authentication configuration
 */
export const authConfig: AuthConfig = {
  // JWT configuration — no insecure defaults; empty string if not set
  jwtSecret: process.env.JWT_SECRET || '',
  // Previous secret kept during rotation grace period — tokens signed with it remain valid
  jwtSecretPrevious: process.env.JWT_SECRET_PREVIOUS || undefined,
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || '',
  sessionSecret: process.env.SESSION_SECRET || '',

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
export const emailConfig: EmailConfig = {
  provider: process.env.EMAIL_PROVIDER === 'sendgrid' ? 'sendgrid' : process.env.EMAIL_PROVIDER === 'resend' ? 'resend' : 'smtp',
  sendgridApiKey: process.env.SENDGRID_API_KEY,
  sendgridFrom: process.env.SENDGRID_FROM || process.env.EMAIL_FROM || 'noreply@slimbooks.app',
  resendApiKey: process.env.RESEND_API_KEY,
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
  isConfigured: (
    process.env.EMAIL_PROVIDER === 'sendgrid'
      ? !!(process.env.SENDGRID_API_KEY && (process.env.SENDGRID_FROM || process.env.EMAIL_FROM))
      : process.env.EMAIL_PROVIDER === 'resend'
        ? !!(process.env.RESEND_API_KEY && process.env.EMAIL_FROM)
        : !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)
  )
};

/**
 * Stripe configuration (for payment processing)
 */
export const stripeConfig: StripeConfig = {
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
export const googleConfig: GoogleConfig = {
  clientId: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  redirectUri: process.env.GOOGLE_REDIRECT_URI,

  // Check if Google OAuth is configured
  isConfigured: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
};

/**
 * Application metadata
 */
export const appConfig: AppConfig = {
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
export const loggingConfig: LoggingConfig = {
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
export const validationConfig: ValidationConfig = {
  // Password requirements
  password: {
    minLength: 12,
    maxLength: 128,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSpecialChars: true
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
export const getAllConfig = (): AppConfigComplete => ({
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
 * @throws {Error} If required environment variables are missing in production
 */
export const validateConfig = (): void => {
  const requiredVars: string[] = [];
  const warnings: string[] = [];

  // DATABASE_URL is always required
  if (!databaseConfig.databaseUrl) {
    requiredVars.push('DATABASE_URL (PostgreSQL connection string required)');
  }

  if (serverConfig.isProduction) {
    // JWT_SECRET must be set and >= 32 chars in production
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
      requiredVars.push('JWT_SECRET (must be set and at least 32 characters)');
    }

    // SESSION_SECRET must be set and >= 32 chars in production
    if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
      requiredVars.push('SESSION_SECRET (must be set and at least 32 characters)');
    }

    // STRIPE_WEBHOOK_SECRET required when STRIPE_SECRET_KEY is set
    if (process.env.STRIPE_SECRET_KEY && !process.env.STRIPE_WEBHOOK_SECRET) {
      requiredVars.push('STRIPE_WEBHOOK_SECRET (required when STRIPE_SECRET_KEY is set)');
    }

    // HTTPS warning (not a hard requirement — ALB can terminate TLS)
    if (!serverConfig.enforceHttpsRedirect) {
      warnings.push('ENFORCE_HTTPS_REDIRECT not set — ensure TLS is terminated at load balancer (ALB/CloudFront)');
    }
  } else {
    // Non-production: warn but don't throw
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
      warnings.push('JWT_SECRET is missing or under 32 characters — change before going to production');
    }
    if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
      warnings.push('SESSION_SECRET is missing or under 32 characters — change before going to production');
    }
  }

  if (serverConfig.enableHttps) {
    if (!serverConfig.sslKeyPath.trim()) {
      throw new Error('ENABLE_HTTPS=true requires a non-empty SSL_KEY_PATH');
    }
    if (!serverConfig.sslCertPath.trim()) {
      throw new Error('ENABLE_HTTPS=true requires a non-empty SSL_CERT_PATH');
    }
  }

  if (requiredVars.length > 0) {
    throw new Error(`Missing required environment variables: ${requiredVars.join(', ')}`);
  }

  if (warnings.length > 0) {
    warnings.forEach(warning => console.warn(`⚠️  Config warning: ${warning}`));
  }

  // Log configuration status in a concise format
  const services: string[] = [];
  if (emailConfig.isConfigured) services.push('Email');
  if (stripeConfig.isConfigured) services.push('Stripe');
  if (googleConfig.isConfigured) services.push('OAuth');

  console.log(`✅ Config validated | Services: ${services.length > 0 ? services.join(', ') : 'None'} | Email verification: ${authConfig.requireEmailVerification ? 'On' : 'Off'}`);
};

// Export default configuration
const config: AppConfigComplete = {
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
// Environment configuration utility for secure deployment
// This module handles environment variables with secure defaults

interface EnvironmentConfig {
  // Server Configuration
  NODE_ENV: string;
  PORT: number;
  HOST: string;
  
  // API Configuration
  API_URL: string;
  APP_NAME: string;
  
  // Security Configuration
  JWT_SECRET: string;
  JWT_REFRESH_SECRET: string;
  SESSION_SECRET: string;
  
  // Token Expiration
  ACCESS_TOKEN_EXPIRY: number;
  REFRESH_TOKEN_EXPIRY: number;
  EMAIL_TOKEN_EXPIRY: number;
  PASSWORD_RESET_EXPIRY: number;
  
  // Database Configuration
  DB_PATH: string;
  DB_BACKUP_PATH: string;
  
  // CORS Configuration
  CORS_ORIGIN: string;
  CORS_CREDENTIALS: boolean;
  
  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: number;
  RATE_LIMIT_MAX_REQUESTS: number;
  LOGIN_RATE_LIMIT_WINDOW_MS: number;
  LOGIN_RATE_LIMIT_MAX_ATTEMPTS: number;
  
  // File Upload
  MAX_FILE_SIZE: number;
  UPLOAD_PATH: string;
  
  // Security Settings
  BCRYPT_ROUNDS: number;
  MAX_FAILED_LOGIN_ATTEMPTS: number;
  ACCOUNT_LOCKOUT_DURATION: number;
  REQUIRE_EMAIL_VERIFICATION: boolean;
  
  // Development/Debug
  ENABLE_DEBUG_ENDPOINTS: boolean;
  ENABLE_SAMPLE_DATA: boolean;
  
  // Logging
  LOG_LEVEL: string;
  LOG_FILE: string;
}

// Default secure configuration
const DEFAULT_CONFIG: EnvironmentConfig = {
  NODE_ENV: 'production',
  PORT: 3002,
  HOST: '0.0.0.0',
  
  API_URL: 'http://localhost:3002',
  APP_NAME: 'Slimbooks',
  
  // These should be overridden in production!
  JWT_SECRET: 'default-jwt-secret-change-in-production',
  JWT_REFRESH_SECRET: 'default-refresh-secret-change-in-production',
  SESSION_SECRET: 'default-session-secret-change-in-production',
  
  ACCESS_TOKEN_EXPIRY: 2 * 60 * 60 * 1000, // 2 hours
  REFRESH_TOKEN_EXPIRY: 7 * 24 * 60 * 60 * 1000, // 7 days
  EMAIL_TOKEN_EXPIRY: 24 * 60 * 60 * 1000, // 24 hours
  PASSWORD_RESET_EXPIRY: 60 * 60 * 1000, // 1 hour
  
  DB_PATH: './server/data/slimbooks.db',
  DB_BACKUP_PATH: './server/data/backups',
  
  CORS_ORIGIN: 'http://localhost:8080',
  CORS_CREDENTIALS: true,
  
  RATE_LIMIT_WINDOW_MS: 15 * 60 * 1000, // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: 100,
  LOGIN_RATE_LIMIT_WINDOW_MS: 15 * 60 * 1000, // 15 minutes
  LOGIN_RATE_LIMIT_MAX_ATTEMPTS: 5,
  
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  UPLOAD_PATH: './uploads',
  
  BCRYPT_ROUNDS: 12,
  MAX_FAILED_LOGIN_ATTEMPTS: 5,
  ACCOUNT_LOCKOUT_DURATION: 30 * 60 * 1000, // 30 minutes
  REQUIRE_EMAIL_VERIFICATION: false,
  
  ENABLE_DEBUG_ENDPOINTS: false,
  ENABLE_SAMPLE_DATA: false,
  
  LOG_LEVEL: 'warn',
  LOG_FILE: './logs/app.log'
};

// Environment variable parsing utilities
const parseBoolean = (value: string | undefined, defaultValue: boolean): boolean => {
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true';
};

const parseNumber = (value: string | undefined, defaultValue: number): number => {
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
};

const parseString = (value: string | undefined, defaultValue: string): string => {
  return value || defaultValue;
};

// Load and validate environment configuration
export const loadEnvironmentConfig = (): EnvironmentConfig => {
  // Check if we're in browser environment
  const isBrowser = typeof window !== 'undefined';
  
  // In browser, use Vite environment variables
  const env = isBrowser ? import.meta.env : process.env;
  
  const config: EnvironmentConfig = {
    NODE_ENV: parseString(env.NODE_ENV, DEFAULT_CONFIG.NODE_ENV),
    PORT: parseNumber(env.PORT, DEFAULT_CONFIG.PORT),
    HOST: parseString(env.HOST, DEFAULT_CONFIG.HOST),
    
    API_URL: parseString(env.VITE_API_URL || env.API_URL, DEFAULT_CONFIG.API_URL),
    APP_NAME: parseString(env.VITE_APP_NAME || env.APP_NAME, DEFAULT_CONFIG.APP_NAME),
    
    JWT_SECRET: parseString(env.JWT_SECRET, DEFAULT_CONFIG.JWT_SECRET),
    JWT_REFRESH_SECRET: parseString(env.JWT_REFRESH_SECRET, DEFAULT_CONFIG.JWT_REFRESH_SECRET),
    SESSION_SECRET: parseString(env.SESSION_SECRET, DEFAULT_CONFIG.SESSION_SECRET),
    
    ACCESS_TOKEN_EXPIRY: parseNumber(env.ACCESS_TOKEN_EXPIRY, DEFAULT_CONFIG.ACCESS_TOKEN_EXPIRY),
    REFRESH_TOKEN_EXPIRY: parseNumber(env.REFRESH_TOKEN_EXPIRY, DEFAULT_CONFIG.REFRESH_TOKEN_EXPIRY),
    EMAIL_TOKEN_EXPIRY: parseNumber(env.EMAIL_TOKEN_EXPIRY, DEFAULT_CONFIG.EMAIL_TOKEN_EXPIRY),
    PASSWORD_RESET_EXPIRY: parseNumber(env.PASSWORD_RESET_EXPIRY, DEFAULT_CONFIG.PASSWORD_RESET_EXPIRY),
    
    DB_PATH: parseString(env.DB_PATH, DEFAULT_CONFIG.DB_PATH),
    DB_BACKUP_PATH: parseString(env.DB_BACKUP_PATH, DEFAULT_CONFIG.DB_BACKUP_PATH),
    
    CORS_ORIGIN: parseString(env.CORS_ORIGIN, DEFAULT_CONFIG.CORS_ORIGIN),
    CORS_CREDENTIALS: parseBoolean(env.CORS_CREDENTIALS, DEFAULT_CONFIG.CORS_CREDENTIALS),
    
    RATE_LIMIT_WINDOW_MS: parseNumber(env.RATE_LIMIT_WINDOW_MS, DEFAULT_CONFIG.RATE_LIMIT_WINDOW_MS),
    RATE_LIMIT_MAX_REQUESTS: parseNumber(env.RATE_LIMIT_MAX_REQUESTS, DEFAULT_CONFIG.RATE_LIMIT_MAX_REQUESTS),
    LOGIN_RATE_LIMIT_WINDOW_MS: parseNumber(env.LOGIN_RATE_LIMIT_WINDOW_MS, DEFAULT_CONFIG.LOGIN_RATE_LIMIT_WINDOW_MS),
    LOGIN_RATE_LIMIT_MAX_ATTEMPTS: parseNumber(env.LOGIN_RATE_LIMIT_MAX_ATTEMPTS, DEFAULT_CONFIG.LOGIN_RATE_LIMIT_MAX_ATTEMPTS),
    
    MAX_FILE_SIZE: parseNumber(env.MAX_FILE_SIZE, DEFAULT_CONFIG.MAX_FILE_SIZE),
    UPLOAD_PATH: parseString(env.UPLOAD_PATH, DEFAULT_CONFIG.UPLOAD_PATH),
    
    BCRYPT_ROUNDS: parseNumber(env.BCRYPT_ROUNDS, DEFAULT_CONFIG.BCRYPT_ROUNDS),
    MAX_FAILED_LOGIN_ATTEMPTS: parseNumber(env.MAX_FAILED_LOGIN_ATTEMPTS, DEFAULT_CONFIG.MAX_FAILED_LOGIN_ATTEMPTS),
    ACCOUNT_LOCKOUT_DURATION: parseNumber(env.ACCOUNT_LOCKOUT_DURATION, DEFAULT_CONFIG.ACCOUNT_LOCKOUT_DURATION),
    REQUIRE_EMAIL_VERIFICATION: parseBoolean(env.REQUIRE_EMAIL_VERIFICATION, DEFAULT_CONFIG.REQUIRE_EMAIL_VERIFICATION),
    
    ENABLE_DEBUG_ENDPOINTS: parseBoolean(env.ENABLE_DEBUG_ENDPOINTS, DEFAULT_CONFIG.ENABLE_DEBUG_ENDPOINTS),
    ENABLE_SAMPLE_DATA: parseBoolean(env.ENABLE_SAMPLE_DATA, DEFAULT_CONFIG.ENABLE_SAMPLE_DATA),
    
    LOG_LEVEL: parseString(env.LOG_LEVEL, DEFAULT_CONFIG.LOG_LEVEL),
    LOG_FILE: parseString(env.LOG_FILE, DEFAULT_CONFIG.LOG_FILE)
  };
  
  // Validate critical security settings
  validateSecurityConfig(config);
  
  return config;
};

// Validate security configuration
const validateSecurityConfig = (config: EnvironmentConfig): void => {
  const warnings: string[] = [];
  
  // Check for default secrets in production
  if (config.NODE_ENV === 'production') {
    if (config.JWT_SECRET.includes('default') || config.JWT_SECRET.includes('change')) {
      warnings.push('JWT_SECRET is using default value in production!');
    }
    
    if (config.JWT_REFRESH_SECRET.includes('default') || config.JWT_REFRESH_SECRET.includes('change')) {
      warnings.push('JWT_REFRESH_SECRET is using default value in production!');
    }
    
    if (config.SESSION_SECRET.includes('default') || config.SESSION_SECRET.includes('change')) {
      warnings.push('SESSION_SECRET is using default value in production!');
    }
    
    // Check secret length
    if (config.JWT_SECRET.length < 32) {
      warnings.push('JWT_SECRET should be at least 32 characters long!');
    }
    
    if (config.JWT_REFRESH_SECRET.length < 32) {
      warnings.push('JWT_REFRESH_SECRET should be at least 32 characters long!');
    }
  }
};

// Export singleton instance
export const envConfig = loadEnvironmentConfig();

// Export individual config sections for convenience
export const serverConfig = {
  NODE_ENV: envConfig.NODE_ENV,
  PORT: envConfig.PORT,
  HOST: envConfig.HOST
};

export const securityConfig = {
  JWT_SECRET: envConfig.JWT_SECRET,
  JWT_REFRESH_SECRET: envConfig.JWT_REFRESH_SECRET,
  SESSION_SECRET: envConfig.SESSION_SECRET,
  ACCESS_TOKEN_EXPIRY: envConfig.ACCESS_TOKEN_EXPIRY,
  REFRESH_TOKEN_EXPIRY: envConfig.REFRESH_TOKEN_EXPIRY,
  BCRYPT_ROUNDS: envConfig.BCRYPT_ROUNDS,
  MAX_FAILED_LOGIN_ATTEMPTS: envConfig.MAX_FAILED_LOGIN_ATTEMPTS,
  ACCOUNT_LOCKOUT_DURATION: envConfig.ACCOUNT_LOCKOUT_DURATION
};

export const corsConfig = {
  CORS_ORIGIN: envConfig.CORS_ORIGIN,
  CORS_CREDENTIALS: envConfig.CORS_CREDENTIALS
};

export const rateLimitConfig = {
  RATE_LIMIT_WINDOW_MS: envConfig.RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_MAX_REQUESTS: envConfig.RATE_LIMIT_MAX_REQUESTS,
  LOGIN_RATE_LIMIT_WINDOW_MS: envConfig.LOGIN_RATE_LIMIT_WINDOW_MS,
  LOGIN_RATE_LIMIT_MAX_ATTEMPTS: envConfig.LOGIN_RATE_LIMIT_MAX_ATTEMPTS
};

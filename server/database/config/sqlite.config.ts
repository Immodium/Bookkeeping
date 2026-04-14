// SQLite database configuration for Slimbooks
// Handles database connection setup and configuration

import { join, dirname, resolve } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import type { DatabaseConfig, DatabaseOptions } from '../../types/database.types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Get the database configuration based on environment
 */
export const getDatabaseConfig = (): DatabaseConfig => {
  const projectRoot = join(__dirname, '..', '..', '..');
  const dbPath = process.env.DB_PATH 
    ? resolve(projectRoot, process.env.DB_PATH)
    : join(projectRoot, 'data', 'slimbooks.db');
  
  // Ensure data directory exists
  const dataDir = dirname(dbPath);
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }
  
  const options: DatabaseOptions = {
    // Enable verbose logging in development
    verbose: process.env.NODE_ENV === 'development' ? console.log : undefined,
    timeout: parseInt(process.env.DB_TIMEOUT || '30000'),
    fileMustExist: false
  };
  
  return {
    path: dbPath,
    options
  };
};

/**
 * SQLite pragma settings for optimal performance
 */
export const getSQLitePragmas = (): Record<string, string | number> => {
  return {
    // Enable foreign key constraints
    'foreign_keys': 'ON',
    
    // Use WAL mode for better concurrency
    'journal_mode': 'WAL',
    
    // Synchronization mode for reliability vs performance
    'synchronous': process.env.NODE_ENV === 'production' ? 'FULL' : 'NORMAL',
    
    // Cache size (negative value = KB, positive = pages)
    'cache_size': -64000, // 64MB cache
    
    // Memory-mapped I/O size
    'mmap_size': 268435456, // 256MB
    
    // Temporary storage location
    'temp_store': 'MEMORY',
    
    // Query optimizer settings
    'optimize': 1,
    
    // Auto vacuum for space management
    'auto_vacuum': 'INCREMENTAL'
  };
};

/**
 * Database connection test settings
 */
export interface ConnectionTestResult {
  success: boolean;
  error?: string;
  path: string;
  size?: number;
  writable: boolean;
}

/**
 * Backup configuration
 */
export interface BackupConfig {
  enabled: boolean;
  directory: string;
  retention: number; // days
  schedule: string; // cron expression
}

export const getBackupConfig = (): BackupConfig => {
  const projectRoot = join(__dirname, '..', '..', '..');
  
  return {
    enabled: process.env.BACKUP_ENABLED === 'true',
    directory: process.env.BACKUP_DIR || join(projectRoot, 'data', 'backups'),
    retention: parseInt(process.env.BACKUP_RETENTION || '30'),
    schedule: process.env.BACKUP_SCHEDULE || '0 2 * * *' // Daily at 2 AM
  };
};
// Database configuration utilities - PostgreSQL-only
import { databaseConfig } from './index.js';

/**
 * Get the PostgreSQL connection URL
 * @returns {string} PostgreSQL connection URL
 */
export const getDatabaseUrl = (): string => {
  return databaseConfig.databaseUrl;
};

/**
 * Get a hint for where backups should be stored.
 * PostgreSQL backups are handled externally with pg_dump.
 * @returns {string} Backup path hint
 */
export const getBackupPath = (): string => {
  return './data/backups';
};

/**
 * @deprecated Use getDatabaseUrl() instead. This stub exists for compatibility.
 * PostgreSQL does not use a file path.
 */
export const getDatabasePath = (): string => {
  return databaseConfig.databaseUrl;
};

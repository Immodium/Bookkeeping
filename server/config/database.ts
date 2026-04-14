// Database configuration utilities
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { databaseConfig } from './index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Get the absolute path to the database file
 * @returns {string} Absolute path to the database file
 */
export const getDatabasePath = (): string => {
  // If dbPath is already absolute, use it as-is
  if (path.isAbsolute(databaseConfig.dbPath)) {
    return databaseConfig.dbPath;
  }
  
  // Otherwise, resolve relative to project root
  return path.resolve(path.join(__dirname, '..', '..', databaseConfig.dbPath));
};

/**
 * Get the absolute path to the backup directory
 * @returns {string} Absolute path to the backup directory
 */
export const getBackupPath = (): string => {
  // If backupPath is already absolute, use it as-is
  if (path.isAbsolute(databaseConfig.backupPath)) {
    return databaseConfig.backupPath;
  }
  
  // Otherwise, resolve relative to project root
  return path.resolve(path.join(__dirname, '..', '..', databaseConfig.backupPath));
};
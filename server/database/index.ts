// Database Module - Main entry point for all database operations
// Provides unified database access and initialization

import { database, SQLiteDatabase } from './SQLiteDatabase.js';
import { createTables } from './schemas/tables.schema.js';
import { initializeAllSeeds } from './seeds/initial.seed.js';
import { getDatabaseConfig } from './config/sqlite.config.js';
import { runMigrations } from './migrations/index.js';
import type { IDatabase } from '../types/database.types.js';

/**
 * Main database instance (singleton)
 */
export const db: IDatabase = database;

/**
 * Get a fresh database instance (for testing or specific use cases)
 */
export const createDatabase = (): SQLiteDatabase => {
  return new SQLiteDatabase();
};

/**
 * Initialize the complete database setup
 * This includes creating tables and seeding initial data
 */
export const initializeDatabase = async (includeSampleData = false): Promise<void> => {
  try {
    // Ensure database is connected before proceeding
    if (!db.isConnected()) {
      console.log('Database not connected, attempting to connect...');
      await db.connect(getDatabaseConfig());
    }

    // Create all tables
    createTables(db);
    console.log('✓ Database tables created');

    // Run migrations
    runMigrations(db);
    console.log('✓ Database migrations completed');

    // Initialize seed data
    await initializeAllSeeds(db, includeSampleData);
    console.log('✓ Database seed data initialized');

    if (process.env.NODE_ENV === 'development') {
      console.log('✓ Database initialization complete');
    }
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    throw error;
  }
};

/**
 * Gracefully close database connection
 */
export const closeDatabase = async (): Promise<void> => {
  try {
    await db.disconnect();
    console.log('✓ Database connection closed');
  } catch (error) {
    console.error('❌ Error closing database connection:', error);
    throw error;
  }
};

/**
 * Check database health and connectivity
 */
export const checkDatabaseHealth = () => {
  if (db instanceof SQLiteDatabase) {
    return db.getHealth();
  }
  
  return {
    isConnected: db.isConnected(),
    uptime: 0,
    totalQueries: 0,
    avgQueryTime: 0,
    diskUsage: 0
  };
};

/**
 * Create a database backup
 */
export const backupDatabase = (backupPath: string): void => {
  try {
    db.backup(backupPath);
    console.log(`✓ Database backup created: ${backupPath}`);
  } catch (error) {
    console.error('❌ Database backup failed:', error);
    throw error;
  }
};

/**
 * Optimize database performance
 */
export const optimizeDatabase = (): void => {
  try {
    db.vacuum();
    db.pragma('optimize');
    console.log('✓ Database optimization complete');
  } catch (error) {
    console.error('❌ Database optimization failed:', error);
    throw error;
  }
};

// Re-export types and utilities
export type { IDatabase } from '../types/database.types.js';
export { createTables } from './schemas/tables.schema.js';
export { initializeAllSeeds } from './seeds/initial.seed.js';
export { getDatabaseConfig } from './config/sqlite.config.js';

// Re-export the SQLite implementation for advanced usage
export { SQLiteDatabase } from './SQLiteDatabase.js';
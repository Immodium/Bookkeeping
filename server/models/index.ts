// Main database model module for Slimbooks
// PostgreSQL-only: exports database instance and initialization functions

import { db } from '../database/index.js';
import { createTables } from '../database/schemas/tables.schema.js';
import {
  initializeCounters,
  initializeAdminUser,
  initializeSampleClients,
  initializeSampleInvoices,
  initializeSamplePayments
} from '../database/seeds/initial.seed.js';

export { db };

/**
 * Initialize the complete database setup
 */
export const initializeCompleteDatabase = async (includeSampleData = false): Promise<void> => {
  try {
    await createTables(db);

    await initializeCounters(db);
    await initializeAdminUser(db);

    if (includeSampleData && process.env.NODE_ENV !== 'production') {
      await initializeSampleClients(db);
      await initializeSampleInvoices(db);
      await initializeSamplePayments(db);
    }
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    throw error;
  }
};

// Export individual functions for specific use cases
export {
  createTables,
  initializeCounters,
  initializeAdminUser,
  initializeSampleClients,
  initializeSampleInvoices,
  initializeSamplePayments
};

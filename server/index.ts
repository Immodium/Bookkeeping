// Main entry point for Slimbooks server
// Starts the refactored modular server with TypeScript

import { startServer } from './app.js';
import { logger } from './utils/logger.js';

// Start the server with proper error handling
async function main(): Promise<void> {
  try {
    await startServer();
    logger.info('Slimbooks server started successfully with TypeScript');
  } catch (error) {
    logger.error({ err: error }, 'Failed to start server');

    // More detailed error logging for development
    if (process.env.NODE_ENV !== 'production') {
      console.error('Full error details:', error);
    }

    process.exit(1);
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error({ reason, promise }, 'Unhandled Rejection');
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error({ err: error }, 'Uncaught Exception');
  process.exit(1);
});

// Note: SIGTERM and SIGINT are handled by gracefulShutdown() in errorHandler.ts
// which is registered in app.ts. Do not add duplicate handlers here.

// Start the application
main();
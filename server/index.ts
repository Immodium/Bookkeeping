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

// Fatal-error handling for unhandled rejections / uncaught exceptions.
//
// Always log (so the failure is observable as a metric). In production we exit
// immediately and let the process manager restart a clean process. Outside
// production we only exit once failures are sustained within a short window,
// so a single transient rejection doesn't tear down the dev server and amplify
// the failure.
const FATAL_EXIT_THRESHOLD = 5;
const FATAL_WINDOW_MS = 60_000;
let fatalWindowStart = Date.now();
let fatalCount = 0;

const handleFatalError = (label: string, payload: Record<string, unknown>): void => {
  logger.error(payload, label);

  const now = Date.now();
  if (now - fatalWindowStart > FATAL_WINDOW_MS) {
    fatalWindowStart = now;
    fatalCount = 0;
  }
  fatalCount += 1;

  if (process.env.NODE_ENV === 'production' || fatalCount >= FATAL_EXIT_THRESHOLD) {
    logger.error(
      { fatalCount, windowMs: FATAL_WINDOW_MS },
      'Exiting process after fatal error(s)'
    );
    process.exit(1);
  }
};

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  handleFatalError('Unhandled Rejection', { reason, promise });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  handleFatalError('Uncaught Exception', { err: error });
});

// Note: SIGTERM and SIGINT are handled by gracefulShutdown() in errorHandler.ts
// which is registered in app.ts. Do not add duplicate handlers here.

// Start the application
main();
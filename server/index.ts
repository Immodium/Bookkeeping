// Main entry point for Slimbooks server
// Starts the refactored modular server with TypeScript

import { startServer } from './app.js';

// Start the server with proper error handling
async function main(): Promise<void> {
  try {
    await startServer();
    console.log('✅ Slimbooks server started successfully with TypeScript');
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    
    // More detailed error logging for development
    if (process.env.NODE_ENV !== 'production') {
      console.error('Full error details:', error);
    }
    
    process.exit(1);
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  process.exit(0);
});

// Start the application
main();
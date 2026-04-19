// Development-only logging utility
// Logs only show in development environment

interface Logger {
  log: (...args: any[]) => void;
  debug: (...args: any[]) => void;
  warn: (...args: any[]) => void;
  error: (...args: any[]) => void;
}

const isDevelopment = import.meta.env.DEV || process.env.NODE_ENV === 'development';

// Create a logger that only outputs in development
export const logger: Logger = {
  log: (...args: any[]) => {
    if (isDevelopment) {
      console.log(...args);
    }
  },
  debug: (...args: any[]) => {
    if (isDevelopment) {
      console.debug(...args);
    }
  },
  warn: (...args: any[]) => {
    if (isDevelopment) {
      console.warn(...args);
    }
  },
  error: (...args: any[]) => {
    // Always show errors, even in production
    console.error(...args);
  }
};

// Export individual functions for easier importing
export const { log, debug, warn, error } = logger;
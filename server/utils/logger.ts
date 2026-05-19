import pino from 'pino';

const isTest = process.env.NODE_ENV === 'test';
const isDevelopment = process.env.NODE_ENV === 'development';

export const logger = pino({
  level: isTest ? 'warn' : (process.env.LOG_LEVEL || 'info'),
  // Pretty-print in development; JSON in production/test
  ...(isDevelopment && !isTest
    ? { transport: { target: 'pino-pretty', options: { colorize: true, ignore: 'pid,hostname' } } }
    : {}),
  base: { service: 'slimbooks' },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => ({ level: label }),
  },
});

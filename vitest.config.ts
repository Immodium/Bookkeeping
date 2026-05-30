import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./src/test/setup.ts'],
    env: {
      // Provide a test-only JWT_SECRET so server modules can generate tokens during tests.
      // Must be >= 32 characters to satisfy the new secret-length validation.
      JWT_SECRET: 'test-jwt-secret-for-vitest-runs-only-32chars',
      SESSION_SECRET: 'test-session-secret-for-vitest-runs-only-32c',
      BILLING_WEBHOOK_SECRET: 'test-billing-webhook-secret',
      DATABASE_URL:
        process.env.DATABASE_URL ||
        'postgresql://slimbooks:slimbooks@localhost:5432/slimbooks?sslmode=disable',
    },
    include: ['src/test/**/*.test.{ts,tsx}'],
    exclude: ['node_modules', 'dist', '.git', 'server'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/test/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/dist/**',
        '**/server/**'
      ]
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  }
});

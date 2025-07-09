import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true, // Optional: to use Vitest globals like describe, it, expect without importing
    environment: 'node', // Specify Node.js environment for testing
    coverage: {
      provider: 'v8', // or 'istanbul'
      reporter: ['text', 'json', 'html'], // Coverage reporters
      reportsDirectory: './coverage',
      include: ['src/**/*.js'], // Files to include in coverage analysis
      exclude: [ // Files/patterns to exclude from coverage
        'src/server.js', // Usually entry points are harder to unit test directly
        'src/config/index.js', // Config is mostly env vars
        'src/utils/logger.js', // Logger setup
        'src/routes/**', // Routes are better tested via integration/e2e tests
        '**/__tests__/**', // Test files themselves
        '**/__mocks__/**', // Mocks
      ],
    },
    // setupFiles: ['./src/tests/setup.js'], // Example if you need global setup
  },
});

import { defineConfig, devices } from '@playwright/test';

/**
 * KDOps Playwright E2E configuration.
 *
 * Tests run against a local Vite dev/preview server. In CI the workflow
 * builds the app, starts `vite preview`, and points Playwright at it.
 *
 * Test credentials are read from environment variables so they never
 * appear in source:
 *   TEST_USER_EMAIL    — a Super Admin account in the test Supabase project
 *   TEST_USER_PASSWORD — password for the above
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,       // serialise to avoid auth race conditions
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'html',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:8080',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
    actionTimeout: 10_000,
  },
  projects: [
    {
      name: 'setup',
      testMatch: /global-setup\.ts/,
    },
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'tests/.auth/user.json',
      },
      dependencies: ['setup'],
    },
  ],
  webServer: process.env.CI
    ? undefined
    : {
        command: 'npm run dev',
        port: 8080,
        reuseExistingServer: true,
        timeout: 30_000,
      },
});

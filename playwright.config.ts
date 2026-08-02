import { defineConfig, devices } from '@playwright/test';

/**
 * KDOps Playwright E2E configuration.
 *
 * Tests run against a local Vite dev server (port 8080) or, in CI, against
 * the `vite preview` server (port 4173) after a production build.
 *
 * Required env vars:
 *   TEST_USER_EMAIL    — email of a Super Admin account in the test project
 *   TEST_USER_PASSWORD — password for the above
 *   VITE_SUPABASE_URL  — Supabase project URL
 *   VITE_SUPABASE_ANON_KEY — Supabase anon key
 */
export default defineConfig({
  testDir: './tests',
  // Serial execution avoids auth-state race conditions between tests.
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : 'html',
  timeout: 30_000,
  expect: { timeout: 10_000 },

  use: {
    // CI uses vite preview on 4173; local dev uses port 8080.
    baseURL: process.env.BASE_URL || 'http://localhost:8080',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
    actionTimeout: 10_000,
  },

  projects: [
    // global-setup.ts authenticates once and saves storage state.
    // Own timeout is longer than the default 30s: CI cold-start plus the
    // internal 40s waitForURL (for MFA/reset-password redirects) can
    // together exceed the global test timeout, killing the test before
    // that internal wait ever gets to resolve or report its own error.
    {
      name: 'setup',
      testMatch: /global-setup\.ts/,
      timeout: 90_000,
    },
    // All spec files run after setup, reusing the saved session.
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'tests/.auth/user.json',
      },
      dependencies: ['setup'],
    },
  ],

  // Start the dev server automatically when running locally.
  // In CI the workflow handles building and starting vite preview instead.
  webServer: process.env.CI
    ? undefined
    : {
        command: 'npm run dev',
        port: 8080,
        reuseExistingServer: true,
        timeout: 60_000,
      },
});

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
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, args: ['--no-sandbox', '--disable-gpu'] } }
      : {}),
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
    // payroll-live-verification.spec.ts is excluded here — it mutates real
    // production payroll data and must only run via the dedicated
    // 'live-verification' project below, triggered by hand
    // (payroll-live-verification.yml, workflow_dispatch only), never on a
    // routine push.
    {
      name: 'chromium',
      testIgnore: /payroll-live-verification\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'tests/.auth/user.json',
      },
      dependencies: ['setup'],
    },
    // One-shot, manually-triggered only — see payroll-live-verification.yml.
    // Own timeout is much longer than the 30s default: approve() and
    // generate-payslips each do one sequential network round-trip per
    // active employee before the UI reflects the result, which at a
    // real headcount can genuinely take well over a minute per step.
    {
      name: 'live-verification',
      testMatch: /payroll-live-verification\.spec\.ts/,
      timeout: 300_000,
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

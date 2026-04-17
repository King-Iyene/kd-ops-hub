import { test as setup, expect } from '@playwright/test';

/**
 * Authenticates once via the KDOps login page and saves the browser
 * storage state so every subsequent test reuses the session.
 *
 * Requires env vars:
 *   TEST_USER_EMAIL    — email of a Super Admin account
 *   TEST_USER_PASSWORD — password for the above
 */
setup('authenticate', async ({ page }) => {
  const email = process.env.TEST_USER_EMAIL;
  const password = process.env.TEST_USER_PASSWORD;

  if (!email || !password) {
    throw new Error(
      'Set TEST_USER_EMAIL and TEST_USER_PASSWORD env vars to run E2E tests.',
    );
  }

  await page.goto('/login');
  await expect(page.locator('text=KDOps')).toBeVisible();

  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');

  // Wait for the dashboard to render — this confirms auth succeeded and
  // profile loaded without a double-redirect.
  await page.waitForURL('**/dashboard', { timeout: 15_000 });
  await expect(page.locator('text=Dashboard')).toBeVisible({ timeout: 10_000 });

  // Persist the authenticated session so other tests skip login.
  await page.context().storageState({ path: 'tests/.auth/user.json' });
});

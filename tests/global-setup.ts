import { test as setup, expect } from '@playwright/test';
import fs from 'fs';

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

  // Ensure storage state directory exists before Playwright tries to write to it.
  fs.mkdirSync('tests/.auth', { recursive: true });

  await page.goto('/login');
  // Use .first() — "KDOps" may appear in the document title and the page body.
  await expect(page.locator('text=KDOps').first()).toBeVisible({ timeout: 10_000 });

  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');

  // Wait for the dashboard to render — this confirms auth succeeded and the
  // profile loaded without a double-redirect.
  await page.waitForURL('**/dashboard', { timeout: 20_000 });

  // The dashboard renders a personalised greeting h1 (e.g. "Good morning, Alice"),
  // NOT a literal "Dashboard" heading — wait for any h1 to confirm the page loaded.
  await expect(page.locator('h1').first()).toBeVisible({ timeout: 15_000 });

  // Persist the authenticated session so other tests skip login.
  await page.context().storageState({ path: 'tests/.auth/user.json' });
});

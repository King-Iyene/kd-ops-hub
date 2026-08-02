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

  // Wait for EITHER the dashboard OR a redirect to an auth-followup page
  // (MFA challenge, unauthorized, reset-password). Timeout bumped to 40s
  // because CI cold-start can be slow to hydrate the profile.
  await page.waitForURL(
    (url) => /\/(dashboard|mfa-challenge|unauthorized|reset-password)/.test(url.pathname),
    { timeout: 40_000 },
  );

  // If we landed on MFA challenge, the test user needs a TOTP secret set
  // in TEST_USER_TOTP_SECRET (base32). Without it, the CI can't proceed
  // past this gate — instruct the reviewer to disable MFA for the test
  // user or wire up the secret.
  const pathname = new URL(page.url()).pathname;
  if (pathname.includes('mfa-challenge')) {
    throw new Error(
      'MFA is enabled for the test user — either disable MFA for this account, or ' +
      'set TEST_USER_TOTP_SECRET (base32) and wire in an authenticator-lib step here.',
    );
  }
  if (pathname.includes('unauthorized')) {
    throw new Error(
      'Test user has an inactive / pending profile. Activate the profile in Supabase ' +
      `profiles table (status=active) for ${email}.`,
    );
  }
  if (pathname.includes('reset-password')) {
    throw new Error(
      'Login redirected to reset-password — the test user password may have expired or ' +
      'this account was created via invite and hasn\'t completed setup. Set a fresh password.',
    );
  }

  // The dashboard renders a personalised greeting h1 (e.g. "Good morning, Alice"),
  // NOT a literal "Dashboard" heading — wait for any h1 to confirm the page loaded.
  await expect(page.locator('h1').first()).toBeVisible({ timeout: 15_000 });

  // Persist the authenticated session so other tests skip login.
  await page.context().storageState({ path: 'tests/.auth/user.json' });
});

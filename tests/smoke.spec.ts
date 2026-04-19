import { test, expect } from '@playwright/test';

test.describe('Auth — unauthenticated flows', () => {
  // Each test here runs without any stored session.
  test.use({ storageState: { cookies: [], origins: [] } });

  test('login page renders KDOps branding and form', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('text=KDOps').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('unauthenticated user visiting /dashboard is redirected to /login', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForURL('**/login', { timeout: 10_000 });
    await expect(page).toHaveURL(/\/login/);
  });

  test('invalid credentials show an error message', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'nonexistent@example.com');
    await page.fill('input[type="password"]', 'wrongpassword123');
    await page.click('button[type="submit"]');
    // Supabase returns an error toast or inline message.
    await expect(
      page.locator('text=/failed|invalid|error|credentials/i').first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('register page shows an account creation form', async ({ page }) => {
    await page.goto('/register');
    await expect(
      page.locator('text=Create Account').or(page.locator('input[type="email"]')).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('forgot-password page shows an email input', async ({ page }) => {
    await page.goto('/forgot-password');
    await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 10_000 });
  });
});

import { test, expect } from '@playwright/test';

test.describe('Login page (unauthenticated)', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('renders the login form with KDOps branding', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('text=KDOps')).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('redirects unauthenticated user from /dashboard to /login', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForURL('**/login', { timeout: 10_000 });
    await expect(page).toHaveURL(/\/login/);
  });

  test('shows error on wrong password', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'nonexistent@example.com');
    await page.fill('input[type="password"]', 'wrongpassword123');
    await page.click('button[type="submit"]');
    // Supabase returns an error toast or inline message.
    await expect(page.locator('text=/failed|invalid|error/i')).toBeVisible({
      timeout: 10_000,
    });
  });

  test('register page loads', async ({ page }) => {
    await page.goto('/register');
    await expect(page.locator('text=Create Account')).toBeVisible();
  });

  test('forgot password page loads', async ({ page }) => {
    await page.goto('/forgot-password');
    await expect(page.locator('input[type="email"]')).toBeVisible();
  });
});

import { test, expect } from '@playwright/test';

test.describe('Smoke tests', () => {
  test('login page renders', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('text=KDOps')).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test('unauthenticated user redirects to login', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForURL('**/login');
    await expect(page).toHaveURL(/\/login/);
  });

  test('register page renders', async ({ page }) => {
    await page.goto('/register');
    await expect(page.locator('text=Create Account')).toBeVisible();
  });

  test('forgot password page renders', async ({ page }) => {
    await page.goto('/forgot-password');
    await expect(page.locator('input[type="email"]')).toBeVisible();
  });
});

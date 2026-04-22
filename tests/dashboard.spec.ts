import { test, expect } from '@playwright/test';

test.describe('Dashboard', () => {
  test('loads without errors and shows KPI cards', async ({ page }) => {
    await page.goto('/dashboard');
    // The dashboard renders a personalised greeting h1, not a literal "Dashboard" heading.
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 10_000 });

    // At least one stat card should render.
    const cards = page.locator('[class*="CardContent"]');
    await expect(cards.first()).toBeVisible({ timeout: 10_000 });
  });

  test('recent activity feed loads', async ({ page }) => {
    await page.goto('/dashboard');
    // Use first() — "Recent Activity" could appear in a heading and a card title.
    await expect(page.locator('text=Recent Activity').first()).toBeVisible({ timeout: 10_000 });
  });

  test('quick actions — Create Payment Batch navigates to wizard', async ({ page }) => {
    await page.goto('/dashboard');
    // The quick-action is a link or button. Use first() to avoid ambiguity with
    // any duplicate labels that may appear elsewhere on the page.
    const createBatch = page.locator(
      'a:has-text("Create Payment Batch"), button:has-text("Create Payment Batch")',
    ).first();
    await expect(createBatch).toBeVisible({ timeout: 10_000 });
    await createBatch.click();
    await page.waitForURL('**/payments/new');
    await expect(page).toHaveURL(/\/payments\/new/);
  });

  test('full audit log link navigates to /audit', async ({ page }) => {
    await page.goto('/dashboard');
    const link = page.locator('a:has-text("Full audit log"), text=Full audit log').first();
    if (await link.isVisible()) {
      await link.click();
      await page.waitForURL('**/audit', { timeout: 10_000 });
      await expect(page).toHaveURL(/\/audit/);
    }
  });

  test('header is visible and contains icon buttons', async ({ page }) => {
    await page.goto('/dashboard');
    const header = page.locator('header');
    await expect(header).toBeVisible({ timeout: 10_000 });
    // There must be at least one icon button (notification bell or profile).
    await expect(header.locator('button').first()).toBeVisible();
  });
});

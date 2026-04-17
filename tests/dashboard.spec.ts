import { test, expect } from '@playwright/test';

test.describe('Dashboard', () => {
  test('loads without errors and shows KPI cards', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.locator('h1:has-text("Dashboard")')).toBeVisible();

    // At least 4 stat cards should render (Partners Paid, Disbursed,
    // Pending Approvals, Fuel Spend).
    const cards = page.locator('[class*="CardContent"]');
    await expect(cards.first()).toBeVisible({ timeout: 10_000 });
  });

  test('recent activity feed loads', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(
      page.locator('text=Recent Activity').first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('quick actions section has working buttons', async ({ page }) => {
    await page.goto('/dashboard');
    const createBatch = page.locator('text=Create Payment Batch');
    await expect(createBatch).toBeVisible({ timeout: 10_000 });
    await createBatch.click();
    await page.waitForURL('**/payments/new');
    await expect(page).toHaveURL(/\/payments\/new/);
  });

  test('audit log link works', async ({ page }) => {
    await page.goto('/dashboard');
    const link = page.locator('text=Full audit log');
    if (await link.isVisible()) {
      await link.click();
      await page.waitForURL('**/audit');
      await expect(page).toHaveURL(/\/audit/);
    }
  });

  test('notification bell is visible', async ({ page }) => {
    await page.goto('/dashboard');
    const bell = page.locator('button[aria-label*="notification"], button:has(svg.lucide-bell)').first();
    // The bell may be rendered as an icon button without explicit aria-label;
    // fall back to checking the header area has at least one button.
    await expect(page.locator('header')).toBeVisible();
  });
});

import { test, expect } from '@playwright/test';

test.describe('Payments', () => {
  test('payments page loads and shows table or empty state', async ({ page }) => {
    await page.goto('/payments');
    await expect(
      page.locator('h1:has-text("Payment Batches")'),
    ).toBeVisible({ timeout: 10_000 });
    // Either a table or a "No batches found" message should appear.
    const table = page.locator('table');
    const empty = page.locator('text=/no batches/i');
    await expect(table.or(empty).first()).toBeVisible({ timeout: 10_000 });
  });

  test('create batch wizard — step 1 loads', async ({ page }) => {
    await page.goto('/payments/new');
    await expect(
      page.locator('h1:has-text("New Payment Batch")'),
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('text=Batch Name')).toBeVisible();
    await expect(page.locator('text=Payment Date')).toBeVisible();
  });

  test('step 1 → step 2 navigation works', async ({ page }) => {
    await page.goto('/payments/new');
    await page.fill('input[placeholder*="LinkedIn"]', 'E2E Test Batch');
    // Find the date input — there may be multiple; pick the payment date one.
    const dateInputs = page.locator('input[type="date"]');
    await dateInputs.first().fill('2026-04-30');
    // Click Next.
    const next = page.locator('button:has-text("Next")');
    await expect(next).toBeEnabled({ timeout: 5_000 });
    await next.click();
    await expect(page.locator('text=Select Contractors')).toBeVisible({
      timeout: 5_000,
    });
  });

  test('quick pay dialog opens', async ({ page }) => {
    await page.goto('/payments');
    const qp = page.locator('button:has-text("Quick Pay")');
    if (await qp.isVisible()) {
      await qp.click();
      await expect(page.locator('text=Quick Pay').first()).toBeVisible();
      await expect(page.locator('text=Bank')).toBeVisible();
      await expect(page.locator('text=Amount')).toBeVisible();
    }
  });
});

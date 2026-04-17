import { test, expect } from '@playwright/test';

test.describe('Budgets', () => {
  test('page loads', async ({ page }) => {
    await page.goto('/budgets');
    await expect(page.locator('h1:has-text("Budgets")')).toBeVisible({
      timeout: 10_000,
    });
  });

  test('new budget dialog opens with line items', async ({ page }) => {
    await page.goto('/budgets');
    const btn = page.locator('button:has-text("New Budget")');
    await expect(btn).toBeVisible({ timeout: 10_000 });
    await btn.click();

    await expect(page.locator('text=New Budget').first()).toBeVisible();
    await expect(page.locator('text=Name')).toBeVisible();
    await expect(page.locator('text=Period start')).toBeVisible();
    await expect(page.locator('text=Line items')).toBeVisible();
    await expect(page.locator('text=Add line')).toBeVisible();
  });

  test('add a line item row', async ({ page }) => {
    await page.goto('/budgets');
    const btn = page.locator('button:has-text("New Budget")');
    await btn.click();

    const addLine = page.locator('button:has-text("Add line")');
    await addLine.click();

    // Should now have at least 2 rows in the line items table.
    const rows = page.locator('table tbody tr');
    await expect(rows).toHaveCount(2, { timeout: 3_000 });
  });
});

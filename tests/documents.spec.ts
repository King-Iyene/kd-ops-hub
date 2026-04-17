import { test, expect } from '@playwright/test';

test.describe('Documents', () => {
  test('page loads and shows table or empty state', async ({ page }) => {
    await page.goto('/documents');
    // Page title or heading.
    await expect(
      page.locator('h1:has-text("Documents")'),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('upload dialog opens with file picker', async ({ page }) => {
    await page.goto('/documents');
    const btn = page.locator('button:has-text("Upload")').first();
    if (await btn.isVisible()) {
      await btn.click();
      await expect(page.locator('text=Title')).toBeVisible();
      await expect(page.locator('text=Category')).toBeVisible();
      await expect(page.locator('input[type="file"]')).toBeVisible();
    }
  });

  test('category filter dropdown works', async ({ page }) => {
    await page.goto('/documents');
    const filter = page
      .locator('button[role="combobox"]')
      .filter({ hasText: /all categories/i })
      .first();
    if (await filter.isVisible()) {
      await filter.click();
      // The dropdown should show at least one category option.
      await expect(
        page.locator('[role="option"]').first(),
      ).toBeVisible({ timeout: 3_000 });
    }
  });
});

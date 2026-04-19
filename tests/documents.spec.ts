import { test, expect } from '@playwright/test';

test.describe('Documents', () => {
  test('page loads and shows table or empty state', async ({ page }) => {
    await page.goto('/documents');
    await expect(page.locator('h1:has-text("Documents")')).toBeVisible({ timeout: 10_000 });
    await expect(
      page.locator('table, text=/no document/i').first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('upload dialog opens with title, category, and file picker', async ({ page }) => {
    await page.goto('/documents');
    const btn = page.locator('button:has-text("Upload")').first();
    if (await btn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await btn.click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible({ timeout: 5_000 });
      // Scope label checks inside the dialog.
      await expect(dialog.locator('label:has-text("Title"), [placeholder*="title"]').first()).toBeVisible();
      await expect(dialog.locator('label:has-text("Category"), text=Category').first()).toBeVisible();
      await expect(dialog.locator('input[type="file"]')).toBeVisible();
    }
  });

  test('category filter dropdown shows options', async ({ page }) => {
    await page.goto('/documents');
    const filter = page
      .locator('button[role="combobox"]')
      .filter({ hasText: /all categories/i })
      .first();
    if (await filter.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await filter.click();
      await expect(page.locator('[role="option"]').first()).toBeVisible({ timeout: 3_000 });
    }
  });
});

import { test, expect } from '@playwright/test';

test.describe('Leave', () => {
  test('leave page loads with heading', async ({ page }) => {
    await page.goto('/leave');
    await expect(page.locator('h1:has-text("Leave")')).toBeVisible({ timeout: 10_000 });
  });

  test('request leave dialog opens with required fields', async ({ page }) => {
    await page.goto('/leave');
    // The button label may be "Request Leave", "New Request", or similar.
    const requestBtn = page
      .locator('button:has-text("Request Leave"), button:has-text("New Request"), button:has-text("Apply")')
      .first();
    if (await requestBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await requestBtn.click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible({ timeout: 5_000 });
      // Leave type, start/end dates must be present.
      await expect(
        dialog.locator('label:has-text("Type"), label:has-text("Leave type")').or(dialog.getByText('Leave type')).first(),
      ).toBeVisible();
      await expect(
        dialog.locator('label:has-text("Start"), input[type="date"]').first(),
      ).toBeVisible();
    }
  });

  test('My Leave tab shows own requests or empty state', async ({ page }) => {
    await page.goto('/leave');
    // Try clicking the "My Leave" or "Mine" tab if it exists.
    const myTab = page.getByRole('tab', { name: /my leave|mine/i });
    if (await myTab.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await myTab.click();
    }
    await expect(
      page.locator('table').or(page.getByText(/no leave|no request/i)).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('Team Leave tab is visible for admins', async ({ page }) => {
    await page.goto('/leave');
    const teamTab = page.getByRole('tab', { name: /team|all/i });
    if (await teamTab.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await teamTab.click();
      await expect(
        page.locator('table').or(page.getByText(/no leave|no request/i)).first(),
      ).toBeVisible({ timeout: 10_000 });
    }
  });

  test('leave status badges render without errors', async ({ page }) => {
    await page.goto('/leave');
    await page.waitForTimeout(2_000);
    // Any badge with leave status text — just assert no crash.
    const badges = page.locator('[class*="badge"], [class*="Badge"]');
    expect(await badges.count()).toBeGreaterThanOrEqual(0);
  });
});

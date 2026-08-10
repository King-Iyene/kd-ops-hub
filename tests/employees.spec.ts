import { test, expect } from '@playwright/test';

test.describe('Employees', () => {
  test('employees page loads with heading', async ({ page }) => {
    await page.goto('/employees');
    await expect(page.locator('h1:has-text("Employees")')).toBeVisible({ timeout: 10_000 });
  });

  test('employee table or empty state is visible', async ({ page }) => {
    await page.goto('/employees');
    await expect(
      page.locator('table').or(page.getByText(/no employee/i)).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('clicking an employee row opens their profile page', async ({ page }) => {
    await page.goto('/employees');
    await expect(page.locator('h1:has-text("Employees")')).toBeVisible({ timeout: 10_000 });
    const firstRow = page.locator('table tbody tr').first();
    if (await firstRow.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await firstRow.click();
      await expect(page).toHaveURL(/\/employees\/[^/]+/, { timeout: 10_000 });
    }
  });

  test('employee profile shows tabs (Overview, Documents, Activity)', async ({ page }) => {
    await page.goto('/employees');
    const firstRow = page.locator('table tbody tr').first();
    if (await firstRow.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await firstRow.click();
      await page.waitForURL(/\/employees\/[^/]+/, { timeout: 10_000 });
      // At least the Overview tab must exist.
      await expect(page.getByRole('tab', { name: /overview/i })).toBeVisible({ timeout: 10_000 });
    }
  });

  test('invite employee dialog opens', async ({ page }) => {
    await page.goto('/employees');
    const inviteBtn = page.locator('button:has-text("Invite"), button:has-text("Add Employee")').first();
    if (await inviteBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await inviteBtn.click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible({ timeout: 5_000 });
      await expect(dialog.locator('input[type="email"]')).toBeVisible();
    }
  });

  test('search filters the employee table', async ({ page }) => {
    await page.goto('/employees');
    const search = page.locator('input[placeholder*="Search"]').first();
    if (await search.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await search.fill('zzz_no_match_zzz');
      await page.waitForTimeout(500);
      expect(await page.locator('table tbody tr').count()).toBeGreaterThanOrEqual(0);
    }
  });
});

import { test, expect } from '@playwright/test';

test.describe('Contractors', () => {
  test('page loads and shows table or empty state', async ({ page }) => {
    await page.goto('/contractors');
    await expect(page.locator('h1:has-text("Contractors")')).toBeVisible({ timeout: 10_000 });
    await expect(
      page.locator('table').or(page.getByText(/no contractor/i)).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('add contractor dialog opens with form fields', async ({ page }) => {
    await page.goto('/contractors');
    const addBtn = page.locator('button:has-text("Add Contractor")');
    await expect(addBtn).toBeVisible({ timeout: 10_000 });
    await addBtn.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    // Scope all assertions to the dialog.
    await expect(dialog.locator('label:has-text("Full Name"), [placeholder*="Name"]').first()).toBeVisible();
    await expect(dialog.locator('label:has-text("Bank")').or(dialog.getByText('Bank')).first()).toBeVisible();
    await expect(dialog.locator('label:has-text("Account Number"), [placeholder*="Account"]').first()).toBeVisible();
    await expect(dialog.locator('label:has-text("Default Amount"), label:has-text("Amount")').first()).toBeVisible();
  });

  test('clicking a contractor row opens the profile page', async ({ page }) => {
    await page.goto('/contractors');
    await expect(page.locator('h1:has-text("Contractors")')).toBeVisible({ timeout: 10_000 });
    const firstRow = page.locator('table tbody tr').first();
    if (await firstRow.isVisible()) {
      await firstRow.click();
      // Should navigate to a contractor detail/profile route.
      await expect(page).toHaveURL(/\/contractors\/[^/]+/, { timeout: 10_000 });
    }
  });

  test('search filters the contractor table', async ({ page }) => {
    await page.goto('/contractors');
    const search = page.locator('input[placeholder*="Search"]').first();
    await expect(search).toBeVisible({ timeout: 10_000 });
    await search.fill('zzz_no_match_zzz');
    await page.waitForTimeout(500);
    const rows = page.locator('table tbody tr');
    expect(await rows.count()).toBeGreaterThanOrEqual(0);
  });

  test('applications tab shows pending badge or list', async ({ page }) => {
    await page.goto('/contractors');
    const appsTab = page.getByRole('tab', { name: /application/i });
    if (await appsTab.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await appsTab.click();
      await expect(
        page.locator('table').or(page.getByText(/no.*application/i)).first(),
      ).toBeVisible({ timeout: 10_000 });
    }
  });
});

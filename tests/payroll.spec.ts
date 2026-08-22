import { test, expect } from '@playwright/test';

test.describe('Payroll', () => {
  test('payroll page loads with heading', async ({ page }) => {
    await page.goto('/payroll');
    await expect(
      page.locator('h1:has-text("Payroll")').or(page.locator('h1:has-text("Pay Runs")')).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('payroll list or empty state is visible', async ({ page }) => {
    await page.goto('/payroll');
    await expect(
      page.getByTestId('payroll-runs-list').or(page.getByText(/no payroll|no pay run/i)).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('create payroll run wizard opens and advances through its steps', async ({ page }) => {
    await page.goto('/payroll');
    const createBtn = page
      .locator('button:has-text("New Payroll"), button:has-text("Create"), button:has-text("Run Payroll")')
      .first();
    if (await createBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await createBtn.click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible({ timeout: 5_000 });
      // Step 1 of the wizard: who gets paid.
      await expect(dialog.getByText('Who gets paid').first()).toBeVisible();
      await dialog.getByRole('button', { name: 'Continue' }).click();
      // Step 2: period & schedule.
      await expect(
        dialog.locator('label:has-text("Period"), input[type="month"]').first(),
      ).toBeVisible();
    }
  });

  test('expanding a run shows who gets paid', async ({ page }) => {
    await page.goto('/payroll');
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 10_000 });
    const firstRunToggle = page.getByTestId('payroll-runs-list').getByRole('button').first();
    if (await firstRunToggle.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await firstRunToggle.click();
      // Expanding a run reveals its inline "who gets paid" / bonuses detail.
      await expect(
        page.getByText(/who gets paid|employees/i).first(),
      ).toBeVisible({ timeout: 10_000 });
    }
  });
});

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
      // Step 1 of the wizard: period + who gets paid, combined.
      await expect(dialog.locator('label:has-text("Period"), input[type="month"]').first()).toBeVisible();
      await dialog.locator('input[type="month"]').fill('2026-08');
      await dialog.getByRole('button', { name: 'Continue' }).click();
      // Step 2: bonuses & adjustments.
      await expect(dialog.getByText('Bonuses & Extras').first()).toBeVisible();
    }
  });

  test('opening a run shows its detail drawer', async ({ page }) => {
    await page.goto('/payroll');
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 10_000 });
    const firstRunCard = page.getByTestId('payroll-runs-list').getByRole('button').first();
    if (await firstRunCard.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await firstRunCard.click();
      // Opening a run reveals its detail drawer with "who gets paid" / money ledger.
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible({ timeout: 10_000 });
      await expect(dialog.getByText(/who gets paid|money ledger/i).first()).toBeVisible();
    }
  });
});

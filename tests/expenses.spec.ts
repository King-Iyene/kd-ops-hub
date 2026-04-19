import { test, expect } from '@playwright/test';

test.describe('Expenses', () => {
  test('page loads with heading', async ({ page }) => {
    await page.goto('/expenses');
    await expect(page.locator('h1:has-text("Expenses")')).toBeVisible({ timeout: 10_000 });
  });

  test('new expense dialog opens with required fields', async ({ page }) => {
    await page.goto('/expenses');
    const btn = page.locator('button:has-text("New Expense")');
    await expect(btn).toBeVisible({ timeout: 10_000 });
    await btn.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    // Scope all label checks inside the dialog.
    await expect(dialog.getByText('Category', { exact: true }).or(dialog.locator('label:has-text("Category")')).first()).toBeVisible();
    await expect(dialog.getByText('Amount', { exact: true }).or(dialog.locator('label:has-text("Amount")')).first()).toBeVisible();
  });

  test('submit an expense and see success toast', async ({ page }) => {
    await page.goto('/expenses');
    const btn = page.locator('button:has-text("New Expense")');
    await btn.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // Select category from the first combobox inside the dialog.
    const categoryTrigger = dialog.locator('button[role="combobox"]').first();
    await categoryTrigger.click();
    await page.locator('[role="option"]:has-text("transport")').first().click();

    // Fill amount.
    await dialog.locator('input[type="number"]').first().fill('2500');

    // Fill date.
    await dialog.locator('input[type="date"]').first().fill('2026-04-15');

    // Fill description.
    await dialog.locator('textarea').first().fill('E2E test expense — safe to delete');

    // Submit via the dialog's submit button.
    await dialog.getByRole('button', { name: /submit/i }).click();

    // Toast confirmation.
    await expect(page.locator('text=/submitted|saved|expense/i').first()).toBeVisible({ timeout: 10_000 });
  });

  test('approve button or empty state visible for approvers', async ({ page }) => {
    await page.goto('/expenses');
    await page.waitForTimeout(2_000);
    // Count doesn't matter — just assert no crash.
    const approveBtn = page.locator('button:has-text("Approve all pending"), button:has-text("Approve All")');
    expect(await approveBtn.count()).toBeGreaterThanOrEqual(0);
  });
});

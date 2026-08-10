import { test, expect } from '@playwright/test';

test.describe('Budgets', () => {
  test('page loads with heading', async ({ page }) => {
    await page.goto('/budgets');
    await expect(page.locator('h1:has-text("Budgets")')).toBeVisible({ timeout: 10_000 });
  });

  test('new budget dialog opens with form fields', async ({ page }) => {
    await page.goto('/budgets');
    const btn = page.locator('button:has-text("New Budget")');
    await expect(btn).toBeVisible({ timeout: 10_000 });
    await btn.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    // Scope all label checks inside the dialog to avoid matching page content.
    await expect(dialog.locator('label:has-text("Name"), [placeholder*="Budget name"]').first()).toBeVisible();
    await expect(dialog.locator('label:has-text("Period"), label:has-text("Start")').or(dialog.getByText('Period start')).first()).toBeVisible();
    await expect(dialog.locator('text=Line items').or(dialog.locator('text=Add line')).first()).toBeVisible();
  });

  test('add a line item row increases row count', async ({ page }) => {
    await page.goto('/budgets');
    await page.locator('button:has-text("New Budget")').click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    const addLine = dialog.locator('button:has-text("Add line")');
    await expect(addLine).toBeVisible({ timeout: 5_000 });
    await addLine.click();

    // Should now have at least 2 rows in the line items table (inside the dialog).
    const rows = dialog.locator('table tbody tr');
    await expect(rows).toHaveCount(2, { timeout: 3_000 });
  });

  test('budget list or empty state is visible', async ({ page }) => {
    await page.goto('/budgets');
    await expect(page.locator('h1:has-text("Budgets")')).toBeVisible({ timeout: 10_000 });
    // Table or empty state must render without errors.
    const content = page.locator('table').or(page.getByText(/no budget/i)).first();
    await expect(content).toBeVisible({ timeout: 10_000 });
  });
});

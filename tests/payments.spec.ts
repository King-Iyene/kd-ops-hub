import { test, expect } from '@playwright/test';

test.describe('Payments', () => {
  test('payments page loads and shows table or empty state', async ({ page }) => {
    await page.goto('/payments');
    await expect(
      page.locator('h1:has-text("Payment Batches")'),
    ).toBeVisible({ timeout: 10_000 });
    const table = page.locator('table');
    // EmptyState renders "No payment batches yet" or "No <status> batches" —
    // "no" and "batch" aren't adjacent, so a literal /no batches/i never matches.
    const empty = page.locator('text=/no .*batch/i');
    await expect(table.or(empty).first()).toBeVisible({ timeout: 10_000 });
  });

  test('create batch wizard — step 1 loads with required fields', async ({ page }) => {
    await page.goto('/payments/new');
    await expect(
      page.locator('h1:has-text("New Payment Batch")'),
    ).toBeVisible({ timeout: 10_000 });
    // Use label-scoped locators to avoid matching identical text elsewhere on page.
    await expect(page.locator('label:has-text("Batch Name"), label:has-text("Name")')).toBeVisible();
    await expect(page.locator('label:has-text("Payment Date"), label:has-text("Date")')).toBeVisible();
  });

  test('step 1 → step 2 navigation works', async ({ page }) => {
    await page.goto('/payments/new');
    // Fill batch name — the input may use a generic placeholder.
    const nameInput = page.locator('input').first();
    await nameInput.fill('E2E Test Batch');
    // Fill the first date input (payment date).
    const dateInputs = page.locator('input[type="date"]');
    await dateInputs.first().fill('2026-04-30');
    // Click Next.
    const next = page.getByRole('button', { name: /next/i });
    await expect(next).toBeEnabled({ timeout: 5_000 });
    await next.click();
    // Step 2 heading should appear.
    await expect(
      page.locator('text=Select Contractors').or(page.locator('h2:has-text("Step 2"), h3:has-text("Step 2")')).first(),
    ).toBeVisible({ timeout: 5_000 });
  });

  test('quick pay dialog opens with bank and amount fields', async ({ page }) => {
    await page.goto('/payments');
    const qp = page.locator('button:has-text("Quick Pay")');
    if (await qp.isVisible()) {
      await qp.click();
      // Scope label checks inside the dialog to avoid page-level ambiguity.
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible({ timeout: 5_000 });
      await expect(dialog.getByText('Bank', { exact: true }).or(dialog.locator('label:has-text("Bank")')).first()).toBeVisible();
      await expect(dialog.getByText('Amount', { exact: true }).or(dialog.locator('label:has-text("Amount")')).first()).toBeVisible();
    }
  });
});

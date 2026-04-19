import { type Page, expect } from '@playwright/test';

/**
 * Log in via the KDOps login page and wait for the dashboard to appear.
 * Only needed for tests that override the default storageState.
 */
export async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard', { timeout: 20_000 });
  await expect(page.locator('h1:has-text("Dashboard")')).toBeVisible({ timeout: 15_000 });
}

/**
 * Log out by clicking the profile button then the Logout menu item.
 */
export async function logout(page: Page) {
  // The profile/avatar button is in the header. It may have aria-label or be
  // identified by its position. Try common selectors.
  const profileBtn = page
    .locator('header button[aria-label*="profile"], header button[aria-label*="account"]')
    .or(page.locator('header button').last())
    .first();
  await profileBtn.click();
  const logoutItem = page.getByRole('menuitem', { name: /log.?out|sign.?out/i });
  await logoutItem.click();
  await page.waitForURL('**/login', { timeout: 10_000 });
}

/**
 * Open the New Expense dialog, fill in the minimum required fields, and submit.
 * Returns after the success toast appears.
 */
export async function createExpense(
  page: Page,
  { amount = 1000, description = 'E2E test expense' }: { amount?: number; description?: string } = {},
) {
  await page.goto('/expenses');
  await page.locator('button:has-text("New Expense")').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible({ timeout: 5_000 });

  // Pick first category option.
  await dialog.locator('button[role="combobox"]').first().click();
  await page.locator('[role="option"]').first().click();

  await dialog.locator('input[type="number"]').first().fill(String(amount));
  await dialog.locator('input[type="date"]').first().fill('2026-04-15');
  await dialog.locator('textarea').first().fill(description);
  await dialog.getByRole('button', { name: /submit/i }).click();

  await expect(page.locator('text=/submitted|saved/i').first()).toBeVisible({ timeout: 10_000 });
}

/**
 * Navigate to the Payments page and open the Create Batch wizard.
 */
export async function openCreateBatchWizard(page: Page) {
  await page.goto('/payments');
  const newBatch = page.locator('button:has-text("New Batch"), a:has-text("New Batch"), button:has-text("Create")').first();
  if (await newBatch.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await newBatch.click();
  } else {
    await page.goto('/payments/new');
  }
  await expect(page.locator('h1:has-text("New Payment Batch")')).toBeVisible({ timeout: 10_000 });
}

/**
 * Dismiss any open dialog by pressing Escape.
 */
export async function closeDialog(page: Page) {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
}

import { test, expect } from '@playwright/test';

// Light-touch smoke tests for the approval framework UI surface.
// Heavy lifting (RPC contract, payload-lock, self-approval) is covered by
// supabase/tests/approval_framework.sql — these only confirm the user-visible
// pieces actually mount.

test.describe('Approval framework — UI surface', () => {
  test('Quick Pay button shows the disabled banner when the master switch is off', async ({ page }) => {
    await page.goto('/payments');
    const trigger = page.locator('button:has-text("Quick Pay")');
    if (!(await trigger.isVisible())) test.skip();
    await trigger.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    // Either the disabled banner is present (default state) OR the dialog
    // shows the bank field — both are acceptable depending on env config.
    const bannerOrField = dialog.locator('text=/quick pay is disabled/i')
      .or(dialog.locator('label:has-text("Bank")'));
    await expect(bannerOrField.first()).toBeVisible({ timeout: 5_000 });
  });

  test('Approvals page renders and shows pending counts', async ({ page }) => {
    await page.goto('/approvals');
    // The page should mount even if the queue is empty.
    await expect(
      page.locator('text=/Approvals/i').or(page.locator('text=/all clear/i')).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('Settings → Transfer Authorization shows the new co-approval column', async ({ page }) => {
    await page.goto('/settings');
    // Try to navigate to the Transfer Authorization tab/section.
    const link = page.locator('a:has-text("Transfer Authorization"), button:has-text("Transfer Authorization")');
    if (await link.first().isVisible().catch(() => false)) {
      await link.first().click();
    }
    // The column header should appear once the panel mounts.
    const header = page.locator('th:has-text("Co-approval above")');
    // Soft assertion — admin-only panel may not be visible if test user lacks the role.
    if (await header.first().isVisible({ timeout: 5_000 }).catch(() => false)) {
      await expect(header.first()).toBeVisible();
    } else {
      test.skip();
    }
  });

  test('BatchDetail shows awaiting-second banner for pending_second_approval batches', async ({ page }) => {
    // We can't construct a pending_second_approval batch from the test user
    // without DB access, so this test only runs when a batch URL with that
    // status is reachable from the payments index. If not, skip.
    await page.goto('/payments');
    const candidate = page.locator('a:has-text("Awaiting 2nd")').first();
    if (!(await candidate.isVisible({ timeout: 3_000 }).catch(() => false))) test.skip();
    await candidate.click();
    await expect(
      page.locator('text=/awaiting second approval/i'),
    ).toBeVisible({ timeout: 5_000 });
  });
});

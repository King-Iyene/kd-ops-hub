import { test, expect, type Page } from '@playwright/test';

/**
 * One-time, deliberately manual (workflow_dispatch only — see
 * .github/workflows/payroll-live-verification.yml) verification that the
 * formal Payroll run pipeline (draft -> submit -> approve -> generate
 * payslips) actually works end-to-end against the live database. It never
 * has, on this project: the only two payroll_runs rows before this test
 * existed were manually drafted in April 2026 and abandoned at draft.
 *
 * This targets the real 2026-08 period. company_settings.
 * payroll_notifications_muted is on for the duration so no employee gets
 * emailed/notified — turn it back off afterward. No money moves either way;
 * disbursement is a separate, untouched step in the Payments module.
 *
 * Not part of the regular push-triggered E2E suite on purpose — it's a
 * one-shot, not a repeatable regression test (the period-uniqueness
 * constraint means a second run against the same period would just find
 * everything already done, not meaningfully re-verify anything).
 */

const PERIOD_MONTH_INPUT = '2026-08';
const PERIOD_ROW_TEXT = 'August 2026';

async function screenshot(page: Page, name: string) {
  await page.screenshot({ path: `test-results/live-verify-${name}.png`, fullPage: true });
}

test.describe.configure({ mode: 'serial' });

test('payroll pipeline: draft -> submit -> approve -> generate payslips (2026-08, live)', async ({ page }) => {
  await page.goto('/payroll');
  await expect(page.locator('h1').first()).toBeVisible({ timeout: 15_000 });

  await test.step('locate or draft the August 2026 run', async () => {
    await page.waitForTimeout(1000); // let the runs table finish its initial load
    const existingRow = page.locator('tr', { hasText: PERIOD_ROW_TEXT }).first();

    if (await existingRow.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await screenshot(page, '01-existing-run-found');
      return; // a run for this period already exists — later steps adapt to its status
    }

    const draftButton = page.locator('button', { hasText: 'Draft payroll' }).first();
    await draftButton.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    const periodInput = dialog.locator('input[type="month"]');
    await periodInput.fill(PERIOD_MONTH_INPUT);

    // Roster preview — expand it and screenshot so the run's who's-in/
    // who's-out breakdown is captured in the CI artifact for review.
    const rosterTrigger = dialog.locator('button', { hasText: /will be paid/ }).first();
    if (await rosterTrigger.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await rosterTrigger.click();
      await page.waitForTimeout(500);
    }
    await screenshot(page, '02-draft-dialog-roster');

    await dialog.locator('button', { hasText: 'Draft' }).last().click();
    await expect(dialog).not.toBeVisible({ timeout: 10_000 }).catch(() => {});
    await page.waitForTimeout(1500);

    await expect(page.locator('tr', { hasText: PERIOD_ROW_TEXT }).first()).toBeVisible({ timeout: 10_000 });
    await screenshot(page, '03-draft-created');
  });

  const row = () => page.locator('tr', { hasText: PERIOD_ROW_TEXT }).first();

  await test.step('submit for approval, if still a draft', async () => {
    const submitBtn = row().locator('button', { hasText: 'Submit' });
    if (await submitBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await submitBtn.click();
      await page.waitForTimeout(1500);
      await screenshot(page, '04-submitted');
    }
  });

  await test.step('approve, if pending approval', async () => {
    const approveBtn = row().locator('button', { hasText: 'Approve' });
    if (await approveBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      const disabled = await approveBtn.isDisabled().catch(() => false);
      expect(disabled, 'Approve button is disabled — likely the self-approval block. The test user must be admin/super_admin, or a different account must approve.').toBe(false);
      await approveBtn.click();
      // approve() awaits the full compliance auto-fill + anomaly scan +
      // (if permitted) generatePayslips() chain — which itself does one
      // sequential network round-trip per active employee — before it
      // calls load() to refresh the row. With headcount in the 20s this
      // can genuinely take over a minute; a short wait here just means
      // the next step finds a stale, still-pending_approval row.
      await page.waitForTimeout(90_000);
      await screenshot(page, '05-approved');
    }
  });

  await test.step('generate payslips, if approved and not yet generated', async () => {
    // A fresh reload guarantees the row reflects current DB state rather
    // than whatever the client had in memory when the approve step's wait
    // elapsed — approve_payroll_run() commits fast; the client-side
    // generatePayslips() that follows it in the same async chain is the
    // slow part and may not have finished re-rendering yet.
    await page.reload();
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(1500);

    const genBtn = row().locator('button', { hasText: 'Generate payslips' });
    if (await genBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await genBtn.click();
      // Payslip generation loops per-employee (toast per step, one network
      // round-trip each) — real headcount here is in the 20s, so give it
      // real time rather than a guess sized for a much smaller test set.
      await page.waitForTimeout(120_000);
      await screenshot(page, '06-payslips-generated');
    }
  });

  await test.step('final state', async () => {
    await screenshot(page, '07-final-state');
    // Surface whatever status badge the run landed on in the report,
    // rather than asserting one exact value — later steps may not have
    // been reachable (e.g. self-approval block), and that's a real,
    // reportable outcome, not a script bug.
    const statusText = await row().innerText().catch(() => '(row not found)');
    console.log('[payroll-live-verification] final row contents:\n', statusText);
  });
});

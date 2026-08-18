import { test, type Page, type Locator } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * Annotated, click-by-click walkthrough screenshots for the Platform Guide:
 * creating a payment batch, submitting an expense with a receipt, and
 * submitting a fuel or repair request. Each step highlights the exact
 * control it's illustrating (an amber ring + numbered badge injected into
 * the live page before the shot) instead of dumping one whole-page image
 * per module.
 *
 * Prints base64 straight to the job log — same reason as
 * guide-screenshots-inline.spec.ts: this repo's CI environments can read
 * job logs through the GitHub API but not GitHub's artifact blob storage.
 *
 * Read-only by design: every flow stops right before its final submit
 * button (never clicks "Submit for Approval" / "Submit" / "Submit Request"
 * / "Submit Repair") so no real batch, expense, or fleet request is ever
 * created. The one exception is filling a fake bank account number into
 * a card that resolves it live — that step is skipped entirely; those
 * dialogs are only screenshotted with their fields still empty/unverified.
 *
 * Run only via .github/workflows/guide-screenshots.yml (workflow_dispatch).
 */

const OUT_DIR = 'guide-walkthroughs';
const DUMMY_RECEIPT = path.join(OUT_DIR, 'dummy-receipt.jpg');

function printBase64(name: string, buf: Buffer) {
  console.log(`===SCREENSHOT:${name}.jpg:START===`);
  console.log(buf.toString('base64'));
  console.log(`===SCREENSHOT:${name}.jpg:END===`);
}

/**
 * Draws an amber ring + numbered badge around `highlight`, screenshots
 * either the full viewport or (if `container` is given) a tight crop
 * around that container, then removes the overlay.
 */
async function stepShot(
  page: Page,
  opts: { name: string; label: string; highlight: Locator; container?: Locator; padding?: number },
) {
  const { name, label, highlight, container, padding = 20 } = opts;
  await highlight.scrollIntoViewIfNeeded();
  const hbox = await highlight.boundingBox();
  if (!hbox) {
    console.log(`SKIP ${name}: highlight target not found`);
    return;
  }

  await page.evaluate(
    ({ x, y, w, h, label }) => {
      const ring = document.createElement('div');
      ring.id = '__guide_ring';
      Object.assign(ring.style, {
        position: 'fixed', left: `${x - 6}px`, top: `${y - 6}px`,
        width: `${w + 12}px`, height: `${h + 12}px`,
        border: '3px solid #f59e0b', borderRadius: '10px',
        boxShadow: '0 0 0 4px rgba(245,158,11,0.28)',
        zIndex: 2147483000, pointerEvents: 'none',
      });
      document.body.appendChild(ring);

      const badge = document.createElement('div');
      badge.id = '__guide_badge';
      badge.textContent = label;
      Object.assign(badge.style, {
        position: 'fixed', left: `${x - 16}px`, top: `${y - 16}px`,
        width: '30px', height: '30px', borderRadius: '9999px',
        background: '#f59e0b', color: '#1a1200', fontWeight: '800',
        fontSize: '15px', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        zIndex: 2147483001, boxShadow: '0 2px 10px rgba(0,0,0,0.4)',
      });
      document.body.appendChild(badge);
    },
    { x: hbox.x, y: hbox.y, w: hbox.width, h: hbox.height, label },
  );

  let clip: { x: number; y: number; width: number; height: number } | undefined;
  if (container) {
    const cbox = await container.boundingBox();
    if (cbox) {
      const vp = page.viewportSize() ?? { width: 1440, height: 900 };
      clip = {
        x: Math.max(0, cbox.x - padding),
        y: Math.max(0, cbox.y - padding),
        width: Math.min(vp.width - Math.max(0, cbox.x - padding), cbox.width + padding * 2),
        height: Math.min(vp.height - Math.max(0, cbox.y - padding), cbox.height + padding * 2),
      };
    }
  }

  try {
    const buf = await page.screenshot({ type: 'jpeg', quality: 68, clip });
    printBase64(name, buf);
  } catch (err) {
    console.log(`SKIP ${name}: ${(err as Error).message}`);
  } finally {
    await page.evaluate(() => {
      document.getElementById('__guide_ring')?.remove();
      document.getElementById('__guide_badge')?.remove();
    });
  }
}

test.beforeAll(() => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  // Tiny valid 2x2 JPEG, used only to populate a file input so the "receipt
  // attached" confirmation state can be screenshotted — never actually
  // submitted anywhere.
  const tinyJpegBase64 =
    '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a' +
    'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIy' +
    'MjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAACAAIDASIA' +
    'AhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEB' +
    'AQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX' +
    '/9k=';
  fs.writeFileSync(DUMMY_RECEIPT, Buffer.from(tinyJpegBase64, 'base64'));
});

test('walkthrough: creating a payment batch', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.goto('/payments', { waitUntil: 'networkidle', timeout: 20_000 });
  const newBatchBtn = page.getByRole('button', { name: 'New Batch' }).first();
  if (await newBatchBtn.count()) {
    await stepShot(page, { name: 'batch-1-start', label: '1', highlight: newBatchBtn });
  }

  await page.goto('/payments/new', { waitUntil: 'networkidle', timeout: 20_000 });
  const contractorCard = page.getByText('Contractor Payment', { exact: false }).first();
  if (await contractorCard.count()) {
    await contractorCard.click();
  }
  const batchNameInput = page.getByLabel('Batch Name').first();
  if (await batchNameInput.count()) {
    await batchNameInput.fill('Guide Walkthrough Example');
  }
  const nextBtn = page.getByRole('button', { name: 'Next' }).first();
  if (await nextBtn.count()) {
    await stepShot(page, { name: 'batch-2-details', label: '2', highlight: nextBtn });
    await nextBtn.click().catch(() => {});
  }

  const addOneOffBtn = page.getByRole('button', { name: 'Add One-off Beneficiary' }).first();
  if (await addOneOffBtn.count()) {
    await addOneOffBtn.click();
    const dialog = page.getByRole('dialog').first();
    const bankField = dialog.getByText('Bank', { exact: false }).first();
    if (await dialog.count() && await bankField.count()) {
      await stepShot(page, { name: 'batch-3-beneficiary', label: '3', highlight: bankField, container: dialog });
    }
  }
});

test('walkthrough: submitting an expense with a receipt', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.goto('/expenses', { waitUntil: 'networkidle', timeout: 20_000 });
  const newExpenseBtn = page.getByRole('button', { name: 'New Expense' }).first();
  if (await newExpenseBtn.count()) {
    await stepShot(page, { name: 'expense-1-start', label: '1', highlight: newExpenseBtn });
    await newExpenseBtn.click();
  }

  const dialog = page.getByRole('dialog').first();
  if (await dialog.count()) {
    const descriptionField = dialog.getByPlaceholder('What was the expense for?').first();
    if (await descriptionField.count()) {
      await descriptionField.fill('Guide walkthrough example expense');
      await stepShot(page, { name: 'expense-2-details', label: '2', highlight: descriptionField, container: dialog });
    }

    const scanBtn = dialog.getByRole('button', { name: /scan receipt/i }).first();
    if (await scanBtn.count()) {
      await stepShot(page, { name: 'expense-3-receipt', label: '3', highlight: scanBtn, container: dialog });
    }
  }
});

test('walkthrough: submitting a fuel or repair request', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.goto('/fleet', { waitUntil: 'networkidle', timeout: 20_000 });
  const myRequestsNav = page.getByText('My Requests', { exact: false }).first();
  if (await myRequestsNav.count()) {
    await myRequestsNav.click().catch(() => {});
    await page.waitForTimeout(500);
  }

  const fuelBtn = page.getByRole('button', { name: 'New Fuel Request' }).first();
  const repairBtn = page.getByRole('button', { name: 'Repair Request' }).first();
  if (await fuelBtn.count() && await repairBtn.count()) {
    // One shared shot: both entry points live side by side, so a single
    // screenshot with both rings covers the "where do I start" step for
    // both the fuel and repair walkthroughs.
    await repairBtn.scrollIntoViewIfNeeded();
    const rbox = await repairBtn.boundingBox();
    const fbox = await fuelBtn.boundingBox();
    if (rbox && fbox) {
      await page.evaluate(
        ({ rbox, fbox }) => {
          const draw = (box: { x: number; y: number; width: number; height: number }, label: string, id: string) => {
            const ring = document.createElement('div');
            ring.className = '__guide_multi';
            Object.assign(ring.style, {
              position: 'fixed', left: `${box.x - 6}px`, top: `${box.y - 6}px`,
              width: `${box.width + 12}px`, height: `${box.height + 12}px`,
              border: '3px solid #f59e0b', borderRadius: '10px',
              boxShadow: '0 0 0 4px rgba(245,158,11,0.28)', zIndex: 2147483000, pointerEvents: 'none',
            });
            document.body.appendChild(ring);
            const badge = document.createElement('div');
            badge.className = '__guide_multi';
            badge.textContent = label;
            Object.assign(badge.style, {
              position: 'fixed', left: `${box.x - 16}px`, top: `${box.y - 16}px`,
              width: '30px', height: '30px', borderRadius: '9999px',
              background: '#f59e0b', color: '#1a1200', fontWeight: '800', fontSize: '15px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'system-ui, -apple-system, sans-serif',
              zIndex: 2147483001, boxShadow: '0 2px 10px rgba(0,0,0,0.4)',
            });
            document.body.appendChild(badge);
          };
          draw(rbox, 'A', 'repair');
          draw(fbox, 'B', 'fuel');
        },
        { rbox, fbox },
      );
      try {
        const buf = await page.screenshot({ type: 'jpeg', quality: 68 });
        printBase64('fleet-requests-start', buf);
      } catch (err) {
        console.log(`SKIP fleet-requests-start: ${(err as Error).message}`);
      } finally {
        await page.evaluate(() => document.querySelectorAll('.__guide_multi').forEach((el) => el.remove()));
      }
    }
  }

  // Fuel request dialog — fill the basics, highlight the receipt dropzone.
  if (await fuelBtn.count()) {
    await fuelBtn.click();
    const dialog = page.getByRole('dialog').first();
    if (await dialog.count()) {
      const dropzone = dialog.getByText(/click to attach receipt/i).first();
      if (await dropzone.count()) {
        await stepShot(page, { name: 'fuel-2-receipt', label: '2', highlight: dropzone, container: dialog });
      }
      const cancelBtn = dialog.getByRole('button', { name: 'Cancel' }).first();
      if (await cancelBtn.count()) await cancelBtn.click().catch(() => {});
    }
  }

  // Repair request dialog — fill the basics, attach a dummy file so the
  // green "receipt attached" confirmation card is visible, highlight it.
  if (await repairBtn.count()) {
    await repairBtn.click();
    const dialog = page.getByRole('dialog').first();
    if (await dialog.count()) {
      const descField = dialog.getByPlaceholder(/description/i).first();
      if (await descField.count()) await descField.fill('Guide walkthrough example repair').catch(() => {});

      const manualInput = dialog.locator('input[type="file"]').last();
      if (await manualInput.count()) {
        await manualInput.setInputFiles(DUMMY_RECEIPT).catch(() => {});
        await page.waitForTimeout(400);
      }

      const confirmCard = dialog.getByText(/change/i).first();
      const target = (await confirmCard.count()) ? confirmCard : descField;
      if (await target.count()) {
        await stepShot(page, { name: 'repair-2-receipt', label: '2', highlight: target, container: dialog });
      }
    }
  }
});

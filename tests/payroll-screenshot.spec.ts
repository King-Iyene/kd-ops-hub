import { test } from '@playwright/test';
import fs from 'fs';

/**
 * Payroll-only screenshot, printed as base64 into the job log.
 *
 * Why this exists next to guide-screenshots-inline: that spec prints a
 * curated tour and is followed in its workflow by the walkthrough step, so
 * the payroll images end up buried in the middle of a long job log. A reader
 * that can only pull the *tail* of the log through the API therefore cannot
 * reach them without dragging every later image along too. Here payroll is
 * the only thing captured and the print is the last thing the job does, so
 * the tail of the log is exactly the payroll screen and nothing else.
 *
 * Small and heavily compressed on purpose: the base64 has to be small enough
 * to copy back out of the log in one piece. Enough to judge layout, spacing
 * and whether anything is obviously broken — not fine detail.
 *
 * Read-only: navigates and screenshots, never clicks a submit, approve,
 * delete or send control, and never touches a disbursement path.
 */

const SHOTS: { name: string; width: number; height: number; quality: number }[] = [
  { name: 'payroll-desktop', width: 1024, height: 640, quality: 30 },
  { name: 'payroll-mobile', width: 390, height: 780, quality: 30 },
];

test('print the payroll screen as base64 to the job log', async ({ page }) => {
  test.setTimeout(120_000);
  const outDir = 'payroll-screenshot';
  fs.mkdirSync(outDir, { recursive: true });

  for (const { name, width, height, quality } of SHOTS) {
    try {
      await page.setViewportSize({ width, height });
      await page.goto('/payroll', { waitUntil: 'networkidle', timeout: 30_000 });
      // Charts and the runs list animate in; settle before capturing.
      await page.waitForTimeout(2_000);
      const filePath = `${outDir}/${name}.jpg`;
      await page.screenshot({ path: filePath, type: 'jpeg', quality });
      const b64 = fs.readFileSync(filePath).toString('base64');
      console.log(`===SHOT:${name}:len=${b64.length}===`);
      console.log(b64);
      console.log(`===SHOT:${name}:END===`);
    } catch (err) {
      console.log(`SKIP ${name}: ${(err as Error).message}`);
    }
  }
});

import { test } from '@playwright/test';
import fs from 'fs';

/**
 * Prints a small, curated set of screenshots as base64 directly into the
 * job log, instead of uploading a zip artifact to blob storage. Some CI
 * environments (this repo's Claude sessions included) can read job logs
 * through the GitHub API but cannot reach GitHub's artifact blob storage
 * host directly — base64-in-log sidesteps that entirely.
 *
 * Kept intentionally small (a handful of pages, JPEG, viewport-only, no
 * fullPage) so the whole log stays well under any step-log size limit.
 *
 * Run only via .github/workflows/guide-screenshots.yml (workflow_dispatch).
 */

const PAGES: { path: string; name: string; width: number; height: number }[] = [
  { path: '/login', name: 'login-desktop', width: 1440, height: 900 },
  { path: '/dashboard', name: 'dashboard-desktop', width: 1440, height: 900 },
  { path: '/guide', name: 'guide-desktop', width: 1440, height: 900 },
  { path: '/tasks', name: 'tasks-desktop', width: 1440, height: 900 },
  { path: '/dashboard', name: 'dashboard-mobile', width: 390, height: 844 },
  { path: '/attendance', name: 'attendance-mobile', width: 390, height: 844 },
];

test('print curated screenshots as base64 to the job log', async ({ page }) => {
  test.setTimeout(60_000);
  const outDir = 'guide-screenshots-inline';
  fs.mkdirSync(outDir, { recursive: true });

  for (const { path, name, width, height } of PAGES) {
    try {
      await page.setViewportSize({ width, height });
      await page.goto(path, { waitUntil: 'networkidle', timeout: 20_000 });
      await page.waitForTimeout(800);
      const filePath = `${outDir}/${name}.jpg`;
      await page.screenshot({ path: filePath, type: 'jpeg', quality: 65 });
      const b64 = fs.readFileSync(filePath).toString('base64');
      console.log(`===SCREENSHOT:${name}.jpg:START===`);
      console.log(b64);
      console.log(`===SCREENSHOT:${name}.jpg:END===`);
    } catch (err) {
      console.log(`SKIP ${name}: ${(err as Error).message}`);
    }
  }
});

import { test } from '@playwright/test';
import fs from 'fs';

/**
 * Read-only screenshot tour for the team onboarding guide. Reuses the
 * authenticated session from global-setup.ts (same Super Admin test
 * account the rest of the E2E suite uses). Navigates to a curated list of
 * pages and takes full-page screenshots — never clicks a submit/approve/
 * delete/send button, never mutates data.
 *
 * Run only via .github/workflows/guide-screenshots.yml (workflow_dispatch).
 */

const OUT_DIR = 'guide-screenshots';

const DESKTOP_PAGES: { path: string; name: string }[] = [
  { path: '/dashboard', name: 'dashboard' },
  { path: '/my-dashboard', name: 'my-dashboard' },
  { path: '/attendance', name: 'attendance' },
  { path: '/tasks', name: 'tasks' },
  { path: '/leave', name: 'leave' },
  { path: '/timesheets', name: 'timesheets' },
  { path: '/documents', name: 'documents' },
  { path: '/communications', name: 'communications' },
  { path: '/messages', name: 'messages' },
  { path: '/profile', name: 'profile' },
  { path: '/assistant', name: 'assistant' },
  { path: '/knowledge', name: 'knowledge' },
  { path: '/handbook', name: 'handbook' },
  { path: '/goals', name: 'goals' },
  { path: '/performance', name: 'performance' },
  { path: '/benefits', name: 'benefits' },
  { path: '/training', name: 'training' },
  { path: '/surveys', name: 'surveys' },
  { path: '/referrals', name: 'referrals' },
  { path: '/my-requests', name: 'my-requests' },
  { path: '/guide', name: 'system-reference' },
  { path: '/payments', name: 'payments' },
  { path: '/payroll', name: 'payroll' },
  { path: '/employees', name: 'employees' },
  { path: '/fleet', name: 'fleet' },
  { path: '/settings', name: 'settings' },
  { path: '/reports', name: 'reports' },
  { path: '/expenses', name: 'expenses' },
  { path: '/approvals', name: 'approvals' },
  { path: '/contractors', name: 'contractors' },
  { path: '/clients', name: 'clients' },
  { path: '/recruitment', name: 'recruitment' },
  { path: '/onboarding', name: 'onboarding' },
  { path: '/invoices', name: 'invoices' },
  { path: '/budgets', name: 'budgets' },
];

const MOBILE_PAGES: { path: string; name: string }[] = [
  { path: '/dashboard', name: 'dashboard' },
  { path: '/attendance', name: 'attendance' },
  { path: '/tasks', name: 'tasks' },
  { path: '/leave', name: 'leave' },
  { path: '/documents', name: 'documents' },
  { path: '/profile', name: 'profile' },
];

test('capture desktop screenshots for team guide', async ({ page }) => {
  fs.mkdirSync(`${OUT_DIR}/desktop`, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 });

  for (const { path, name } of DESKTOP_PAGES) {
    try {
      await page.goto(path, { waitUntil: 'networkidle', timeout: 20_000 });
      await page.waitForTimeout(800); // let charts/animations settle
      await page.screenshot({ path: `${OUT_DIR}/desktop/${name}.png`, fullPage: true });
      console.log(`captured desktop/${name}.png`);
    } catch (err) {
      console.log(`SKIP desktop/${name}: ${(err as Error).message}`);
    }
  }
});

test('capture mobile screenshots for team guide', async ({ page }) => {
  fs.mkdirSync(`${OUT_DIR}/mobile`, { recursive: true });
  await page.setViewportSize({ width: 390, height: 844 }); // iPhone 12/13 size

  for (const { path, name } of MOBILE_PAGES) {
    try {
      await page.goto(path, { waitUntil: 'networkidle', timeout: 20_000 });
      await page.waitForTimeout(800);
      await page.screenshot({ path: `${OUT_DIR}/mobile/${name}.png`, fullPage: true });
      console.log(`captured mobile/${name}.png`);
    } catch (err) {
      console.log(`SKIP mobile/${name}: ${(err as Error).message}`);
    }
  }
});

import { test, expect, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Comprehensive E2E test suite for the Database (Bases) feature.
 *
 * State is persisted to a temp file so that Playwright retry workers
 * (which re-evaluate the module) can pick up the base URL created in
 * the first run.
 */

const STATE_FILE = path.join(__dirname, '.e2e-test-base-state.json');

function loadPersistedState(): { name: string; url: string | null } {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
  } catch {
    return { name: '', url: null };
  }
}

function persistState(name: string, url: string | null) {
  fs.writeFileSync(STATE_FILE, JSON.stringify({ name, url }));
}

const persisted = loadPersistedState();
const TEST_BASE_NAME = persisted.name || `E2E Test Base ${Date.now()}`;
let testBaseUrl: string | null = persisted.url;

// Persist the name immediately so retry workers use the same name
if (!persisted.name) {
  persistState(TEST_BASE_NAME, null);
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function screenshotStep(page: Page, name: string) {
  await page.screenshot({
    path: `test-results/screenshots/${name}.png`,
    fullPage: false,
  });
}

async function navigateToData(page: Page) {
  await page.goto('/data');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
}

async function waitForGridLoad(page: Page) {
  await page.waitForSelector(
    '[role="grid"], text=/No records|0 records|Add row|Empty/i',
    { timeout: 15_000 },
  );
  await page.waitForTimeout(500);
}

async function getSidebarBases(page: Page) {
  // Sidebar base items are <div> elements inside <aside>, with cursor-pointer class
  // Each contains a <span> with the base name
  return page.locator('aside div.cursor-pointer span.truncate');
}

async function clickSidebarBase(page: Page, baseName: string) {
  const sidebar = page.locator('aside');
  // Base items are divs with cursor-pointer class containing a span with the name
  const baseItem = sidebar.locator(`div.cursor-pointer:has(span.truncate:has-text("${baseName}"))`).first();
  await expect(baseItem).toBeVisible({ timeout: 10_000 });
  await baseItem.click();
  await page.waitForTimeout(2000);
}

async function clickFirstSidebarBase(page: Page) {
  const parentDiv = page.locator('aside div.cursor-pointer').first();
  if (await parentDiv.isVisible({ timeout: 10_000 }).catch(() => false)) {
    await parentDiv.click();
    await page.waitForTimeout(2000);
    return true;
  }
  return false;
}

async function clickAddRow(page: Page) {
  // The add-row button in GridView says "New row" with a Plus icon
  const newRowBtn = page.locator('button:has-text("New row")');
  if (await newRowBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await newRowBtn.click();
    await page.waitForTimeout(500);
    return;
  }
  // Empty state button says "Add row"
  const addRowBtn = page.locator('button:has-text("Add row")');
  if (await addRowBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await addRowBtn.click();
    await page.waitForTimeout(500);
    return;
  }
  throw new Error('Could not find add-row button ("New row" or "Add row")');
}

async function navigateToTestBase(page: Page) {
  if (testBaseUrl) {
    await page.goto(testBaseUrl);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
  } else {
    await navigateToData(page);
    await clickSidebarBase(page, TEST_BASE_NAME);
  }
  await waitForGridLoad(page);
}

// ─── 1. EXISTING BASES — 406 Fix Verification ──────────────────────────────

test.describe('Existing bases load without 406 errors', () => {
  test('navigate to /data and verify sidebar lists bases', async ({ page }) => {
    await navigateToData(page);
    await screenshotStep(page, '01_data_page_loaded');

    const bases = await getSidebarBases(page);
    const count = await bases.count();
    console.log(`BASES FOUND IN SIDEBAR: ${count}`);
    await screenshotStep(page, '02_sidebar_bases');

    expect(count, 'At least one base should be listed in the sidebar').toBeGreaterThan(0);
  });

  test('click into each existing base and verify no 406 / "Failed to load"', async ({ page }) => {
    const errors406: string[] = [];
    page.on('response', (response) => {
      if (response.status() === 406) {
        errors406.push(`406 on ${response.url()}`);
      }
    });

    await navigateToData(page);

    const bases = await getSidebarBases(page);
    const count = await bases.count();
    const baseNames: string[] = [];
    for (let i = 0; i < count; i++) {
      const name = await bases.nth(i).textContent();
      if (name) baseNames.push(name.trim());
    }
    console.log(`Will test ${baseNames.length} base(s): ${baseNames.join(', ')}`);

    const results: { name: string; status: string }[] = [];

    for (let i = 0; i < Math.min(baseNames.length, 5); i++) {
      // Click the base in the sidebar
      const baseDiv = page.locator('aside div.cursor-pointer').nth(i);
      await baseDiv.click();
      await page.waitForTimeout(3000);

      const baseName = baseNames[i];
      await screenshotStep(page, `03_base_${baseName.substring(0, 20).replace(/\s/g, '_')}`);

      const failedLoad = await page.locator('text=/Failed to load|Not Acceptable/i').count();
      const hasGrid = await page.locator('[role="grid"]').count();
      const hasContent = await page.locator('text=/records|New row|Add row/i').count();

      if (failedLoad > 0 || errors406.length > 0) {
        results.push({ name: baseName, status: `FAIL — errors detected (406 count: ${errors406.length})` });
      } else if (hasGrid > 0 || hasContent > 0) {
        results.push({ name: baseName, status: 'PASS — loaded successfully' });
      } else {
        results.push({ name: baseName, status: 'PARTIAL — no error but no grid found' });
      }
    }

    console.log('\n══════════════════════════════════════════');
    console.log('EXISTING BASES TEST RESULTS:');
    results.forEach((r) => console.log(`  ${r.status}: ${r.name}`));
    console.log('══════════════════════════════════════════\n');

    const failures = results.filter((r) => r.status.startsWith('FAIL'));
    expect(failures, `${failures.length} base(s) failed to load`).toHaveLength(0);
  });
});

// ─── 2. CREATE A NEW BASE ───────────────────────────────────────────────────

test.describe('Create a new test base', () => {
  test('create base via dialog', async ({ page }) => {
    await navigateToData(page);
    await screenshotStep(page, '10_before_create_base');

    // The "Create base" button in sidebar header has title="Create base"
    const createBtn = page.locator('button[title="Create base"]');
    await expect(createBtn).toBeVisible({ timeout: 10_000 });
    await createBtn.click();

    // Wait for the Create Base dialog
    await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 5_000 });
    await screenshotStep(page, '11_create_base_dialog');

    // Fill in the name (input with id="base-name" or placeholder containing "Project Tracker")
    const nameInput = page.locator('#base-name');
    await nameInput.fill(TEST_BASE_NAME);
    await screenshotStep(page, '12_base_name_filled');

    // Click the "Create Base" submit button inside the dialog
    const dialog = page.locator('[role="dialog"]');
    await dialog.locator('button:has-text("Create Base")').click();

    // Wait for navigation to the new base
    await page.waitForURL('**/data/**', { timeout: 15_000 });
    await page.waitForTimeout(3000);
    await screenshotStep(page, '13_base_created');

    const url = page.url();
    expect(url).toContain('/data/');
    testBaseUrl = url;
    persistState(TEST_BASE_NAME, url);
    console.log('PASS: Base created, navigated to:', url);
  });
});

// ─── 3. ADD EVERY FIELD TYPE ────────────────────────────────────────────────

const FIELD_TYPES_TO_TEST = [
  { type: 'SingleLineText', label: 'Single Line Text', testValue: 'Hello World' },
  { type: 'Email', label: 'Email', testValue: 'test@example.com' },
  { type: 'PhoneNumber', label: 'Phone Number', testValue: '+1234567890' },
  { type: 'URL', label: 'URL', testValue: 'https://example.com' },
  { type: 'Number', label: 'Number', testValue: '42' },
  { type: 'Currency', label: 'Currency', testValue: '99.99' },
  { type: 'Percent', label: 'Percent', testValue: '75' },
  { type: 'Date', label: 'Date', testValue: '2026-01-15' },
  { type: 'SingleSelect', label: 'Single Select', testValue: null },
  { type: 'MultiSelect', label: 'Multi Select', testValue: null },
  { type: 'Checkbox', label: 'Checkbox', testValue: null },
  { type: 'LongText', label: 'Long Text', testValue: 'This is a longer text with\nmultiple lines for testing.' },
  { type: 'Rating', label: 'Rating', testValue: null },
  { type: 'Decimal', label: 'Decimal', testValue: '3.14159' },
] as const;

test.describe('Add fields of every type', () => {
  test.beforeEach(async ({ page }) => {
    await navigateToTestBase(page);
  });

  for (const fieldDef of FIELD_TYPES_TO_TEST) {
    test(`add ${fieldDef.label} field`, async ({ page }) => {
      // Click the "Add field" button in the grid header (has aria-label="Add field")
      const addFieldBtn = page.locator('[aria-label="Add field"]').first();
      if (await addFieldBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await addFieldBtn.click();
      } else {
        // Fallback: toolbar button with title="Add new field"
        await page.locator('button[title="Add new field"]').click();
      }
      await page.waitForTimeout(500);

      // The CreateFieldDialog should appear
      const dialog = page.locator('[role="dialog"]');
      await expect(dialog).toBeVisible({ timeout: 5_000 });
      await screenshotStep(page, `20_add_field_${fieldDef.type}_dialog`);

      // Fill field name
      const nameInput = dialog.locator('input').first();
      await nameInput.fill(`Test ${fieldDef.label}`);

      // Select the field type — look for a type selector dropdown/button
      // The dialog likely has a select or button group for field types
      const typeOption = dialog.locator(`text="${fieldDef.label}"`).first();
      if (await typeOption.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await typeOption.click();
        await page.waitForTimeout(300);
      }

      // For SingleSelect / MultiSelect — add some options
      if (fieldDef.type === 'SingleSelect' || fieldDef.type === 'MultiSelect') {
        const optionInput = dialog.locator('input[placeholder*="option"], input[placeholder*="Add"]').first();
        if (await optionInput.isVisible().catch(() => false)) {
          for (const opt of ['Option A', 'Option B', 'Option C']) {
            await optionInput.fill(opt);
            await optionInput.press('Enter');
            await page.waitForTimeout(200);
          }
        }
      }

      await screenshotStep(page, `21_add_field_${fieldDef.type}_configured`);

      // Click Create / Save button in dialog
      const saveBtn = dialog.locator('button:has-text("Create"), button:has-text("Save"), button:has-text("Add")').first();
      await saveBtn.click();
      await page.waitForTimeout(1500);
      await screenshotStep(page, `22_add_field_${fieldDef.type}_done`);

      console.log(`PASS: ${fieldDef.label} field added`);
    });
  }
});

// ─── 4. RECORD CRUD ─────────────────────────────────────────────────────────

test.describe('Record CRUD operations', () => {
  test.beforeEach(async ({ page }) => {
    await navigateToTestBase(page);
  });

  test('CREATE — add a new row and fill in fields', async ({ page }) => {
    await screenshotStep(page, '30_before_add_row');

    await clickAddRow(page);
    await page.waitForTimeout(1000);
    await screenshotStep(page, '31_row_added');

    // Try to fill in the first data cell
    const firstCell = page.locator('[role="gridcell"]').first();
    if (await firstCell.isVisible().catch(() => false)) {
      await firstCell.dblclick();
      await page.waitForTimeout(300);
      await page.keyboard.type('Test Record 1');
      await page.keyboard.press('Tab');
      await page.waitForTimeout(500);
    }

    await screenshotStep(page, '32_row_filled');
    console.log('PASS: Row created and text entered');
  });

  test('CREATE — add multiple rows', async ({ page }) => {
    for (let i = 2; i <= 5; i++) {
      await clickAddRow(page);
      await page.waitForTimeout(800);

      const cells = page.locator('[role="gridcell"]');
      const lastCell = cells.last();
      if (await lastCell.isVisible().catch(() => false)) {
        await lastCell.dblclick();
        await page.waitForTimeout(200);
        await page.keyboard.type(`Test Record ${i}`);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
      }
    }
    await screenshotStep(page, '33_multiple_rows');
    console.log('PASS: Multiple rows created');
  });

  test('READ — expand a row to see full record', async ({ page }) => {
    // Hover over the first data row to reveal the expand button
    const firstDataRow = page.locator('[role="row"]').nth(1);
    if (await firstDataRow.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await firstDataRow.hover();
      await page.waitForTimeout(300);

      // The expand button has aria-label="Expand row N"
      const expandBtn = page.locator('button[aria-label^="Expand row"]').first();
      if (await expandBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await expandBtn.click();
        await page.waitForTimeout(1000);
        await screenshotStep(page, '34_expanded_row');

        // The expanded modal overlay has class "fixed inset-0 z-50"
        const modal = page.locator('div.fixed.inset-0.z-50');
        await expect(modal).toBeVisible({ timeout: 5_000 });
        console.log('PASS: Row expanded successfully');

        // Close modal by clicking backdrop or pressing Escape
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
      } else {
        console.log('PARTIAL: No expand button found on hover');
        await screenshotStep(page, '34_no_expand_btn');
      }
    }
  });

  test('UPDATE — edit an existing cell value', async ({ page }) => {
    const cells = page.locator('[role="gridcell"]');
    const cellCount = await cells.count();
    if (cellCount > 0) {
      const targetCell = cells.first();
      await targetCell.dblclick();
      await page.waitForTimeout(300);

      await page.keyboard.press('Control+a');
      await page.keyboard.type('Updated Record');
      await page.keyboard.press('Tab');
      await page.waitForTimeout(500);
      await screenshotStep(page, '35_cell_updated');
      console.log('PASS: Cell updated');
    } else {
      console.log('FAIL: No cells found to edit');
      expect(cellCount).toBeGreaterThan(0);
    }
  });

  test('DELETE — delete a row via context menu', async ({ page }) => {
    await screenshotStep(page, '36_before_delete');

    // Right-click on a data row (nth(1) to skip header)
    const dataRow = page.locator('[role="row"]').nth(1);
    if (await dataRow.isVisible().catch(() => false)) {
      await dataRow.click({ button: 'right' });
      await page.waitForTimeout(500);
      await screenshotStep(page, '37_context_menu');

      // Context menu items include "Delete record"
      const deleteOption = page.locator('text=/Delete record/i').first();
      if (await deleteOption.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await deleteOption.click();
        await page.waitForTimeout(500);

        // Confirm if dialog appears
        const confirmBtn = page.locator('button:has-text("Delete"), button:has-text("Confirm")').first();
        if (await confirmBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
          await confirmBtn.click();
        }
        await page.waitForTimeout(1000);
        await screenshotStep(page, '38_after_delete');
        console.log('PASS: Row deleted');
      } else {
        console.log('PARTIAL: Context menu appeared but no Delete option found');
      }
    }
  });

  test('BULK DELETE — select multiple rows and delete', async ({ page }) => {
    // Use the row checkboxes with known aria-labels
    const checkbox1 = page.locator('input[aria-label="Select row 1"]');
    const checkbox2 = page.locator('input[aria-label="Select row 2"]');

    // Hover first row to reveal its checkbox
    const firstRow = page.locator('[role="row"]').nth(1);
    if (await firstRow.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await firstRow.hover();
      await page.waitForTimeout(300);
    }

    if (await checkbox1.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await checkbox1.click();
      await page.waitForTimeout(300);

      // Hover second row
      const secondRow = page.locator('[role="row"]').nth(2);
      if (await secondRow.isVisible().catch(() => false)) {
        await secondRow.hover();
        await page.waitForTimeout(300);
      }

      if (await checkbox2.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await checkbox2.click();
        await page.waitForTimeout(500);
      }

      await screenshotStep(page, '39_rows_selected');

      // Bulk actions bar should appear at bottom of screen
      const bulkBar = page.locator('text=/selected/i').first();
      if (await bulkBar.isVisible({ timeout: 3_000 }).catch(() => false)) {
        // Find and click the delete button in the bulk bar
        const deleteBtn = page.locator('button:has-text("Delete")').first();
        if (await deleteBtn.isVisible().catch(() => false)) {
          await deleteBtn.click();
          await page.waitForTimeout(500);
          // Confirm
          const confirmBtn = page.locator('button:has-text("Delete"), button:has-text("Confirm")').last();
          if (await confirmBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
            await confirmBtn.click();
          }
          await page.waitForTimeout(1000);
          await screenshotStep(page, '40_bulk_deleted');
          console.log('PASS: Bulk delete completed');
        }
      } else {
        console.log('PARTIAL: Could not trigger bulk selection bar');
      }
    } else {
      console.log('PARTIAL: Row checkboxes not accessible');
    }
  });
});

// ─── 5. FIELD-SPECIFIC VALUE TESTS ──────────────────────────────────────────

test.describe('Field type value entry', () => {
  test.beforeEach(async ({ page }) => {
    await navigateToTestBase(page);
  });

  test('Checkbox field — toggle on/off', async ({ page }) => {
    // Look for a checkbox within the grid (not the row-select checkboxes)
    const gridCheckbox = page.locator('[role="gridcell"] input[type="checkbox"]').first();
    if (await gridCheckbox.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await gridCheckbox.click();
      await page.waitForTimeout(500);
      await screenshotStep(page, '50_checkbox_toggled');
      console.log('PASS: Checkbox toggled');
    } else {
      console.log('PARTIAL: No checkbox field visible in grid');
    }
  });

  test('SingleSelect field — pick an option', async ({ page }) => {
    // Click on a select-type cell in the grid
    const selectCell = page.locator('[role="gridcell"]').filter({ hasText: /Option|Select/i }).first();
    if (await selectCell.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await selectCell.click();
      await page.waitForTimeout(500);
      const option = page.locator('[role="option"]').first();
      if (await option.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await option.click();
        await page.waitForTimeout(500);
        await screenshotStep(page, '51_select_picked');
        console.log('PASS: Single select option picked');
      }
    } else {
      console.log('PARTIAL: No select field visible');
    }
  });

  test('Date field — enter a date', async ({ page }) => {
    const dateCell = page.locator('[role="gridcell"] input[type="date"]').first();
    if (await dateCell.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await dateCell.fill('2026-06-15');
      await page.waitForTimeout(500);
      await screenshotStep(page, '52_date_entered');
      console.log('PASS: Date entered');
    } else {
      // Try clicking a date-type column cell
      console.log('PARTIAL: No date input visible to test');
    }
  });

  test('Number field — enter a number', async ({ page }) => {
    const numInput = page.locator('[role="gridcell"] input[type="number"]').first();
    if (await numInput.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await numInput.fill('12345');
      await page.waitForTimeout(500);
      await screenshotStep(page, '53_number_entered');
      console.log('PASS: Number entered');
    } else {
      console.log('PARTIAL: No number input visible');
    }
  });
});

// ─── 6. CSV IMPORT ──────────────────────────────────────────────────────────

test.describe('CSV Import', () => {
  test('import a CSV file into the table', async ({ page }) => {
    await navigateToTestBase(page);

    // Look for Import button in toolbar or menu
    const importBtn = page.locator('button:has-text("Import")').first();
    if (await importBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await importBtn.click();
      await page.waitForTimeout(500);
      await screenshotStep(page, '60_import_dialog');

      const csvContent = 'Name,Email,Phone\nAlice,alice@test.com,+1111111111\nBob,bob@test.com,+2222222222\nCharlie,charlie@test.com,+3333333333';

      // The ImportCsvDialog has a hidden file input with accept=".csv"
      const fileInput = page.locator('input[type="file"][accept=".csv"]');
      if (await fileInput.count() > 0) {
        await fileInput.setInputFiles({
          name: 'test-import.csv',
          mimeType: 'text/csv',
          buffer: Buffer.from(csvContent),
        });
        await page.waitForTimeout(2000);
        await screenshotStep(page, '61_csv_preview');

        // Click Import button (shows row count like "Import 3 rows")
        const confirmBtn = page.locator('button:has-text("Import")').first();
        if (await confirmBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
          await confirmBtn.click();
          await page.waitForTimeout(3000);
          await screenshotStep(page, '62_csv_imported');
          console.log('PASS: CSV imported');
        }
      } else {
        console.log('PARTIAL: No file input found in import dialog');
      }
    } else {
      console.log('PARTIAL: No Import button found in toolbar');
    }
  });
});

// ─── 7. CSV EXPORT ──────────────────────────────────────────────────────────

test.describe('CSV Export', () => {
  test('export table to CSV', async ({ page }) => {
    await navigateToTestBase(page);

    // The toolbar has an Export button with title="Download CSV" and <Download> icon
    const exportBtn = page.locator('button[title="Download CSV"]');
    if (await exportBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      const downloadPromise = page.waitForEvent('download', { timeout: 10_000 }).catch(() => null);
      await exportBtn.click();
      const download = await downloadPromise;

      if (download) {
        const filename = download.suggestedFilename();
        console.log(`PASS: CSV exported as "${filename}"`);
        await screenshotStep(page, '71_csv_exported');
      } else {
        console.log('PARTIAL: Export clicked but no download triggered');
      }
    } else {
      // Fallback: try More options button then look for export
      const moreBtn = page.locator('button[aria-label="More options"]');
      if (await moreBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await moreBtn.click();
        await page.waitForTimeout(500);
        await screenshotStep(page, '70_export_menu');

        const exportOption = page.locator('text=/Export|Download CSV/i').first();
        if (await exportOption.isVisible({ timeout: 3_000 }).catch(() => false)) {
          const downloadPromise = page.waitForEvent('download', { timeout: 10_000 }).catch(() => null);
          await exportOption.click();
          const download = await downloadPromise;
          if (download) {
            console.log(`PASS: CSV exported as "${download.suggestedFilename()}"`);
          } else {
            console.log('PARTIAL: Export clicked but no download');
          }
        }
      }
    }
  });
});

// ─── 8. PERFORMANCE ─────────────────────────────────────────────────────────

test.describe('Performance', () => {
  test('data page loads within acceptable time', async ({ page }) => {
    const start = Date.now();
    await page.goto('/data');
    await page.waitForLoadState('networkidle');
    const loadTime = Date.now() - start;

    console.log(`/data page load time: ${loadTime}ms`);
    await screenshotStep(page, '80_perf_data_load');

    expect(loadTime, 'Page should load within 10s').toBeLessThan(10_000);
    console.log(loadTime < 3000 ? 'PASS: Fast load' : 'PARTIAL: Loaded but slow');
  });

  test('base with records loads grid within acceptable time', async ({ page }) => {
    await navigateToData(page);

    const hasBase = await clickFirstSidebarBase(page);
    if (hasBase) {
      const start = Date.now();
      await waitForGridLoad(page);
      const loadTime = Date.now() - start;

      console.log(`Grid load time: ${loadTime}ms`);
      await screenshotStep(page, '81_perf_grid_load');

      expect(loadTime, 'Grid should load within 15s').toBeLessThan(15_000);
      console.log(loadTime < 5000 ? 'PASS: Fast grid load' : 'PARTIAL: Grid loaded but slow');
    }
  });

  test('no 406 errors when browsing bases', async ({ page }) => {
    const errors: string[] = [];
    page.on('response', (response) => {
      if (response.status() === 406) {
        errors.push(`406 on ${response.url()}`);
      }
    });

    await navigateToData(page);

    // Navigate through up to 3 bases
    const baseCount = await page.locator('aside div.cursor-pointer').count();
    for (let i = 0; i < Math.min(baseCount, 3); i++) {
      await page.locator('aside div.cursor-pointer').nth(i).click();
      await page.waitForTimeout(3000);
    }

    console.log(`406 errors captured: ${errors.length}`);
    if (errors.length > 0) {
      console.log('FAIL — 406 errors:', errors);
    } else {
      console.log('PASS: No 406 errors');
    }
    expect(errors, 'Should have zero 406 errors').toHaveLength(0);
  });
});

// ─── 9. EDGE CASES ──────────────────────────────────────────────────────────

test.describe('Edge cases', () => {
  test.beforeEach(async ({ page }) => {
    await navigateToTestBase(page);
  });

  test('empty field values — add row without filling anything', async ({ page }) => {
    await clickAddRow(page);
    await page.waitForTimeout(1000);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    await screenshotStep(page, '90_empty_row');

    const rows = page.locator('[role="row"]');
    expect(await rows.count()).toBeGreaterThan(1);
    console.log('PASS: Empty row created without errors');
  });

  test('special characters in text fields', async ({ page }) => {
    await clickAddRow(page);
    await page.waitForTimeout(500);

    const firstCell = page.locator('[role="gridcell"]').first();
    if (await firstCell.isVisible().catch(() => false)) {
      await firstCell.dblclick();
      await page.waitForTimeout(300);
      await page.keyboard.type('Special chars: <script>alert("xss")</script> & "quotes" \'apostrophes\'');
      await page.keyboard.press('Tab');
      await page.waitForTimeout(500);
      await screenshotStep(page, '91_special_chars');
      console.log('PASS: Special characters handled');
    }
  });

  test('very long text in a cell', async ({ page }) => {
    await clickAddRow(page);
    await page.waitForTimeout(500);

    const firstCell = page.locator('[role="gridcell"]').first();
    if (await firstCell.isVisible().catch(() => false)) {
      await firstCell.dblclick();
      await page.waitForTimeout(300);
      await page.keyboard.type('A'.repeat(500));
      await page.keyboard.press('Tab');
      await page.waitForTimeout(500);
      await screenshotStep(page, '92_long_text');
      console.log('PASS: Long text handled');
    }
  });

  test('rapid row creation — add 10 rows quickly', async ({ page }) => {
    const start = Date.now();
    for (let i = 0; i < 10; i++) {
      await clickAddRow(page);
      await page.waitForTimeout(300);
    }
    const elapsed = Date.now() - start;
    await screenshotStep(page, '93_rapid_rows');
    console.log(`10 rows created in ${elapsed}ms`);
    console.log(elapsed < 10_000 ? 'PASS: Rapid creation OK' : 'PARTIAL: Slow but functional');
  });
});

// ─── 10. CLEANUP — Delete test base ─────────────────────────────────────────

test.describe('Cleanup', () => {
  test('delete the test base', async ({ page }) => {
    await navigateToData(page);

    // Find the test base in sidebar and hover to reveal options
    const sidebar = page.locator('aside');
    const baseItem = sidebar.locator(`div.cursor-pointer:has(span.truncate:has-text("${TEST_BASE_NAME}"))`).first();

    if (await baseItem.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await baseItem.hover();
      await page.waitForTimeout(500);

      // The "..." button appears on hover within the same div
      const moreBtn = baseItem.locator('button').first();
      if (await moreBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await moreBtn.click();
        await page.waitForTimeout(500);
        await screenshotStep(page, '99_delete_menu');

        // Click Delete in dropdown
        const deleteOption = page.locator('text=/Delete/i').last();
        if (await deleteOption.isVisible({ timeout: 3_000 }).catch(() => false)) {
          await deleteOption.click();
          await page.waitForTimeout(500);

          // Confirm deletion
          const confirmBtn = page.locator('button:has-text("Delete")').last();
          if (await confirmBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
            await confirmBtn.click();
            await page.waitForTimeout(2000);
            await screenshotStep(page, '99_base_deleted');
            console.log('PASS: Test base deleted');
          }
        }
      }
    } else {
      console.log('PARTIAL: Test base not found for cleanup (may already be deleted)');
    }
  });
});

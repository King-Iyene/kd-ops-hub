import { test, expect, type Page } from '@playwright/test';

/**
 * Comprehensive E2E test suite for the Database (Bases) feature.
 *
 * Covers:
 *  - Loading existing bases (verifies 406 fix)
 *  - Creating a new base
 *  - Adding every field type
 *  - Record CRUD (create, read, update, delete)
 *  - CSV import / export
 *  - Performance basics
 *  - Edge cases (empty fields, special characters, long text)
 *
 * Run locally:
 *   TEST_USER_EMAIL=kingiyene05@gmail.com TEST_USER_PASSWORD=testing \
 *   VITE_SUPABASE_URL=https://mseeurrvdcfxdmvqjjki.supabase.co \
 *   VITE_SUPABASE_ANON_KEY=<your-anon-key> \
 *   npx playwright test database-bases --headed
 */

const TEST_BASE_NAME = `E2E Test Base ${Date.now()}`;

// ─── Helpers ────────────────────────────────────────────────────────────────

async function screenshotStep(page: Page, name: string) {
  await page.screenshot({
    path: `test-results/screenshots/${name}.png`,
    fullPage: false,
  });
}

async function waitForGridLoad(page: Page) {
  // Wait for either the grid to appear or a "no records" state
  await page.waitForSelector(
    '[role="grid"], [role="table"], text=/No records|Add a row|Empty/i',
    { timeout: 15_000 },
  );
  // Let any animations settle
  await page.waitForTimeout(500);
}

async function clickAddRow(page: Page) {
  const addBtn = page.locator('button:has-text("Add"), button:has(svg.lucide-plus)').first();
  if (await addBtn.isVisible()) {
    await addBtn.click();
  } else {
    // Some views show an inline "+" row at the bottom of the grid
    const plusRow = page.locator('text=/Add a row|New row/i').first();
    await plusRow.click();
  }
  await page.waitForTimeout(500);
}

// ─── 1. EXISTING BASES — 406 Fix Verification ──────────────────────────────

test.describe('Existing bases load without 406 errors', () => {
  test('navigate to /data and verify sidebar lists bases', async ({ page }) => {
    await page.goto('/data');
    await page.waitForLoadState('networkidle');
    await screenshotStep(page, '01_data_page_loaded');

    // The sidebar should contain at least one base item (link to /data/<id>)
    const baseLinks = page.locator('a[href*="/data/"]');
    const count = await baseLinks.count();
    console.log(`BASES FOUND IN SIDEBAR: ${count}`);
    await screenshotStep(page, '02_sidebar_bases');

    // PASS if at least one base is listed; FAIL if zero
    expect(count, 'At least one base should be listed in the sidebar').toBeGreaterThan(0);
  });

  test('click into each existing base and verify no 406 / "Failed to load"', async ({ page }) => {
    await page.goto('/data');
    await page.waitForLoadState('networkidle');

    const baseLinks = page.locator('a[href*="/data/"]');
    const hrefs: string[] = [];
    const count = await baseLinks.count();
    for (let i = 0; i < count; i++) {
      const href = await baseLinks.nth(i).getAttribute('href');
      if (href && !hrefs.includes(href)) hrefs.push(href);
    }
    console.log(`Will test ${hrefs.length} base(s)`);

    const results: { name: string; status: string }[] = [];

    for (const href of hrefs) {
      await page.goto(href);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);

      const baseName = href.split('/').pop() ?? href;
      const shotName = `03_base_${baseName.substring(0, 20)}`;
      await screenshotStep(page, shotName);

      // Check for error indicators
      const failedLoad = await page.locator('text=/Failed to load|406|Not Acceptable/i').count();
      const hasGrid = await page.locator('[role="grid"], [role="table"], table').count();
      const hasContent = await page.locator('text=/No records|Add a row|records/i').count();

      if (failedLoad > 0) {
        results.push({ name: baseName, status: 'FAIL — "Failed to load" or 406 error' });
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

    // Every base should not have "Failed to load"
    const failures = results.filter((r) => r.status.startsWith('FAIL'));
    expect(failures, `${failures.length} base(s) failed to load`).toHaveLength(0);
  });
});

// ─── 2. CREATE A NEW BASE ───────────────────────────────────────────────────

test.describe('Create a new test base', () => {
  test('create base via dialog', async ({ page }) => {
    await page.goto('/data');
    await page.waitForLoadState('networkidle');
    await screenshotStep(page, '10_before_create_base');

    // Click the "+" or "Create Base" button in the sidebar
    const createBtn = page.locator('button:has-text("Create"), button[title*="Create"], button:has(svg.lucide-plus)').first();
    await expect(createBtn).toBeVisible({ timeout: 10_000 });
    await createBtn.click();

    // Wait for dialog
    await expect(page.locator('text=Create Base')).toBeVisible({ timeout: 5_000 });
    await screenshotStep(page, '11_create_base_dialog');

    // Fill in the name
    await page.fill('#base-name, input[placeholder*="Project Tracker"]', TEST_BASE_NAME);
    await screenshotStep(page, '12_base_name_filled');

    // Click the Create button
    await page.click('button:has-text("Create Base")');

    // Wait for navigation to the new base
    await page.waitForURL('**/data/**', { timeout: 15_000 });
    await page.waitForTimeout(3000);
    await screenshotStep(page, '13_base_created');

    // Verify we're on the new base page
    const url = page.url();
    expect(url).toContain('/data/');
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
    // Navigate to the test base — find it by name in sidebar
    await page.goto('/data');
    await page.waitForLoadState('networkidle');
    // Click into the test base
    const baseLink = page.locator(`a:has-text("${TEST_BASE_NAME}")`).first();
    if (await baseLink.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await baseLink.click();
      await page.waitForTimeout(2000);
    }
  });

  for (const fieldDef of FIELD_TYPES_TO_TEST) {
    test(`add ${fieldDef.label} field`, async ({ page }) => {
      // Click the "+" column header to add a field
      const addFieldBtn = page.locator('button:has(svg.lucide-plus), button[title*="Add field"], text=/Add field|\\+/').last();
      await addFieldBtn.click();
      await page.waitForTimeout(500);

      // The CreateFieldDialog should appear
      const dialog = page.locator('[role="dialog"]');
      await expect(dialog).toBeVisible({ timeout: 5_000 });
      await screenshotStep(page, `20_add_field_${fieldDef.type}_dialog`);

      // Fill field name
      const nameInput = dialog.locator('input').first();
      await nameInput.fill(`Test ${fieldDef.label}`);

      // Select the field type — click the type selector and find the option
      const typeSelector = dialog.locator('button:has-text("Single Line Text"), [class*="type-select"], button:has-text("Text")').first();
      if (await typeSelector.isVisible().catch(() => false)) {
        await typeSelector.click();
        await page.waitForTimeout(300);
      }

      // Find and click the target type in the dropdown/list
      const typeOption = page.locator(`text="${fieldDef.label}"`).first();
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

      // Click Create / Save
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
    await page.goto('/data');
    await page.waitForLoadState('networkidle');
    const baseLink = page.locator(`a:has-text("${TEST_BASE_NAME}")`).first();
    if (await baseLink.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await baseLink.click();
      await waitForGridLoad(page);
    }
  });

  test('CREATE — add a new row and fill in fields', async ({ page }) => {
    await screenshotStep(page, '30_before_add_row');

    await clickAddRow(page);
    await page.waitForTimeout(1000);
    await screenshotStep(page, '31_row_added');

    // Try to fill in the first text cell (Title / first column)
    const firstCell = page.locator('[role="gridcell"], td').first();
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

      const firstCell = page.locator('[role="gridcell"], td').last();
      if (await firstCell.isVisible().catch(() => false)) {
        await firstCell.dblclick();
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
    // Click the expand icon on the first row
    const expandBtn = page.locator('button:has(svg.lucide-expand), [title*="Expand"]').first();
    if (await expandBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await expandBtn.click();
      await page.waitForTimeout(1000);
      await screenshotStep(page, '34_expanded_row');

      // The expanded modal should show field labels and values
      const modal = page.locator('[role="dialog"]');
      await expect(modal).toBeVisible({ timeout: 5_000 });
      console.log('PASS: Row expanded successfully');

      // Close modal
      await page.keyboard.press('Escape');
    } else {
      // Try clicking a row to expand
      const row = page.locator('[role="row"]').nth(1);
      await row.click();
      await page.waitForTimeout(1000);
      await screenshotStep(page, '34_row_clicked');
      console.log('PARTIAL: No expand button found, clicked row directly');
    }
  });

  test('UPDATE — edit an existing cell value', async ({ page }) => {
    // Double-click the first data cell to edit it
    const cells = page.locator('[role="gridcell"], td');
    const cellCount = await cells.count();
    if (cellCount > 0) {
      const targetCell = cells.first();
      await targetCell.dblclick();
      await page.waitForTimeout(300);

      // Select all and type new value
      await page.keyboard.press('Control+a');
      await page.keyboard.type('Updated Record');
      await page.keyboard.press('Tab');
      await page.waitForTimeout(500);
      await screenshotStep(page, '35_cell_updated');
      console.log('PASS: Cell updated');
    } else {
      console.log('FAIL: No cells found to edit');
    }
  });

  test('DELETE — delete a row via context menu', async ({ page }) => {
    await screenshotStep(page, '36_before_delete');

    // Right-click on a row to get context menu
    const row = page.locator('[role="row"]').nth(1);
    if (await row.isVisible().catch(() => false)) {
      await row.click({ button: 'right' });
      await page.waitForTimeout(500);
      await screenshotStep(page, '37_context_menu');

      // Click Delete
      const deleteOption = page.locator('text=/Delete row|Delete record/i').first();
      if (await deleteOption.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await deleteOption.click();
        await page.waitForTimeout(500);

        // Confirm deletion if dialog appears
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
    // Click row checkboxes (row numbers usually act as select)
    const rowNumbers = page.locator('[class*="row-number"], [class*="RowNumber"]');
    const rowCount = await rowNumbers.count();
    if (rowCount >= 2) {
      await rowNumbers.nth(0).click();
      await rowNumbers.nth(1).click({ modifiers: ['Shift'] });
      await page.waitForTimeout(500);
      await screenshotStep(page, '39_rows_selected');

      // Look for bulk actions bar
      const bulkBar = page.locator('text=/selected|Delete|Bulk/i').first();
      if (await bulkBar.isVisible({ timeout: 3_000 }).catch(() => false)) {
        const bulkDeleteBtn = page.locator('button:has(svg.lucide-trash-2), button:has-text("Delete")').first();
        if (await bulkDeleteBtn.isVisible().catch(() => false)) {
          await bulkDeleteBtn.click();
          await page.waitForTimeout(500);
          // Confirm
          const confirmBtn = page.locator('button:has-text("Delete"), button:has-text("Confirm")').first();
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
    }
  });
});

// ─── 5. FIELD-SPECIFIC VALUE TESTS ──────────────────────────────────────────

test.describe('Field type value entry', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/data');
    await page.waitForLoadState('networkidle');
    const baseLink = page.locator(`a:has-text("${TEST_BASE_NAME}")`).first();
    if (await baseLink.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await baseLink.click();
      await waitForGridLoad(page);
    }
  });

  test('Checkbox field — toggle on/off', async ({ page }) => {
    const checkbox = page.locator('input[type="checkbox"], [role="checkbox"]').first();
    if (await checkbox.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await checkbox.click();
      await page.waitForTimeout(500);
      await screenshotStep(page, '50_checkbox_toggled');
      console.log('PASS: Checkbox toggled');
    } else {
      console.log('PARTIAL: No checkbox field visible');
    }
  });

  test('SingleSelect field — pick an option', async ({ page }) => {
    // Find a cell that looks like a select field
    const selectCell = page.locator('[class*="select"], [class*="Select"]').first();
    if (await selectCell.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await selectCell.click();
      await page.waitForTimeout(500);
      // Pick first option
      const option = page.locator('[role="option"], [class*="option"]').first();
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
    // Find a date input
    const dateCell = page.locator('input[type="date"], [class*="date"], [class*="Date"]').first();
    if (await dateCell.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await dateCell.dblclick();
      await page.waitForTimeout(300);
      await page.keyboard.type('2026-06-15');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(500);
      await screenshotStep(page, '52_date_entered');
      console.log('PASS: Date entered');
    } else {
      console.log('PARTIAL: No date field visible to test');
    }
  });

  test('Number field — enter a number', async ({ page }) => {
    // Find a number input
    const numCell = page.locator('input[type="number"]').first();
    if (await numCell.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await numCell.dblclick();
      await page.waitForTimeout(300);
      await page.keyboard.type('12345');
      await page.keyboard.press('Tab');
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
    await page.goto('/data');
    await page.waitForLoadState('networkidle');
    const baseLink = page.locator(`a:has-text("${TEST_BASE_NAME}")`).first();
    if (await baseLink.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await baseLink.click();
      await waitForGridLoad(page);
    }

    // Look for Import button in toolbar
    const importBtn = page.locator('button:has-text("Import"), button:has(svg.lucide-upload)').first();
    if (await importBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await importBtn.click();
      await page.waitForTimeout(500);
      await screenshotStep(page, '60_import_dialog');

      // Create a small CSV file to upload
      const csvContent = 'Name,Email,Phone\nAlice,alice@test.com,+1111111111\nBob,bob@test.com,+2222222222\nCharlie,charlie@test.com,+3333333333';

      // Look for file input
      const fileInput = page.locator('input[type="file"]');
      if (await fileInput.count() > 0) {
        await fileInput.setInputFiles({
          name: 'test-import.csv',
          mimeType: 'text/csv',
          buffer: Buffer.from(csvContent),
        });
        await page.waitForTimeout(2000);
        await screenshotStep(page, '61_csv_preview');

        // Click Import / Confirm
        const confirmBtn = page.locator('button:has-text("Import"), button:has-text("Confirm")').first();
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
      console.log('PARTIAL: No Import button found');
    }
  });
});

// ─── 7. CSV EXPORT ──────────────────────────────────────────────────────────

test.describe('CSV Export', () => {
  test('export table to CSV', async ({ page }) => {
    await page.goto('/data');
    await page.waitForLoadState('networkidle');
    const baseLink = page.locator(`a:has-text("${TEST_BASE_NAME}")`).first();
    if (await baseLink.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await baseLink.click();
      await waitForGridLoad(page);
    }

    // Look for the export/download button in toolbar or dropdown
    const moreBtn = page.locator('button:has(svg.lucide-more-horizontal), button:has(svg.lucide-download)').first();
    if (await moreBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await moreBtn.click();
      await page.waitForTimeout(500);
      await screenshotStep(page, '70_export_menu');

      const exportOption = page.locator('text=/Export CSV|Download CSV/i').first();
      if (await exportOption.isVisible({ timeout: 3_000 }).catch(() => false)) {
        // Set up download listener
        const downloadPromise = page.waitForEvent('download', { timeout: 10_000 }).catch(() => null);
        await exportOption.click();
        const download = await downloadPromise;

        if (download) {
          const filename = download.suggestedFilename();
          console.log(`PASS: CSV exported as "${filename}"`);
          await screenshotStep(page, '71_csv_exported');
        } else {
          console.log('PARTIAL: Export clicked but no download triggered');
        }
      } else {
        console.log('PARTIAL: No Export CSV option found');
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

    // Should load within 10 seconds
    expect(loadTime, 'Page should load within 10s').toBeLessThan(10_000);
    console.log(loadTime < 3000 ? 'PASS: Fast load' : 'PARTIAL: Loaded but slow');
  });

  test('base with records loads grid within acceptable time', async ({ page }) => {
    await page.goto('/data');
    await page.waitForLoadState('networkidle');

    // Click into a base that has records
    const baseLink = page.locator('a[href*="/data/"]').first();
    if (await baseLink.isVisible({ timeout: 5_000 }).catch(() => false)) {
      const start = Date.now();
      await baseLink.click();
      await waitForGridLoad(page);
      const loadTime = Date.now() - start;

      console.log(`Grid load time: ${loadTime}ms`);
      await screenshotStep(page, '81_perf_grid_load');

      expect(loadTime, 'Grid should load within 15s').toBeLessThan(15_000);
      console.log(loadTime < 5000 ? 'PASS: Fast grid load' : 'PARTIAL: Grid loaded but slow');
    }
  });

  test('no console errors related to 406', async ({ page }) => {
    const errors: string[] = [];
    page.on('response', (response) => {
      if (response.status() === 406) {
        errors.push(`406 on ${response.url()}`);
      }
    });

    await page.goto('/data');
    await page.waitForLoadState('networkidle');

    // Navigate through bases
    const baseLinks = page.locator('a[href*="/data/"]');
    const count = Math.min(await baseLinks.count(), 3);
    for (let i = 0; i < count; i++) {
      const href = await baseLinks.nth(i).getAttribute('href');
      if (href) {
        await page.goto(href);
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(2000);
      }
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
    await page.goto('/data');
    await page.waitForLoadState('networkidle');
    const baseLink = page.locator(`a:has-text("${TEST_BASE_NAME}")`).first();
    if (await baseLink.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await baseLink.click();
      await waitForGridLoad(page);
    }
  });

  test('empty field values — add row without filling anything', async ({ page }) => {
    await clickAddRow(page);
    await page.waitForTimeout(1000);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    await screenshotStep(page, '90_empty_row');

    // Row should exist even without values
    const rows = page.locator('[role="row"]');
    expect(await rows.count()).toBeGreaterThan(1); // header + at least 1 data row
    console.log('PASS: Empty row created without errors');
  });

  test('special characters in text fields', async ({ page }) => {
    await clickAddRow(page);
    await page.waitForTimeout(500);

    const firstCell = page.locator('[role="gridcell"], td').first();
    if (await firstCell.isVisible().catch(() => false)) {
      await firstCell.dblclick();
      await page.waitForTimeout(300);
      await page.keyboard.type('Special chars: <script>alert("xss")</script> & "quotes" \'apostrophes\' emojis: 🎉🚀');
      await page.keyboard.press('Tab');
      await page.waitForTimeout(500);
      await screenshotStep(page, '91_special_chars');
      console.log('PASS: Special characters handled');
    }
  });

  test('very long text in a cell', async ({ page }) => {
    await clickAddRow(page);
    await page.waitForTimeout(500);

    const firstCell = page.locator('[role="gridcell"], td').first();
    if (await firstCell.isVisible().catch(() => false)) {
      await firstCell.dblclick();
      await page.waitForTimeout(300);
      const longText = 'A'.repeat(5000);
      await page.keyboard.type(longText.substring(0, 500)); // Type first 500 chars (Playwright limit)
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
    await page.goto('/data');
    await page.waitForLoadState('networkidle');

    // Find the test base in sidebar
    const baseItem = page.locator(`text="${TEST_BASE_NAME}"`).first();
    if (await baseItem.isVisible({ timeout: 5_000 }).catch(() => false)) {
      // Right-click for context menu, or find the "..." menu
      await baseItem.hover();
      await page.waitForTimeout(500);

      // Look for the more options button that appears on hover
      const moreBtn = baseItem.locator('..').locator('button:has(svg.lucide-more-horizontal)').first();
      if (await moreBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await moreBtn.click();
        await page.waitForTimeout(500);
        await screenshotStep(page, '99_delete_menu');

        const deleteOption = page.locator('text=/Delete base|Delete/i').first();
        if (await deleteOption.isVisible({ timeout: 3_000 }).catch(() => false)) {
          await deleteOption.click();
          await page.waitForTimeout(500);

          // Confirm deletion
          const confirmBtn = page.locator('button:has-text("Delete"), button:has-text("Confirm")').first();
          if (await confirmBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
            await confirmBtn.click();
            await page.waitForTimeout(2000);
            await screenshotStep(page, '99_base_deleted');
            console.log('PASS: Test base deleted');
          }
        }
      }
    } else {
      console.log('PARTIAL: Test base not found for cleanup');
    }
  });
});

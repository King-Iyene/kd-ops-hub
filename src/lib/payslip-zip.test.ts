import { describe, it, expect } from 'vitest';
import { slugifyName, assignPayslipFilenames, payslipZipFilename } from '@/lib/payslip-zip';

describe('slugifyName', () => {
  it('slugifies ordinary names', () => {
    expect(slugifyName('Ada Okoro')).toBe('ada-okoro');
    expect(slugifyName('Chinedu  Eze')).toBe('chinedu-eze');
  });

  it('strips accents rather than dropping the letters', () => {
    expect(slugifyName('Zoë Férnandez')).toBe('zoe-fernandez');
  });

  it('removes punctuation and collapses separators', () => {
    expect(slugifyName("O'Brien-Smith, Jr.")).toBe('o-brien-smith-jr');
  });

  it('never returns an empty or edge-padded slug', () => {
    expect(slugifyName('')).toBe('employee');
    expect(slugifyName(null)).toBe('employee');
    expect(slugifyName(undefined)).toBe('employee');
    expect(slugifyName('---')).toBe('employee');
    expect(slugifyName('!!!')).toBe('employee');
    expect(slugifyName('  Ada  ')).toBe('ada');
  });
});

describe('assignPayslipFilenames', () => {
  it('names each payslip after the employee', () => {
    const out = assignPayslipFilenames([
      { employee_name: 'Ada Okoro' },
      { employee_name: 'Chinedu Eze' },
    ]);
    expect(out.map((o) => o.filename)).toEqual(['ada-okoro.html', 'chinedu-eze.html']);
  });

  it('keeps BOTH payslips when two employees share a name', () => {
    // The bug this guards: JSZip.file() overwrites, so without a suffix one
    // of these two people silently gets no payslip in the archive.
    const out = assignPayslipFilenames([
      { employee_name: 'Ada Okoro' },
      { employee_name: 'Ada Okoro' },
      { employee_name: 'Ada Okoro' },
    ]);
    expect(out.map((o) => o.filename)).toEqual([
      'ada-okoro.html',
      'ada-okoro-2.html',
      'ada-okoro-3.html',
    ]);
    expect(new Set(out.map((o) => o.filename)).size).toBe(3);
  });

  it('treats names differing only by case as colliding', () => {
    // A ZIP extracted on Windows/macOS lands on a case-insensitive
    // filesystem, where these two would overwrite each other.
    const out = assignPayslipFilenames([
      { employee_name: 'ADA OKORO' },
      { employee_name: 'ada okoro' },
    ]);
    expect(out[0].filename).not.toBe(out[1].filename);
  });

  it('separates employees with missing names instead of merging them', () => {
    const out = assignPayslipFilenames([
      { employee_name: null },
      { employee_name: '' },
      { employee_name: undefined },
    ]);
    expect(new Set(out.map((o) => o.filename)).size).toBe(3);
    expect(out[0].filename).toBe('employee.html');
  });

  it('applies an optional prefix', () => {
    const out = assignPayslipFilenames([{ employee_name: 'Ada Okoro' }], '2026-11');
    expect(out[0].filename).toBe('2026-11-ada-okoro.html');
  });

  it('carries the original entry through untouched', () => {
    const row = { employee_name: 'Ada Okoro', id: 'abc', storage_path: 'x/y.html' };
    const out = assignPayslipFilenames([row]);
    expect(out[0].entry).toBe(row);
  });

  it('handles an empty list', () => {
    expect(assignPayslipFilenames([])).toEqual([]);
  });
});

describe('payslipZipFilename', () => {
  it('names the archive after the period', () => {
    expect(payslipZipFilename('2026-11')).toBe('payslips-2026-11.zip');
  });

  it('falls back to a sensible label when the period is missing', () => {
    // Not "payslips-employee.zip" — the archive is named after a period, so
    // the employee-name fallback would read as gibberish to whoever
    // downloads it.
    expect(payslipZipFilename(null)).toBe('payslips-run.zip');
    expect(payslipZipFilename('')).toBe('payslips-run.zip');
    expect(payslipZipFilename('   ')).toBe('payslips-run.zip');
  });

  it('sanitises a period that contains path characters', () => {
    expect(payslipZipFilename('2026/11')).toBe('payslips-2026-11.zip');
  });
});

/**
 * Helpers for bundling a payroll run's payslips into one ZIP.
 *
 * The naming logic lives here, apart from the download I/O, because it has a
 * genuinely easy-to-get-wrong case: two employees with the same name. JSZip's
 * file() silently OVERWRITES an existing entry, so "Ada Okoro" twice would
 * produce a ZIP containing one payslip and quietly lose the other — an
 * employee simply never receiving their payslip, with nothing in the UI to
 * suggest anything went wrong. Names are not unique in any real company.
 */

/**
 * Turn a name into a filesystem-safe slug.
 *
 * `fallback` is what an empty or punctuation-only input becomes. It is a
 * parameter rather than a hardcoded "employee" because this is also used for
 * period labels, where "payslips-employee.zip" would be gibberish.
 */
export function slugifyName(
  name: string | null | undefined,
  fallback = 'employee',
): string {
  const slug = (name ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')   // strip accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || fallback;
}

export interface PayslipZipEntry {
  /** Employee name as stored on the payslip row. */
  employee_name?: string | null;
  /** Anything else the caller needs to carry through (id, storage_path…). */
  [key: string]: unknown;
}

export interface NamedPayslipEntry<T> {
  entry: T;
  /** Unique filename within the archive, including the .html extension. */
  filename: string;
}

/**
 * Assign each payslip a unique filename inside the archive.
 *
 * Duplicates get a numeric suffix in the order they appear ("ada-okoro.html",
 * "ada-okoro-2.html"), so every employee's payslip survives the zip. The
 * comparison is case-insensitive because a ZIP extracted on Windows or macOS
 * lands on a case-insensitive filesystem, where "Ada.html" and "ada.html"
 * collide even though the archive itself allows both.
 */
export function assignPayslipFilenames<T extends PayslipZipEntry>(
  entries: readonly T[],
  prefix?: string,
): NamedPayslipEntry<T>[] {
  const used = new Map<string, number>();
  const pre = prefix ? `${slugifyName(prefix)}-` : '';

  return entries.map((entry) => {
    const base = `${pre}${slugifyName(entry.employee_name)}`;
    const seen = used.get(base.toLowerCase()) ?? 0;
    used.set(base.toLowerCase(), seen + 1);
    const filename = seen === 0 ? `${base}.html` : `${base}-${seen + 1}.html`;
    return { entry, filename };
  });
}

/** Filename for the archive itself, e.g. "payslips-2026-11.zip". */
export function payslipZipFilename(period: string | null | undefined): string {
  return `payslips-${slugifyName(period, 'run')}.zip`;
}

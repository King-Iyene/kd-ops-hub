/**
 * Pure pieces of the Airtable import, kept apart from the dialog so they can be tested.
 */

/**
 * A number from an Airtable record, ready to store in the column for the field's type.
 *
 * Airtable's API returns a percent field as a fraction (25% arrives as 0.25), while the database module
 * keeps a Percent as the number shown (25), so percents are multiplied by 100. The rounding step removes
 * the noise that multiplying decimals leaves behind (0.07 * 100 is 7.000000000000001).
 * Whole-number columns are rounded. Returns undefined for a value that is not a finite number.
 */
export function numberFromAirtable(uiType: string, pgType: string, value: unknown): number | undefined {
  const n = Number(value);
  if (value === '' || value === null || value === undefined || !Number.isFinite(n)) return undefined;
  if (uiType === 'Percent') return Math.round(n * 1e8) / 1e6;
  return pgType === 'INTEGER' || pgType === 'SMALLINT' ? Math.round(n) : n;
}

/** The link options to store for an Airtable "link to another record" field. */
export function linkOptionsFromAirtable(options: { prefersSingleRecordLink?: boolean; inverseLinkFieldId?: string } | undefined): {
  allowMultiple?: false;
  prefersSingleRecordLink?: true;
  inverseLinkFieldId?: string;
} {
  const out: { allowMultiple?: false; prefersSingleRecordLink?: true; inverseLinkFieldId?: string } = {};
  if (options?.prefersSingleRecordLink) {
    // `allowMultiple: false` is what the link cell and field editor read; the old key is kept for anything that already looks at it.
    out.allowMultiple = false;
    out.prefersSingleRecordLink = true;
  }
  if (options?.inverseLinkFieldId) out.inverseLinkFieldId = options.inverseLinkFieldId;
  return out;
}

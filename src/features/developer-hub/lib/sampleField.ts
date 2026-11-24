/**
 * Pick a column name to use in the example "create a record" body, so the
 * snippet uses a column that really exists. Pure and read-only.
 */

export interface SampleFieldInput {
  name: string;
  is_primary?: boolean;
  is_system?: boolean;
  is_hidden?: boolean;
  ui_type?: string;
}

/** Column types the API will not accept a value for (computed or system). */
const COMPUTED_TYPES = new Set([
  'Links',
  'Lookup',
  'Rollup',
  'Count',
  'Formula',
  'CreatedTime',
  'LastModifiedTime',
  'CreatedBy',
  'LastModifiedBy',
  'ID',
  'AutoNumber',
  'Button',
  'Attachment',
]);

const TEXT_TYPES = new Set(['SingleLineText', 'LongText']);

export function pickSampleFieldName(fields: SampleFieldInput[]): string | undefined {
  // The example value is plain text, so only offer text columns.
  const usable = fields.filter(
    (f) =>
      f.name &&
      !f.is_system &&
      !f.is_hidden &&
      !(f.ui_type && COMPUTED_TYPES.has(f.ui_type)) &&
      (!f.ui_type || TEXT_TYPES.has(f.ui_type)),
  );
  const primary = usable.find((f) => f.is_primary);
  return (primary ?? usable[0])?.name;
}

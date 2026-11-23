/**
 * Default values for new rows.
 *
 * A field's default is stored as text in `default_value` (the same column for
 * every field type) and turned into the right kind of value here:
 *   single select -> the option title      multiple select -> a list with that option
 *   checkbox      -> "true" or "false"     text types      -> the text
 *   number types  -> the number            rating          -> the number
 * Date fields use the separate "default to today" switch in their options.
 */

import type { FieldMeta } from '../types';

export const DEFAULTABLE_TYPES = [
  'SingleLineText', 'LongText', 'Email', 'URL', 'PhoneNumber',
  'Number', 'Decimal', 'Currency', 'Percent', 'Rating',
  'Checkbox', 'SingleSelect', 'MultiSelect',
] as const;

const TEXT_TYPES = new Set(['SingleLineText', 'LongText', 'Email', 'URL', 'PhoneNumber']);
const NUMBER_TYPES = new Set(['Number', 'Decimal', 'Currency', 'Percent', 'Rating']);

export function supportsDefault(uiType: string): boolean {
  return (DEFAULTABLE_TYPES as readonly string[]).includes(uiType);
}

type Defaultable = Pick<FieldMeta, 'ui_type' | 'options' | 'default_value' | 'is_system' | 'pg_column_name'>;

/**
 * The value a new row should start with for this field, or `undefined` when the
 * field has no default (so nothing is written and the column stays empty).
 */
export function defaultForNewRow(
  field: Defaultable,
  today: string,
  nowIso: string,
): string | number | boolean | string[] | undefined {
  if (field.is_system || !field.pg_column_name) return undefined;
  const options = (field.options ?? {}) as Record<string, unknown>;

  if (options.defaultToCurrentDate) {
    if (field.ui_type === 'Date') return today;
    if (field.ui_type === 'DateTime') return nowIso;
  }

  const raw = field.default_value;
  if (raw == null || String(raw).trim() === '') return undefined;
  const text = String(raw);

  if (field.ui_type === 'Checkbox') return text.trim().toLowerCase() === 'true';

  if (field.ui_type === 'SingleSelect' || field.ui_type === 'MultiSelect') {
    const choices = (options.choices as { title: string }[] | undefined) ?? [];
    // A default that points at an option that no longer exists is ignored.
    if (!choices.some((c) => c.title === text)) return undefined;
    return field.ui_type === 'MultiSelect' ? [text] : text;
  }

  if (NUMBER_TYPES.has(field.ui_type)) {
    const n = Number(text);
    return Number.isFinite(n) ? n : undefined;
  }

  if (TEXT_TYPES.has(field.ui_type)) return text;
  return undefined;
}

/** Text to store for a default the person entered, or null to clear it. */
export function normalizeDefault(uiType: string, input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (NUMBER_TYPES.has(uiType)) return Number.isFinite(Number(trimmed)) ? String(Number(trimmed)) : null;
  if (uiType === 'Checkbox') return trimmed.toLowerCase() === 'true' ? 'true' : null;
  return input;
}

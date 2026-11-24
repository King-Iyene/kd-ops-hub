import type { FieldMeta, RecordRow } from '@/features/database/types';
import { formatDate, formatDateTime } from '@/lib/format';

const _ariaFmtMap = new Map<string, Intl.NumberFormat>();
function _ariaFmtCache(code: string): Intl.NumberFormat {
  let fmt = _ariaFmtMap.get(code);
  if (!fmt) {
    fmt = new Intl.NumberFormat(undefined, { style: 'currency', currency: code });
    _ariaFmtMap.set(code, fmt);
  }
  return fmt;
}

/** Best-effort plain-text rendering of a cell's value for aria-label purposes. */
function extractDisplayValue(val: any): string {
  if (typeof val === 'object' && val !== null) {
    return val.value ?? val.title ?? val.name ?? val.label ?? val.display_name ?? val.email ?? val.primary ?? '';
  }
  // Handle JSON strings stored as text (e.g. from Airtable migration)
  if (typeof val === 'string' && val.startsWith('{') && val.includes('"')) {
    try {
      const parsed = JSON.parse(val);
      if (typeof parsed === 'object' && parsed !== null) {
        return parsed.value ?? parsed.title ?? parsed.name ?? parsed.label ?? parsed.display_name ?? parsed.email ?? parsed.primary ?? val;
      }
    } catch { /* not valid JSON, use as-is */ }
  }
  return String(val);
}

export function formatCellAriaValue(record: RecordRow, field: FieldMeta): string {
  const val = record[field.pg_column_name];
  if (val == null || val === '') return '';
  const lookup = (record as any)?.__linkLookup as Record<string, string> | undefined;
  if (Array.isArray(val)) {
    return val
      .map((v) => {
        if (typeof v === 'object' && v !== null) return extractDisplayValue(v);
        const id = String(v);
        return (lookup && lookup[id]) || id;
      })
      .filter(Boolean)
      .join(', ');
  }
  if (typeof val === 'object') {
    return extractDisplayValue(val);
  }
  if (typeof val === 'boolean') return val ? 'Yes' : 'No';
  // Try extracting display value from JSON strings
  if (typeof val === 'string' && val.startsWith('{') && val.includes('"')) {
    const extracted = extractDisplayValue(val);
    if (extracted !== val) return extracted;
  }
  if (field.ui_type === 'Date' || field.ui_type === 'DateTime' || field.ui_type === 'CreatedTime' || field.ui_type === 'LastModifiedTime') {
    const d = new Date(val);
    if (!isNaN(d.getTime())) {
      return (field.ui_type === 'DateTime' || field.ui_type === 'LastModifiedTime')
        ? formatDateTime(String(val))
        : formatDate(String(val));
    }
  }
  if (field.ui_type === 'Currency') {
    const n = Number(val);
    if (!isNaN(n)) {
      const sym = field.options?.currencySymbol || '₦';
      const code = sym === '₦' ? 'NGN' : sym === '$' ? 'USD' : sym === '€' ? 'EUR' : sym === '£' ? 'GBP' : 'NGN';
      try { return _ariaFmtCache(code).format(n); } catch { /* fall through */ }
    }
  }
  if (field.ui_type === 'Checkbox') return val ? 'Yes' : 'No';
  return String(val);
}

interface AriaEntry {
  field: FieldMeta;
  value: unknown;
  lookup: unknown;
  label: string;
}

const ariaCache = new WeakMap<RecordRow, Map<string, AriaEntry>>();

/**
 * formatCellAriaValue, remembered per row object. Building the label parses
 * dates and JSON text for every cell of every row that scrolls into view, and
 * the same rows scroll in and out of view again and again. An entry is reused
 * only while the row, the column definition, the cell's value and the names
 * lookup are all the very same objects, so it can never show a stale label.
 */
export function cachedCellAriaValue(record: RecordRow, field: FieldMeta): string {
  const value = record[field.pg_column_name];
  const lookup = (record as any)?.__linkLookup;
  let perRecord = ariaCache.get(record);
  if (!perRecord) {
    perRecord = new Map();
    ariaCache.set(record, perRecord);
  }
  const hit = perRecord.get(field.id);
  if (hit && hit.field === field && hit.value === value && hit.lookup === lookup) return hit.label;
  const label = formatCellAriaValue(record, field);
  perRecord.set(field.id, { field, value, lookup, label });
  return label;
}

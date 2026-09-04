/**
 * Pure computation helpers for the two "virtual" field types that read
 * through a Links field: Lookup and Rollup.
 *
 * Neither type stores its own column — a Lookup pulls one field's value
 * from every record linked through a Links field on the same table, and a
 * Rollup aggregates one field's values from the same set of linked records.
 *
 * Field configuration (see `FieldOptions` in ../types):
 *   - linkFieldId:   id of the Links field (on this table) to traverse.
 *   - lookupFieldId: (Lookup only) id of the field on the related table to read.
 *   - rollupFieldId: (Rollup only) id of the field on the related table to aggregate.
 *   - fn:            (Rollup only) the aggregate function name, e.g. 'SUM'.
 *
 * These functions are intentionally pure and framework-free — no querying,
 * no React. Callers (e.g. cell renderers) are responsible for fetching the
 * Links field's related records and handing them in as `linkedRecords`, and
 * for supplying `allFields` as a pool of FieldMeta covering both the source
 * table (to resolve the Links field) and the related table (to resolve the
 * looked-up/rolled-up field).
 */

import type { FieldMeta, RecordRow } from '@/features/database/types';

export type RollupFunction =
  | 'SUM'
  | 'AVG'
  | 'COUNT'
  | 'MIN'
  | 'MAX'
  | 'COUNTA'
  | 'COUNTALL'
  | 'CONCATENATE'
  | 'ARRAY_UNIQUE';

export const ROLLUP_FUNCTIONS: RollupFunction[] = [
  'SUM',
  'AVG',
  'COUNT',
  'MIN',
  'MAX',
  'COUNTA',
  'COUNTALL',
  'CONCATENATE',
  'ARRAY_UNIQUE',
];

/** Find a field by id in a pool of fields. Returns null if missing/unresolvable. */
function findField(allFields: FieldMeta[] | null | undefined, fieldId: string | null | undefined): FieldMeta | null {
  if (!fieldId || !allFields) return null;
  return allFields.find((f) => f.id === fieldId) ?? null;
}

/**
 * Resolve the Links field a Lookup/Rollup field is configured to traverse.
 * Returns null when the field isn't configured yet, or the referenced field
 * can't be found in `allFields` / isn't actually a Links field.
 */
export function resolveLinkField(field: FieldMeta, allFields: FieldMeta[]): FieldMeta | null {
  const linkField = findField(allFields, field.options?.linkFieldId);
  if (!linkField || linkField.ui_type !== 'Links') return null;
  return linkField;
}

/** Read a raw value off a related record for a given target FieldMeta. */
function readValue(rec: RecordRow, targetField: FieldMeta): any {
  const col = targetField.pg_column_name || targetField.id;
  return rec?.[col];
}

function isEmpty(v: any): boolean {
  return v === null || v === undefined || v === '';
}

/**
 * Flatten a raw value into a list of scalar values. Multi-valued fields
 * (MultiSelect, Links, arrays in general) contribute each element; anything
 * else contributes itself (when not empty).
 */
function flattenValue(v: any): any[] {
  if (v === null || v === undefined) return [];
  if (Array.isArray(v)) return v.flatMap(flattenValue);
  return [v];
}

/**
 * Given a record and a Lookup field, return the values of the configured
 * target field across every record linked through the field's Links field.
 * Missing configuration or missing/empty linked data resolves to `[]`
 * rather than throwing.
 */
export function computeLookupValues(
  _record: RecordRow,
  field: FieldMeta,
  allFields: FieldMeta[],
  linkedRecords: RecordRow[] | null | undefined,
): any[] {
  if (field.ui_type !== 'Lookup') return [];
  if (!linkedRecords || linkedRecords.length === 0) return [];

  const targetField = findField(allFields, field.options?.lookupFieldId);
  if (!targetField) return [];

  return linkedRecords
    .flatMap((rec) => flattenValue(readValue(rec, targetField)))
    .filter((v) => !isEmpty(v));
}

/** Try to coerce a value to a finite number, otherwise return null. */
function toNumber(v: any): number | null {
  if (isEmpty(v)) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Produce a value usable for ordering (MIN/MAX) from an arbitrary field
 * value: numbers compare numerically, ISO-ish date strings compare as
 * timestamps, everything else falls back to string comparison.
 */
function toComparable(v: any): number | string | null {
  if (isEmpty(v)) return null;
  const num = Number(v);
  if (typeof v !== 'boolean' && Number.isFinite(num)) return num;
  if (typeof v === 'string') {
    const t = Date.parse(v);
    if (!Number.isNaN(t)) return t;
  }
  return String(v);
}

/**
 * Given a record and a Rollup field, compute the configured aggregate over
 * the target field's values across every record linked through the field's
 * Links field. Missing configuration or data degrades gracefully:
 * COUNT/COUNTALL still count linked records, everything else returns null
 * (or an empty array/string for the collection-shaped functions).
 */
export function computeRollupValue(
  _record: RecordRow,
  field: FieldMeta,
  allFields: FieldMeta[],
  linkedRecords: RecordRow[] | null | undefined,
): number | string | any[] | null {
  if (field.ui_type !== 'Rollup' && field.ui_type !== 'Count') return null;

  const records = linkedRecords ?? [];
  const fn = (field.options?.fn || 'COUNT').toUpperCase() as RollupFunction;

  // COUNT/COUNTALL only need the linked record set, not the target field.
  if (fn === 'COUNT' || fn === 'COUNTALL') {
    return records.length;
  }

  const targetField = findField(allFields, field.options?.rollupFieldId);
  if (!targetField) {
    if (fn === 'CONCATENATE') return '';
    if (fn === 'ARRAY_UNIQUE') return [];
    return null;
  }

  const rawValues = records.flatMap((rec) => flattenValue(readValue(rec, targetField)));
  const nonEmpty = rawValues.filter((v) => !isEmpty(v));

  switch (fn) {
    case 'COUNTA':
      return nonEmpty.length;

    case 'SUM': {
      const nums = nonEmpty.map(toNumber).filter((n): n is number => n !== null);
      return nums.reduce((a, b) => a + b, 0);
    }

    case 'AVG': {
      const nums = nonEmpty.map(toNumber).filter((n): n is number => n !== null);
      if (nums.length === 0) return null;
      return nums.reduce((a, b) => a + b, 0) / nums.length;
    }

    case 'MIN':
    case 'MAX': {
      if (nonEmpty.length === 0) return null;
      let best = nonEmpty[0];
      let bestComparable = toComparable(best);
      for (const v of nonEmpty.slice(1)) {
        const c = toComparable(v);
        if (c === null || bestComparable === null) continue;
        const better = fn === 'MIN' ? c < bestComparable : c > bestComparable;
        if (better) {
          best = v;
          bestComparable = c;
        }
      }
      return best;
    }

    case 'CONCATENATE':
      return nonEmpty.map(String).join(', ');

    case 'ARRAY_UNIQUE': {
      const seen = new Set<string>();
      const unique: any[] = [];
      for (const v of nonEmpty) {
        const key = typeof v === 'object' ? JSON.stringify(v) : String(v);
        if (!seen.has(key)) {
          seen.add(key);
          unique.push(v);
        }
      }
      return unique;
    }

    default:
      return null;
  }
}

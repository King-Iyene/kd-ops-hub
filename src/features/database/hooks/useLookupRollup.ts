/**
 * Hooks that resolve Lookup and Rollup field values for a single record.
 *
 * These wrap the data-fetching (useFields, useLinkedRecords) and pure
 * computation (computeLookupValues, computeRollupValue) into a single call
 * so that callers (e.g. the expanded-row modal) don't repeat the plumbing.
 *
 * React Query deduplicates identical queries, so even if multiple Lookup/
 * Rollup cells on the same record share a link field or related table the
 * underlying network requests run only once.
 */

import { useMemo } from 'react';
import { useFields } from './useFields';
import { useRecordLinks } from './useLinks';
import { useDatabaseUI } from '../lib/store';
import { computeLookupValues, computeRollupValue, resolveLinkField } from '../lib/computations';
import type { FieldMeta, RecordRow } from '../types';

// ---------------------------------------------------------------------------
// Internal: shared data-fetching for a Lookup or Rollup field on one record.
// ---------------------------------------------------------------------------

function useLookupRollupData(field: FieldMeta, record: RecordRow) {
  const activeBaseId = useDatabaseUI((s) => s.activeBaseId);

  const { data: sourceFields, isLoading: sourceLoading } = useFields(field.table_id);

  const linkField = sourceFields ? resolveLinkField(field, sourceFields) : null;
  const relatedTableId = linkField?.options?.relatedTableId;
  const linkType = linkField?.options?.linkType;

  const { data: linkedRecords, isLoading: linkedLoading } = useRecordLinks({
    baseId: activeBaseId,
    sourceTableId: field.table_id,
    targetTableId: relatedTableId,
    fieldId: linkField?.id ?? '',
    recordId: record?.id ?? null,
    linkType,
  });

  const { data: relatedFields, isLoading: relatedLoading } = useFields(relatedTableId);

  const allFields = useMemo(
    () => [...(sourceFields ?? []), ...(relatedFields ?? [])],
    [sourceFields, relatedFields],
  );

  const isConfigured = !!linkField;
  const isLoading = sourceLoading || (isConfigured && (linkedLoading || relatedLoading));

  return { allFields, linkedRecords: linkedRecords ?? [], isConfigured, isLoading };
}

// ---------------------------------------------------------------------------
// Public hooks
// ---------------------------------------------------------------------------

export interface LookupResult {
  values: any[];
  isConfigured: boolean;
  isLoading: boolean;
}

/**
 * Resolve a Lookup field's values for a single record.
 *
 * Returns the list of looked-up values (scalars), plus loading / configuration
 * state so the caller can decide what placeholder to show.
 */
export function useLookupValue(field: FieldMeta, record: RecordRow): LookupResult {
  const { allFields, linkedRecords, isConfigured, isLoading } = useLookupRollupData(field, record);

  const values = useMemo(() => {
    if (!isConfigured || isLoading || !field.options?.lookupFieldId) return [];
    return computeLookupValues(record, field, allFields, linkedRecords);
  }, [isConfigured, isLoading, field, record, allFields, linkedRecords]);

  return { values, isConfigured: isConfigured && !!field.options?.lookupFieldId, isLoading };
}

export interface RollupResult {
  value: number | string | any[] | null;
  isConfigured: boolean;
  isLoading: boolean;
}

/**
 * Resolve a Rollup field's aggregated value for a single record.
 */
export function useRollupValue(field: FieldMeta, record: RecordRow): RollupResult {
  const { allFields, linkedRecords, isConfigured, isLoading } = useLookupRollupData(field, record);

  const fn = field.options?.fn;
  const needsTargetField = fn !== 'COUNT' && fn !== 'COUNTALL';
  const configured = isConfigured && !!fn && (!needsTargetField || !!field.options?.rollupFieldId);

  const value = useMemo(() => {
    if (!configured || isLoading) return null;
    return computeRollupValue(record, field, allFields, linkedRecords);
  }, [configured, isLoading, record, field, allFields, linkedRecords]);

  return { value, isConfigured: configured, isLoading };
}

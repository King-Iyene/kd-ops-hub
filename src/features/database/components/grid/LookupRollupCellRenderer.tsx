import React from 'react';
import type { FieldMeta, RecordRow } from '@/features/database/types';
import { useFields } from '../../hooks/useFields';
import { useLinkedRecords } from '../../hooks/useLinks';
import { useDatabaseUI } from '../../lib/store';
import { computeLookupValues, computeRollupValue, resolveLinkField } from '../../lib/computations';

interface LookupRollupCellRendererProps {
  value: any;
  field: FieldMeta;
  record: RecordRow;
  rowHeight: 'compact' | 'default' | 'tall' | 'extra-tall';
}

const NOT_CONFIGURED = (
  <span className="truncate text-xs italic" style={{ color: '#CBD5E1' }}>
    Not configured
  </span>
);

function formatDisplayValue(v: any): string {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/**
 * Shared data-fetching for Lookup/Rollup cells: resolves the field's Links
 * field, pulls the linked records through it, and gathers a field pool
 * (source table + related table) to hand to the pure computation helpers.
 */
function useLookupRollupData(field: FieldMeta, record: RecordRow) {
  const { activeBaseId } = useDatabaseUI();
  const { data: sourceFields, isLoading: sourceLoading } = useFields(field.table_id);
  const linkField = sourceFields ? resolveLinkField(field, sourceFields) : null;

  const { data: linkedData, isLoading: linkedLoading } = useLinkedRecords({
    baseId: activeBaseId,
    sourceTableId: field.table_id,
    fieldId: linkField?.id,
    recordId: record.id,
  });

  const relatedTableId = linkField?.options?.relatedTableId;
  const { data: relatedFields, isLoading: relatedLoading } = useFields(relatedTableId);

  const allFields = [...(sourceFields ?? []), ...(relatedFields ?? [])];
  const linkedRecords = linkedData?.records ?? [];
  const isConfigured = !!linkField;
  const isLoading = sourceLoading || (isConfigured && (linkedLoading || relatedLoading));

  return { allFields, linkedRecords, isConfigured, isLoading };
}

export const LookupCellRenderer = React.memo(function LookupCellRenderer({
  field,
  record,
}: LookupRollupCellRendererProps) {
  const { allFields, linkedRecords, isConfigured, isLoading } = useLookupRollupData(field, record);

  if (!isConfigured || !field.options?.lookupFieldId) return NOT_CONFIGURED;
  if (isLoading) return null;

  const values = computeLookupValues(record, field, allFields, linkedRecords);
  if (values.length === 0) return null;

  const display = values.map(formatDisplayValue).filter(Boolean).join(', ');
  if (!display) return null;

  return (
    <span className="truncate" style={{ color: '#334155' }}>
      {display}
    </span>
  );
});

export const RollupCellRenderer = React.memo(function RollupCellRenderer({
  field,
  record,
}: LookupRollupCellRendererProps) {
  const { allFields, linkedRecords, isConfigured, isLoading } = useLookupRollupData(field, record);

  const fn = field.options?.fn;
  const needsTargetField = fn !== 'COUNT' && fn !== 'COUNTALL';
  if (!isConfigured || !fn || (needsTargetField && !field.options?.rollupFieldId)) return NOT_CONFIGURED;
  if (isLoading) return null;

  const result = computeRollupValue(record, field, allFields, linkedRecords);
  if (result === null || result === undefined || result === '') return null;

  if (Array.isArray(result)) {
    if (result.length === 0) return null;
    const display = result.map(formatDisplayValue).filter(Boolean).join(', ');
    if (!display) return null;
    return (
      <span className="truncate" style={{ color: '#334155' }}>
        {display}
      </span>
    );
  }

  const isNumeric = typeof result === 'number';
  return (
    <span
      className={isNumeric ? 'truncate block text-right w-full' : 'truncate'}
      style={{ color: '#334155', fontVariantNumeric: isNumeric ? 'tabular-nums' : undefined }}
    >
      {isNumeric ? result.toLocaleString() : String(result)}
    </span>
  );
});

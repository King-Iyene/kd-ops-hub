import React from 'react';
import type { FieldMeta, RecordRow } from '@/features/database/types';
import { useLookupValue, useRollupValue } from '../../hooks/useLookupRollup';
import { useGridColors } from '../../hooks/useGridColors';

interface LookupRollupCellRendererProps {
  value: any;
  field: FieldMeta;
  record: RecordRow;
  rowHeight: 'short' | 'medium' | 'tall' | 'extra-tall';
}

function NotConfigured() {
  const colors = useGridColors();
  return (
    <span className="truncate text-xs italic" style={{ color: colors.muted }}>
      Not configured
    </span>
  );
}

function formatDisplayValue(v: any): string {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

export const LookupCellRenderer = React.memo(function LookupCellRenderer({
  field,
  record,
}: LookupRollupCellRendererProps) {
  const { values, isConfigured, isLoading } = useLookupValue(field, record);
  const colors = useGridColors();

  if (!isConfigured) return <NotConfigured />;
  if (isLoading) return null;
  if (values.length === 0) return null;

  const display = values.map(formatDisplayValue).filter(Boolean).join(', ');
  if (!display) return null;

  return (
    <span className="truncate" style={{ color: colors.text }}>
      {display}
    </span>
  );
});

export const RollupCellRenderer = React.memo(function RollupCellRenderer({
  field,
  record,
}: LookupRollupCellRendererProps) {
  const { value: result, isConfigured, isLoading } = useRollupValue(field, record);
  const colors = useGridColors();

  if (!isConfigured) return <NotConfigured />;
  if (isLoading) return null;
  if (result === null || result === undefined || result === '') return null;

  if (Array.isArray(result)) {
    if (result.length === 0) return null;
    const display = result.map(formatDisplayValue).filter(Boolean).join(', ');
    if (!display) return null;
    return (
      <span className="truncate" style={{ color: colors.text }}>
        {display}
      </span>
    );
  }

  const isNumeric = typeof result === 'number';
  return (
    <span
      className={isNumeric ? 'truncate block text-right w-full' : 'truncate'}
      style={{ color: colors.text, fontVariantNumeric: isNumeric ? 'tabular-nums' : undefined }}
    >
      {isNumeric ? result.toLocaleString() : String(result)}
    </span>
  );
});

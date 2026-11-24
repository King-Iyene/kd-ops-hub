import React from 'react';
import type { FieldMeta, RecordRow } from '@/features/database/types';
import { useLookupValue, useRollupValue } from '../../hooks/useLookupRollup';
import { useGridColors } from '../../hooks/useGridColors';

import { formatCurrency, formatNumber, formatPercent } from '../../lib/numberFormat';

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

/**
 * Several values from linked records, shown as small chips so they read as separate items. One value is plain
 * text: a chip around a single word is clutter. The cell clips what does not fit; the full list is in the tooltip.
 */
function ValueList({ items }: { items: string[] }) {
  const colors = useGridColors();
  if (items.length === 1) {
    return (
      <span className="truncate" style={{ color: colors.text }}>
        {items[0]}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 min-w-0 overflow-hidden" title={items.join(', ')} data-value-list>
      {items.map((text, i) => (
        <span
          key={`${i}-${text}`}
          className="shrink-0 truncate rounded leading-5 px-1.5"
          style={{
            maxWidth: 160,
            fontSize: 12,
            color: colors.text,
            backgroundColor: colors.headerBg,
            border: `1px solid ${colors.border}`,
          }}
        >
          {text}
        </span>
      ))}
    </span>
  );
}

export const LookupCellRenderer = React.memo(function LookupCellRenderer({
  field,
  record,
}: LookupRollupCellRendererProps) {
  const { values, isConfigured, isLoading } = useLookupValue(field, record);

  if (!isConfigured) return <NotConfigured />;
  if (isLoading) return null;
  if (values.length === 0) return null;

  const items = values.map(formatDisplayValue).filter(Boolean);
  if (items.length === 0) return null;

  return <ValueList items={items} />;
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
    const items = result.map(formatDisplayValue).filter(Boolean);
    if (items.length === 0) return null;
    return <ValueList items={items} />;
  }

  const isNumeric = typeof result === 'number';

  // Money and percentages use the same formatter as every other cell.
  let displayValue: string;
  if (typeof result === 'boolean') {
    displayValue = result ? 'Yes' : 'No';
  } else if (isNumeric) {
    const resultType = field.options?.result?.type;
    if (resultType === 'currency') {
      displayValue = formatCurrency(result, {
        currencyCode: field.options?.result?.options?.currencyCode ?? field.options?.result?.options?.symbol ?? '$',
        precision: field.options?.result?.options?.precision ?? 0,
      });
    } else if (resultType === 'percent') {
      displayValue = formatPercent(result * 100, { precision: 1 });
    } else {
      displayValue = formatNumber(result);
    }
  } else {
    displayValue = String(result);
  }

  return (
    <span
      className={isNumeric ? 'truncate block text-right w-full' : 'truncate'}
      style={{ color: isNumeric && typeof result === 'number' && result < 0 ? '#EF4444' : colors.text, fontVariantNumeric: isNumeric ? 'tabular-nums' : undefined }}
    >
      {displayValue}
    </span>
  );
});

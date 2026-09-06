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

  // Format currency if the rollup result type is currency
  let displayValue: string;
  if (isNumeric) {
    const resultType = field.options?.result?.type;
    if (resultType === 'currency') {
      const sym = field.options?.result?.options?.symbol ?? '$';
      const SYMBOL_TO_ISO: Record<string, string> = {
        '₦': 'NGN', '$': 'USD', '€': 'EUR', '£': 'GBP', '¥': 'JPY', '₹': 'INR',
        '₩': 'KRW', '₽': 'RUB', '₺': 'TRY', '₴': 'UAH', '₸': 'KZT', '₫': 'VND',
        '₵': 'GHS', 'R': 'ZAR', 'Fr': 'CHF', 'kr': 'SEK', 'zł': 'PLN', 'Kč': 'CZK',
      };
      const trimmed = (sym as string).trim();
      const code = /^[A-Z]{3}$/.test(trimmed) ? trimmed : (SYMBOL_TO_ISO[trimmed] ?? 'USD');
      const precision = field.options?.result?.options?.precision ?? 0;
      try {
        displayValue = new Intl.NumberFormat(undefined, {
          style: 'currency', currency: code,
          minimumFractionDigits: precision, maximumFractionDigits: precision,
        }).format(result);
      } catch {
        displayValue = `${sym}${result.toLocaleString()}`;
      }
    } else if (resultType === 'percent') {
      displayValue = `${(result * 100).toFixed(1)}%`;
    } else {
      displayValue = result.toLocaleString();
    }
  } else {
    displayValue = String(result);
  }

  return (
    <span
      className={isNumeric ? 'truncate block text-right w-full' : 'truncate'}
      style={{ color: colors.text, fontVariantNumeric: isNumeric ? 'tabular-nums' : undefined }}
    >
      {displayValue}
    </span>
  );
});

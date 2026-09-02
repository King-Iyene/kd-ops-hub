import React from 'react';
import { Check, ExternalLink, Copy, Star, Paperclip, Plus } from 'lucide-react';
import type { FieldMeta, SelectChoice, RecordRow } from '@/features/database/types';
import { LinkCellRenderer } from './LinkCellRenderer';
import { LookupCellRenderer, RollupCellRenderer } from './LookupRollupCellRenderer';
import { PILL_COLORS } from '@/features/database/types';

interface CellRendererProps {
  value: any;
  field: FieldMeta;
  record: RecordRow;
  rowHeight: 'compact' | 'default' | 'tall' | 'extra-tall';
}

function getPillColor(colorName: string) {
  return PILL_COLORS.find((c) => c.name === colorName) || PILL_COLORS[7];
}

export const TextCellRenderer = React.memo(function TextCellRenderer({
  value,
  field,
}: CellRendererProps) {
  if (value == null || value === '') return null;
  const text = String(value);

  if (field.ui_type === 'Email') {
    return (
      <span className="truncate" style={{ color: '#3366FF' }}>
        {text}
      </span>
    );
  }

  if (field.ui_type === 'URL') {
    return (
      <span className="truncate flex items-center gap-1" style={{ color: '#3366FF' }}>
        <span className="truncate">{text}</span>
        <ExternalLink size={12} className="shrink-0" />
      </span>
    );
  }

  return <span className="truncate">{text}</span>;
});

export const LongTextCellRenderer = React.memo(function LongTextCellRenderer({
  value,
}: CellRendererProps) {
  if (value == null || value === '') return null;
  const text = String(value);
  const display = text.length > 80 ? text.slice(0, 80) + '...' : text;
  return (
    <span className="truncate" style={{ color: '#64748B' }}>
      {display}
    </span>
  );
});

export const NumberCellRenderer = React.memo(function NumberCellRenderer({
  value,
}: CellRendererProps) {
  if (value == null || value === '') return null;
  const num = Number(value);
  if (isNaN(num)) return <span className="truncate">{String(value)}</span>;
  return (
    <span className="truncate block text-right w-full">
      {num.toLocaleString()}
    </span>
  );
});

export const DecimalCellRenderer = React.memo(function DecimalCellRenderer({
  value,
}: CellRendererProps) {
  if (value == null || value === '') return null;
  const num = Number(value);
  if (isNaN(num)) return <span className="truncate">{String(value)}</span>;
  return (
    <span className="truncate block text-right w-full">
      {num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
    </span>
  );
});

export const PercentCellRenderer = React.memo(function PercentCellRenderer({
  value,
}: CellRendererProps) {
  if (value == null || value === '') return null;
  const num = Number(value);
  if (isNaN(num)) return <span className="truncate">{String(value)}</span>;
  return (
    <span className="truncate block text-right w-full">
      {num}%
    </span>
  );
});

export const CurrencyCellRenderer = React.memo(function CurrencyCellRenderer({
  value,
  field,
}: CellRendererProps) {
  if (value == null || value === '') return null;
  const num = Number(value);
  if (isNaN(num)) return null;
  const code = field.options?.currencyCode || 'USD';
  const formatted = new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: code,
  }).format(num);
  return (
    <span className="truncate block text-right w-full">{formatted}</span>
  );
});

export const DateCellRenderer = React.memo(function DateCellRenderer({
  value,
  field,
}: CellRendererProps) {
  if (value == null || value === '') return null;
  const date = new Date(value);
  if (isNaN(date.getTime())) return <span className="truncate">{String(value)}</span>;
  const opts: Intl.DateTimeFormatOptions =
    field.ui_type === 'DateTime'
      ? { dateStyle: 'medium', timeStyle: 'short' }
      : { dateStyle: 'medium' };
  return <span className="truncate">{date.toLocaleDateString(undefined, opts)}</span>;
});

export const DurationCellRenderer = React.memo(function DurationCellRenderer({
  value,
}: CellRendererProps) {
  if (value == null || value === '') return null;
  const totalSeconds = Number(value);
  if (isNaN(totalSeconds)) return <span className="truncate">{String(value)}</span>;
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const display = h > 0
    ? `${h}h ${m}m`
    : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return (
    <span className="truncate block text-right w-full" style={{ fontVariantNumeric: 'tabular-nums' }}>
      {display}
    </span>
  );
});

export const CheckboxCellRenderer = React.memo(function CheckboxCellRenderer({
  value,
}: CellRendererProps) {
  const checked = Boolean(value);
  return (
    <div className="flex items-center justify-center w-full">
      {checked ? (
        <div
          className="w-4 h-4 rounded flex items-center justify-center"
          style={{ backgroundColor: '#0D9488' }}
        >
          <Check size={12} color="#fff" strokeWidth={3} />
        </div>
      ) : (
        <div
          className="w-4 h-4 rounded border-2"
          style={{ borderColor: '#9AA2AF' }}
        />
      )}
    </div>
  );
});

export const RatingCellRenderer = React.memo(function RatingCellRenderer({
  value,
  field,
}: CellRendererProps) {
  const max = field.options?.max || 5;
  const rating = Number(value) || 0;
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: max }, (_, i) => (
        <Star
          key={i}
          size={14}
          fill={i < rating ? '#F59E0B' : 'none'}
          color={i < rating ? '#F59E0B' : '#E7E7E9'}
          strokeWidth={1.5}
        />
      ))}
    </div>
  );
});

export const SelectCellRenderer = React.memo(function SelectCellRenderer({
  value,
  field,
}: CellRendererProps) {
  if (value == null || value === '') return null;
  const choice = field.options?.choices?.find((c: SelectChoice) => c.title === value);
  const color = getPillColor(choice?.color || 'Gray');
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium truncate"
      style={{ backgroundColor: color.bg, color: color.text }}
    >
      {String(value)}
    </span>
  );
});

export const MultiSelectCellRenderer = React.memo(function MultiSelectCellRenderer({
  value,
  field,
  rowHeight,
}: CellRendererProps) {
  if (!Array.isArray(value) || value.length === 0) return null;
  const isCompact = rowHeight === 'compact';
  const maxVisible = isCompact ? 2 : value.length;
  const visible = value.slice(0, maxVisible);
  const remaining = value.length - maxVisible;

  return (
    <div className="flex flex-wrap gap-1 items-center overflow-hidden">
      {visible.map((v: string) => {
        const choice = field.options?.choices?.find((c: SelectChoice) => c.title === v);
        const color = getPillColor(choice?.color || 'Gray');
        return (
          <span
            key={v}
            className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium truncate"
            style={{ backgroundColor: color.bg, color: color.text }}
          >
            {v}
          </span>
        );
      })}
      {remaining > 0 && (
        <span className="text-xs" style={{ color: '#9AA2AF' }}>
          +{remaining}
        </span>
      )}
    </div>
  );
});

export const AttachmentCellRenderer = React.memo(function AttachmentCellRenderer({
  value,
}: CellRendererProps) {
  if (value == null) return null;
  const files: { name: string; url: string; type: string; size: number }[] = Array.isArray(value) ? value : [];
  if (files.length === 0) {
    return (
      <span className="flex items-center gap-1 text-xs cursor-pointer" style={{ color: '#C4C9D4' }}>
        <Plus size={13} className="shrink-0" />
      </span>
    );
  }
  const isImage = (type: string) => type?.startsWith('image/');
  return (
    <div className="flex items-center gap-1 h-full overflow-hidden">
      {files.slice(0, 3).map((f, i) =>
        isImage(f.type) ? (
          <img
            key={i}
            src={f.url}
            alt={f.name}
            className="h-6 w-6 rounded object-cover border border-[#E7E7E9] shrink-0"
            title={f.name}
          />
        ) : (
          <span
            key={i}
            className="h-6 px-1.5 rounded bg-[#F4F4F5] border border-[#E7E7E9] flex items-center shrink-0"
            title={f.name}
          >
            <Paperclip size={11} className="text-[#9AA2AF]" />
          </span>
        ),
      )}
      {files.length > 3 && (
        <span className="text-[10px] shrink-0" style={{ color: '#9AA2AF' }}>
          +{files.length - 3}
        </span>
      )}
    </div>
  );
});

export const JSONCellRenderer = React.memo(function JSONCellRenderer({
  value,
}: CellRendererProps) {
  if (value == null || value === '') return null;
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  const display = text.length > 60 ? text.slice(0, 60) + '...' : text;
  return (
    <span className="truncate" style={{ fontFamily: 'monospace', fontSize: 12, color: '#64748B' }}>
      {display}
    </span>
  );
});

export const SystemCellRenderer = React.memo(function SystemCellRenderer({
  value,
  field,
}: CellRendererProps) {
  if (value == null || value === '') return null;

  if (field.ui_type === 'ID') {
    const text = String(value);
    const truncated = text.length > 8 ? text.slice(0, 8) + '...' : text;
    return (
      <span
        className="truncate cursor-pointer flex items-center gap-1 group"
        style={{ color: '#9AA2AF' }}
        onClick={(e) => {
          e.stopPropagation();
          navigator.clipboard.writeText(text);
        }}
      >
        {truncated}
        <Copy size={12} className="opacity-0 group-hover:opacity-100 shrink-0" />
      </span>
    );
  }

  if (field.ui_type === 'CreatedTime' || field.ui_type === 'LastModifiedTime') {
    const date = new Date(value);
    if (isNaN(date.getTime())) return <span style={{ color: '#9AA2AF' }}>{String(value)}</span>;
    return (
      <span className="truncate" style={{ color: '#9AA2AF' }}>
        {date.toLocaleDateString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
      </span>
    );
  }

  if (field.ui_type === 'AutoNumber') {
    return (
      <span className="truncate block text-right w-full" style={{ color: '#9AA2AF', fontFamily: 'monospace', fontSize: 12 }}>
        {String(value)}
      </span>
    );
  }

  if (field.ui_type === 'CreatedBy' || field.ui_type === 'LastModifiedBy') {
    const display = typeof value === 'object' && value !== null
      ? value.email || value.name || 'Unknown'
      : String(value || 'Unknown');
    return (
      <span className="truncate" style={{ color: '#9AA2AF' }}>
        {display}
      </span>
    );
  }

  return (
    <span className="truncate" style={{ color: '#9AA2AF' }}>
      {String(value)}
    </span>
  );
});

export const ComputedCellRenderer = React.memo(function ComputedCellRenderer({
  value,
}: CellRendererProps) {
  if (value == null || value === '') return null;
  return (
    <span className="truncate" style={{ color: '#9AA2AF' }}>
      {String(value)}
    </span>
  );
});

export function getCellRenderer(uiType: string) {
  switch (uiType) {
    case 'SingleLineText':
    case 'Email':
    case 'PhoneNumber':
    case 'URL':
      return TextCellRenderer;
    case 'LongText':
      return LongTextCellRenderer;
    case 'Number':
      return NumberCellRenderer;
    case 'Decimal':
      return DecimalCellRenderer;
    case 'Percent':
      return PercentCellRenderer;
    case 'Currency':
      return CurrencyCellRenderer;
    case 'Date':
    case 'DateTime':
    case 'Year':
    case 'Time':
      return DateCellRenderer;
    case 'Duration':
      return DurationCellRenderer;
    case 'Checkbox':
      return CheckboxCellRenderer;
    case 'Rating':
      return RatingCellRenderer;
    case 'SingleSelect':
      return SelectCellRenderer;
    case 'MultiSelect':
      return MultiSelectCellRenderer;
    case 'Attachment':
      return AttachmentCellRenderer;
    case 'JSON':
      return JSONCellRenderer;
    case 'ID':
    case 'CreatedTime':
    case 'LastModifiedTime':
    case 'AutoNumber':
    case 'CreatedBy':
    case 'LastModifiedBy':
      return SystemCellRenderer;
    case 'Links':
      return LinkCellRenderer;
    case 'Lookup':
      return LookupCellRenderer;
    case 'Rollup':
      return RollupCellRenderer;
    case 'Formula':
      return ComputedCellRenderer;
    default:
      return TextCellRenderer;
  }
}

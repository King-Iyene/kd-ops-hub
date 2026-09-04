import React from 'react';
import { Check, ExternalLink, Copy, Paperclip, Plus, Star, Clock, Link2, AlertTriangle, Barcode } from 'lucide-react';
import type { FieldMeta, SelectChoice, RecordRow } from '@/features/database/types';
import { LinkCellRenderer } from './LinkCellRenderer';
// LookupCellRenderer and RollupCellRenderer are defined locally below
import { PILL_COLORS, SELECT_COLORS } from '@/features/database/types';
import { useDatabaseUI } from '../../lib/store';
import { useGridColors } from '../../hooks/useGridColors';

interface CellRendererProps {
  value: any;
  field: FieldMeta;
  record: RecordRow;
  rowHeight: 'short' | 'medium' | 'tall' | 'extra-tall';
}

function HighlightedText({ text, style, className }: { text: string; style?: React.CSSProperties; className?: string }) {
  const searchQuery = useDatabaseUI((s) => s.searchQuery);
  const colors = useGridColors();
  if (!searchQuery) {
    return <span className={className} style={style}>{text}</span>;
  }
  const regex = new RegExp(`(${searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  const parts = text.split(regex);
  if (parts.length === 1) {
    return <span className={className} style={style}>{text}</span>;
  }
  const testRegex = new RegExp(regex.source, 'i');
  return (
    <span className={className} style={style}>
      {parts.map((part, i) =>
        testRegex.test(part) ? (
          <mark key={i} style={{ backgroundColor: colors.highlightBg, color: 'inherit', borderRadius: 2, padding: '0 1px' }}>
            {part}
          </mark>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        ),
      )}
    </span>
  );
}

function getPillColor(colorName: string) {
  return PILL_COLORS.find((c) => c.name === colorName) || PILL_COLORS[7];
}

function getSelectColor(colorName: string) {
  return SELECT_COLORS[colorName] || SELECT_COLORS.grayLight2;
}

const EMAIL_VALID_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const TextCellRenderer = React.memo(function TextCellRenderer({
  value,
  field,
}: CellRendererProps) {
  const colors = useGridColors();
  if (value == null || value === '') return null;
  const text = String(value);

  if (field.ui_type === 'Email') {
    const valid = EMAIL_VALID_RE.test(text);
    if (valid) {
      return (
        <a
          href={`mailto:${text}`}
          className="truncate hover:underline"
          style={{ color: colors.tealText }}
          onClick={(e) => e.stopPropagation()}
        >
          <HighlightedText text={text} className="truncate" style={{ color: colors.tealText }} />
        </a>
      );
    }
    return (
      <span className="truncate flex items-center gap-1">
        <AlertTriangle size={12} className="shrink-0 text-amber-500" />
        <HighlightedText text={text} className="truncate" style={{ color: colors.text }} />
      </span>
    );
  }

  if (field.ui_type === 'URL') {
    let href = text;
    let valid = true;
    let domain = text;
    try {
      const parsed = new URL(href.includes('://') ? href : `https://${href}`);
      if (!href.includes('://')) href = `https://${href}`;
      domain = parsed.hostname.replace(/^www\./, '');
    } catch {
      valid = false;
    }
    if (valid) {
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="truncate flex items-center gap-1 hover:underline"
          style={{ color: colors.tealText }}
          onClick={(e) => e.stopPropagation()}
          title={text}
        >
          <HighlightedText text={domain} className="truncate" style={{ color: colors.tealText }} />
          <ExternalLink size={12} className="shrink-0" />
        </a>
      );
    }
    return (
      <span className="truncate flex items-center gap-1">
        <AlertTriangle size={12} className="shrink-0 text-amber-500" />
        <HighlightedText text={text} className="truncate" style={{ color: colors.text }} />
      </span>
    );
  }

  if (field.ui_type === 'PhoneNumber') {
    const hasLetters = /[a-wyzA-WYZ]/.test(text);
    const digits = text.replace(/\D/g, '');
    if (digits.length >= 7) {
      return (
        <span className="truncate flex items-center gap-1">
          {hasLetters && <AlertTriangle size={12} className="shrink-0 text-amber-500" />}
          <a
            href={`tel:${text}`}
            className="truncate hover:underline"
            style={{ color: colors.tealText }}
            onClick={(e) => e.stopPropagation()}
          >
            <HighlightedText text={text} className="truncate" style={{ color: colors.tealText }} />
          </a>
        </span>
      );
    }
    return (
      <span className="truncate flex items-center gap-1">
        {hasLetters && <AlertTriangle size={12} className="shrink-0 text-amber-500" />}
        <HighlightedText text={text} className="truncate" />
      </span>
    );
  }

  return <HighlightedText text={text} className="truncate" />;
});

export const LongTextCellRenderer = React.memo(function LongTextCellRenderer({
  value,
  rowHeight,
}: CellRendererProps) {
  const colors = useGridColors();
  if (value == null || value === '') return null;
  const text = String(value);
  const lineCount = text.split('\n').length;
  const maxLen = rowHeight === 'short' ? 50 : rowHeight === 'tall' ? 200 : rowHeight === 'extra-tall' ? 400 : 80;
  const display = text.length > maxLen ? text.slice(0, maxLen) + '…' : text;
  return (
    <span className="truncate flex items-center gap-1.5" style={{ color: 'inherit' }}>
      <span className="truncate whitespace-pre-line" style={{ fontSize: 14, lineHeight: '20px' }}>{display}</span>
      {lineCount > 1 && (
        <span className="shrink-0 text-[9px] px-1 py-px rounded-sm bg-black/5 dark:bg-white/5" style={{ color: colors.systemText }}>{lineCount}L</span>
      )}
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
  const colors = useGridColors();
  if (value == null || value === '') return null;
  const date = new Date(value);
  if (isNaN(date.getTime())) return <span className="truncate">{String(value)}</span>;
  const opts: Intl.DateTimeFormatOptions =
    field.ui_type === 'DateTime'
      ? { dateStyle: 'medium', timeStyle: 'short' }
      : { dateStyle: 'medium' };
  const formatted = date.toLocaleString(undefined, opts);
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md px-1.5 truncate"
      style={{
        fontSize: 12,
        color: colors.textSecondary,
        backgroundColor: `${colors.border}30`,
        height: 22,
        lineHeight: '22px',
      }}
    >
      <Clock size={10} className="shrink-0" style={{ color: colors.muted, opacity: 0.8 }} />
      <span className="truncate">{formatted}</span>
    </span>
  );
});

export const CheckboxCellRenderer = React.memo(function CheckboxCellRenderer({
  value,
}: CellRendererProps) {
  const colors = useGridColors();
  const checked = Boolean(value);
  return (
    <div className="flex items-center justify-center w-full h-full cursor-pointer">
      {checked ? (
        <div
          className="w-[18px] h-[18px] rounded flex items-center justify-center"
          style={{ backgroundColor: colors.checkboxChecked }}
        >
          <Check size={13} color="#fff" strokeWidth={3} />
        </div>
      ) : (
        <div
          className="w-[18px] h-[18px] rounded border-2 border-[#D1D5DB] dark:border-[hsl(215,12%,35%)] group-hover/row:border-[#9CA3AF] dark:group-hover/row:border-[hsl(215,12%,45%)] transition-colors"
        />
      )}
    </div>
  );
});

export const SelectCellRenderer = React.memo(function SelectCellRenderer({
  value,
  field,
}: CellRendererProps) {
  if (value == null || value === '') return null;
  const choice = field.options?.choices?.find((c: SelectChoice) => c.title === value);
  const sc = getSelectColor(choice?.color || 'grayLight2');
  return (
    <span
      className="inline-flex items-center px-2.5 rounded-full text-xs font-medium truncate select-pill"
      style={{
        '--pill-bg': sc.bg,
        '--pill-text': sc.text,
        '--pill-dark-bg': sc.darkBg,
        '--pill-dark-text': sc.darkText,
        backgroundColor: 'var(--pill-bg)',
        color: 'var(--pill-text)',
        height: 22,
        lineHeight: '22px',
        maxWidth: '100%',
      } as React.CSSProperties}
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
  const colors = useGridColors();
  if (!Array.isArray(value) || value.length === 0) return null;
  const isCompact = rowHeight === 'short';
  const maxVisible = isCompact ? 2 : value.length;
  const visible = value.slice(0, maxVisible);
  const remaining = value.length - maxVisible;

  return (
    <div className="flex flex-wrap gap-1 items-center overflow-hidden">
      {visible.map((v: string) => {
        const choice = field.options?.choices?.find((c: SelectChoice) => c.title === v);
        const sc = getSelectColor(choice?.color || 'grayLight2');
        return (
          <span
            key={v}
            className="inline-flex items-center px-2 rounded-full text-xs font-medium truncate select-pill"
            style={{
              '--pill-bg': sc.bg,
              '--pill-text': sc.text,
              '--pill-dark-bg': sc.darkBg,
              '--pill-dark-text': sc.darkText,
              backgroundColor: 'var(--pill-bg)',
              color: 'var(--pill-text)',
              height: 20,
              lineHeight: '20px',
            } as React.CSSProperties}
          >
            {v}
          </span>
        );
      })}
      {remaining > 0 && (
        <span className="text-xs" style={{ color: colors.systemText }}>
          +{remaining}
        </span>
      )}
    </div>
  );
});

export const AttachmentCellRenderer = React.memo(function AttachmentCellRenderer({
  value,
}: CellRendererProps) {
  const colors = useGridColors();
  if (value == null) return null;
  const files: { name: string; url: string; type: string; size: number }[] = Array.isArray(value) ? value : [];
  if (files.length === 0) {
    return (
      <span className="flex items-center gap-1 text-xs cursor-pointer" style={{ color: colors.starEmpty }}>
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
            className="h-6 w-6 rounded object-cover shrink-0"
            style={{ border: `1px solid ${colors.dropdownBorder}` }}
            title={f.name}
          />
        ) : (
          <span
            key={i}
            className="h-6 px-1.5 rounded flex items-center shrink-0"
            style={{ backgroundColor: colors.dropdownHover, border: `1px solid ${colors.dropdownBorder}` }}
            title={f.name}
          >
            <Paperclip size={11} style={{ color: colors.systemText }} />
          </span>
        ),
      )}
      {files.length > 3 && (
        <span className="text-[10px] shrink-0" style={{ color: colors.systemText }}>
          +{files.length - 3}
        </span>
      )}
    </div>
  );
});

export const JSONCellRenderer = React.memo(function JSONCellRenderer({
  value,
}: CellRendererProps) {
  const colors = useGridColors();
  if (value == null || value === '') return null;
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  const display = text.length > 60 ? text.slice(0, 60) + '...' : text;
  return (
    <span className="truncate font-mono text-xs" style={{ color: colors.muted }}>
      {display}
    </span>
  );
});

export const SystemCellRenderer = React.memo(function SystemCellRenderer({
  value,
  field,
}: CellRendererProps) {
  const colors = useGridColors();
  if (value == null || value === '') return null;

  if (field.ui_type === 'ID') {
    const text = String(value);
    const truncated = text.length > 8 ? text.slice(0, 8) + '…' : text;
    return (
      <span
        className="truncate cursor-pointer flex items-center gap-1 group"
        style={{ color: colors.systemText }}
        onClick={(e) => {
          e.stopPropagation();
          navigator.clipboard.writeText(text).catch(() => {});
        }}
      >
        <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11 }}>{truncated}</span>
        <Copy size={11} className="opacity-0 group-hover:opacity-100 shrink-0" />
      </span>
    );
  }

  if (field.ui_type === 'CreatedTime' || field.ui_type === 'LastModifiedTime') {
    const date = new Date(value);
    if (isNaN(date.getTime())) return <span style={{ color: colors.systemText }}>{String(value)}</span>;
    const formatted = date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-md px-1.5 truncate"
        style={{
          fontSize: 11,
          color: colors.systemText,
          backgroundColor: `${colors.border}40`,
          height: 22,
          lineHeight: '22px',
        }}
      >
        <Clock size={10} className="shrink-0" style={{ opacity: 0.7 }} />
        <span className="truncate">{formatted}</span>
      </span>
    );
  }

  if (field.ui_type === 'AutoNumber') {
    return (
      <span className="truncate block text-right w-full" style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, color: colors.systemText }}>
        {String(value)}
      </span>
    );
  }

  if (field.ui_type === 'CreatedBy' || field.ui_type === 'LastModifiedBy') {
    const display = typeof value === 'object' && value !== null
      ? value.email || value.name || 'Unknown'
      : String(value || 'Unknown');
    const initial = display.charAt(0).toUpperCase();
    return (
      <span className="truncate flex items-center gap-1.5" style={{ color: colors.systemText }}>
        <span
          className="shrink-0 flex items-center justify-center rounded-full text-white"
          style={{
            width: 18,
            height: 18,
            fontSize: 10,
            fontWeight: 600,
            backgroundColor: colors.avatarBg,
          }}
        >
          {initial}
        </span>
        <span className="truncate" style={{ fontSize: 12 }}>{display}</span>
      </span>
    );
  }

  return (
    <span className="truncate" style={{ fontSize: 12, color: colors.systemText }}>
      {String(value)}
    </span>
  );
});

export const ComputedCellRenderer = React.memo(function ComputedCellRenderer({
  value,
}: CellRendererProps) {
  if (value == null || value === '') return null;
  return (
    <span className="truncate text-[#9AA2AF] dark:text-[hsl(200,20%,55%)]">
      {String(value)}
    </span>
  );
});

export const RatingCellRenderer = React.memo(function RatingCellRenderer({
  value,
  field,
}: CellRendererProps) {
  const max = field.options?.max ?? 5;
  const rating = typeof value === 'number' ? value : 0;
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: max }, (_, i) => (
        <Star
          key={i}
          size={14}
          fill={i < rating ? '#F59E0B' : 'none'}
          stroke={i < rating ? '#F59E0B' : undefined}
          className={i < rating ? '' : 'stroke-[#D1D5DB] dark:stroke-[hsl(200,20%,35%)]'}
          strokeWidth={1.5}
        />
      ))}
    </div>
  );
});

export const PercentCellRenderer = React.memo(function PercentCellRenderer({
  value,
}: CellRendererProps) {
  if (value == null || value === '') return null;
  const num = Number(value);
  if (isNaN(num)) return <span className="truncate">{String(value)}</span>;
  return (
    <div className="flex items-center gap-2 w-full">
      <div className="flex-1 h-1.5 rounded-full bg-[#E5E5E5] dark:bg-[hsl(200,25%,18%)] overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.min(100, Math.max(0, num))}%`, backgroundColor: '#2563EB' }}
        />
      </div>
      <span className="text-xs shrink-0 text-[#6A7184] dark:text-[hsl(200,20%,55%)]">{num}%</span>
    </div>
  );
});

export const DurationCellRenderer = React.memo(function DurationCellRenderer({
  value,
  field,
}: CellRendererProps) {
  const colors = useGridColors();
  if (value == null || value === '') return null;
  const seconds = Number(value);
  if (isNaN(seconds)) return <span className="truncate">{String(value)}</span>;
  const format = field.options?.format || 'h:mm';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const rawS = seconds % 3600 % 60;
  const pad2 = (n: number) => String(n).padStart(2, '0');
  let display: string;
  if (format === 'h:mm') {
    display = `${h}:${pad2(m)}`;
  } else if (format === 'h:mm:ss') {
    display = `${h}:${pad2(m)}:${pad2(Math.floor(rawS))}`;
  } else if (format === 'h:mm:ss.s') {
    display = `${h}:${pad2(m)}:${pad2(Math.floor(rawS))}.${Math.floor((rawS % 1) * 10)}`;
  } else if (format === 'h:mm:ss.ss') {
    display = `${h}:${pad2(m)}:${pad2(Math.floor(rawS))}.${String(Math.floor((rawS % 1) * 100)).padStart(2, '0')}`;
  } else if (format === 'h:mm:ss.sss') {
    display = `${h}:${pad2(m)}:${pad2(Math.floor(rawS))}.${String(Math.floor((rawS % 1) * 1000)).padStart(3, '0')}`;
  } else {
    display = `${h}:${pad2(m)}`;
  }
  return (
    <span className="flex items-center gap-1 truncate" style={{ color: colors.muted }}>
      <Clock size={12} className="shrink-0" style={{ color: colors.systemText }} />
      {display}
    </span>
  );
});

export const TimeCellRenderer = React.memo(function TimeCellRenderer({
  value,
}: CellRendererProps) {
  if (value == null || value === '') return null;
  return <span className="truncate">{String(value)}</span>;
});

export const YearCellRenderer = React.memo(function YearCellRenderer({
  value,
}: CellRendererProps) {
  if (value == null || value === '') return null;
  return <span className="truncate">{String(value)}</span>;
});


export const FormulaCellRenderer = React.memo(function FormulaCellRenderer({
  value,
}: CellRendererProps) {
  const colors = useGridColors();
  if (value == null || value === '') return null;
  if (typeof value === 'string' && (value.startsWith('#ERROR') || value.startsWith('ERROR') || value.startsWith('!ERROR'))) {
    return (
      <span className="truncate font-medium text-[12px]" style={{ color: '#EF4444' }}>
        #ERROR
      </span>
    );
  }
  if (typeof value === 'boolean') {
    return (
      <div className="flex items-center justify-center w-full">
        {value ? (
          <div className="w-4 h-4 rounded flex items-center justify-center" style={{ backgroundColor: colors.tealText }}>
            <Check size={12} color="#fff" strokeWidth={3} />
          </div>
        ) : (
          <div className="w-4 h-4 rounded" style={{ border: `2px solid ${colors.starEmpty}` }} />
        )}
      </div>
    );
  }
  if (typeof value === 'number') {
    return (
      <span className="truncate block text-right w-full">
        {value.toLocaleString()}
      </span>
    );
  }
  // Date strings (ISO format)
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    const date = new Date(value);
    if (!isNaN(date.getTime())) {
      return (
        <span className="truncate">
          {date.toLocaleDateString(undefined, { dateStyle: 'medium' })}
        </span>
      );
    }
  }
  return <span className="truncate">{String(value)}</span>;
});

export const JsonCellRenderer = React.memo(function JsonCellRenderer({
  value,
}: CellRendererProps) {
  const colors = useGridColors();
  if (value == null || value === '') return null;
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return (
    <span className="truncate font-mono text-[11px]" style={{ color: colors.muted }}>
      {text}
    </span>
  );
});

export const LookupCellRenderer = React.memo(function LookupCellRenderer({
  value,
}: CellRendererProps) {
  if (value == null || value === '') return null;
  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    return <span className="truncate">{value.join(', ')}</span>;
  }
  return <span className="truncate">{String(value)}</span>;
});

export const RollupCellRenderer = React.memo(function RollupCellRenderer({
  value,
}: CellRendererProps) {
  const colors = useGridColors();
  if (value == null || value === '') {
    return <span className="truncate block text-right w-full" style={{ color: colors.systemText }}>{'—'}</span>;
  }
  const num = Number(value);
  if (isNaN(num)) return <span className="truncate">{String(value)}</span>;
  return (
    <span className="truncate block text-right w-full">
      {num.toLocaleString()}
    </span>
  );
});

export const LinksCellRenderer = React.memo(function LinksCellRenderer({
  value,
}: CellRendererProps) {
  const colors = useGridColors();
  const count = Array.isArray(value) ? value.length : 0;
  if (count === 0) return null;
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium cursor-pointer hover:opacity-80"
      style={{ backgroundColor: `${colors.primary}20`, color: colors.linkText }}
    >
      <Link2 size={12} />
      {count} linked {count === 1 ? 'record' : 'records'}
    </span>
  );
});

export const BarcodeCellRenderer = React.memo(function BarcodeCellRenderer({
  value,
}: CellRendererProps) {
  if (value == null || value === '') return null;
  const text = String(value);
  return (
    <span className="truncate flex items-center gap-1.5">
      <Barcode size={14} className="shrink-0 text-[#9AA2AF]" />
      <HighlightedText text={text} className="truncate" />
    </span>
  );
});

export const ButtonCellRenderer = React.memo(function ButtonCellRenderer({
  field,
  record,
}: CellRendererProps) {
  const label = field.options?.label || 'Click';
  const urlTemplate = field.options?.url || '';

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!urlTemplate) return;
    const url = urlTemplate.replace(/\{(\w+)\}/g, (_: string, fieldName: string) => {
      const val = record[fieldName];
      return val != null ? encodeURIComponent(String(val)) : '';
    });
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="inline-flex items-center px-3 rounded text-xs font-medium transition-colors"
      style={{
        height: 24,
        backgroundColor: '#166EE1',
        color: '#FFFFFF',
        cursor: urlTemplate ? 'pointer' : 'default',
      }}
    >
      {label}
    </button>
  );
});

export const UserCellRenderer = React.memo(function UserCellRenderer({
  value,
}: CellRendererProps) {
  const colors = useGridColors();
  if (value == null || value === '') return null;

  const users: Array<{ id?: string; email?: string; name?: string }> = Array.isArray(value)
    ? value
    : typeof value === 'object' && value !== null
      ? [value]
      : [];

  if (users.length === 0) return null;

  return (
    <div className="flex items-center gap-1 overflow-hidden">
      {users.slice(0, 3).map((user, i) => {
        const displayName = user.name || user.email || 'Unknown';
        const initial = displayName.charAt(0).toUpperCase();
        return (
          <span key={user.id || user.email || i} className="inline-flex items-center gap-1 shrink-0">
            <span
              className="flex items-center justify-center rounded-full text-white shrink-0"
              style={{
                width: 20,
                height: 20,
                fontSize: 10,
                fontWeight: 600,
                backgroundColor: colors.avatarBg || '#6366F1',
              }}
            >
              {initial}
            </span>
            <span className="text-xs truncate" style={{ color: colors.text, maxWidth: 80 }}>
              {displayName}
            </span>
          </span>
        );
      })}
      {users.length > 3 && (
        <span className="text-[10px] shrink-0" style={{ color: colors.systemText }}>
          +{users.length - 3}
        </span>
      )}
    </div>
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
      return DateCellRenderer;
    case 'Year':
      return YearCellRenderer;
    case 'Time':
      return TimeCellRenderer;
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
      return JsonCellRenderer;
    case 'Barcode':
      return BarcodeCellRenderer;
    case 'Formula':
      return FormulaCellRenderer;
    case 'Links':
      return LinkCellRenderer;
    case 'Lookup':
      return LookupCellRenderer;
    case 'Rollup':
      return RollupCellRenderer;
    case 'Count':
      return RollupCellRenderer;
    case 'Button':
      return ButtonCellRenderer;
    case 'User':
      return UserCellRenderer;
    case 'ID':
    case 'CreatedTime':
    case 'LastModifiedTime':
    case 'AutoNumber':
    case 'CreatedBy':
    case 'LastModifiedBy':
      return SystemCellRenderer;
    default:
      return TextCellRenderer;
  }
}

import React, { useState, useMemo } from 'react';
import { Check, ExternalLink, Copy, Plus, Star, Clock, AlertTriangle, Barcode, FileText, FileSpreadsheet, FileCode, FileArchive, FileVideo, FileAudio, File, FileImage, Presentation } from 'lucide-react';
import AttachmentLightbox from '../AttachmentLightbox';
import type { FieldMeta, SelectChoice, RecordRow } from '@/features/database/types';
import { LookupCellRenderer as SmartLookupCellRenderer, RollupCellRenderer as SmartRollupCellRenderer } from './LookupRollupCellRenderer';
import { SELECT_COLORS } from '@/features/database/types';
import { useDatabaseUI } from '../../lib/store';
import { useGridColors } from '../../hooks/useGridColors';
import { useWorkspaceUsers } from '../../hooks/useWorkspaceUsers';
import { formatDate, formatDateTime } from '@/lib/format';

interface CellRendererProps {
  value: any;
  field: FieldMeta;
  record: RecordRow;
  rowHeight: 'short' | 'medium' | 'tall' | 'extra-tall';
}

function HighlightedText({ text, style, className }: { text: string; style?: React.CSSProperties; className?: string }) {
  const searchQuery = useDatabaseUI((s) => s.searchQuery);
  const colors = useGridColors();
  const regex = useMemo(
    () => searchQuery ? new RegExp(`(${searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi') : null,
    [searchQuery],
  );
  if (!regex) {
    return <span className={className} style={style}>{text}</span>;
  }
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

function getSelectColor(colorName: string) {
  return SELECT_COLORS[colorName] || SELECT_COLORS.grayLight2;
}

const EMAIL_VALID_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const _fmtCache = new Map<string, Intl.NumberFormat>();
function getCurrencyFormatter(code: string, precision: number, narrow: boolean): Intl.NumberFormat {
  const key = `${code}:${precision}:${narrow ? 1 : 0}`;
  let fmt = _fmtCache.get(key);
  if (!fmt) {
    fmt = new Intl.NumberFormat('en-US', {
      style: 'currency', currency: code,
      minimumFractionDigits: precision, maximumFractionDigits: precision,
      ...(narrow ? { currencyDisplay: 'narrowSymbol' } : {}),
    });
    _fmtCache.set(key, fmt);
  }
  return fmt;
}

export const TextCellRenderer = React.memo(function TextCellRenderer({
  value,
  field,
}: CellRendererProps) {
  const colors = useGridColors();
  if (value == null || value === '') return null;
  let text: string;
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    text = value.value ?? value.title ?? value.name ?? value.label ?? value.display_name ?? value.email ?? value.primary ?? JSON.stringify(value);
  } else {
    text = String(value);
    // Handle JSON strings stored as text (e.g. Airtable migration)
    if (text.startsWith('{') && text.includes('"')) {
      try {
        const parsed = JSON.parse(text);
        if (typeof parsed === 'object' && parsed !== null) {
          text = parsed.value ?? parsed.title ?? parsed.name ?? parsed.label ?? parsed.display_name ?? parsed.email ?? parsed.primary ?? text;
        }
      } catch { /* not valid JSON, use as-is */ }
    }
  }

  if (field.ui_type === 'Email') {
    const valid = EMAIL_VALID_RE.test(text);
    if (valid) {
      return (
        <a
          href={`mailto:${text}`}
          className="truncate hover:underline"
          style={{ color: colors.tealText, fontSize: 13 }}
          onClick={(e) => e.stopPropagation()}
        >
          <HighlightedText text={text} className="truncate" style={{ color: colors.tealText }} />
        </a>
      );
    }
    return (
      <span className="truncate flex items-center gap-1">
        <AlertTriangle size={12} className="shrink-0 text-warning" />
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
          className="truncate flex items-center gap-1.5 hover:underline group/url"
          style={{ color: colors.tealText }}
          onClick={(e) => e.stopPropagation()}
          title={text}
        >
          <HighlightedText text={domain} className="truncate" style={{ color: colors.tealText, fontSize: 13 }} />
          <ExternalLink size={11} className="shrink-0 opacity-0 group-hover/url:opacity-100 transition-opacity" />
        </a>
      );
    }
    return (
      <span className="truncate flex items-center gap-1">
        <AlertTriangle size={12} className="shrink-0 text-warning" />
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
          {hasLetters && <AlertTriangle size={12} className="shrink-0 text-warning" />}
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
        {hasLetters && <AlertTriangle size={12} className="shrink-0 text-warning" />}
        <HighlightedText text={text} className="truncate" />
      </span>
    );
  }

  return <HighlightedText text={text} className="truncate" style={{ fontSize: 13 }} />;
});

const LIST_BULLET_RE = /^[•\-*]\s/;
const LIST_NUM_RE = /^\d+\.\s/;
const LIST_ALPHA_RE = /^[a-z]\.\s/;

function renderLongTextLine(line: string, idx: number) {
  if (LIST_BULLET_RE.test(line)) {
    return <div key={idx} style={{ paddingLeft: 12, textIndent: -10 }}>{'• '}{line.replace(LIST_BULLET_RE, '')}</div>;
  }
  if (LIST_NUM_RE.test(line)) {
    const match = line.match(/^(\d+\.)\s/);
    return <div key={idx} style={{ paddingLeft: 16, textIndent: -14 }}><span style={{ fontWeight: 500 }}>{match?.[1]}</span>{' '}{line.replace(LIST_NUM_RE, '')}</div>;
  }
  if (LIST_ALPHA_RE.test(line)) {
    const match = line.match(/^([a-z]\.)\s/);
    return <div key={idx} style={{ paddingLeft: 16, textIndent: -14 }}><span style={{ fontWeight: 500 }}>{match?.[1]}</span>{' '}{line.replace(LIST_ALPHA_RE, '')}</div>;
  }
  return <div key={idx}>{line || ' '}</div>;
}

export const LongTextCellRenderer = React.memo(function LongTextCellRenderer({
  value,
  rowHeight,
}: CellRendererProps) {
  if (value == null || value === '') return null;
  let text: string;
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    text = value.value ?? value.title ?? value.name ?? value.label ?? JSON.stringify(value);
  } else {
    text = String(value);
    if (text.startsWith('{') && text.includes('"')) {
      try {
        const parsed = JSON.parse(text);
        if (typeof parsed === 'object' && parsed !== null) {
          text = parsed.value ?? parsed.title ?? parsed.name ?? parsed.label ?? text;
        }
      } catch { /* not valid JSON */ }
    }
  }
  if (rowHeight === 'short') {
    return <span className="truncate" title={text} style={{ fontSize: 13, lineHeight: '18px' }}>{text}</span>;
  }
  const maxLines = rowHeight === 'tall' ? 3 : rowHeight === 'extra-tall' ? 5 : 2;
  const lines = text.split('\n');
  const hasLists = lines.some((l) => LIST_BULLET_RE.test(l) || LIST_NUM_RE.test(l) || LIST_ALPHA_RE.test(l));
  if (hasLists) {
    return (
      <div
        title={text}
        style={{
          fontSize: 13,
          lineHeight: '18px',
          display: '-webkit-box',
          WebkitLineClamp: maxLines,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {lines.map((line, i) => renderLongTextLine(line, i))}
      </div>
    );
  }
  return (
    <span
      className="whitespace-pre-line"
      title={text}
      style={{
        fontSize: 13,
        lineHeight: '18px',
        display: '-webkit-box',
        WebkitLineClamp: maxLines,
        WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
      }}
    >
      {text}
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
    <span className="truncate block text-right w-full" style={{ fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em', fontSize: 13, color: num < 0 ? '#EF4444' : undefined }}>
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
    <span className="truncate block text-right w-full" style={{ fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em', fontSize: 13, color: num < 0 ? '#EF4444' : undefined }}>
      {num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
    </span>
  );
});

const SYMBOL_TO_ISO: Record<string, string> = {
  '₦': 'NGN', '$': 'USD', '€': 'EUR', '£': 'GBP', '¥': 'JPY', '₹': 'INR',
  '₩': 'KRW', '₽': 'RUB', '₺': 'TRY', '₴': 'UAH', '₸': 'KZT', '₫': 'VND',
  '₵': 'GHS', 'R': 'ZAR', 'Fr': 'CHF', 'kr': 'SEK', 'zł': 'PLN', 'Kč': 'CZK',
};

function resolveISO(raw: string): string {
  const trimmed = raw.trim();
  if (/^[A-Z]{3}$/.test(trimmed)) return trimmed;
  return SYMBOL_TO_ISO[trimmed] ?? 'USD';
}

export const CurrencyCellRenderer = React.memo(function CurrencyCellRenderer({
  value,
  field,
}: CellRendererProps) {
  if (value == null || value === '') return null;
  const num = Number(value);
  if (isNaN(num)) return null;
  const rawCode = field.options?.currencyCode || field.options?.symbol || 'USD';
  const code = resolveISO(rawCode);
  const precision = field.options?.precision ?? 2;
  let formatted: string;
  try {
    formatted = getCurrencyFormatter(code, precision, true).format(num);
  } catch {
    try {
      formatted = getCurrencyFormatter(code, precision, false).format(num);
    } catch {
      formatted = `${rawCode}${num.toLocaleString()}`;
    }
  }
  return (
    <span
      className="truncate block text-right w-full"
      style={{
        fontVariantNumeric: 'tabular-nums',
        color: num < 0 ? '#EF4444' : undefined,
        fontSize: 13,
        letterSpacing: '-0.01em',
      }}
    >
      {formatted}
    </span>
  );
});

export const DateCellRenderer = React.memo(function DateCellRenderer({
  value,
  field,
}: CellRendererProps) {
  const formatted = useMemo(() => {
    if (value == null || value === '') return null;
    try {
      if (field.ui_type === 'DateTime') return formatDateTime(value);
      return formatDate(value);
    } catch {
      return String(value);
    }
  }, [value, field.ui_type]);
  if (formatted == null) return null;
  return (
    <span className="truncate text-foreground" style={{ fontSize: 13, letterSpacing: '-0.01em', fontVariantNumeric: 'tabular-nums' }}>
      {formatted}
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
          className="w-[17px] h-[17px] rounded-[4px] flex items-center justify-center shadow-sm transition-all"
          style={{ backgroundColor: colors.checkboxChecked }}
        >
          <Check size={12} color="#fff" strokeWidth={3} />
        </div>
      ) : (
        <div
          className="w-[17px] h-[17px] rounded-[4px] border-[1.5px] border-[#CBD5E1] dark:border-[hsl(215,12%,32%)] group-hover/row:border-[#94A3B8] dark:group-hover/row:border-[hsl(215,12%,42%)] transition-colors"
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
      title={String(value)}
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
        letterSpacing: '-0.01em',
        fontSize: 12,
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
            title={v}
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

function getFileIcon(type: string, name: string): { Icon: React.ElementType; color: string; bg: string } {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (type === 'application/pdf' || ext === 'pdf')
    return { Icon: FileText, color: '#EF4444', bg: 'rgba(239,68,68,0.1)' };
  if (type.includes('spreadsheet') || type.includes('excel') || ['xlsx', 'xls', 'csv'].includes(ext))
    return { Icon: FileSpreadsheet, color: '#22C55E', bg: 'rgba(34,197,94,0.1)' };
  if (type.includes('presentation') || type.includes('powerpoint') || ['pptx', 'ppt'].includes(ext))
    return { Icon: Presentation, color: '#F97316', bg: 'rgba(249,115,22,0.1)' };
  if (type.includes('word') || type.includes('document') || ['doc', 'docx'].includes(ext))
    return { Icon: FileText, color: '#3B82F6', bg: 'rgba(59,130,246,0.1)' };
  if (type.startsWith('video/') || ['mp4', 'mov', 'avi', 'webm'].includes(ext))
    return { Icon: FileVideo, color: '#A855F7', bg: 'rgba(168,85,247,0.1)' };
  if (type.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'aac'].includes(ext))
    return { Icon: FileAudio, color: '#EC4899', bg: 'rgba(236,72,153,0.1)' };
  if (type.includes('zip') || type.includes('archive') || type.includes('compressed') || ['zip', 'rar', '7z', 'tar', 'gz'].includes(ext))
    return { Icon: FileArchive, color: '#EAB308', bg: 'rgba(234,179,8,0.1)' };
  if (type.includes('json') || type.includes('javascript') || type.includes('xml') || ['js', 'ts', 'json', 'xml', 'html', 'css', 'py'].includes(ext))
    return { Icon: FileCode, color: '#06B6D4', bg: 'rgba(6,182,212,0.1)' };
  if (type.startsWith('image/'))
    return { Icon: FileImage, color: '#8B5CF6', bg: 'rgba(139,92,246,0.1)' };
  return { Icon: File, color: '#6B7280', bg: 'rgba(107,114,128,0.1)' };
}

export const AttachmentCellRenderer = React.memo(function AttachmentCellRenderer({
  value,
}: CellRendererProps) {
  const colors = useGridColors();
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  if (value == null) return null;
  const raw: any[] = Array.isArray(value) ? value : [];
  const files = raw.map((f) => ({
    name: f.name || f.filename || 'file',
    url: f.url || '',
    type: f.type || '',
    size: f.size || 0,
    uploaded_at: f.uploaded_at ?? '',
  }));
  if (files.length === 0) {
    return (
      <span className="flex items-center gap-1 text-xs cursor-pointer" style={{ color: colors.starEmpty }}>
        <Plus size={13} className="shrink-0" />
      </span>
    );
  }
  const isImage = (type: string) => type?.startsWith('image/');
  const asAttachmentMeta = files.map(f => ({ ...f, uploaded_at: f.uploaded_at ?? '' }));
  return (
    <>
      <div className="flex items-center gap-1 h-full overflow-hidden">
        {files.slice(0, 3).map((f, i) =>
          isImage(f.type) ? (
            <span key={i} className="relative group shrink-0">
              <img
                src={f.url}
                alt={f.name}
                className="h-7 w-7 rounded-[4px] object-cover cursor-pointer hover:ring-2 hover:ring-primary transition-all"
                loading="lazy"
                style={{ border: `1px solid ${colors.dropdownBorder}` }}
                title={f.name}
                onClick={(e) => { e.stopPropagation(); setLightboxIndex(i); }}
                onError={(e) => {
                  const img = e.target as HTMLImageElement;
                  const parent = img.parentElement;
                  if (parent) {
                    const { Icon, color, bg } = getFileIcon(f.type, f.name);
                    const fallback = document.createElement('span');
                    fallback.className = 'h-7 w-7 rounded-[4px] flex items-center justify-center shrink-0 cursor-pointer';
                    fallback.style.backgroundColor = bg;
                    fallback.style.border = `1px solid ${colors.dropdownBorder}`;
                    fallback.title = f.name;
                    fallback.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>`;
                    parent.replaceChild(fallback, img);
                  }
                }}
              />
              <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 pointer-events-none">
                <img src={f.url} alt={f.name} className="w-32 h-32 object-cover rounded-lg shadow-xl border border-white/20" />
                <div className="text-3xs text-center mt-1 px-1 truncate max-w-[140px] text-white bg-black/70 rounded" style={{ margin: '0 auto' }}>{f.name}</div>
              </div>
            </span>
          ) : (() => {
            const { Icon, color, bg } = getFileIcon(f.type, f.name);
            return (
              <span key={i} className="relative group shrink-0">
                <span
                  className="h-7 w-7 rounded-[4px] flex items-center justify-center cursor-pointer hover:ring-2 hover:ring-primary transition-all"
                  style={{ backgroundColor: bg, border: `1px solid ${colors.dropdownBorder}` }}
                  title={f.name}
                  onClick={(e) => { e.stopPropagation(); setLightboxIndex(i); }}
                >
                  <Icon size={13} style={{ color }} />
                </span>
                <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 pointer-events-none">
                  <div className="text-3xs text-center px-2 py-1 truncate max-w-[140px] text-white bg-black/80 rounded shadow-lg whitespace-nowrap">{f.name}</div>
                </div>
              </span>
            );
          })(),
        )}
        {files.length > 3 && (
          <span className="text-3xs shrink-0" style={{ color: colors.systemText }}>
            +{files.length - 3}
          </span>
        )}
      </div>
      {lightboxIndex !== null && (
        <AttachmentLightbox
          attachments={asAttachmentMeta}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </>
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
        <Copy size={11} className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
      </span>
    );
  }

  if (field.ui_type === 'CreatedTime' || field.ui_type === 'LastModifiedTime') {
    const formatted = formatDateTime(value);
    return (
      <span className="truncate" style={{ fontSize: 12, color: colors.systemText, fontVariantNumeric: 'tabular-nums' }}>
        {formatted}
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
            width: 20,
            height: 20,
            fontSize: 10,
            fontWeight: 600,
            backgroundColor: colors.avatarBg,
            letterSpacing: '0.02em',
          }}
        >
          {initial}
        </span>
        <span className="truncate" style={{ fontSize: 12, fontWeight: 450 }}>{display}</span>
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
    <span className="truncate text-[#9AA2AF] dark:text-[hsl(220,15%,55%)]">
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
          className={i < rating ? '' : 'stroke-[#D1D5DB] dark:stroke-[hsl(220,15%,35%)]'}
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
  const barColor = num >= 75 ? '#22C55E' : num >= 50 ? '#2563EB' : num >= 25 ? '#F59E0B' : '#EF4444';
  return (
    <div className="flex items-center gap-2.5 w-full">
      <div className="flex-1 rounded-full bg-[#E5E5E5] dark:bg-[hsl(220,15%,20%)] overflow-hidden" style={{ height: 5 }}>
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${Math.min(100, Math.max(0, num))}%`, backgroundColor: barColor }}
        />
      </div>
      <span className="text-xs shrink-0 tabular-nums" style={{ fontSize: 12, letterSpacing: '-0.01em', color: barColor, fontWeight: 500 }}>{num}%</span>
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
    <span className="flex items-center gap-1.5 truncate" style={{ color: colors.muted, fontVariantNumeric: 'tabular-nums', fontSize: 13, letterSpacing: '-0.01em' }}>
      <Clock size={12} className="shrink-0" style={{ color: colors.systemText }} />
      {display}
    </span>
  );
});

export const TimeCellRenderer = React.memo(function TimeCellRenderer({
  value,
}: CellRendererProps) {
  const formatted = useMemo(() => {
    if (value == null || value === '') return null;
    const str = String(value);
    const match = str.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (!match) return str;
    let h = parseInt(match[1], 10);
    const m = match[2];
    const ampm = h >= 12 ? 'PM' : 'AM';
    if (h === 0) h = 12;
    else if (h > 12) h -= 12;
    return `${h}:${m} ${ampm}`;
  }, [value]);
  if (formatted == null) return null;
  return (
    <span className="truncate text-foreground" style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
      {formatted}
    </span>
  );
});

export const YearCellRenderer = React.memo(function YearCellRenderer({
  value,
}: CellRendererProps) {
  if (value == null || value === '') return null;
  return (
    <span className="truncate text-foreground" style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
      {String(value).slice(0, 4)}
    </span>
  );
});


function formatFormulaNumber(val: number, field: FieldMeta): string {
  const resultType = field.options?.result?.type;
  if (resultType === 'currency') {
    const sym = field.options?.result?.options?.symbol ?? '$';
    const code = resolveISO((sym as string).trim());
    const precision = field.options?.result?.options?.precision ?? 0;
    try {
      return getCurrencyFormatter(code, precision, true).format(val);
    } catch {
      try {
        return getCurrencyFormatter(code, precision, false).format(val);
      } catch {
        return `${sym}${val.toLocaleString()}`;
      }
    }
  }
  if (resultType === 'percent') {
    const precision = field.options?.result?.options?.precision ?? 1;
    return `${(val * 100).toFixed(precision)}%`;
  }
  return val.toLocaleString();
}

export const FormulaCellRenderer = React.memo(function FormulaCellRenderer({
  value,
  field,
}: CellRendererProps) {
  const colors = useGridColors();
  if (value == null || value === '') return null;
  if (typeof value === 'string' && (value.startsWith('#ERROR') || value.startsWith('ERROR') || value.startsWith('!ERROR'))) {
    return (
      <span className="truncate font-medium text-xs" style={{ color: '#EF4444' }}>
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
  const numVal = typeof value === 'number' ? value : (typeof value === 'string' && value !== '' && !isNaN(Number(value)) ? Number(value) : null);
  if (numVal !== null) {
    const formatted = formatFormulaNumber(numVal, field);
    return (
      <span className="truncate block text-right w-full" style={{ fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em', fontSize: 13, color: numVal < 0 ? '#EF4444' : undefined }}>
        {formatted}
      </span>
    );
  }
  // Date strings (ISO format)
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    const d = new Date(value);
    if (!isNaN(d.getTime())) {
      return <span className="truncate">{formatDate(value)}</span>;
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
    <span className="truncate font-mono text-2xs" style={{ color: colors.muted }}>
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
  record,
}: CellRendererProps) {
  const colors = useGridColors();
  if (!Array.isArray(value) || value.length === 0) return null;
  const lookup = (record as any)?.__linkLookup as Record<string, string> | undefined;
  return (
    <div className="flex items-center gap-1 overflow-hidden">
      {value.slice(0, 3).map((item: any, i: number) => {
        let label: string;
        if (typeof item === 'object' && item !== null) {
          label = item.title || item.name || item.primary || item.id;
        } else {
          const id = String(item);
          label = (lookup && lookup[id]) || id;
        }
        return (
          <span
            key={i}
            className="inline-flex items-center px-2 rounded-sm text-xs font-medium truncate cursor-pointer hover:opacity-80 transition-opacity"
            title={label}
            style={{
              height: 22,
              lineHeight: '22px',
              backgroundColor: `${colors.primary}18`,
              color: colors.linkText,
              maxWidth: 120,
              border: `1px solid ${colors.primary}30`,
            }}
          >
            {label}
          </span>
        );
      })}
      {value.length > 3 && (
        <span
          className="text-xs shrink-0"
          style={{ color: colors.muted }}
          title={value.slice(3).map((item: any) => {
            if (typeof item === 'object' && item !== null) return item.title || item.name || item.id;
            const id = String(item);
            return (lookup && lookup[id]) || id;
          }).join(', ')}
        >
          +{value.length - 3}
        </span>
      )}
    </div>
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
      className="inline-flex items-center px-3 rounded text-xs font-medium hover:opacity-90 active:scale-[0.97]"
      style={{
        height: 24,
        backgroundColor: '#2D7FF9',
        color: '#FFFFFF',
        cursor: urlTemplate ? 'pointer' : 'default',
        transition: 'opacity 120ms ease, transform 80ms ease',
      }}
    >
      {label}
    </button>
  );
});

export const LastModifiedByCellRenderer = React.memo(function LastModifiedByCellRenderer({
  value,
  record,
}: CellRendererProps) {
  const colors = useGridColors();
  const { data: users = [] } = useWorkspaceUsers();

  // Prefer field value (updated_by), fall back to created_by
  const userId = value ?? record.updated_by ?? record.created_by;
  if (!userId) return null;

  const idStr = String(userId);

  // If the value is an object (email/name), display directly
  if (typeof userId === 'object' && userId !== null) {
    const display = userId.email || userId.name || 'Unknown';
    const initial = display.charAt(0).toUpperCase();
    return (
      <span className="truncate flex items-center gap-1.5" style={{ color: colors.systemText }}>
        <span
          className="shrink-0 flex items-center justify-center rounded-full text-white"
          style={{ width: 18, height: 18, fontSize: 10, fontWeight: 600, backgroundColor: colors.avatarBg }}
        >
          {initial}
        </span>
        <span className="truncate" style={{ fontSize: 12 }}>{display}</span>
      </span>
    );
  }

  // UUID lookup
  const user = users.find((u) => u.id === idStr);
  const display = user ? (user.full_name || user.email) : (idStr.length > 8 ? idStr.slice(0, 8) + '…' : idStr);
  const initial = display.charAt(0).toUpperCase();

  return (
    <span className="truncate flex items-center gap-1.5" style={{ color: colors.systemText }}>
      <span
        className="shrink-0 flex items-center justify-center rounded-full text-white"
        style={{ width: 18, height: 18, fontSize: 10, fontWeight: 600, backgroundColor: colors.avatarBg }}
      >
        {initial}
      </span>
      <span className="truncate" style={{ fontSize: 12 }}>{display}</span>
    </span>
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
        <span className="text-3xs shrink-0" style={{ color: colors.systemText }}>
          +{users.length - 3}
        </span>
      )}
    </div>
  );
});

export interface LinkedTaskValue {
  id?: string;
  title?: string;
}

/** Normalize a Linked Tasks cell value to an array of {id, title}. */
export function normalizeLinkedTasks(value: unknown): LinkedTaskValue[] {
  if (value == null || value === '') return [];
  if (Array.isArray(value)) return value.filter(Boolean) as LinkedTaskValue[];
  if (typeof value === 'object') return [value as LinkedTaskValue];
  return [{ id: String(value), title: String(value) }];
}

export const LinkedTasksCellRenderer = React.memo(function LinkedTasksCellRenderer({
  value,
}: CellRendererProps) {
  const colors = useGridColors();
  const tasks = normalizeLinkedTasks(value);
  if (tasks.length === 0) return null;

  return (
    <div className="flex items-center gap-1 overflow-hidden">
      {tasks.slice(0, 3).map((t, i) => (
        <span
          key={t.id || i}
          className="inline-flex items-center px-2 py-0.5 rounded text-xs shrink-0 truncate"
          style={{
            maxWidth: 140,
            backgroundColor: colors.hoverRow,
            color: colors.text,
            border: `1px solid ${colors.border}`,
          }}
        >
          {t.title || t.id}
        </span>
      ))}
      {tasks.length > 3 && (
        <span className="text-3xs shrink-0" style={{ color: colors.systemText }}>
          +{tasks.length - 3}
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
      return LinksCellRenderer;
    case 'Lookup':
      return SmartLookupCellRenderer as any;
    case 'Rollup':
      return SmartRollupCellRenderer as any;
    case 'Count':
      return SmartRollupCellRenderer as any;
    case 'Button':
      return ButtonCellRenderer;
    case 'User':
      return UserCellRenderer;
    case 'LinkedTasks':
      return LinkedTasksCellRenderer;
    case 'LastModifiedBy':
      return LastModifiedByCellRenderer;
    case 'ID':
    case 'CreatedTime':
    case 'LastModifiedTime':
    case 'AutoNumber':
    case 'CreatedBy':
      return SystemCellRenderer;
    default:
      return TextCellRenderer;
  }
}

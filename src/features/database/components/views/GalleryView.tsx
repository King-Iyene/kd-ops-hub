import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import {
  Plus,
  ChevronLeft,
  ChevronRight,
  Expand,
  Trash2,
  Copy,
  Check,
  Star,
  Image as ImageIcon,
  ChevronDown,
  LayoutGrid,
  Link2,
  Mail,
  Paperclip,
  Database,
} from 'lucide-react';
import type { FieldMeta, RecordRow } from '../../types';
import { PILL_COLORS } from '../../types';

/* ------------------------------------------------------------------ */
/*  Types & constants                                                 */
/* ------------------------------------------------------------------ */

type CardSize = 'small' | 'medium' | 'large';

const CARD_SIZE_CONFIG: Record<CardSize, { minWidth: string; maxFields: number }> = {
  small:  { minWidth: '220px', maxFields: 3 },
  medium: { minWidth: '300px', maxFields: 5 },
  large:  { minWidth: '400px', maxFields: 8 },
};

interface GalleryViewProps {
  fields: FieldMeta[];
  records: RecordRow[];
  totalCount: number;
  isLoading: boolean;
  onCellUpdate: (recordId: string, fieldId: string, value: any) => void;
  onAddRow: () => void;
  onExpandRow?: (record: RecordRow) => void;
  onDeleteRow?: (recordId: string) => void;
  onDuplicateRow?: (record: RecordRow) => void;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function getPillColor(colorName: string) {
  return PILL_COLORS.find((c) => c.name === colorName) || PILL_COLORS[7];
}

function formatDate(val: unknown): string {
  if (!val) return '';
  const d = new Date(val as string);
  if (isNaN(d.getTime())) return String(val);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function extractImageUrl(val: unknown): string | null {
  if (!val) return null;
  if (typeof val === 'string') {
    try {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed) && parsed.length > 0 && parsed[0]?.url) return parsed[0].url;
    } catch {
      if (val.startsWith('http')) return val;
    }
    return null;
  }
  if (Array.isArray(val) && val.length > 0) {
    const first = val[0];
    if (typeof first === 'string' && first.startsWith('http')) return first;
    if (first?.url) return first.url;
    if (first?.signedUrl) return first.signedUrl;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/*  Dropdown                                                          */
/* ------------------------------------------------------------------ */

function Dropdown({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const current = options.find((o) => o.value === value);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md border
          border-[#E7E7E9] dark:border-[hsl(200,25%,18%)] bg-white dark:bg-[hsl(200,30%,12%)]
          text-[#374151] dark:text-[hsl(200,25%,88%)] hover:bg-gray-50 dark:hover:bg-[hsl(200,30%,15%)]
          transition-colors"
      >
        <span className="text-[#9AA2AF] dark:text-[hsl(200,25%,55%)]">{label}:</span>
        <span className="font-medium">{current?.label ?? value}</span>
        <ChevronDown size={12} />
      </button>
      {open && (
        <div
          className="absolute top-full left-0 mt-1 z-50 min-w-[160px] rounded-lg border
            border-[#E7E7E9] dark:border-[hsl(200,25%,18%)] bg-white dark:bg-[hsl(200,30%,12%)]
            shadow-lg py-1"
        >
          {options.map((opt) => (
            <button
              key={opt.value}
              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-[#F3F4F6] dark:hover:bg-[hsl(200,30%,16%)]
                transition-colors ${opt.value === value ? 'text-[#3366FF] font-medium' : 'text-[#374151] dark:text-[hsl(200,25%,88%)]'}`}
              onClick={() => { onChange(opt.value); setOpen(false); }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Field value renderer                                              */
/* ------------------------------------------------------------------ */

function FieldValue({ field, value }: { field: FieldMeta; value: unknown }) {
  const { ui_type } = field;

  if (value === null || value === undefined || value === '') {
    return <span className="text-[#D1D5DB] dark:text-[hsl(200,25%,35%)] italic text-[11px]">Empty</span>;
  }

  // Checkbox
  if (ui_type === 'Checkbox') {
    return value ? (
      <Check size={14} className="text-[#3366FF]" />
    ) : (
      <div className="w-3.5 h-3.5 rounded border border-[#D1D5DB] dark:border-[hsl(200,25%,30%)]" />
    );
  }

  // Rating
  if (ui_type === 'Rating') {
    const max = field.options?.max ?? 5;
    const num = typeof value === 'number' ? value : parseInt(String(value), 10) || 0;
    return (
      <div className="flex gap-0.5">
        {Array.from({ length: max }, (_, i) => (
          <Star
            key={i}
            size={13}
            className={i < num ? 'text-amber-400 fill-amber-400' : 'text-[#D1D5DB] dark:text-[hsl(200,25%,30%)]'}
          />
        ))}
      </div>
    );
  }

  // SingleSelect
  if (ui_type === 'SingleSelect' && value) {
    const choice = field.options?.choices?.find((c) => c.title === value);
    const color = choice ? getPillColor(choice.color) : getPillColor('Gray');
    return (
      <span
        className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium"
        style={{ backgroundColor: color.bg, color: color.text }}
      >
        {String(value)}
      </span>
    );
  }

  // MultiSelect
  if (ui_type === 'MultiSelect') {
    const items: string[] = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',').map((s) => s.trim()) : [];
    return (
      <div className="flex flex-wrap gap-1">
        {items.map((item) => {
          const choice = field.options?.choices?.find((c) => c.title === item);
          const color = choice ? getPillColor(choice.color) : getPillColor('Gray');
          return (
            <span
              key={item}
              className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium"
              style={{ backgroundColor: color.bg, color: color.text }}
            >
              {item}
            </span>
          );
        })}
      </div>
    );
  }

  // Date / DateTime
  if (ui_type === 'Date' || ui_type === 'DateTime' || ui_type === 'CreatedTime' || ui_type === 'LastModifiedTime') {
    return <span className="text-xs text-[#374151] dark:text-[hsl(200,25%,88%)]">{formatDate(value)}</span>;
  }

  // URL
  if (ui_type === 'URL') {
    const str = String(value);
    return (
      <span className="flex items-center gap-1 text-xs text-[#3366FF] truncate">
        <Link2 size={11} className="shrink-0" />
        <span className="truncate">{str.replace(/^https?:\/\//, '').slice(0, 30)}</span>
      </span>
    );
  }

  // Email
  if (ui_type === 'Email') {
    return (
      <span className="flex items-center gap-1 text-xs text-[#3366FF] truncate">
        <Mail size={11} className="shrink-0" />
        <span className="truncate">{String(value)}</span>
      </span>
    );
  }

  // Attachment
  if (ui_type === 'Attachment') {
    const url = extractImageUrl(value);
    if (url) {
      return (
        <div className="flex items-center gap-1.5">
          <img src={url} alt="" className="w-8 h-8 rounded object-cover border border-[#E7E7E9] dark:border-[hsl(200,25%,18%)]" />
          <span className="text-[11px] text-[#6A7184] dark:text-[hsl(200,25%,55%)]">
            {Array.isArray(value) ? `${(value as unknown[]).length} file(s)` : '1 file'}
          </span>
        </div>
      );
    }
    return (
      <span className="flex items-center gap-1 text-xs text-[#6A7184] dark:text-[hsl(200,25%,55%)]">
        <Paperclip size={11} /> Attachment
      </span>
    );
  }

  // Default
  return (
    <span className="text-xs text-[#374151] dark:text-[hsl(200,25%,88%)] line-clamp-2">
      {String(value)}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  GalleryCard                                                       */
/* ------------------------------------------------------------------ */

function GalleryCard({
  record,
  titleField,
  previewFields,
  coverFieldId,
  fields,
  onExpand,
  onDelete,
  onDuplicate,
}: {
  record: RecordRow;
  titleField: FieldMeta | undefined;
  previewFields: FieldMeta[];
  coverFieldId: string | null;
  fields: FieldMeta[];
  onExpand?: (r: RecordRow) => void;
  onDelete?: (id: string) => void;
  onDuplicate?: (r: RecordRow) => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  const coverField = coverFieldId ? fields.find((f) => f.id === coverFieldId) : null;
  const coverUrl = coverField ? extractImageUrl(record[coverField.pg_column_name]) : null;

  return (
    <div
      className="relative bg-white dark:bg-[hsl(200,30%,12%)] rounded-lg border border-[#E7E7E9] dark:border-[hsl(200,25%,18%)]
        overflow-hidden cursor-pointer hover:shadow-md dark:hover:shadow-[0_4px_12px_rgba(0,0,0,0.4)]
        transition-all duration-200 group"
      onClick={() => onExpand?.(record)}
    >
      {/* Cover image */}
      {coverUrl ? (
        <div className="w-full h-36 bg-[#F3F4F6] dark:bg-[hsl(200,30%,8%)] overflow-hidden">
          <img src={coverUrl} alt="" className="w-full h-full object-cover" />
        </div>
      ) : (
        <div className="h-1.5 bg-[#3366FF]/60" />
      )}

      {/* Hover action bar */}
      <div
        className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100
          transition-opacity duration-150 z-10"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          title="Expand"
          className="p-1.5 rounded-md bg-white/90 dark:bg-[hsl(200,30%,15%)]/90 border border-[#E7E7E9] dark:border-[hsl(200,25%,22%)]
            text-[#6A7184] dark:text-[hsl(200,25%,70%)] hover:text-[#3366FF] hover:border-[#3366FF]/30 transition-colors shadow-sm"
          onClick={() => onExpand?.(record)}
        >
          <Expand size={13} />
        </button>
        <button
          title="Duplicate"
          className="p-1.5 rounded-md bg-white/90 dark:bg-[hsl(200,30%,15%)]/90 border border-[#E7E7E9] dark:border-[hsl(200,25%,22%)]
            text-[#6A7184] dark:text-[hsl(200,25%,70%)] hover:text-[#3366FF] hover:border-[#3366FF]/30 transition-colors shadow-sm"
          onClick={() => onDuplicate?.(record)}
        >
          <Copy size={13} />
        </button>
        {confirmDelete ? (
          <button
            title="Confirm delete"
            className="p-1.5 rounded-md bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800
              text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors shadow-sm"
            onClick={() => { onDelete?.(record.id); setConfirmDelete(false); }}
            onMouseLeave={() => setConfirmDelete(false)}
          >
            <Trash2 size={13} />
          </button>
        ) : (
          <button
            title="Delete"
            className="p-1.5 rounded-md bg-white/90 dark:bg-[hsl(200,30%,15%)]/90 border border-[#E7E7E9] dark:border-[hsl(200,25%,22%)]
              text-[#6A7184] dark:text-[hsl(200,25%,70%)] hover:text-red-500 hover:border-red-200 dark:hover:border-red-800 transition-colors shadow-sm"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>

      {/* Card content */}
      <div className="p-4">
        <div className="text-sm font-semibold text-[#374151] dark:text-[hsl(200,25%,90%)] truncate mb-3">
          {titleField ? record[titleField.pg_column_name] ?? (
            <span className="text-[#D1D5DB] dark:text-[hsl(200,25%,35%)] italic font-normal">(empty)</span>
          ) : record.id}
        </div>
        {previewFields.map((f) => (
          <div key={f.id} className="mb-2.5 last:mb-0">
            <div className="text-[10px] font-semibold text-[#9AA2AF] dark:text-[hsl(200,25%,50%)] uppercase tracking-wider mb-0.5">
              {f.name}
            </div>
            <FieldValue field={f} value={record[f.pg_column_name]} />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                    */
/* ------------------------------------------------------------------ */

export default function GalleryView({
  fields,
  records,
  totalCount,
  onAddRow,
  onExpandRow,
  onDeleteRow,
  onDuplicateRow,
  page,
  pageSize,
  onPageChange,
}: GalleryViewProps) {
  const [cardSize, setCardSize] = useState<CardSize>('medium');
  const [coverFieldId, setCoverFieldId] = useState<string | null>(() => {
    const attachmentField = fields.find((f) => f.ui_type === 'Attachment');
    return attachmentField?.id ?? null;
  });

  // Sync default cover field when fields change
  useEffect(() => {
    if (coverFieldId && !fields.find((f) => f.id === coverFieldId)) {
      const attachmentField = fields.find((f) => f.ui_type === 'Attachment');
      setCoverFieldId(attachmentField?.id ?? null);
    }
  }, [fields, coverFieldId]);

  const titleField = useMemo(
    () => fields.find((f) => f.is_primary) ?? fields[0],
    [fields],
  );

  const config = CARD_SIZE_CONFIG[cardSize];

  const previewFields = useMemo(
    () =>
      fields
        .filter((f) => !f.is_primary && !f.is_system && f.ui_type !== 'ID' && f.id !== coverFieldId)
        .sort((a, b) => a.position - b.position)
        .slice(0, config.maxFields),
    [fields, config.maxFields, coverFieldId],
  );

  const coverFieldOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [{ value: '__none__', label: 'None' }];
    fields
      .filter((f) => f.ui_type === 'Attachment')
      .forEach((f) => opts.push({ value: f.id, label: f.name }));
    return opts;
  }, [fields]);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  const handleCoverChange = useCallback((v: string) => {
    setCoverFieldId(v === '__none__' ? null : v);
  }, []);

  return (
    <div className="flex flex-col h-full bg-white dark:bg-[hsl(200,30%,10%)]">
      {/* Toolbar */}
      <div
        className="flex items-center gap-3 px-4 shrink-0 border-b border-[#E7E7E9] dark:border-[hsl(200,25%,18%)]"
        style={{ height: 44 }}
      >
        <LayoutGrid size={14} className="text-[#6A7184] dark:text-[hsl(200,25%,55%)]" />

        {coverFieldOptions.length > 1 && (
          <Dropdown
            label="Cover"
            value={coverFieldId ?? '__none__'}
            options={coverFieldOptions}
            onChange={handleCoverChange}
          />
        )}

        <Dropdown
          label="Size"
          value={cardSize}
          options={[
            { value: 'small', label: 'Small' },
            { value: 'medium', label: 'Medium' },
            { value: 'large', label: 'Large' },
          ]}
          onChange={(v) => setCardSize(v as CardSize)}
        />
      </div>

      {/* Cards grid */}
      <div className="flex-1 overflow-auto p-4">
        {records.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center h-full text-center py-20">
            <div
              className="w-16 h-16 rounded-2xl bg-[#F3F4F6] dark:bg-[hsl(200,30%,14%)] flex items-center justify-center mb-4"
            >
              <Database size={28} className="text-[#D1D5DB] dark:text-[hsl(200,25%,30%)]" />
            </div>
            <h3 className="text-sm font-semibold text-[#374151] dark:text-[hsl(200,25%,88%)] mb-1">
              No records yet
            </h3>
            <p className="text-xs text-[#6A7184] dark:text-[hsl(200,25%,55%)] mb-4 max-w-[260px]">
              Add your first record to see it appear as a card in the gallery.
            </p>
            <button
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#3366FF] hover:bg-[#2952CC] text-white text-xs font-medium transition-colors"
              onClick={onAddRow}
            >
              <Plus size={14} /> Add record
            </button>
          </div>
        ) : (
          <div
            className="grid gap-4"
            style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${config.minWidth}, 1fr))` }}
          >
            {records.map((r) => (
              <GalleryCard
                key={r.id}
                record={r}
                titleField={titleField}
                previewFields={previewFields}
                coverFieldId={coverFieldId}
                fields={fields}
                onExpand={onExpandRow}
                onDelete={onDeleteRow}
                onDuplicate={onDuplicateRow}
              />
            ))}
            <button
              className="flex items-center justify-center gap-1 rounded-lg border-2 border-dashed
                border-[#E7E7E9] dark:border-[hsl(200,25%,18%)] min-h-[140px]
                text-[#9AA2AF] dark:text-[hsl(200,25%,45%)]
                hover:border-[#3366FF] hover:text-[#3366FF] dark:hover:border-[#3366FF] dark:hover:text-[#3366FF]
                transition-colors text-sm"
              onClick={onAddRow}
            >
              <Plus size={14} /> Add record
            </button>
          </div>
        )}
      </div>

      {/* Footer / pagination */}
      <div
        className="flex items-center justify-between px-4 shrink-0 border-t
          border-[#E7E7E9] dark:border-[hsl(200,25%,18%)]
          bg-[#F9F9FA] dark:bg-[hsl(200,30%,8%)]"
        style={{ height: 40, fontSize: 13 }}
      >
        <span className="text-[#6A7184] dark:text-[hsl(200,25%,55%)]">
          {totalCount} record{totalCount !== 1 ? 's' : ''}
        </span>
        <div className="flex items-center gap-2 text-[#6A7184] dark:text-[hsl(200,25%,55%)]">
          <button
            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-[hsl(200,30%,16%)] disabled:opacity-40 transition-colors"
            disabled={page === 0}
            onClick={() => onPageChange(page - 1)}
          >
            <ChevronLeft size={16} />
          </button>
          <span>
            Page {page + 1} of {totalPages}
          </span>
          <button
            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-[hsl(200,30%,16%)] disabled:opacity-40 transition-colors"
            disabled={page >= totalPages - 1}
            onClick={() => onPageChange(page + 1)}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

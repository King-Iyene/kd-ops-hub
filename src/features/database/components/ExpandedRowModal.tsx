import React, { useState, useCallback, useEffect } from 'react';
import { X, ChevronLeft, ChevronRight, Star, MessageSquare, ChevronDown, Paperclip, Link2, Trash2, Clock, Activity } from 'lucide-react';
import { RecordComments } from './RecordComments';
import type { FieldMeta, RecordRow, SelectChoice } from '../types';
import { PILL_COLORS } from '../types';
import { getCellRenderer } from './grid/cell-renderers';
import { getFieldTypeIcon } from './grid/field-icons';
import { AttachmentManager, type AttachmentMeta } from './AttachmentManager';

interface ExpandedRowModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record: RecordRow | null;
  fields: FieldMeta[];
  baseId: string;
  tableId: string;
  onCellUpdate?: (recordId: string, fieldId: string, value: any) => void;
  records?: RecordRow[];
  onNavigate?: (record: RecordRow) => void;
  onDeleteRecord?: (recordId: string) => void;
}

function getPillColor(colorName: string) {
  return PILL_COLORS.find((c) => c.name === colorName) || PILL_COLORS[7];
}

const SYSTEM_TYPES = new Set([
  'ID',
  'CreatedTime',
  'LastModifiedTime',
  'CreatedBy',
  'LastModifiedBy',
]);

function isSystemField(field: FieldMeta): boolean {
  return SYSTEM_TYPES.has(field.ui_type) || !!field.is_system;
}

function isPrimaryField(field: FieldMeta): boolean {
  return !!field.is_primary;
}

function InlineTextEditor({
  value,
  onCommit,
}: {
  value: string;
  onCommit: (v: string) => void;
}) {
  const [text, setText] = useState(value ?? '');
  return (
    <input
      type="text"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => onCommit(text)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onCommit(text);
      }}
      className="w-full px-2 py-1 text-sm rounded border outline-none bg-white dark:bg-[hsl(200,30%,12%)] text-[#374151] dark:text-[hsl(200,25%,88%)] border-[#E7E7E9] dark:border-[hsl(200,25%,18%)] focus:border-[#3366FF]"
    />
  );
}

function InlineLongTextEditor({
  value,
  onCommit,
}: {
  value: string;
  onCommit: (v: string) => void;
}) {
  const [text, setText] = useState(value ?? '');
  return (
    <textarea
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => onCommit(text)}
      rows={4}
      className="w-full px-2 py-1.5 text-sm rounded border outline-none resize-y bg-white dark:bg-[hsl(200,30%,12%)] text-[#374151] dark:text-[hsl(200,25%,88%)] border-[#E7E7E9] dark:border-[hsl(200,25%,18%)] focus:border-[#3366FF]"
    />
  );
}

function InlineNumberEditor({
  value,
  onCommit,
}: {
  value: number | null;
  onCommit: (v: number | null) => void;
}) {
  const [num, setNum] = useState(value != null ? String(value) : '');
  return (
    <input
      type="number"
      value={num}
      onChange={(e) => setNum(e.target.value)}
      onBlur={() => onCommit(num === '' ? null : Number(num))}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onCommit(num === '' ? null : Number(num));
      }}
      className="w-full px-2 py-1 text-sm rounded border outline-none bg-white dark:bg-[hsl(200,30%,12%)] text-[#374151] dark:text-[hsl(200,25%,88%)] border-[#E7E7E9] dark:border-[hsl(200,25%,18%)] focus:border-[#3366FF]"
    />
  );
}

function InlineDateEditor({
  value,
  onCommit,
  showTime,
}: {
  value: string | null;
  onCommit: (v: string | null) => void;
  showTime?: boolean;
}) {
  const initial = value ? new Date(value).toISOString().split('T')[0] : '';
  const [date, setDate] = useState(initial);
  return (
    <input
      type={showTime ? 'datetime-local' : 'date'}
      value={date}
      onChange={(e) => setDate(e.target.value)}
      onBlur={() => onCommit(date || null)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onCommit(date || null);
      }}
      className="w-full px-2 py-1 text-sm rounded border outline-none bg-white dark:bg-[hsl(200,30%,12%)] text-[#374151] dark:text-[hsl(200,25%,88%)] border-[#E7E7E9] dark:border-[hsl(200,25%,18%)] focus:border-[#3366FF]"
    />
  );
}

function InlineCheckboxEditor({
  value,
  onCommit,
}: {
  value: boolean;
  onCommit: (v: boolean) => void;
}) {
  return (
    <input
      type="checkbox"
      checked={!!value}
      onChange={(e) => onCommit(e.target.checked)}
      className="w-4 h-4 accent-[#3366FF] cursor-pointer"
    />
  );
}

function InlineSelectEditor({
  value,
  field,
  onCommit,
}: {
  value: string | null;
  field: FieldMeta;
  onCommit: (v: string | null) => void;
}) {
  const choices: SelectChoice[] = field.options?.choices || [];
  return (
    <div className="flex flex-wrap gap-1.5">
      {choices.map((c) => {
        const color = getPillColor(c.color);
        const isSelected = value === c.title;
        return (
          <button
            key={c.title}
            type="button"
            onClick={() => onCommit(isSelected ? null : c.title)}
            className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium transition-all"
            style={{
              backgroundColor: color.bg,
              color: color.text,
              outline: isSelected ? `2px solid ${color.text}` : 'none',
              outlineOffset: 1,
            }}
          >
            {c.title}
          </button>
        );
      })}
    </div>
  );
}

function InlineMultiSelectEditor({
  value,
  field,
  onCommit,
}: {
  value: string[];
  field: FieldMeta;
  onCommit: (v: string[]) => void;
}) {
  const choices: SelectChoice[] = field.options?.choices || [];
  const selected = Array.isArray(value) ? value : [];

  const toggle = (title: string) => {
    const next = selected.includes(title)
      ? selected.filter((t) => t !== title)
      : [...selected, title];
    onCommit(next);
  };

  return (
    <div className="flex flex-wrap gap-1.5">
      {choices.map((c) => {
        const color = getPillColor(c.color);
        const isSelected = selected.includes(c.title);
        return (
          <button
            key={c.title}
            type="button"
            onClick={() => toggle(c.title)}
            className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium transition-all"
            style={{
              backgroundColor: isSelected ? color.bg : '#F4F4F5',
              color: isSelected ? color.text : '#9AA2AF',
              outline: isSelected ? `2px solid ${color.text}` : 'none',
              outlineOffset: 1,
            }}
          >
            {c.title}
          </button>
        );
      })}
    </div>
  );
}

function InlineRatingEditor({
  value,
  max,
  onCommit,
}: {
  value: number;
  max: number;
  onCommit: (v: number) => void;
}) {
  const rating = typeof value === 'number' ? value : 0;
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: max }, (_, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onCommit(i + 1 === rating ? 0 : i + 1)}
          className="p-0 hover:scale-110 transition-transform"
        >
          <Star
            size={20}
            fill={i < rating ? '#F59E0B' : 'none'}
            stroke={i < rating ? '#F59E0B' : '#D1D5DB'}
            strokeWidth={1.5}
          />
        </button>
      ))}
    </div>
  );
}

function InlineAttachmentEditor({
  value,
  fieldId,
  onCommit,
}: {
  value: AttachmentMeta[];
  fieldId: string;
  onCommit: (v: AttachmentMeta[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const attachments = Array.isArray(value) ? value : [];

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed text-sm transition-colors border-[#E7E7E9] text-[#6A7184] hover:border-[#3366FF] hover:text-[#3366FF] dark:border-[hsl(200,25%,18%)] dark:text-[#9AA2AF] dark:hover:border-[#3366FF] dark:hover:text-[#3366FF]"
      >
        <Paperclip size={14} />
        {attachments.length > 0
          ? `${attachments.length} attachment${attachments.length !== 1 ? 's' : ''} - click to manage`
          : 'Add attachments'}
      </button>
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {attachments.map((att, i) => {
            const isImage = att.type?.startsWith('image/');
            return (
              <div key={i} className="w-12 h-12 rounded border border-[#E7E7E9] dark:border-[hsl(200,25%,18%)] overflow-hidden bg-[#FAFAFA] dark:bg-[hsl(200,30%,12%)]">
                {isImage ? (
                  <img src={att.url} alt={att.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Paperclip size={16} className="text-[#9AA2AF]" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <AttachmentManager
        open={open}
        onOpenChange={setOpen}
        value={attachments}
        onCommit={onCommit}
        storagePath={fieldId}
      />
    </div>
  );
}

/* ── Tooltip wrapper ─────────────────────────────────────────────────── */
function Tooltip({ text, children }: { text: string; children: React.ReactNode }) {
  const [show, setShow] = useState(false);
  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1 px-2 py-1 text-[10px] rounded bg-[#374151] dark:bg-[hsl(200,25%,88%)] text-white dark:text-[hsl(200,30%,10%)] whitespace-nowrap z-50 pointer-events-none shadow">
          {text}
        </span>
      )}
    </span>
  );
}

/* ── Copied-link toast ───────────────────────────────────────────────── */
function CopyLinkButton({ recordId }: { recordId: string }) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('record', recordId);
    navigator.clipboard.writeText(url.toString()).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }, [recordId]);

  return (
    <button
      onClick={copy}
      className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
      title="Copy record link"
    >
      {copied ? (
        <span className="text-[10px] font-medium text-green-600 dark:text-green-400 px-1">Copied!</span>
      ) : (
        <Link2 size={15} className="text-[#6A7184] dark:text-[#9AA2AF]" />
      )}
    </button>
  );
}

/* ── Delete button with confirmation ─────────────────────────────────── */
function DeleteRecordButton({
  onDelete,
}: {
  onDelete: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <div className="flex items-center gap-1">
        <button
          onClick={() => {
            onDelete();
            setConfirming(false);
          }}
          className="px-2 py-1 rounded text-[11px] font-medium bg-red-600 text-white hover:bg-red-700 transition-colors"
        >
          Confirm
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="px-2 py-1 rounded text-[11px] font-medium text-[#6A7184] hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
      title="Delete record"
    >
      <Trash2 size={15} className="text-red-500 dark:text-red-400" />
    </button>
  );
}

/* ── Comments section (sidebar) ──────────────────────────────────────── */
function CommentsSection({ baseId, tableId, recordId }: { baseId: string; tableId: string; recordId: string }) {
  return (
    <div>
      <h3 className="flex items-center gap-1.5 text-[10px] font-semibold text-[#9AA2AF] uppercase tracking-wider mb-3">
        <MessageSquare size={12} />
        Comments
      </h3>
      <div className="max-h-[320px] flex flex-col">
        <RecordComments baseId={baseId} tableId={tableId} recordId={recordId} />
      </div>
    </div>
  );
}

/* ── Activity / Audit trail section ──────────────────────────────────── */
function ActivitySection({ record, fields }: { record: RecordRow; fields: FieldMeta[] }) {
  const createdField = fields.find((f) => f.ui_type === 'CreatedTime');
  const modifiedField = fields.find((f) => f.ui_type === 'LastModifiedTime');

  const createdAt = createdField ? record[createdField.pg_column_name] : null;
  const modifiedAt = modifiedField ? record[modifiedField.pg_column_name] : null;

  const fmt = (v: unknown) => {
    if (!v) return 'Unknown';
    try {
      return new Date(v as string).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
    } catch {
      return String(v);
    }
  };

  return (
    <div>
      <h3 className="flex items-center gap-1.5 text-[10px] font-semibold text-[#9AA2AF] uppercase tracking-wider mb-3">
        <Activity size={12} />
        Activity
      </h3>
      <div className="space-y-3">
        <div className="flex items-start gap-2.5">
          <div className="mt-0.5 w-5 h-5 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center shrink-0">
            <Clock size={10} className="text-green-600 dark:text-green-400" />
          </div>
          <div>
            <p className="text-xs font-medium text-[#374151] dark:text-[hsl(200,25%,88%)]">Record created</p>
            <p className="text-[10px] text-[#9AA2AF]">{fmt(createdAt)}</p>
          </div>
        </div>
        {modifiedAt && modifiedAt !== createdAt && (
          <div className="flex items-start gap-2.5">
            <div className="mt-0.5 w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
              <Clock size={10} className="text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-xs font-medium text-[#374151] dark:text-[hsl(200,25%,88%)]">Last modified</p>
              <p className="text-[10px] text-[#9AA2AF]">{fmt(modifiedAt)}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── System fields accordion ─────────────────────────────────────────── */
function SystemFieldsAccordion({
  fields,
  record,
}: {
  fields: FieldMeta[];
  record: RecordRow;
}) {
  const [expanded, setExpanded] = useState(false);

  if (fields.length === 0) return null;

  return (
    <div className="border-t border-[#E7E7E9] dark:border-[hsl(200,25%,18%)] pt-4">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1.5 text-[10px] font-semibold text-[#9AA2AF] uppercase tracking-wider mb-3 hover:text-[#6A7184] dark:hover:text-[hsl(200,25%,70%)] transition-colors"
      >
        <Clock size={12} />
        System Fields
        <ChevronDown size={12} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>
      {expanded && (
        <div className="grid grid-cols-2 gap-3">
          {fields.map((field) => {
            const val = record[field.pg_column_name];
            const Renderer = getCellRenderer(field.ui_type);
            return (
              <div key={field.id}>
                <label className="block text-[10px] font-medium text-[#9AA2AF] mb-0.5">{field.name}</label>
                <div className="text-xs text-[#6A7184] dark:text-[hsl(200,25%,70%)]">
                  <Renderer value={val} field={field} record={record} rowHeight="default" />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ExpandedRowModal({
  open,
  onOpenChange,
  record,
  fields,
  baseId,
  tableId,
  onCellUpdate,
  records,
  onNavigate,
  onDeleteRecord,
}: ExpandedRowModalProps) {
  const currentIndex = records && record ? records.findIndex((r) => r.id === record.id) : -1;
  const hasPrev = currentIndex > 0;
  const hasNext = records ? currentIndex >= 0 && currentIndex < records.length - 1 : false;

  const goToPrev = useCallback(() => {
    if (hasPrev && records && onNavigate) {
      onNavigate(records[currentIndex - 1]);
    }
  }, [hasPrev, records, onNavigate, currentIndex]);

  const goToNext = useCallback(() => {
    if (hasNext && records && onNavigate) {
      onNavigate(records[currentIndex + 1]);
    }
  }, [hasNext, records, onNavigate, currentIndex]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (!e.altKey) return;
      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        e.preventDefault();
        goToPrev();
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        e.preventDefault();
        goToNext();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, goToPrev, goToNext]);

  if (!open || !record) return null;

  const visibleFields = fields
    .filter((f) => !f.is_hidden && f.ui_type !== 'ID')
    .sort((a, b) => a.position - b.position);

  const primaryFields = visibleFields.filter((f) => isPrimaryField(f) && !isSystemField(f));
  const regularFields = visibleFields.filter((f) => !isPrimaryField(f) && !isSystemField(f));
  const systemFields = visibleFields.filter((f) => isSystemField(f));

  const handleUpdate = (fieldId: string, value: any) => {
    if (onCellUpdate && record) {
      onCellUpdate(record.id, fieldId, value);
    }
  };

  const renderEditor = (field: FieldMeta) => {
    const val = record[field.pg_column_name];

    if (!onCellUpdate) {
      const Renderer = getCellRenderer(field.ui_type);
      return <Renderer value={val} field={field} record={record} rowHeight="default" />;
    }

    switch (field.ui_type) {
      case 'Checkbox':
        return <InlineCheckboxEditor value={!!val} onCommit={(v) => handleUpdate(field.id, v)} />;
      case 'SingleSelect':
        return <InlineSelectEditor value={val as string | null} field={field} onCommit={(v) => handleUpdate(field.id, v)} />;
      case 'MultiSelect':
        return <InlineMultiSelectEditor value={val as string[] ?? []} field={field} onCommit={(v) => handleUpdate(field.id, v)} />;
      case 'Rating':
        return <InlineRatingEditor value={val as number} max={field.options?.max ?? 5} onCommit={(v) => handleUpdate(field.id, v)} />;
      case 'Number':
      case 'Decimal':
      case 'Currency':
      case 'Percent':
        return <InlineNumberEditor value={val as number | null} onCommit={(v) => handleUpdate(field.id, v)} />;
      case 'Date':
        return <InlineDateEditor value={val as string | null} onCommit={(v) => handleUpdate(field.id, v)} />;
      case 'DateTime':
        return <InlineDateEditor value={val as string | null} onCommit={(v) => handleUpdate(field.id, v)} showTime />;
      case 'Attachment':
        return <InlineAttachmentEditor value={val as AttachmentMeta[] ?? []} fieldId={field.id} onCommit={(v) => handleUpdate(field.id, v)} />;
      case 'LongText':
        return <InlineLongTextEditor value={val != null ? String(val) : ''} onCommit={(v) => handleUpdate(field.id, v)} />;
      default:
        return <InlineTextEditor value={val != null ? String(val) : ''} onCommit={(v) => handleUpdate(field.id, v)} />;
    }
  };

  const renderFieldRow = (field: FieldMeta) => {
    const Icon = getFieldTypeIcon(field.ui_type);
    return (
      <div key={field.id}>
        <label className="flex items-center gap-1.5 text-[11px] font-semibold text-[#6A7184] dark:text-[#9AA2AF] uppercase tracking-wider mb-1.5">
          {field.description ? (
            <Tooltip text={field.description}>
              <Icon size={11} className="text-[#9AA2AF]" />
            </Tooltip>
          ) : (
            <Icon size={11} className="text-[#9AA2AF]" />
          )}
          {field.name}
          {field.is_required && <span className="text-red-400">*</span>}
        </label>
        <div className="text-sm text-[#374151] dark:text-[hsl(200,25%,88%)] min-h-[28px] flex items-center">
          {renderEditor(field)}
        </div>
      </div>
    );
  };

  const primaryField = fields.find((f) => f.is_primary);
  const title = primaryField ? record[primaryField.pg_column_name] : record.id;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/30 dark:bg-black/50"
        onClick={() => onOpenChange(false)}
      />
      <div
        className="relative bg-white dark:bg-[hsl(200,30%,10%)] rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col border border-[#E7E7E9] dark:border-[hsl(200,25%,18%)] animate-[panelSlideDown_150ms_ease-out]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#E7E7E9] dark:border-[hsl(200,25%,18%)] shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-sm font-semibold text-[#374151] dark:text-[hsl(200,25%,88%)] truncate">
              {title || 'Untitled'}
            </h2>
            {records && records.length > 0 && currentIndex >= 0 && (
              <div className="flex items-center gap-1 ml-2 shrink-0">
                <button
                  onClick={goToPrev}
                  disabled={!hasPrev}
                  className="p-1 rounded hover:bg-gray-100 dark:hover:bg-white/5 disabled:opacity-30 transition-colors"
                >
                  <ChevronLeft size={16} className="text-[#6A7184] dark:text-[#9AA2AF]" />
                </button>
                <span className="text-xs text-[#9AA2AF] select-none tabular-nums">
                  {currentIndex + 1} / {records.length}
                </span>
                <button
                  onClick={goToNext}
                  disabled={!hasNext}
                  className="p-1 rounded hover:bg-gray-100 dark:hover:bg-white/5 disabled:opacity-30 transition-colors"
                >
                  <ChevronRight size={16} className="text-[#6A7184] dark:text-[#9AA2AF]" />
                </button>
              </div>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <CopyLinkButton recordId={record.id} />
            {onDeleteRecord && (
              <DeleteRecordButton
                onDelete={() => {
                  onDeleteRecord(record.id);
                  onOpenChange(false);
                }}
              />
            )}
            <button
              onClick={() => onOpenChange(false)}
              className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
            >
              <X size={16} className="text-[#6A7184] dark:text-[#9AA2AF]" />
            </button>
          </div>
        </div>

        {/* Body — two-column on lg */}
        <div className="flex-1 overflow-y-auto lg:overflow-hidden flex flex-col lg:flex-row">
          {/* Left: Fields */}
          <div className="flex-1 lg:overflow-y-auto p-5 lg:border-r border-[#E7E7E9] dark:border-[hsl(200,25%,18%)]">
            {/* Primary fields */}
            {primaryFields.length > 0 && (
              <div className="space-y-4 mb-6">
                {primaryFields.map(renderFieldRow)}
              </div>
            )}

            {/* Regular fields */}
            {regularFields.length > 0 && (
              <div className="space-y-4">
                {regularFields.map(renderFieldRow)}
              </div>
            )}

            {/* System fields accordion */}
            {systemFields.length > 0 && (
              <div className="mt-6">
                <SystemFieldsAccordion fields={systemFields} record={record} />
              </div>
            )}
          </div>

          {/* Right: Comments + Activity */}
          <div className="lg:w-[320px] shrink-0 lg:overflow-y-auto p-5 border-t lg:border-t-0 border-[#E7E7E9] dark:border-[hsl(200,25%,18%)]">
            <CommentsSection baseId={baseId} tableId={tableId} recordId={record.id} />
            <div className="mt-6 pt-4 border-t border-[#E7E7E9] dark:border-[hsl(200,25%,18%)]">
              <ActivitySection record={record} fields={fields} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

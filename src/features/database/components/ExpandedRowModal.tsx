import React, { useState, useCallback, useEffect } from 'react';
import { X, ChevronLeft, ChevronRight, Star } from 'lucide-react';
import type { FieldMeta, RecordRow, SelectChoice } from '../types';
import { PILL_COLORS } from '../types';
import { getCellRenderer } from './grid/cell-renderers';
import { getFieldTypeIcon } from './grid/field-icons';

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

export function ExpandedRowModal({
  open,
  onOpenChange,
  record,
  fields,
  onCellUpdate,
  records,
  onNavigate,
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

  const editableFields = visibleFields.filter((f) => !isSystemField(f));
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
      case 'LongText':
        return <InlineLongTextEditor value={val != null ? String(val) : ''} onCommit={(v) => handleUpdate(field.id, v)} />;
      default:
        return <InlineTextEditor value={val != null ? String(val) : ''} onCommit={(v) => handleUpdate(field.id, v)} />;
    }
  };

  const primaryField = fields.find((f) => f.is_primary);
  const title = primaryField ? record[primaryField.pg_column_name] : record.id;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/30"
        onClick={() => onOpenChange(false)}
      />
      <div
        className="relative bg-white dark:bg-[hsl(200,30%,10%)] rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col border border-[#E7E7E9] dark:border-[hsl(200,25%,18%)]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#E7E7E9] dark:border-[hsl(200,25%,18%)]">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-sm font-semibold text-[#374151] dark:text-[hsl(200,25%,88%)] truncate">
              {title || 'Untitled'}
            </h2>
            {records && records.length > 0 && currentIndex >= 0 && (
              <div className="flex items-center gap-1 ml-2 shrink-0">
                <button
                  onClick={goToPrev}
                  disabled={!hasPrev}
                  className="p-1 rounded hover:bg-gray-100 dark:hover:bg-white/5"
                  style={{ opacity: hasPrev ? 1 : 0.3 }}
                >
                  <ChevronLeft size={16} className="text-[#6A7184]" />
                </button>
                <span className="text-xs text-[#9AA2AF] select-none">
                  {currentIndex + 1} of {records.length}
                </span>
                <button
                  onClick={goToNext}
                  disabled={!hasNext}
                  className="p-1 rounded hover:bg-gray-100 dark:hover:bg-white/5"
                  style={{ opacity: hasNext ? 1 : 0.3 }}
                >
                  <ChevronRight size={16} className="text-[#6A7184]" />
                </button>
              </div>
            )}
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-white/5"
          >
            <X size={16} className="text-[#6A7184] dark:text-[#9AA2AF]" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          <div className="space-y-4">
            {editableFields.map((field) => {
              const Icon = getFieldTypeIcon(field.ui_type);
              return (
                <div key={field.id}>
                  <label className="flex items-center gap-1.5 text-[11px] font-semibold text-[#6A7184] dark:text-[#9AA2AF] uppercase tracking-wider mb-1.5">
                    <Icon size={11} className="text-[#9AA2AF]" />
                    {field.name}
                    {field.is_required && <span className="text-red-400">*</span>}
                  </label>
                  <div className="text-sm text-[#374151] dark:text-[hsl(200,25%,88%)] min-h-[28px] flex items-center">
                    {renderEditor(field)}
                  </div>
                  {field.description && (
                    <p className="mt-0.5 text-[10px] text-[#9AA2AF]">{field.description}</p>
                  )}
                </div>
              );
            })}
          </div>

          {/* System fields */}
          {systemFields.length > 0 && (
            <div className="mt-6 pt-4 border-t border-[#E7E7E9] dark:border-[hsl(200,25%,18%)]">
              <h3 className="text-[10px] font-semibold text-[#9AA2AF] uppercase tracking-wider mb-3">System</h3>
              <div className="grid grid-cols-2 gap-3">
                {systemFields.map((field) => {
                  const val = record[field.pg_column_name];
                  const Renderer = getCellRenderer(field.ui_type);
                  return (
                    <div key={field.id}>
                      <label className="block text-[10px] font-medium text-[#9AA2AF] mb-0.5">{field.name}</label>
                      <div className="text-xs text-[#6A7184]">
                        <Renderer value={val} field={field} record={record} rowHeight="default" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Copy, Check, Trash2, X } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import type {
  FieldMeta,
  RecordRow,
  SelectChoice,
} from '@/features/database/types';
import { PILL_COLORS } from '@/features/database/types';
import { useUpdateRecord, useDeleteRecord } from '../hooks';
import { getFieldTypeIcon } from './grid/field-icons';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ExpandedRowModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record: RecordRow | null;
  fields: FieldMeta[];
  baseId: string;
  tableId: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getPillColor(colorName: string) {
  return PILL_COLORS.find((c) => c.name === colorName) || PILL_COLORS[7];
}

function formatDisplayValue(value: any, field: FieldMeta): string {
  if (value == null || value === '') return '';

  switch (field.ui_type) {
    case 'Number':
    case 'Decimal': {
      const n = Number(value);
      return isNaN(n) ? String(value) : n.toLocaleString();
    }
    case 'Currency': {
      const n = Number(value);
      if (isNaN(n)) return String(value);
      const code = field.options?.currencyCode || 'USD';
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: code,
      }).format(n);
    }
    case 'Percent': {
      const n = Number(value);
      return isNaN(n) ? String(value) : `${n}%`;
    }
    case 'Date':
      return new Date(value).toLocaleDateString(undefined, { dateStyle: 'medium' });
    case 'DateTime':
    case 'CreatedTime':
    case 'LastModifiedTime':
      return new Date(value).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
    case 'Checkbox':
      return value ? 'Yes' : 'No';
    default:
      return String(value);
  }
}

function toDateInputValue(value: any): string {
  if (!value) return '';
  try {
    return new Date(value).toISOString().split('T')[0];
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// Saved indicator
// ---------------------------------------------------------------------------

function SavedIndicator({ show }: { show: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs transition-opacity duration-300 ${
        show ? 'opacity-100' : 'opacity-0'
      }`}
      style={{ color: '#059669' }}
    >
      <Check size={12} />
      Saved
    </span>
  );
}

// ---------------------------------------------------------------------------
// Inline editors
// ---------------------------------------------------------------------------

function InlineTextInput({
  value,
  field,
  onSave,
  align = 'left',
  type = 'text',
}: {
  value: any;
  field: FieldMeta;
  onSave: (v: any) => void;
  align?: 'left' | 'right';
  type?: string;
}) {
  const [text, setText] = useState(value ?? '');

  useEffect(() => {
    setText(value ?? '');
  }, [value]);

  const commit = () => {
    const raw = text;
    if (type === 'number') {
      onSave(raw === '' ? null : Number(raw));
    } else {
      onSave(raw);
    }
  };

  return (
    <input
      type={type}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
      className={`w-full rounded-md border px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-[#0D9488] ${
        align === 'right' ? 'text-right' : 'text-left'
      }`}
      style={{
        borderColor: '#E2E8F0',
        color: '#0F172A',
      }}
    />
  );
}

function InlineDateInput({
  value,
  onSave,
}: {
  value: any;
  onSave: (v: any) => void;
}) {
  const [date, setDate] = useState(toDateInputValue(value));

  useEffect(() => {
    setDate(toDateInputValue(value));
  }, [value]);

  return (
    <input
      type="date"
      value={date}
      onChange={(e) => {
        setDate(e.target.value);
        onSave(e.target.value || null);
      }}
      className="w-full rounded-md border px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-[#0D9488]"
      style={{ borderColor: '#E2E8F0', color: '#0F172A' }}
    />
  );
}

function InlineCheckbox({
  value,
  onSave,
}: {
  value: any;
  onSave: (v: any) => void;
}) {
  const checked = Boolean(value);

  return (
    <button
      type="button"
      onClick={() => onSave(!checked)}
      className="flex items-center gap-2"
    >
      <div
        className={`w-5 h-5 rounded flex items-center justify-center ${
          checked ? '' : 'border-2'
        }`}
        style={
          checked
            ? { backgroundColor: '#0D9488' }
            : { borderColor: '#94A3B8' }
        }
      >
        {checked && <Check size={14} color="#fff" strokeWidth={3} />}
      </div>
      <span className="text-sm" style={{ color: '#0F172A' }}>
        {checked ? 'Checked' : 'Unchecked'}
      </span>
    </button>
  );
}

function InlineSingleSelect({
  value,
  field,
  onSave,
}: {
  value: any;
  field: FieldMeta;
  onSave: (v: any) => void;
}) {
  const choices = field.options?.choices || [];

  return (
    <select
      value={value ?? ''}
      onChange={(e) => onSave(e.target.value || null)}
      className="w-full rounded-md border px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-[#0D9488]"
      style={{ borderColor: '#E2E8F0', color: '#0F172A' }}
    >
      <option value="">-- None --</option>
      {choices.map((c: SelectChoice) => (
        <option key={c.title} value={c.title}>
          {c.title}
        </option>
      ))}
    </select>
  );
}

function InlineMultiSelect({
  value,
  field,
  onSave,
}: {
  value: any;
  field: FieldMeta;
  onSave: (v: any) => void;
}) {
  const choices = field.options?.choices || [];
  const selected: string[] = Array.isArray(value) ? value : [];

  const toggle = (title: string) => {
    const next = selected.includes(title)
      ? selected.filter((s) => s !== title)
      : [...selected, title];
    onSave(next);
  };

  return (
    <div className="flex flex-wrap gap-1.5">
      {choices.map((c: SelectChoice) => {
        const color = getPillColor(c.color);
        const isActive = selected.includes(c.title);
        return (
          <button
            key={c.title}
            type="button"
            onClick={() => toggle(c.title)}
            className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium transition-opacity ${
              isActive ? 'opacity-100' : 'opacity-40'
            }`}
            style={{ backgroundColor: color.bg, color: color.text }}
          >
            {c.title}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Field row
// ---------------------------------------------------------------------------

function FieldRow({
  field,
  value,
  onSave,
  savedFieldId,
}: {
  field: FieldMeta;
  value: any;
  onSave: (v: any) => void;
  savedFieldId: string | null;
}) {
  const Icon = getFieldTypeIcon(field.ui_type);
  const isSystem = field.is_system;

  const renderEditor = () => {
    if (isSystem) {
      return (
        <span className="text-sm" style={{ color: '#94A3B8' }}>
          {formatDisplayValue(value, field)}
        </span>
      );
    }

    switch (field.ui_type) {
      case 'Number':
      case 'Decimal':
      case 'Percent':
        return (
          <InlineTextInput value={value} field={field} onSave={onSave} type="number" align="right" />
        );
      case 'Currency':
        return (
          <InlineTextInput value={value} field={field} onSave={onSave} type="number" align="right" />
        );
      case 'Date':
      case 'DateTime':
        return <InlineDateInput value={value} onSave={onSave} />;
      case 'Checkbox':
        return <InlineCheckbox value={value} onSave={onSave} />;
      case 'SingleSelect':
        return <InlineSingleSelect value={value} field={field} onSave={onSave} />;
      case 'MultiSelect':
        return <InlineMultiSelect value={value} field={field} onSave={onSave} />;
      default:
        return <InlineTextInput value={value} field={field} onSave={onSave} />;
    }
  };

  return (
    <div
      className="flex items-start gap-4 border-b px-4 py-3"
      style={{ borderColor: '#E2E8F0' }}
    >
      <div className="w-[180px] shrink-0 flex items-center gap-1.5 pt-1.5">
        <Icon size={14} style={{ color: '#94A3B8' }} />
        <span
          className="text-xs font-medium uppercase tracking-wider truncate"
          style={{ color: '#475569' }}
        >
          {field.name}
        </span>
        <SavedIndicator show={savedFieldId === field.id} />
      </div>
      <div className="flex-1 min-w-0">{renderEditor()}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ExpandedRowModal({
  open,
  onOpenChange,
  record,
  fields,
  baseId,
  tableId,
}: ExpandedRowModalProps) {
  const updateRecord = useUpdateRecord();
  const deleteRecord = useDeleteRecord();
  const [savedFieldId, setSavedFieldId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState(false);

  // Clear saved indicator after a delay
  useEffect(() => {
    if (!savedFieldId) return;
    const t = setTimeout(() => setSavedFieldId(null), 1500);
    return () => clearTimeout(t);
  }, [savedFieldId]);

  useEffect(() => {
    if (!copiedId) return;
    const t = setTimeout(() => setCopiedId(false), 1500);
    return () => clearTimeout(t);
  }, [copiedId]);

  const sortedFields = useMemo(() => {
    return [...fields].sort((a, b) => a.position - b.position);
  }, [fields]);

  const regularFields = useMemo(
    () => sortedFields.filter((f) => !f.is_system),
    [sortedFields],
  );

  const systemFields = useMemo(
    () => sortedFields.filter((f) => f.is_system),
    [sortedFields],
  );

  const primaryField = useMemo(
    () => fields.find((f) => f.is_primary),
    [fields],
  );

  const primaryValue = record && primaryField
    ? record[primaryField.pg_column_name] ?? 'Untitled'
    : 'Untitled';

  const handleSave = useCallback(
    (field: FieldMeta, value: any) => {
      if (!record) return;
      updateRecord.mutate(
        {
          baseId,
          tableId,
          recordId: record.id,
          field: field.pg_column_name,
          value,
        },
        {
          onSuccess: () => setSavedFieldId(field.id),
        },
      );
    },
    [record, baseId, tableId, updateRecord],
  );

  const handleDelete = useCallback(() => {
    if (!record) return;
    const confirmed = window.confirm(
      'Are you sure you want to delete this record? This action cannot be undone.',
    );
    if (!confirmed) return;
    deleteRecord.mutate(
      { baseId, tableId, recordId: record.id },
      {
        onSuccess: () => onOpenChange(false),
      },
    );
  }, [record, baseId, tableId, deleteRecord, onOpenChange]);

  const handleCopyId = useCallback(() => {
    if (!record) return;
    navigator.clipboard.writeText(record.id);
    setCopiedId(true);
  }, [record]);

  if (!record) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full max-w-[640px] p-0 flex flex-col overflow-hidden bg-white"
      >
        {/* Header */}
        <SheetHeader className="px-4 py-4 border-b" style={{ borderColor: '#E2E8F0' }}>
          <div className="flex items-center justify-between">
            <SheetTitle
              className="text-lg font-semibold truncate"
              style={{ color: '#0F172A' }}
            >
              {String(primaryValue)}
            </SheetTitle>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="p-1 rounded hover:bg-gray-100"
            >
              <X size={18} style={{ color: '#64748B' }} />
            </button>
          </div>

          {/* Record ID */}
          <div className="flex items-center gap-1.5 mt-1">
            <span className="text-xs" style={{ color: '#94A3B8' }}>
              ID: {record.id}
            </span>
            <button
              type="button"
              onClick={handleCopyId}
              className="p-0.5 rounded hover:bg-gray-100"
              title="Copy record ID"
            >
              {copiedId ? (
                <Check size={12} style={{ color: '#059669' }} />
              ) : (
                <Copy size={12} style={{ color: '#94A3B8' }} />
              )}
            </button>
          </div>
        </SheetHeader>

        {/* Fields */}
        <div className="flex-1 overflow-y-auto">
          {/* Regular fields */}
          {regularFields.map((field) => (
            <FieldRow
              key={field.id}
              field={field}
              value={record[field.pg_column_name]}
              onSave={(v) => handleSave(field, v)}
              savedFieldId={savedFieldId}
            />
          ))}

          {/* System fields */}
          {systemFields.length > 0 && (
            <>
              <div
                className="px-4 py-2 mt-2"
                style={{ backgroundColor: '#F8FAFC' }}
              >
                <span
                  className="text-xs font-medium uppercase tracking-wider"
                  style={{ color: '#94A3B8' }}
                >
                  System
                </span>
              </div>
              {systemFields.map((field) => (
                <FieldRow
                  key={field.id}
                  field={field}
                  value={record[field.pg_column_name]}
                  onSave={() => {}}
                  savedFieldId={savedFieldId}
                />
              ))}
            </>
          )}
        </div>

        {/* Footer */}
        <div
          className="px-4 py-3 border-t flex items-center justify-between"
          style={{ borderColor: '#E2E8F0' }}
        >
          <span className="text-xs" style={{ color: '#94A3B8' }}>
            Created {new Date(record.created_at).toLocaleString(undefined, {
              dateStyle: 'medium',
              timeStyle: 'short',
            })}
            {' | '}
            Updated {new Date(record.updated_at).toLocaleString(undefined, {
              dateStyle: 'medium',
              timeStyle: 'short',
            })}
          </span>
          <button
            type="button"
            onClick={handleDelete}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium hover:bg-red-50 transition-colors"
            style={{ color: '#DC2626' }}
          >
            <Trash2 size={14} />
            Delete Record
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

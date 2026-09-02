import React, { useState, useCallback } from 'react';
import { X } from 'lucide-react';
import type { FieldMeta, RecordRow, SelectChoice } from '../types';
import { PILL_COLORS } from '../types';
import { getCellRenderer } from './grid/cell-renderers';

interface ExpandedRowModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record: RecordRow | null;
  fields: FieldMeta[];
  baseId: string;
  tableId: string;
  onCellUpdate?: (recordId: string, fieldId: string, value: any) => void;
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
    <select
      value={value ?? ''}
      onChange={(e) => onCommit(e.target.value || null)}
      className="w-full px-2 py-1 text-sm rounded border outline-none bg-white dark:bg-[hsl(200,30%,12%)] text-[#374151] dark:text-[hsl(200,25%,88%)] border-[#E7E7E9] dark:border-[hsl(200,25%,18%)] focus:border-[#3366FF]"
    >
      <option value="">--</option>
      {choices.map((c) => (
        <option key={c.title} value={c.title}>
          {c.title}
        </option>
      ))}
    </select>
  );
}

export function ExpandedRowModal({
  open,
  onOpenChange,
  record,
  fields,
  onCellUpdate,
}: ExpandedRowModalProps) {
  if (!open || !record) return null;

  const visibleFields = fields
    .filter((f) => !f.is_hidden && f.ui_type !== 'ID')
    .sort((a, b) => a.position - b.position);

  const handleUpdate = (fieldId: string, value: any) => {
    if (onCellUpdate && record) {
      onCellUpdate(record.id, fieldId, value);
    }
  };

  const renderField = (field: FieldMeta) => {
    const val = record[field.pg_column_name];
    const system = isSystemField(field);

    if (system || !onCellUpdate) {
      const Renderer = getCellRenderer(field.ui_type);
      return (
        <Renderer
          value={val}
          field={field}
          record={record}
          rowHeight="default"
        />
      );
    }

    switch (field.ui_type) {
      case 'Checkbox':
        return (
          <InlineCheckboxEditor
            value={!!val}
            onCommit={(v) => handleUpdate(field.id, v)}
          />
        );
      case 'SingleSelect':
        return (
          <InlineSelectEditor
            value={val as string | null}
            field={field}
            onCommit={(v) => handleUpdate(field.id, v)}
          />
        );
      default:
        return (
          <InlineTextEditor
            value={val != null ? String(val) : ''}
            onCommit={(v) => handleUpdate(field.id, v)}
          />
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/30"
        onClick={() => onOpenChange(false)}
      />
      <div
        className="relative bg-white dark:bg-[hsl(200,30%,10%)] rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-hidden flex flex-col border border-[#E7E7E9] dark:border-[hsl(200,25%,18%)]"
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#E7E7E9] dark:border-[hsl(200,25%,18%)]">
          <h2 className="text-sm font-semibold text-[#374151] dark:text-[hsl(200,25%,88%)]">
            Record Detail
          </h2>
          <button
            onClick={() => onOpenChange(false)}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-white/5"
          >
            <X size={16} className="text-[#6A7184] dark:text-[#9AA2AF]" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {visibleFields.map((field) => (
            <div key={field.id}>
              <label className="block text-[11px] font-semibold text-[#6A7184] dark:text-[#9AA2AF] uppercase tracking-wider mb-1">
                {field.name}
              </label>
              <div className="text-sm text-[#374151] dark:text-[hsl(200,25%,88%)] min-h-[28px] flex items-center">
                {renderField(field)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

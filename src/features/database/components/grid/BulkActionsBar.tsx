import React, { useState, useCallback, useRef, useEffect } from 'react';
import { X, Copy, Trash2, Download, Pencil, ChevronDown } from 'lucide-react';
import type { FieldMeta, RecordRow } from '@/features/database/types';

export interface BulkActionsBarProps {
  selectedRowIds: Set<string>;
  records: RecordRow[];
  fields: FieldMeta[];
  totalCount: number;
  onClearSelection: () => void;
  onSelectAll: () => void;
  onBulkDelete?: (recordIds: string[]) => void;
  onCellUpdate: (recordId: string, fieldId: string, value: any) => void;
}

export function BulkActionsBar({
  selectedRowIds,
  records,
  fields,
  totalCount,
  onClearSelection,
  onSelectAll,
  onBulkDelete,
  onCellUpdate,
}: BulkActionsBarProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showUpdateField, setShowUpdateField] = useState(false);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [updateValue, setUpdateValue] = useState('');
  const [copyFeedback, setCopyFeedback] = useState(false);
  const updateRef = useRef<HTMLDivElement>(null);

  const count = selectedRowIds.size;
  const allSelected = count === records.length && records.length === totalCount;

  // Close update dropdown on outside click
  useEffect(() => {
    if (!showUpdateField) return;
    const handler = (e: MouseEvent) => {
      if (updateRef.current && !updateRef.current.contains(e.target as Node)) {
        setShowUpdateField(false);
        setSelectedFieldId(null);
        setUpdateValue('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showUpdateField]);

  const selectedRecords = records.filter((r) => selectedRowIds.has(r.id));

  const editableFields = fields.filter(
    (f) => !f.is_system && !f.is_primary && !f.is_hidden,
  );

  const handleCopy = useCallback(() => {
    const visibleFields = fields.filter((f) => !f.is_hidden).sort((a, b) => a.position - b.position);
    const header = visibleFields.map((f) => f.name).join('\t');
    const rows = selectedRecords.map((r) =>
      visibleFields
        .map((f) => {
          const val = r[f.pg_column_name];
          if (val == null) return '';
          if (Array.isArray(val)) return val.join(', ');
          if (typeof val === 'object') return JSON.stringify(val);
          return String(val);
        })
        .join('\t'),
    );
    navigator.clipboard.writeText([header, ...rows].join('\n')).catch(() => {});
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 1500);
  }, [selectedRecords, fields]);

  const handleDelete = useCallback(() => {
    if (!onBulkDelete) return;
    onBulkDelete(Array.from(selectedRowIds));
    onClearSelection();
    setShowDeleteConfirm(false);
  }, [selectedRowIds, onBulkDelete, onClearSelection]);

  const handleBulkUpdate = useCallback(() => {
    if (!selectedFieldId) return;
    const field = fields.find((f) => f.id === selectedFieldId);
    if (!field) return;

    let parsedValue: any = updateValue;
    const uiType = field.ui_type;
    if (['Number', 'Decimal', 'Currency', 'Percent', 'Rating', 'Duration'].includes(uiType)) {
      parsedValue = parseFloat(updateValue);
      if (isNaN(parsedValue)) parsedValue = null;
    } else if (uiType === 'Checkbox') {
      parsedValue = ['true', '1', 'yes'].includes(updateValue.toLowerCase());
    }

    for (const id of selectedRowIds) {
      onCellUpdate(id, field.id, parsedValue);
    }
    setShowUpdateField(false);
    setSelectedFieldId(null);
    setUpdateValue('');
  }, [selectedFieldId, updateValue, selectedRowIds, fields, onCellUpdate]);

  const handleExportCSV = useCallback(() => {
    const visibleFields = fields.filter((f) => !f.is_hidden).sort((a, b) => a.position - b.position);

    const escape = (val: string) => {
      if (val.includes(',') || val.includes('"') || val.includes('\n')) {
        return '"' + val.replace(/"/g, '""') + '"';
      }
      return val;
    };

    const header = visibleFields.map((f) => escape(f.name)).join(',');
    const rows = selectedRecords.map((r) =>
      visibleFields
        .map((f) => {
          const val = r[f.pg_column_name];
          if (val == null) return '';
          if (Array.isArray(val)) return escape(val.join(', '));
          if (typeof val === 'object') return escape(JSON.stringify(val));
          return escape(String(val));
        })
        .join(','),
    );

    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `export-${count}-rows.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [selectedRecords, fields, count]);

  return (
    <div
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl border shadow-lg backdrop-blur-sm"
      style={{
        animation: 'bulkBarSlideUp 200ms ease-out',
        backgroundColor: 'var(--bulk-bar-bg, #fff)',
        borderColor: 'var(--bulk-bar-border, #E7E7E9)',
      }}
    >
      <style>{`
        @keyframes bulkBarSlideUp {
          from { opacity: 0; transform: translate(-50%, 12px); }
          to   { opacity: 1; transform: translate(-50%, 0); }
        }
        :root {
          --bulk-bar-bg: #fff;
          --bulk-bar-border: #E7E7E9;
          --bulk-bar-text: #374151;
          --bulk-bar-muted: #6A7184;
          --bulk-bar-hover: #F4F4F5;
          --bulk-bar-accent: #3366FF;
          --bulk-bar-accent-hover: #2952CC;
          --bulk-bar-danger: #EF4444;
          --bulk-bar-danger-hover: #DC2626;
          --bulk-bar-dropdown-bg: #fff;
        }
        :root:not([data-theme="light"]) {
          @media (prefers-color-scheme: dark) {
            --bulk-bar-bg: hsl(200, 30%, 12%);
            --bulk-bar-border: hsl(200, 25%, 18%);
            --bulk-bar-text: hsl(200, 25%, 88%);
            --bulk-bar-muted: hsl(200, 15%, 55%);
            --bulk-bar-hover: hsl(200, 25%, 16%);
            --bulk-bar-dropdown-bg: hsl(200, 30%, 12%);
          }
        }
        [data-theme="dark"] {
          --bulk-bar-bg: hsl(200, 30%, 12%);
          --bulk-bar-border: hsl(200, 25%, 18%);
          --bulk-bar-text: hsl(200, 25%, 88%);
          --bulk-bar-muted: hsl(200, 15%, 55%);
          --bulk-bar-hover: hsl(200, 25%, 16%);
          --bulk-bar-dropdown-bg: hsl(200, 30%, 12%);
        }
      `}</style>

      {/* Selection count */}
      <span
        className="text-[13px] font-medium whitespace-nowrap"
        style={{ color: 'var(--bulk-bar-text)' }}
      >
        {count} row{count !== 1 ? 's' : ''} selected
      </span>

      {!allSelected && (
        <button
          className="text-[12px] font-medium whitespace-nowrap hover:underline"
          style={{ color: 'var(--bulk-bar-accent)' }}
          onClick={onSelectAll}
        >
          Select all
        </button>
      )}

      {/* Divider */}
      <div
        className="w-px h-5 mx-1"
        style={{ backgroundColor: 'var(--bulk-bar-border)' }}
      />

      {/* Copy */}
      <button
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-medium transition-colors"
        style={{ color: 'var(--bulk-bar-text)' }}
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bulk-bar-hover)')}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
        onClick={handleCopy}
      >
        <Copy size={14} />
        {copyFeedback ? 'Copied!' : 'Copy'}
      </button>

      {/* Export CSV */}
      <button
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-medium transition-colors"
        style={{ color: 'var(--bulk-bar-text)' }}
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bulk-bar-hover)')}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
        onClick={handleExportCSV}
      >
        <Download size={14} />
        Export
      </button>

      {/* Update field */}
      <div className="relative" ref={updateRef}>
        <button
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-medium transition-colors"
          style={{ color: 'var(--bulk-bar-text)' }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bulk-bar-hover)')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          onClick={() => setShowUpdateField((v) => !v)}
        >
          <Pencil size={14} />
          Update field
          <ChevronDown size={12} />
        </button>

        {showUpdateField && (
          <div
            className="absolute bottom-full left-0 mb-2 rounded-lg border shadow-lg p-3 min-w-[240px]"
            style={{
              backgroundColor: 'var(--bulk-bar-dropdown-bg)',
              borderColor: 'var(--bulk-bar-border)',
            }}
          >
            <label
              className="block text-[11px] font-medium mb-1"
              style={{ color: 'var(--bulk-bar-muted)' }}
            >
              Field
            </label>
            <select
              className="w-full border rounded-md px-2 py-1.5 text-[13px] mb-2"
              style={{
                borderColor: 'var(--bulk-bar-border)',
                backgroundColor: 'var(--bulk-bar-bg)',
                color: 'var(--bulk-bar-text)',
              }}
              value={selectedFieldId ?? ''}
              onChange={(e) => {
                setSelectedFieldId(e.target.value || null);
                setUpdateValue('');
              }}
            >
              <option value="">Select a field...</option>
              {editableFields.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>

            {selectedFieldId && (
              <>
                <label
                  className="block text-[11px] font-medium mb-1"
                  style={{ color: 'var(--bulk-bar-muted)' }}
                >
                  Value
                </label>
                {(() => {
                  const field = fields.find((f) => f.id === selectedFieldId);
                  if (!field) return null;

                  if (field.ui_type === 'Checkbox') {
                    return (
                      <select
                        className="w-full border rounded-md px-2 py-1.5 text-[13px] mb-2"
                        style={{
                          borderColor: 'var(--bulk-bar-border)',
                          backgroundColor: 'var(--bulk-bar-bg)',
                          color: 'var(--bulk-bar-text)',
                        }}
                        value={updateValue}
                        onChange={(e) => setUpdateValue(e.target.value)}
                      >
                        <option value="">Select...</option>
                        <option value="true">Checked</option>
                        <option value="false">Unchecked</option>
                      </select>
                    );
                  }

                  if (field.ui_type === 'SingleSelect' && field.options?.choices) {
                    return (
                      <select
                        className="w-full border rounded-md px-2 py-1.5 text-[13px] mb-2"
                        style={{
                          borderColor: 'var(--bulk-bar-border)',
                          backgroundColor: 'var(--bulk-bar-bg)',
                          color: 'var(--bulk-bar-text)',
                        }}
                        value={updateValue}
                        onChange={(e) => setUpdateValue(e.target.value)}
                      >
                        <option value="">Select...</option>
                        {field.options.choices!.map((c) => (
                          <option key={c.title} value={c.title}>
                            {c.title}
                          </option>
                        ))}
                      </select>
                    );
                  }

                  return (
                    <input
                      type={
                        ['Number', 'Decimal', 'Currency', 'Percent', 'Rating', 'Duration'].includes(field.ui_type)
                          ? 'number'
                          : 'text'
                      }
                      className="w-full border rounded-md px-2 py-1.5 text-[13px] mb-2"
                      style={{
                        borderColor: 'var(--bulk-bar-border)',
                        backgroundColor: 'var(--bulk-bar-bg)',
                        color: 'var(--bulk-bar-text)',
                      }}
                      placeholder="Enter value..."
                      value={updateValue}
                      onChange={(e) => setUpdateValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleBulkUpdate();
                      }}
                    />
                  );
                })()}

                <button
                  className="w-full py-1.5 rounded-md text-[12px] font-medium text-white transition-colors"
                  style={{ backgroundColor: 'var(--bulk-bar-accent)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bulk-bar-accent-hover)')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--bulk-bar-accent)')}
                  onClick={handleBulkUpdate}
                >
                  Update {count} row{count !== 1 ? 's' : ''}
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Divider */}
      <div
        className="w-px h-5 mx-1"
        style={{ backgroundColor: 'var(--bulk-bar-border)' }}
      />

      {/* Delete */}
      <div className="relative">
        {!showDeleteConfirm ? (
          <button
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-medium transition-colors"
            style={{ color: 'var(--bulk-bar-danger)' }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bulk-bar-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            onClick={() => setShowDeleteConfirm(true)}
          >
            <Trash2 size={14} />
            Delete
          </button>
        ) : (
          <div className="flex items-center gap-1.5">
            <span className="text-[12px]" style={{ color: 'var(--bulk-bar-danger)' }}>
              Delete {count}?
            </span>
            <button
              className="px-2 py-1 rounded-md text-[11px] font-medium text-white"
              style={{ backgroundColor: 'var(--bulk-bar-danger)' }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bulk-bar-danger-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--bulk-bar-danger)')}
              onClick={handleDelete}
            >
              Confirm
            </button>
            <button
              className="px-2 py-1 rounded-md text-[11px] font-medium"
              style={{ color: 'var(--bulk-bar-muted)' }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bulk-bar-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              onClick={() => setShowDeleteConfirm(false)}
            >
              No
            </button>
          </div>
        )}
      </div>

      {/* Divider */}
      <div
        className="w-px h-5 mx-1"
        style={{ backgroundColor: 'var(--bulk-bar-border)' }}
      />

      {/* Clear selection */}
      <button
        className="flex items-center justify-center w-6 h-6 rounded-md transition-colors"
        style={{ color: 'var(--bulk-bar-muted)' }}
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bulk-bar-hover)')}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
        onClick={onClearSelection}
        title="Clear selection"
      >
        <X size={14} />
      </button>
    </div>
  );
}

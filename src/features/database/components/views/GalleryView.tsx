import React from 'react';
import { Plus, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import type { FieldMeta, RecordRow, SelectChoice } from '@/features/database/types';
import { PILL_COLORS } from '@/features/database/types';

interface GalleryViewProps {
  fields: FieldMeta[];
  records: RecordRow[];
  totalCount: number;
  isLoading: boolean;
  onCellUpdate: (recordId: string, fieldId: string, value: any) => void;
  onAddRow: () => void;
  onExpandRow?: (record: RecordRow) => void;
  onDeleteRow?: (recordId: string) => void;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

function getPillColor(colorName: string) {
  return (
    PILL_COLORS.find((c) => c.name.toLowerCase() === colorName.toLowerCase()) ??
    PILL_COLORS[7] // Gray fallback
  );
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '';
  try {
    return new Date(value).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return String(value);
  }
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '';
  try {
    return new Date(value).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return String(value);
  }
}

function SelectPill({ label, color }: { label: string; color: string }) {
  const pill = getPillColor(color);
  return (
    <span
      className="inline-block rounded-full px-2 py-0.5 text-xs font-medium mr-1 mb-1"
      style={{ backgroundColor: pill.bg, color: pill.text }}
    >
      {label}
    </span>
  );
}

function CellValue({
  field,
  value,
}: {
  field: FieldMeta;
  value: any;
}) {
  if (value == null || value === '') {
    return <span className="text-[#9AA2AF] text-sm italic">Empty</span>;
  }

  switch (field.ui_type) {
    case 'Checkbox':
      return (
        <span className="text-sm">
          {value ? (
            <svg width="16" height="16" viewBox="0 0 16 16" className="inline-block text-[#3366FF]">
              <rect x="1" y="1" width="14" height="14" rx="3" fill="currentColor" />
              <path d="M4.5 8L7 10.5L11.5 5.5" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 16 16" className="inline-block text-[#9AA2AF]">
              <rect x="1" y="1" width="14" height="14" rx="3" fill="none" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          )}
        </span>
      );

    case 'SingleSelect': {
      const choices = field.options?.choices ?? [];
      const choice = choices.find((c: SelectChoice) => c.title === value);
      return <SelectPill label={String(value)} color={choice?.color ?? 'Gray'} />;
    }

    case 'MultiSelect': {
      const choices = field.options?.choices ?? [];
      const values = Array.isArray(value) ? value : [];
      return (
        <div className="flex flex-wrap">
          {values.map((v: string) => {
            const choice = choices.find((c: SelectChoice) => c.title === v);
            return <SelectPill key={v} label={v} color={choice?.color ?? 'Gray'} />;
          })}
        </div>
      );
    }

    case 'Date':
    case 'CreatedTime':
      return <span className="text-sm text-[#374151]">{formatDate(value)}</span>;

    case 'DateTime':
    case 'LastModifiedTime':
      return <span className="text-sm text-[#374151]">{formatDateTime(value)}</span>;

    default:
      return (
        <span className="text-sm text-[#374151] line-clamp-2">
          {String(value)}
        </span>
      );
  }
}

function SkeletonCard() {
  return (
    <div className="bg-white border border-[#E7E7E9] rounded-lg p-4 animate-pulse">
      <div className="h-5 bg-[#E7E7E9] rounded w-3/4 mb-4" />
      <div className="space-y-3">
        <div>
          <div className="h-3 bg-[#E7E7E9] rounded w-1/3 mb-1" />
          <div className="h-4 bg-[#E7E7E9] rounded w-2/3" />
        </div>
        <div>
          <div className="h-3 bg-[#E7E7E9] rounded w-1/4 mb-1" />
          <div className="h-4 bg-[#E7E7E9] rounded w-1/2" />
        </div>
        <div>
          <div className="h-3 bg-[#E7E7E9] rounded w-1/3 mb-1" />
          <div className="h-4 bg-[#E7E7E9] rounded w-3/5" />
        </div>
      </div>
      <div className="mt-4 pt-3 border-t border-[#E7E7E9]">
        <div className="h-3 bg-[#E7E7E9] rounded w-1/3" />
      </div>
    </div>
  );
}

function GalleryView({
  fields,
  records,
  totalCount,
  isLoading,
  onCellUpdate: _onCellUpdate,
  onAddRow,
  onExpandRow,
  onDeleteRow: _onDeleteRow,
  page,
  pageSize,
  onPageChange,
}: GalleryViewProps) {
  const visibleFields = fields.filter((f) => !f.is_system && !f.is_hidden);
  const primaryField = visibleFields.find((f) => f.is_primary) ?? visibleFields[0];
  const bodyFields = visibleFields
    .filter((f) => f.id !== primaryField?.id)
    .slice(0, 6);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const startRecord = (page - 1) * pageSize + 1;
  const endRecord = Math.min(page * pageSize, totalCount);

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        </div>
        <div className="flex items-center justify-center py-3 border-t border-[#E7E7E9] bg-[#F9F9FA]">
          <Loader2 className="w-4 h-4 animate-spin text-[#9AA2AF] mr-2" />
          <span className="text-sm text-[#9AA2AF]">Loading records...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {records.map((record) => {
            const primaryValue = primaryField
              ? record[primaryField.pg_column_name]
              : record.id;

            return (
              <div
                key={record.id}
                className="bg-white border border-[#E7E7E9] rounded-lg shadow-sm hover:shadow-md transition-shadow cursor-pointer flex flex-col"
                onClick={() => onExpandRow?.(record)}
              >
                {/* Header */}
                <div className="px-4 pt-4 pb-2 border-b border-[#E7E7E9]">
                  <h3 className="font-semibold text-[#374151] text-sm truncate">
                    {primaryValue != null && primaryValue !== ''
                      ? String(primaryValue)
                      : 'Untitled'}
                  </h3>
                </div>

                {/* Body */}
                <div className="px-4 py-3 flex-1 space-y-2.5">
                  {bodyFields.map((field) => (
                    <div key={field.id}>
                      <div className="text-xs text-[#9AA2AF] mb-0.5 truncate">
                        {field.name}
                      </div>
                      <CellValue
                        field={field}
                        value={record[field.pg_column_name]}
                      />
                    </div>
                  ))}
                </div>

                {/* Footer */}
                <div className="px-4 py-2 border-t border-[#E7E7E9]">
                  <span className="text-xs text-[#9AA2AF]">
                    {formatDate(record.created_at)}
                  </span>
                </div>
              </div>
            );
          })}

          {/* Add Record Card */}
          <button
            onClick={onAddRow}
            className="border-2 border-dashed border-[#E7E7E9] rounded-lg flex flex-col items-center justify-center min-h-[200px] hover:border-[#3366FF] hover:text-[#3366FF] text-[#9AA2AF] transition-colors cursor-pointer bg-transparent"
          >
            <Plus className="w-8 h-8 mb-2" />
            <span className="text-sm font-medium">Add Record</span>
          </button>
        </div>
      </div>

      {/* Pagination Footer */}
      <div className="flex items-center justify-between px-4 py-2 border-t border-[#E7E7E9] bg-[#F9F9FA] text-sm">
        <span className="text-[#9AA2AF]">
          {totalCount === 0
            ? 'No records'
            : `${startRecord}-${endRecord} of ${totalCount} records`}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            className="p-1 rounded hover:bg-[#E7E7E9] disabled:opacity-30 disabled:cursor-not-allowed text-[#374151]"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="px-2 text-[#374151]">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            className="p-1 rounded hover:bg-[#E7E7E9] disabled:opacity-30 disabled:cursor-not-allowed text-[#374151]"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default GalleryView;

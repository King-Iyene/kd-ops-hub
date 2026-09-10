import React from 'react';
import { ArrowRight, Inbox } from 'lucide-react';
import { useRecordHistory } from '../hooks/useRecordHistory';
import type { FieldMeta } from '../types';

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const seconds = Math.floor((now - then) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

function resolveFieldName(key: string, fields: FieldMeta[]): string {
  const field = fields.find((f) => f.pg_column_name === key || f.id === key);
  return field?.name ?? key;
}

function formatValue(val: unknown): string {
  if (val == null) return '(empty)';
  if (Array.isArray(val)) {
    if (val.length > 0 && typeof val[0] === 'object' && val[0]?.name) {
      return val.map((a: any) => a.name).join(', ');
    }
    return val.map(v => typeof v === 'object' ? JSON.stringify(v) : String(v)).join(', ');
  }
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}

function countChangedFields(oldVal: Record<string, any> | null, newVal: Record<string, any> | null): number {
  const allKeys = new Set([...Object.keys(oldVal ?? {}), ...Object.keys(newVal ?? {})]);
  let count = 0;
  for (const k of allKeys) {
    if (k.startsWith('nc_') || k === 'id' || k === 'created_at' || k === 'updated_at') continue;
    if (oldVal?.[k] !== newVal?.[k]) count++;
  }
  return count;
}

function DiffView({
  oldValue,
  newValue,
  fields,
}: {
  oldValue: Record<string, any> | null;
  newValue: Record<string, any> | null;
  fields: FieldMeta[];
}) {
  const allKeys = new Set([
    ...Object.keys(oldValue ?? {}),
    ...Object.keys(newValue ?? {}),
  ]);

  // Filter out internal keys
  const keys = Array.from(allKeys).filter(
    (k) => !k.startsWith('nc_') && k !== 'id' && k !== 'created_at' && k !== 'updated_at',
  );

  if (keys.length === 0) {
    return <span className="text-[11px] text-[#9AA2AF] italic">No field changes recorded</span>;
  }

  return (
    <div className="space-y-1.5 mt-1.5">
      {keys.map((key) => {
        const oldVal = oldValue?.[key];
        const newVal = newValue?.[key];
        if (oldVal === newVal) return null;
        const name = resolveFieldName(key, fields);
        return (
          <div key={key} className="text-[11px]">
            <span className="font-medium text-[#6A7184] dark:text-[#9AA2AF]">{name}</span>
            <div className="flex items-start gap-1 mt-0.5 flex-wrap">
              {oldVal != null && (
                <span className="inline-block px-1.5 py-0.5 rounded bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 line-through break-all">
                  {formatValue(oldVal)}
                </span>
              )}
              <ArrowRight size={10} className="text-[#9AA2AF] mt-1 shrink-0" />
              {newVal != null && (
                <span className="inline-block px-1.5 py-0.5 rounded bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 break-all">
                  {formatValue(newVal)}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function actionColor(action: string) {
  switch (action) {
    case 'INSERT':
      return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400';
    case 'UPDATE':
      return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400';
    case 'DELETE':
      return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400';
    default:
      return 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400';
  }
}

interface RecordHistoryPanelProps {
  baseId: string;
  tableId: string;
  recordId: string;
  fields: FieldMeta[];
}

export function RecordHistoryPanel({ baseId, tableId, recordId, fields }: RecordHistoryPanelProps) {
  const { data: entries, isLoading, error } = useRecordHistory(baseId, tableId, recordId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="w-5 h-5 border-2 border-[#2D7FF9] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-xs text-red-500 py-4 text-center">
        Failed to load history
      </p>
    );
  }

  if (!entries || entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <Inbox size={28} className="text-[#D1D5DB] dark:text-[hsl(200,20%,30%)] mb-2" />
        <p className="text-[13px] font-medium text-[#6A7184] dark:text-[#9AA2AF]">No history available</p>
        <p className="text-[11px] text-[#9AA2AF] dark:text-[hsl(200,20%,50%)] mt-1">
          Changes to this record will appear here
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {entries.map((entry, i) => (
        <div
          key={entry.id}
          className={`relative pl-6 pb-4 ${i < entries.length - 1 ? 'border-l-2 border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] ml-2' : 'ml-2'}`}
        >
          {/* Timeline dot */}
          <div className="absolute -left-[5px] top-0.5 w-2.5 h-2.5 rounded-full bg-[#2D7FF9] border-2 border-white dark:border-[hsl(200,30%,10%)]" />

          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${actionColor(entry.action)}`}>
                {entry.action}
              </span>
              <span className="text-[10px] text-[#9AA2AF]" title={new Date(entry.created_at).toLocaleString()}>
                {timeAgo(entry.created_at)}
              </span>
              {entry.action === 'UPDATE' && (() => {
                const n = countChangedFields(entry.old_value, entry.new_value);
                return n > 0 ? (
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-500 dark:text-blue-400">
                    {n} field{n !== 1 ? 's' : ''}
                  </span>
                ) : null;
              })()}
            </div>

            {entry.user_email && (
              <p className="text-[11px] text-[#6A7184] dark:text-[#9AA2AF]">{entry.user_email}</p>
            )}

            {entry.action === 'UPDATE' && (
              <DiffView oldValue={entry.old_value} newValue={entry.new_value} fields={fields} />
            )}

            {entry.action === 'INSERT' && entry.new_value && (
              <DiffView oldValue={null} newValue={entry.new_value} fields={fields} />
            )}

            {entry.action === 'DELETE' && entry.old_value && (
              <DiffView oldValue={entry.old_value} newValue={null} fields={fields} />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

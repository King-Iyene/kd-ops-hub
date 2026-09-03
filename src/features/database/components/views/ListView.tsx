import { useMemo, useCallback } from 'react';
import { ChevronRight, Plus, Image as ImageIcon } from 'lucide-react';
import type { FieldMeta, RecordRow } from '../../types';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ListViewProps {
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
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Return the first image URL found in an attachment field value. */
function getFirstImageUrl(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  for (const item of value) {
    if (item && typeof item === 'object' && typeof item.url === 'string') {
      const ext = (item.name ?? item.url ?? '').toLowerCase();
      if (/\.(jpg|jpeg|png|gif|webp|svg|bmp|avif)/.test(ext) || item.type?.startsWith('image/')) {
        return item.url;
      }
    }
  }
  return null;
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-1 p-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="h-14 rounded-lg animate-pulse bg-gray-100 dark:bg-[hsl(200,25%,13%)]"
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function ListView({
  fields,
  records,
  totalCount,
  isLoading,
  onAddRow,
  onExpandRow,
  page,
  pageSize,
  onPageChange,
}: ListViewProps) {
  const primaryField = useMemo(
    () => fields.find((f) => f.is_primary) ?? fields[0],
    [fields],
  );

  const secondaryField = useMemo(
    () =>
      fields.find(
        (f) =>
          f.id !== primaryField?.id &&
          !['Attachment', 'Checkbox'].includes(f.ui_type),
      ) ?? null,
    [fields, primaryField],
  );

  const attachmentField = useMemo(
    () => fields.find((f) => f.ui_type === 'Attachment') ?? null,
    [fields],
  );

  const handleClick = useCallback(
    (record: RecordRow) => {
      onExpandRow?.(record);
    },
    [onExpandRow],
  );

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  if (isLoading && records.length === 0) return <ListSkeleton />;

  return (
    <div className="flex flex-col h-full">
      {/* List body */}
      <div className="flex-1 overflow-y-auto p-4">
        <ul className="flex flex-col gap-1 max-w-2xl mx-auto">
          {records.map((record) => {
            const primaryValue = record.cells?.[primaryField?.id ?? ''];
            const secondaryValue = secondaryField
              ? record.cells?.[secondaryField.id]
              : null;
            const coverUrl = attachmentField
              ? getFirstImageUrl(record.cells?.[attachmentField.id])
              : null;

            return (
              <li key={record.id}>
                <button
                  type="button"
                  onClick={() => handleClick(record)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left
                    hover:bg-gray-50 dark:hover:bg-[hsl(200,25%,13%)]
                    border border-transparent hover:border-gray-200 dark:hover:border-[hsl(200,25%,18%)]
                    transition-colors group"
                >
                  {/* Optional cover thumbnail */}
                  {coverUrl ? (
                    <div className="w-10 h-10 rounded-md overflow-hidden shrink-0 bg-gray-100 dark:bg-[hsl(200,25%,15%)]">
                      <img
                        src={coverUrl}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ) : attachmentField ? (
                    <div className="w-10 h-10 rounded-md shrink-0 bg-gray-100 dark:bg-[hsl(200,25%,15%)] flex items-center justify-center">
                      <ImageIcon size={16} className="text-[#9AA2AF] dark:text-[hsl(200,20%,55%)]" />
                    </div>
                  ) : null}

                  {/* Text content */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-[#111827] dark:text-[hsl(200,25%,88%)] truncate">
                      {primaryValue != null && primaryValue !== ''
                        ? String(primaryValue)
                        : 'Untitled'}
                    </div>
                    {secondaryValue != null && secondaryValue !== '' && (
                      <div className="text-xs text-[#6A7184] dark:text-[hsl(200,20%,55%)] truncate mt-0.5">
                        {String(secondaryValue)}
                      </div>
                    )}
                  </div>

                  {/* Expand chevron */}
                  <ChevronRight
                    size={16}
                    className="text-[#9AA2AF] dark:text-[hsl(200,20%,55%)] opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                  />
                </button>
              </li>
            );
          })}

          {/* Add row button */}
          <li>
            <button
              type="button"
              onClick={onAddRow}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-[#9AA2AF] dark:text-[hsl(200,20%,55%)]
                hover:bg-gray-50 dark:hover:bg-[hsl(200,25%,13%)] hover:text-[#6A7184] dark:hover:text-[hsl(200,20%,70%)]
                transition-colors"
            >
              <Plus size={14} />
              New record
            </button>
          </li>
        </ul>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-2 border-t border-gray-200 dark:border-[hsl(200,25%,18%)] text-xs text-[#6A7184] dark:text-[hsl(200,20%,55%)]">
          <span>
            {(page - 1) * pageSize + 1}&#8211;{Math.min(page * pageSize, totalCount)} of {totalCount}
          </span>
          <div className="flex items-center gap-1">
            <button
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
              className="px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-[hsl(200,25%,15%)] disabled:opacity-40"
            >
              Prev
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
              className="px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-[hsl(200,25%,15%)] disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

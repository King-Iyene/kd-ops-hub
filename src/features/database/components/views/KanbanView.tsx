import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { Plus, GripVertical, MoreHorizontal, ChevronRight, ChevronDown } from 'lucide-react';
import type { FieldMeta, RecordRow } from '../../types';
import { PILL_COLORS } from '../../types';
import { getCellRenderer } from '../grid/cell-renderers';

interface KanbanViewProps {
  fields: FieldMeta[];
  records: RecordRow[];
  totalCount: number;
  isLoading: boolean;
  onCellUpdate: (recordId: string, fieldId: string, value: any) => void;
  onAddRow: (record?: Record<string, any>) => void;
  onExpandRow?: (record: RecordRow) => void;
  onDeleteRow?: (recordId: string) => void;
}

const CARDS_PER_PAGE = 20;

function getPillColor(colorName: string) {
  return PILL_COLORS.find((c) => c.name === colorName) || PILL_COLORS[7];
}

/** Extract the first image URL from an Attachment field value. */
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

function KanbanSkeleton() {
  return (
    <div className="flex gap-3 p-4 h-full overflow-x-auto">
      {Array.from({ length: 4 }).map((_, colIdx) => (
        <div
          key={colIdx}
          className="flex flex-col shrink-0 rounded-lg overflow-hidden bg-gray-100 dark:bg-[hsl(200,28%,13%)]"
          style={{ width: 280 }}
        >
          <div className="h-9 px-3 flex items-center border-b border-gray-200 dark:border-[hsl(200,25%,18%)]">
            <div className="h-3 w-20 rounded animate-pulse bg-gray-200 dark:bg-[hsl(200,25%,15%)]" />
          </div>
          <div className="flex-1 p-2 space-y-2">
            {Array.from({ length: 3 }).map((_, cardIdx) => (
              <div
                key={cardIdx}
                className="h-16 rounded-md animate-pulse bg-gray-200 dark:bg-[hsl(200,25%,15%)]"
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function KanbanView({
  fields,
  records,
  isLoading,
  onCellUpdate,
  onAddRow,
  onExpandRow,
}: KanbanViewProps) {
  const groupField = useMemo(
    () => fields.find((f) => f.ui_type === 'SingleSelect'),
    [fields],
  );

  const titleField = useMemo(
    () => fields.find((f) => f.is_primary) ?? fields[0],
    [fields],
  );

  const attachmentField = useMemo(
    () => fields.find((f) => f.ui_type === 'Attachment'),
    [fields],
  );

  const previewFields = useMemo(
    () =>
      fields
        .filter(
          (f) =>
            !f.is_primary &&
            !f.is_system &&
            f.ui_type !== 'ID' &&
            f.ui_type !== 'SingleSelect' &&
            f.ui_type !== 'Attachment',
        )
        .slice(0, 3),
    [fields],
  );

  const choices = useMemo(() => {
    const opts = groupField?.options?.choices ?? [];
    return [{ title: 'Uncategorized', color: 'Gray' }, ...opts];
  }, [groupField]);

  const grouped = useMemo(() => {
    const map = new Map<string, RecordRow[]>();
    for (const c of choices) map.set(c.title, []);
    for (const r of records) {
      const val = groupField
        ? (r[groupField.pg_column_name] ?? 'Uncategorized')
        : 'Uncategorized';
      const list = map.get(val) ?? map.get('Uncategorized')!;
      list.push(r);
    }
    return map;
  }, [records, groupField, choices]);

  const [dragRecordId, setDragRecordId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [addingInCol, setAddingInCol] = useState<string | null>(null);
  const [newCardTitle, setNewCardTitle] = useState('');
  const newCardRef = useRef<HTMLInputElement>(null);

  // Collapsed columns
  const [collapsedCols, setCollapsedCols] = useState<Set<string>>(new Set());
  const toggleCollapse = useCallback((colTitle: string) => {
    setCollapsedCols((prev) => {
      const next = new Set(prev);
      if (next.has(colTitle)) next.delete(colTitle);
      else next.add(colTitle);
      return next;
    });
  }, []);

  // Column action menus
  const [menuOpenCol, setMenuOpenCol] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Stacking limit — per-column expansion
  const [expandedCols, setExpandedCols] = useState<Set<string>>(new Set());
  const toggleExpanded = useCallback((colTitle: string) => {
    setExpandedCols((prev) => {
      const next = new Set(prev);
      if (next.has(colTitle)) next.delete(colTitle);
      else next.add(colTitle);
      return next;
    });
  }, []);

  // Rename state
  const [renamingCol, setRenamingCol] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const renameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (addingInCol) newCardRef.current?.focus();
  }, [addingInCol]);

  useEffect(() => {
    if (renamingCol) renameRef.current?.focus();
  }, [renamingCol]);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpenCol) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpenCol(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpenCol]);

  const handleAddCard = useCallback(
    (colTitle: string) => {
      const title = newCardTitle.trim();
      if (!title || !titleField || !groupField) {
        setAddingInCol(null);
        setNewCardTitle('');
        return;
      }
      const record: Record<string, any> = {
        [titleField.pg_column_name]: title,
      };
      if (colTitle !== 'Uncategorized') {
        record[groupField.pg_column_name] = colTitle;
      }
      onAddRow(record);
      setAddingInCol(null);
      setNewCardTitle('');
    },
    [newCardTitle, titleField, groupField, onAddRow],
  );

  const handleRenameSubmit = useCallback(
    (oldTitle: string) => {
      const newTitle = renameText.trim();
      if (!newTitle || newTitle === oldTitle || !groupField) {
        setRenamingCol(null);
        setRenameText('');
        return;
      }
      // Update all records in this column to the new value
      const colRecords = grouped.get(oldTitle) ?? [];
      for (const r of colRecords) {
        onCellUpdate(r.id, groupField.id, newTitle);
      }
      setRenamingCol(null);
      setRenameText('');
    },
    [renameText, groupField, grouped, onCellUpdate],
  );

  const handleDeleteColumn = useCallback(
    (colTitle: string) => {
      if (!groupField || colTitle === 'Uncategorized') return;
      // Move all records to Uncategorized
      const colRecords = grouped.get(colTitle) ?? [];
      for (const r of colRecords) {
        onCellUpdate(r.id, groupField.id, null);
      }
      setMenuOpenCol(null);
    },
    [groupField, grouped, onCellUpdate],
  );

  const handleDragStart = useCallback((recordId: string) => {
    setDragRecordId(recordId);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, colTitle: string) => {
    e.preventDefault();
    setDropTarget(colTitle);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDropTarget(null);
  }, []);

  const handleDrop = useCallback(
    (colTitle: string) => {
      if (dragRecordId && groupField) {
        const newValue = colTitle === 'Uncategorized' ? null : colTitle;
        onCellUpdate(dragRecordId, groupField.id, newValue);
      }
      setDragRecordId(null);
      setDropTarget(null);
    },
    [dragRecordId, groupField, onCellUpdate],
  );

  if (isLoading && records.length === 0) {
    return <KanbanSkeleton />;
  }

  if (!groupField) {
    return (
      <div className="flex items-center justify-center h-64 text-sm kanban-muted-text">
        Add a Single Select field to use Kanban view
      </div>
    );
  }

  return (
    <>
      <style>{`
        .kanban-root {
          --kanban-bg: #F9F9FA;
          --kanban-card-bg: #ffffff;
          --kanban-border: #E7E7E9;
          --kanban-text: #374151;
          --kanban-muted: #6A7184;
          --kanban-subtle: #9AA2AF;
          --kanban-primary: #3366FF;
          --kanban-primary-hover: #2952CC;
          --kanban-empty-border: #D1D5DB;
          --kanban-card-shadow: 0 1px 2px rgba(0,0,0,0.06);
          --kanban-card-shadow-hover: 0 4px 12px rgba(0,0,0,0.1);
          --kanban-collapsed-bg: #F3F4F6;
        }
        @media (prefers-color-scheme: dark) {
          :root:not([data-theme="light"]) .kanban-root {
            --kanban-bg: hsl(200,30%,12%);
            --kanban-card-bg: hsl(200,28%,14%);
            --kanban-border: hsl(200,25%,18%);
            --kanban-text: hsl(200,25%,88%);
            --kanban-muted: hsl(200,20%,60%);
            --kanban-subtle: hsl(200,15%,50%);
            --kanban-primary: #5588FF;
            --kanban-primary-hover: #3366FF;
            --kanban-empty-border: hsl(200,20%,25%);
            --kanban-card-shadow: 0 1px 2px rgba(0,0,0,0.3);
            --kanban-card-shadow-hover: 0 4px 12px rgba(0,0,0,0.4);
            --kanban-collapsed-bg: hsl(200,28%,13%);
          }
        }
        :root[data-theme="dark"] .kanban-root {
          --kanban-bg: hsl(200,30%,12%);
          --kanban-card-bg: hsl(200,28%,14%);
          --kanban-border: hsl(200,25%,18%);
          --kanban-text: hsl(200,25%,88%);
          --kanban-muted: hsl(200,20%,60%);
          --kanban-subtle: hsl(200,15%,50%);
          --kanban-primary: #5588FF;
          --kanban-primary-hover: #3366FF;
          --kanban-empty-border: hsl(200,20%,25%);
          --kanban-card-shadow: 0 1px 2px rgba(0,0,0,0.3);
          --kanban-card-shadow-hover: 0 4px 12px rgba(0,0,0,0.4);
          --kanban-collapsed-bg: hsl(200,28%,13%);
        }
        .kanban-muted-text { color: var(--kanban-muted); }
      `}</style>
      <div className="kanban-root flex gap-3 p-4 h-full overflow-x-auto">
        {choices.map((col) => {
          const items = grouped.get(col.title) ?? [];
          const color = getPillColor(col.color);
          const isOver = dropTarget === col.title;
          const isCollapsed = collapsedCols.has(col.title);
          const isExpanded = expandedCols.has(col.title);
          const visibleItems = isExpanded ? items : items.slice(0, CARDS_PER_PAGE);
          const hiddenCount = items.length - visibleItems.length;

          if (isCollapsed) {
            return (
              <div
                key={col.title}
                className="flex flex-col items-center shrink-0 rounded-lg cursor-pointer transition-all"
                style={{
                  width: 44,
                  backgroundColor: 'var(--kanban-collapsed-bg)',
                  border: `1px solid var(--kanban-border)`,
                  minHeight: 200,
                }}
                onClick={() => toggleCollapse(col.title)}
                onDragOver={(e) => handleDragOver(e, col.title)}
                onDragLeave={handleDragLeave}
                onDrop={() => handleDrop(col.title)}
              >
                <div
                  className="w-full rounded-t-lg flex items-center justify-center py-2"
                  style={{ backgroundColor: color.bg }}
                >
                  <ChevronRight size={14} style={{ color: color.text }} />
                </div>
                <div
                  className="flex items-center justify-center rounded-full text-[10px] font-bold mt-2"
                  style={{
                    width: 22,
                    height: 22,
                    backgroundColor: color.bg,
                    color: color.text,
                  }}
                >
                  {items.length}
                </div>
                <div
                  className="mt-3 text-[11px] font-semibold"
                  style={{
                    writingMode: 'vertical-rl',
                    textOrientation: 'mixed',
                    color: color.text,
                    maxHeight: 140,
                    overflow: 'hidden',
                  }}
                >
                  {col.title}
                </div>
              </div>
            );
          }

          return (
            <div
              key={col.title}
              className="flex flex-col shrink-0 rounded-lg overflow-hidden transition-shadow"
              style={{
                width: 280,
                backgroundColor: 'var(--kanban-bg)',
                border: isOver
                  ? `2px solid var(--kanban-primary)`
                  : `1px solid var(--kanban-border)`,
              }}
              onDragOver={(e) => handleDragOver(e, col.title)}
              onDragLeave={handleDragLeave}
              onDrop={() => handleDrop(col.title)}
            >
              {/* Column header */}
              <div
                className="flex items-center justify-between px-3 py-2 relative"
                style={{
                  backgroundColor: color.bg,
                  borderBottom: `1px solid var(--kanban-border)`,
                }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {renamingCol === col.title ? (
                    <input
                      ref={renameRef}
                      className="text-xs font-semibold px-1 py-0.5 rounded border outline-none"
                      style={{
                        borderColor: 'var(--kanban-primary)',
                        backgroundColor: 'var(--kanban-card-bg)',
                        color: color.text,
                        width: 120,
                      }}
                      value={renameText}
                      onChange={(e) => setRenameText(e.target.value)}
                      onBlur={() => handleRenameSubmit(col.title)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRenameSubmit(col.title);
                        if (e.key === 'Escape') {
                          setRenamingCol(null);
                          setRenameText('');
                        }
                      }}
                    />
                  ) : (
                    <span
                      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold truncate"
                      style={{ backgroundColor: color.bg, color: color.text }}
                    >
                      {col.title}
                    </span>
                  )}
                  <span
                    className="text-[10px] font-medium shrink-0"
                    style={{ color: color.text, opacity: 0.6 }}
                  >
                    {items.length}
                  </span>
                </div>
                <div className="flex items-center gap-0.5">
                  <button
                    className="p-0.5 rounded hover:bg-black/5 transition-colors"
                    onClick={() => toggleCollapse(col.title)}
                    title="Collapse column"
                  >
                    <ChevronDown size={14} style={{ color: color.text, opacity: 0.6 }} />
                  </button>
                  <button
                    className="p-0.5 rounded hover:bg-black/5 transition-colors"
                    onClick={() =>
                      setMenuOpenCol(menuOpenCol === col.title ? null : col.title)
                    }
                    title="Column actions"
                  >
                    <MoreHorizontal size={14} style={{ color: color.text, opacity: 0.6 }} />
                  </button>
                </div>
                {/* Dropdown menu */}
                {menuOpenCol === col.title && (
                  <div
                    ref={menuRef}
                    className="absolute right-2 top-full mt-1 rounded-lg shadow-lg py-1 z-50 text-xs min-w-[140px]"
                    style={{
                      backgroundColor: 'var(--kanban-card-bg)',
                      border: `1px solid var(--kanban-border)`,
                      color: 'var(--kanban-text)',
                    }}
                  >
                    {col.title !== 'Uncategorized' && (
                      <button
                        className="w-full text-left px-3 py-1.5 hover:bg-black/5 transition-colors"
                        onClick={() => {
                          setRenamingCol(col.title);
                          setRenameText(col.title);
                          setMenuOpenCol(null);
                        }}
                      >
                        Rename
                      </button>
                    )}
                    <button
                      className="w-full text-left px-3 py-1.5 hover:bg-black/5 transition-colors"
                      onClick={() => {
                        toggleCollapse(col.title);
                        setMenuOpenCol(null);
                      }}
                    >
                      Collapse
                    </button>
                    {col.title !== 'Uncategorized' && (
                      <button
                        className="w-full text-left px-3 py-1.5 hover:bg-black/5 transition-colors text-red-600"
                        onClick={() => handleDeleteColumn(col.title)}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Cards */}
              <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {visibleItems.length === 0 && (
                  <div
                    className="flex items-center justify-center rounded-md py-8 text-xs"
                    style={{
                      border: `1.5px dashed var(--kanban-empty-border)`,
                      color: 'var(--kanban-subtle)',
                    }}
                  >
                    No records
                  </div>
                )}
                {visibleItems.map((r) => {
                  const coverUrl = attachmentField
                    ? getFirstImageUrl(r[attachmentField.pg_column_name])
                    : null;
                  return (
                    <div
                      key={r.id}
                      className="rounded-md overflow-hidden cursor-pointer group transition-shadow"
                      style={{
                        backgroundColor: 'var(--kanban-card-bg)',
                        borderLeft: `3px solid ${color.text}`,
                        borderTop: `1px solid var(--kanban-border)`,
                        borderRight: `1px solid var(--kanban-border)`,
                        borderBottom: `1px solid var(--kanban-border)`,
                        boxShadow: 'var(--kanban-card-shadow)',
                      }}
                      draggable
                      onDragStart={() => handleDragStart(r.id)}
                      onClick={() => onExpandRow?.(r)}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.boxShadow =
                          'var(--kanban-card-shadow-hover)';
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.boxShadow =
                          'var(--kanban-card-shadow)';
                      }}
                    >
                      {coverUrl && (
                        <div
                          className="w-full h-[120px] bg-cover bg-center"
                          style={{ backgroundImage: `url(${coverUrl})` }}
                        />
                      )}
                      <div className="p-3">
                        <div className="flex items-start gap-1">
                          <GripVertical
                            size={12}
                            className="mt-0.5 shrink-0 opacity-0 group-hover:opacity-100 cursor-grab"
                            style={{ color: 'var(--kanban-subtle)' }}
                          />
                          <div className="flex-1 min-w-0">
                            <div
                              className="text-sm font-medium truncate"
                              style={{ color: 'var(--kanban-text)' }}
                            >
                              {titleField
                                ? r[titleField.pg_column_name] ?? '(empty)'
                                : r.id}
                            </div>
                            {previewFields.map((f) => {
                              const Renderer = getCellRenderer(f.ui_type);
                              return (
                                <div key={f.id} className="mt-1.5">
                                  <div
                                    className="text-[9px] font-semibold uppercase tracking-wider mb-0.5"
                                    style={{ color: 'var(--kanban-subtle)' }}
                                  >
                                    {f.name}
                                  </div>
                                  <div
                                    className="text-xs"
                                    style={{ color: 'var(--kanban-muted)' }}
                                  >
                                    <Renderer
                                      value={r[f.pg_column_name]}
                                      field={f}
                                      record={r}
                                      rowHeight="compact"
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {hiddenCount > 0 && (
                  <button
                    className="w-full text-center text-xs py-2 rounded-md transition-colors"
                    style={{
                      color: 'var(--kanban-primary)',
                      backgroundColor: 'transparent',
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.backgroundColor =
                        'var(--kanban-bg)';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.backgroundColor =
                        'transparent';
                    }}
                    onClick={() => toggleExpanded(col.title)}
                  >
                    Show {hiddenCount} more
                  </button>
                )}
                {isExpanded && items.length > CARDS_PER_PAGE && (
                  <button
                    className="w-full text-center text-xs py-2 rounded-md transition-colors"
                    style={{ color: 'var(--kanban-subtle)' }}
                    onClick={() => toggleExpanded(col.title)}
                  >
                    Show fewer
                  </button>
                )}
              </div>

              {/* Add card */}
              {addingInCol === col.title ? (
                <div
                  className="px-2 py-2"
                  style={{ borderTop: `1px solid var(--kanban-border)` }}
                >
                  <input
                    ref={newCardRef}
                    className="w-full px-2 py-1.5 text-xs rounded outline-none"
                    style={{
                      border: `1px solid var(--kanban-primary)`,
                      backgroundColor: 'var(--kanban-card-bg)',
                      color: 'var(--kanban-text)',
                    }}
                    placeholder="Card title..."
                    value={newCardTitle}
                    onChange={(e) => setNewCardTitle(e.target.value)}
                    onBlur={() => handleAddCard(col.title)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddCard(col.title);
                      if (e.key === 'Escape') {
                        setAddingInCol(null);
                        setNewCardTitle('');
                      }
                    }}
                  />
                </div>
              ) : (
                <button
                  className="flex items-center gap-1 px-3 py-2 text-xs transition-colors"
                  style={{
                    color: 'var(--kanban-subtle)',
                    borderTop: `1px solid var(--kanban-border)`,
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.color =
                      'var(--kanban-primary)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.color =
                      'var(--kanban-subtle)';
                  }}
                  onClick={() => setAddingInCol(col.title)}
                >
                  <Plus size={12} /> New
                </button>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

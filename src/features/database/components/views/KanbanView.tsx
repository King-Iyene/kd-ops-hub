import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { Loader2, Plus, Trash2, Expand } from 'lucide-react';
import type { FieldMeta, RecordRow, SelectChoice } from '@/features/database/types';
import { PILL_COLORS } from '@/features/database/types';
import { useDatabaseUI } from '../../lib/store';

interface KanbanViewProps {
  fields: FieldMeta[];
  records: RecordRow[];
  totalCount: number;
  isLoading: boolean;
  onCellUpdate: (recordId: string, fieldId: string, value: any) => void;
  onAddRow: () => void;
  onExpandRow?: (record: RecordRow) => void;
  onDeleteRow?: (recordId: string) => void;
}

const TEAL = '#006994';
const TEXT_COLOR = '#0F172A';
const MUTED = '#94A3B8';
const BORDER = '#E2E8F0';
const SURFACE = '#F8FAFC';

const SYSTEM_FIELDS = new Set(['id', 'created_at', 'updated_at']);

function getPillColor(colorName: string): { bg: string; text: string } {
  const found = PILL_COLORS.find(
    (c) => c.name.toLowerCase() === colorName.toLowerCase()
  );
  return found ?? { bg: '#F1F5F9', text: '#334155' };
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

interface ContextMenuState {
  x: number;
  y: number;
  recordId: string;
}

export default function KanbanView({
  fields,
  records,
  totalCount,
  isLoading,
  onCellUpdate,
  onAddRow,
  onExpandRow,
  onDeleteRow,
}: KanbanViewProps) {
  const { kanbanFieldId, setKanbanFieldId } = useDatabaseUI();
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return;
    const handler = (e: MouseEvent) => {
      if (
        contextMenuRef.current &&
        !contextMenuRef.current.contains(e.target as Node)
      ) {
        setContextMenu(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [contextMenu]);

  // Fields eligible for kanban grouping
  const selectFields = useMemo(
    () =>
      fields.filter(
        (f) => f.ui_type === 'SingleSelect' || f.ui_type === 'MultiSelect'
      ),
    [fields]
  );

  // Active grouping field
  const groupField = useMemo(
    () => fields.find((f) => f.id === kanbanFieldId) ?? null,
    [fields, kanbanFieldId]
  );

  // Primary field (first non-system field)
  const primaryField = useMemo(
    () => fields.find((f) => !f.is_system && !SYSTEM_FIELDS.has(f.pg_column_name)),
    [fields]
  );

  // Display fields for cards (up to 3 non-primary, non-system, non-grouping)
  const cardFields = useMemo(() => {
    return fields
      .filter(
        (f) =>
          !f.is_system &&
          !SYSTEM_FIELDS.has(f.pg_column_name) &&
          f.id !== primaryField?.id &&
          f.id !== groupField?.id
      )
      .slice(0, 3);
  }, [fields, primaryField, groupField]);

  // Choices from the grouping field
  const choices = useMemo<SelectChoice[]>(
    () => groupField?.options?.choices ?? [],
    [groupField]
  );

  // Group records into columns
  const columns = useMemo(() => {
    if (!groupField) return [];

    const columnMap = new Map<string | null, RecordRow[]>();
    // Initialize with null for uncategorized
    columnMap.set(null, []);
    for (const choice of choices) {
      columnMap.set(choice.title, []);
    }

    for (const record of records) {
      const val = record[groupField.pg_column_name];
      if (groupField.ui_type === 'MultiSelect' && Array.isArray(val)) {
        if (val.length === 0) {
          columnMap.get(null)!.push(record);
        } else {
          for (const v of val) {
            const bucket = columnMap.get(v);
            if (bucket) {
              bucket.push(record);
            } else {
              columnMap.get(null)!.push(record);
            }
          }
        }
      } else {
        const strVal = val != null && val !== '' ? String(val) : null;
        const bucket = columnMap.get(strVal);
        if (bucket) {
          bucket.push(record);
        } else {
          columnMap.get(null)!.push(record);
        }
      }
    }

    const result: {
      key: string;
      label: string;
      color: { bg: string; text: string };
      records: RecordRow[];
    }[] = [];

    // Uncategorized first
    const uncategorized = columnMap.get(null)!;
    result.push({
      key: '__uncategorized__',
      label: 'Uncategorized',
      color: { bg: '#F1F5F9', text: '#334155' },
      records: uncategorized,
    });

    for (const choice of choices) {
      result.push({
        key: choice.title,
        label: choice.title,
        color: getPillColor(choice.color),
        records: columnMap.get(choice.title) ?? [],
      });
    }

    return result;
  }, [groupField, choices, records]);

  const handleCardClick = useCallback(
    (record: RecordRow) => {
      onExpandRow?.(record);
    },
    [onExpandRow]
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, recordId: string) => {
      e.preventDefault();
      setContextMenu({ x: e.clientX, y: e.clientY, recordId });
    },
    []
  );

  const handleDelete = useCallback(() => {
    if (contextMenu) {
      onDeleteRow?.(contextMenu.recordId);
      setContextMenu(null);
    }
  }, [contextMenu, onDeleteRow]);

  const handleAddToColumn = useCallback(
    (choiceValue: string | null) => {
      onAddRow();
      // If groupField exists, pre-fill with the column value after creation
      // The parent is expected to handle onAddRow creating the row,
      // then we update the cell with the column value
      // For simplicity, we just call onAddRow -- the parent can extend this
    },
    [onAddRow]
  );

  const formatCellValue = useCallback((field: FieldMeta, value: any): string => {
    if (value == null || value === '') return '';
    if (field.ui_type === 'Checkbox') return value ? 'Yes' : 'No';
    if (Array.isArray(value)) return value.join(', ');
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }, []);

  // Loading state
  if (isLoading) {
    return (
      <div style={styles.centerContainer}>
        <Loader2
          size={32}
          color={TEAL}
          style={{ animation: 'spin 1s linear infinite' }}
        />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // Empty state: no grouping field selected
  if (!groupField) {
    return (
      <div style={styles.emptyContainer}>
        <div style={styles.emptyContent}>
          <div style={styles.emptyIcon}>
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke={MUTED}
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="3" width="7" height="18" rx="1" />
              <rect x="14" y="3" width="7" height="10" rx="1" />
            </svg>
          </div>
          <h3 style={styles.emptyTitle}>No grouping field selected</h3>
          <p style={styles.emptyDesc}>
            Choose a Single Select or Multi Select field to group records into columns.
          </p>
          {selectFields.length > 0 && (
            <select
              value=""
              onChange={(e) => setKanbanFieldId(e.target.value || null)}
              style={styles.emptySelect}
            >
              <option value="">Select a field...</option>
              {selectFields.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          )}
          {selectFields.length === 0 && (
            <p style={{ ...styles.emptyDesc, marginTop: 8, fontSize: 13 }}>
              No Single Select or Multi Select fields available in this table.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={styles.wrapper}>
      {/* Toolbar */}
      <div style={styles.toolbar}>
        <label style={styles.toolbarLabel}>
          Group by:
          <select
            value={kanbanFieldId ?? ''}
            onChange={(e) => setKanbanFieldId(e.target.value || null)}
            style={styles.fieldSelect}
          >
            <option value="">None</option>
            {selectFields.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
        <span style={styles.recordCount}>
          {totalCount} record{totalCount !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Columns */}
      <div style={styles.columnsContainer}>
        {columns.map((col) => (
          <div
            key={col.key}
            style={{
              ...styles.column,
              backgroundColor: hexToRgba(col.color.bg, 0.3),
            }}
          >
            {/* Column header */}
            <div style={styles.columnHeader}>
              <div style={styles.columnHeaderLeft}>
                <span
                  style={{
                    ...styles.choicePill,
                    backgroundColor: col.color.bg,
                    color: col.color.text,
                  }}
                >
                  {col.label}
                </span>
                <span style={styles.columnCount}>{col.records.length}</span>
              </div>
            </div>

            {/* Cards */}
            <div style={styles.cardsContainer}>
              {col.records.map((record) => (
                <div
                  key={record.id}
                  style={styles.card}
                  onClick={() => handleCardClick(record)}
                  onContextMenu={(e) => handleContextMenu(e, record.id)}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLDivElement).style.boxShadow =
                      '0 2px 8px rgba(0, 0, 0, 0.1)';
                    (e.currentTarget as HTMLDivElement).style.borderColor =
                      TEAL;
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLDivElement).style.boxShadow =
                      '0 1px 2px rgba(0, 0, 0, 0.04)';
                    (e.currentTarget as HTMLDivElement).style.borderColor =
                      BORDER;
                  }}
                >
                  {/* Primary field as title */}
                  {primaryField && (
                    <div style={styles.cardTitle}>
                      {formatCellValue(
                        primaryField,
                        record[primaryField.pg_column_name]
                      ) || (
                        <span style={{ color: MUTED, fontStyle: 'italic' }}>
                          Untitled
                        </span>
                      )}
                    </div>
                  )}

                  {/* Additional fields */}
                  {cardFields.map((field) => {
                    const val = formatCellValue(
                      field,
                      record[field.pg_column_name]
                    );
                    if (!val) return null;
                    return (
                      <div key={field.id} style={styles.cardField}>
                        <span style={styles.cardFieldLabel}>{field.name}</span>
                        <span style={styles.cardFieldValue}>{val}</span>
                      </div>
                    );
                  })}
                </div>
              ))}

              {/* Add row button */}
              <button
                onClick={() =>
                  handleAddToColumn(
                    col.key === '__uncategorized__' ? null : col.key
                  )
                }
                style={styles.addButton}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                    '#EDF2F7';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                    'transparent';
                }}
              >
                <Plus size={14} color={MUTED} />
                <span>New</span>
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Context menu */}
      {contextMenu && onDeleteRow && (
        <div
          ref={contextMenuRef}
          style={{
            ...styles.contextMenu,
            top: contextMenu.y,
            left: contextMenu.x,
          }}
        >
          <button onClick={handleDelete} style={styles.contextMenuItem}>
            <Trash2 size={14} />
            <span>Delete record</span>
          </button>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  centerContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    minHeight: 300,
  },
  emptyContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    minHeight: 400,
  },
  emptyContent: {
    textAlign: 'center',
    maxWidth: 360,
  },
  emptyIcon: {
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: 600,
    color: TEXT_COLOR,
    margin: '0 0 8px',
  },
  emptyDesc: {
    fontSize: 14,
    color: MUTED,
    margin: 0,
    lineHeight: 1.5,
  },
  emptySelect: {
    marginTop: 16,
    padding: '8px 12px',
    fontSize: 14,
    border: `1px solid ${BORDER}`,
    borderRadius: 6,
    backgroundColor: 'white',
    color: TEXT_COLOR,
    cursor: 'pointer',
    outline: 'none',
    minWidth: 200,
  },
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflow: 'hidden',
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 16px',
    borderBottom: `1px solid ${BORDER}`,
    backgroundColor: 'white',
    flexShrink: 0,
  },
  toolbarLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 13,
    fontWeight: 500,
    color: TEXT_COLOR,
  },
  fieldSelect: {
    padding: '4px 8px',
    fontSize: 13,
    border: `1px solid ${BORDER}`,
    borderRadius: 4,
    backgroundColor: 'white',
    color: TEXT_COLOR,
    cursor: 'pointer',
    outline: 'none',
  },
  recordCount: {
    fontSize: 13,
    color: MUTED,
  },
  columnsContainer: {
    display: 'flex',
    gap: 12,
    padding: 16,
    overflowX: 'auto',
    overflowY: 'hidden',
    flex: 1,
    alignItems: 'flex-start',
  },
  column: {
    minWidth: 280,
    maxWidth: 320,
    borderRadius: 8,
    border: `1px solid ${BORDER}`,
    display: 'flex',
    flexDirection: 'column',
    maxHeight: '100%',
    flexShrink: 0,
  },
  columnHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 12px',
    borderBottom: `1px solid ${BORDER}`,
  },
  columnHeaderLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  choicePill: {
    display: 'inline-block',
    padding: '2px 10px',
    borderRadius: 12,
    fontSize: 12,
    fontWeight: 600,
    lineHeight: '20px',
    whiteSpace: 'nowrap',
  },
  columnCount: {
    fontSize: 12,
    color: MUTED,
    fontWeight: 500,
  },
  cardsContainer: {
    padding: 8,
    overflowY: 'auto',
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  card: {
    backgroundColor: 'white',
    border: `1px solid ${BORDER}`,
    borderRadius: 6,
    padding: '10px 12px',
    cursor: 'pointer',
    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
    transition: 'box-shadow 150ms, border-color 150ms',
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: 500,
    color: TEXT_COLOR,
    marginBottom: 4,
    lineHeight: 1.4,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  cardField: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: 8,
    marginTop: 4,
  },
  cardFieldLabel: {
    fontSize: 11,
    color: MUTED,
    fontWeight: 500,
    flexShrink: 0,
  },
  cardFieldValue: {
    fontSize: 12,
    color: TEXT_COLOR,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    textAlign: 'right',
  },
  addButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    padding: '6px 8px',
    border: 'none',
    borderRadius: 4,
    backgroundColor: 'transparent',
    color: MUTED,
    fontSize: 13,
    cursor: 'pointer',
    transition: 'background-color 150ms',
    width: '100%',
    marginTop: 2,
  },
  contextMenu: {
    position: 'fixed',
    backgroundColor: 'white',
    border: `1px solid ${BORDER}`,
    borderRadius: 6,
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.12)',
    padding: 4,
    zIndex: 1000,
    minWidth: 160,
  },
  contextMenuItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    padding: '6px 10px',
    border: 'none',
    borderRadius: 4,
    backgroundColor: 'transparent',
    color: '#DC2626',
    fontSize: 13,
    cursor: 'pointer',
    textAlign: 'left',
  },
};

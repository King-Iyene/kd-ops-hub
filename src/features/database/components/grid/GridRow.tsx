import React from 'react';
import { Expand, MoreHorizontal } from 'lucide-react';
import type { FieldMeta, RecordRow } from '@/features/database/types';
import type { GridColorTokens } from '../../hooks/useGridColors';
import { useDatabaseUI } from '../../lib/store';
import { GridCell } from './GridCell';
import { cachedCellAriaValue } from './cellAria';

const ROW_NUMBER_WIDTH = 48;

type GridField = FieldMeta & { width: number };


export interface GridRowProps {
  record: RecordRow;
  /** Position in the list being rendered (drives zebra stripes, the drop line and range selection). */
  index: number;
  rowNum: number;
  top: number;
  rowHeightPx: number;
  /** Rendering inside a group: no drag handle, no zebra, no range selection. */
  grouped: boolean;
  fields: GridField[];
  frozenCount: number;
  frozenLeftOffsets: number[];
  colors: GridColorTokens;
  /** The row's checkbox is ticked. */
  isChecked: boolean;
  isDropTarget: boolean;
  rowColor: string | undefined;
  /** Columns of this row that are inside the dragged range, inclusive; -1 when the row has none. */
  rangeStartCol: number;
  rangeEndCol: number;
  flashCells: ReadonlySet<string>;
  getCellColor: (record: RecordRow, fieldId: string) => string | undefined;
  onCellUpdate: (recordId: string, fieldId: string, value: any) => void;
  onFieldUpdate: (fieldId: string, tableId: string, updates: any) => void;
  onExpandRow?: (record: RecordRow) => void;
  onToggleRowSelection: (id: string) => void;
  onOpenRowMenu: (x: number, y: number, record: RecordRow) => void;
  onRowDragStart: (e: React.DragEvent, recordId: string) => void;
  onRowDragEnd: () => void;
  onRowDragOver: (e: React.DragEvent, idx: number) => void;
  onRowDrop: (e: React.DragEvent, idx: number) => void;
  onCellRangeClick: (e: React.MouseEvent, rowIndex: number, colIndex: number) => void;
}

/**
 * One grid row. Memoised, and given only plain values (never the whole
 * selection state), so moving the selected cell re-renders the two rows it
 * leaves and enters instead of every row on screen.
 *
 * The hover colour is pure CSS (see `.kd-grid-row` in index.css): hovering
 * changes no React state and runs no JavaScript.
 */
export const GridRow = React.memo(function GridRow({
  record,
  index,
  rowNum,
  top,
  rowHeightPx,
  grouped,
  fields,
  frozenCount,
  frozenLeftOffsets,
  colors,
  isChecked,
  isDropTarget,
  rowColor,
  rangeStartCol,
  rangeEndCol,
  flashCells,
  getCellColor,
  onCellUpdate,
  onFieldUpdate,
  onExpandRow,
  onToggleRowSelection,
  onOpenRowMenu,
  onRowDragStart,
  onRowDragEnd,
  onRowDragOver,
  onRowDrop,
  onCellRangeClick,
}: GridRowProps) {
  // True only for the row holding the selected cell. A boolean selector re-renders this row only when the
  // answer flips, so selecting another cell touches the row it leaves and the row it enters, no others.
  const isRowSelected = useDatabaseUI((s) => (s.selectedCellId ? s.selectedCellId.startsWith(record.id + ':') : false));
  const alt = index % 2 === 1 ? colors.altRowBg : colors.bg;
  // Ungrouped rows are striped (or tinted by a colour rule); grouped rows are transparent.
  const rowBg = isRowSelected ? colors.selectedRowBg : grouped ? undefined : (rowColor || alt);
  const gutterBg = isChecked || isRowSelected
    ? colors.selectedRowBg
    : grouped
      ? colors.headerBg
      : (index % 2 === 1 ? colors.altRowBg : colors.headerBg);

  return (
    <div
      className="kd-grid-row absolute left-0 w-full flex group/row"
      role="row"
      aria-rowindex={rowNum}
      aria-selected={isChecked}
      data-row-selected={isRowSelected ? 'true' : undefined}
      style={{
        height: rowHeightPx,
        top,
        backgroundColor: rowBg,
        transition: 'background-color 150ms ease',
        ['--kd-row-hover' as string]: colors.hoverRow,
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        onOpenRowMenu(e.clientX, e.clientY, record);
      }}
    >
      {rowColor && (
        <div
          className="absolute left-0 top-0 h-full z-20 pointer-events-none"
          style={{ width: 3, backgroundColor: rowColor }}
        />
      )}
      {/* Row number gutter */}
      <div
        className="sticky left-0 z-10 flex items-center justify-center shrink-0 group/num"
        style={{
          width: ROW_NUMBER_WIDTH,
          minWidth: ROW_NUMBER_WIDTH,
          backgroundColor: gutterBg,
          borderRight: `1px solid ${colors.border}`,
          borderBottom: `1px solid ${colors.border}`,
          borderTop: !grouped && isDropTarget ? `2px solid ${colors.primary}` : undefined,
          fontSize: 11,
          color: colors.muted,
          cursor: 'pointer',
        }}
        onClick={() => onToggleRowSelection(record.id)}
        onDragOver={grouped ? undefined : (e) => onRowDragOver(e, index)}
        onDrop={grouped ? undefined : (e) => onRowDrop(e, index)}
      >
        {isChecked ? (
          <input
            type="checkbox"
            className="w-3.5 h-3.5 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1"
            style={{ accentColor: colors.primary, outlineColor: colors.primary }}
            checked
            onChange={() => onToggleRowSelection(record.id)}
            aria-label={`Deselect row ${rowNum}`}
          />
        ) : (
          <>
            <span className="group-hover/row:opacity-0 group-focus-within/row:opacity-0">{rowNum}</span>
            <div className="absolute inset-0 flex items-center justify-center gap-0.5 opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100 transition-opacity">
              {!grouped && (
                <span
                  draggable
                  className="cursor-grab active:cursor-grabbing px-0.5 text-[#9AA2AF] hover:text-[#374151] dark:text-[hsl(220,15%,55%)] dark:hover:text-[hsl(220,20%,88%)]"
                  onDragStart={(e) => onRowDragStart(e, record.id)}
                  onDragEnd={onRowDragEnd}
                  style={{ fontSize: 13 }}
                  role="button"
                  aria-label={`Drag to reorder row ${rowNum}`}
                >
                  &#8801;
                </span>
              )}
              <input
                type="checkbox"
                className="w-3.5 h-3.5 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1"
                style={{ outlineColor: colors.primary }}
                checked={false}
                onChange={() => onToggleRowSelection(record.id)}
                aria-label={`Select row ${rowNum}`}
              />
              {onExpandRow && (
                <button
                  className="p-0.5 rounded hover:bg-accent"
                  onClick={(e) => { e.stopPropagation(); onExpandRow(record); }}
                  aria-label={`Expand row ${rowNum}`}
                >
                  <Expand size={12} />
                </button>
              )}
              <button
                className="p-0.5 rounded hover:bg-accent"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenRowMenu(e.clientX, e.clientY, record);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
                    e.preventDefault();
                    const rect = e.currentTarget.getBoundingClientRect();
                    onOpenRowMenu(rect.left, rect.bottom, record);
                  }
                }}
                aria-label={`Row ${rowNum} options`}
                aria-haspopup="menu"
              >
                <MoreHorizontal size={12} />
              </button>
            </div>
          </>
        )}
      </div>

      {fields.map((field, colIdx) => {
        const isFroz = colIdx < frozenCount;
        const isLastFroz = colIdx === frozenCount - 1;
        const cellLeft = isFroz ? frozenLeftOffsets[colIdx] : ROW_NUMBER_WIDTH;
        const isFlash = flashCells.size > 0 && flashCells.has(`${record.id}:${field.id}`);
        const isInRange = !grouped && colIdx >= rangeStartCol && colIdx <= rangeEndCol;
        return (
          <div
            key={field.id}
            className="shrink-0"
            role="gridcell"
            aria-colindex={colIdx + 1}
            aria-rowindex={rowNum}
            aria-label={`Row ${rowNum}, ${field.name}: ${cachedCellAriaValue(record, field)}`}
            style={{
              height: '100%',
              width: field.width || 180,
              minWidth: field.width || 180,
              ...(isFroz ? {
                position: 'sticky' as const,
                left: cellLeft,
                zIndex: 5,
                borderRight: isLastFroz ? `1px solid ${colors.border}` : undefined,
                boxShadow: isLastFroz ? colors.frozenShadow : undefined,
              } : {}),
            }}
          >
            <div
              style={{
                height: '100%',
                ...(isFlash ? {
                  boxShadow: `inset 0 0 0 2px ${colors.primary}`,
                  transition: 'box-shadow 0.3s ease-out',
                } : {}),
                ...(isInRange ? { backgroundColor: `${colors.primary}14` } : {}),
              }}
              onClick={grouped ? undefined : (e) => onCellRangeClick(e, index, colIdx)}
            >
              <GridCell
                field={field}
                record={record}
                onCellUpdate={onCellUpdate}
                onFieldUpdate={onFieldUpdate}
                backgroundColor={getCellColor(record, field.id)}
                frozen={isFroz}
                frozenLeft={cellLeft}
                rowBg={grouped ? undefined : rowBg}
                colors={colors}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
});

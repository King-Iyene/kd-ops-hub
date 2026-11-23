import React, { useEffect, useMemo, useState } from 'react';
import { Maximize2, Plus, Search, X } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import type { FieldMeta, RecordRow } from '@/features/database/types';
import {
  usePrimaryField,
  useRecordLinks,
  useRelatedTableSearch,
  useTargetTableFields,
  useLinkMutations,
  getRecordDisplayValue,
} from '../../hooks/useLinks';
import { useCreateRecord } from '../../hooks/useRecords';
import { useLinkData, type LinkedItem } from '../../hooks/useBatchedLinks';
import { LinkChips } from './LinkChips';
import { linesForRowHeight } from '../../lib/linkBatch';
import { useDatabaseUI } from '../../lib/store';
import { useGridColors } from '../../hooks/useGridColors';

/** How many candidate records the picker shows at first, and adds each time "Show more" is pressed. */
const PICKER_PAGE = 30;

interface LinkCellRendererProps {
  value: any;
  field: FieldMeta;
  record: RecordRow;
  rowHeight: 'short' | 'medium' | 'tall' | 'extra-tall';
}

// ---------------------------------------------------------------------------
// Picker (only mounted while the popover is open, so closed cells cost nothing)
// ---------------------------------------------------------------------------

function RecordCard({
  rec,
  primaryField,
  visibleFields,
  action,
  onAction,
  onOpen,
  active = false,
}: {
  active?: boolean;
  rec: RecordRow;
  primaryField: FieldMeta | null | undefined;
  visibleFields: FieldMeta[];
  action: 'link' | 'unlink';
  onAction: (id: string) => void;
  onOpen?: (rec: RecordRow) => void;
}) {
  const displayVal = getRecordDisplayValue(rec, primaryField);
  const extraFields = visibleFields
    .filter(
      (f) =>
        f.id !== primaryField?.id &&
        rec[f.pg_column_name] != null &&
        String(rec[f.pg_column_name]).trim() !== '' &&
        typeof rec[f.pg_column_name] !== 'object',
    )
    .slice(0, 3);

  return (
    <div
      role="option"
      aria-selected={active}
      id={`link-option-${rec.id}`}
      ref={(el) => { if (active && el) el.scrollIntoView?.({ block: 'nearest' }); }}
      className={`flex items-start justify-between gap-2 px-2.5 py-2 rounded-md hover:bg-muted group/item cursor-pointer transition-colors${active ? ' bg-muted' : ''}`}
      onClick={() => {
        if (action === 'link') onAction(rec.id);
      }}
    >
      <div className="flex-1 min-w-0">
        <div className="text-xs-plus font-medium text-foreground truncate leading-snug">{displayVal}</div>
        {extraFields.length > 0 && (
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
            {extraFields.map((f) => {
              const val = rec[f.pg_column_name];
              const numeric = f.ui_type === 'Currency' || f.ui_type === 'Number' || f.ui_type === 'Decimal';
              const formatted = numeric && !Number.isNaN(Number(val)) ? Number(val).toLocaleString() : String(val);
              return (
                <span key={f.id} className="text-2xs text-muted-foreground truncate max-w-[140px]">
                  <span className="opacity-70">{f.name}: </span>
                  {formatted}
                </span>
              );
            })}
          </div>
        )}
      </div>
      <div className="shrink-0 flex items-center gap-0.5">
        {action === 'unlink' ? (
          <>
            {onOpen && (
              <button
                type="button"
                title="Open record"
                aria-label="Open record"
                className="p-1 rounded-md text-muted-foreground opacity-0 group-hover/item:opacity-100 focus-visible:opacity-100 hover:bg-background transition-opacity"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpen(rec);
                }}
              >
                <Maximize2 size={12} />
              </button>
            )}
            <button
              type="button"
              title="Remove link"
              aria-label="Remove link"
              className="p-1 rounded-md text-destructive opacity-0 group-hover/item:opacity-100 focus-visible:opacity-100 hover:bg-destructive/10 transition-opacity"
              onClick={(e) => {
                e.stopPropagation();
                onAction(rec.id);
              }}
            >
              <X size={12} />
            </button>
          </>
        ) : (
          <div className="opacity-0 group-hover/item:opacity-100 transition-opacity p-0.5 rounded bg-primary/10">
            <Plus size={13} className="text-primary" />
          </div>
        )}
      </div>
    </div>
  );
}

function LinkPickerContent({
  field,
  record,
  onClose,
}: {
  field: FieldMeta;
  record: RecordRow;
  onClose: () => void;
}) {
  const { activeBaseId } = useDatabaseUI();
  const setLinkedRecordExpand = useDatabaseUI((s) => s.setLinkedRecordExpand);
  const [searchTerm, setSearchTerm] = useState('');
  // Ask the server once typing pauses, not on every key; the box itself stays instant.
  const [debouncedTerm, setDebouncedTerm] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedTerm(searchTerm), 180);
    return () => clearTimeout(t);
  }, [searchTerm]);
  const [limit, setLimit] = useState(PICKER_PAGE);

  const relatedTableId = field.options?.relatedTableId as string | undefined;
  const linkType = field.options?.type as string | undefined;

  const { data: primaryField } = usePrimaryField(relatedTableId, !!relatedTableId);
  const { data: linkedRecords = [] } = useRecordLinks({
    baseId: activeBaseId,
    sourceTableId: field.table_id,
    targetTableId: relatedTableId,
    fieldId: field.id,
    recordId: relatedTableId ? record.id : null,
    linkType,
    fkColumnName: field.options?.fkColumnName as string | undefined,
  });
  const { data: searchResults = [] } = useRelatedTableSearch({
    baseId: activeBaseId,
    targetTableId: relatedTableId,
    searchTerm: debouncedTerm,
    primaryField,
    enabled: true,
    limit,
  });
  const { data: visibleFields = [] } = useTargetTableFields(relatedTableId, true);
  const { linkRecord, unlinkRecord } = useLinkMutations({
    baseId: activeBaseId,
    field,
    recordId: record.id,
  });

  const createRecord = useCreateRecord();
  const [creating, setCreating] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const limitToOne = field.options?.allowMultiple === false;
  // In a "one record only" field, picking a record replaces whatever was linked and closes the list.
  const pickRecord = async (id: string) => {
    if (limitToOne) {
      for (const existing of linkedRecords) {
        if (existing.id !== id) await unlinkRecord(existing.id);
      }
      if (!linkedRecords.some((r) => r.id === id)) await linkRecord(id);
      onClose();
      return;
    }
    await linkRecord(id);
  };

  // Create a record in the other table (named after what was typed) and link it at once.
  const createAndLink = async () => {
    if (!relatedTableId || !activeBaseId || !primaryField || creating) return;
    const name = searchTerm.trim();
    setCreating(true);
    try {
      const row = await createRecord.mutateAsync({
        baseId: activeBaseId,
        tableId: relatedTableId,
        record: name ? { [primaryField.pg_column_name]: name } : {},
      });
      await pickRecord(row.id);
      setSearchTerm('');
    } catch {
      // useCreateRecord already tells the user it failed.
    } finally {
      setCreating(false);
    }
  };
  const canCreate = !!relatedTableId && !!primaryField;
  const exactMatch = searchTerm.trim() !== '' && [...linkedRecords, ...searchResults].some(
    (r) => getRecordDisplayValue(r, primaryField).trim().toLowerCase() === searchTerm.trim().toLowerCase(),
  );

  const linkedIds = useMemo(() => new Set(linkedRecords.map((r) => r.id)), [linkedRecords]);
  const suggestions = useMemo(
    () => searchResults.filter((r) => !linkedIds.has(r.id)),
    [searchResults, linkedIds],
  );

  const activeSuggestion = suggestions.length > 0 ? suggestions[Math.min(activeIndex, suggestions.length - 1)] : undefined;
  const onSearchKeyDown = (e: React.KeyboardEvent) => {
    // The grid listens for arrows and Enter; while this list is open they belong to the list.
    e.stopPropagation();
    if (e.key === 'ArrowDown' && suggestions.length > 0) {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp' && suggestions.length > 0) {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeSuggestion) void pickRecord(activeSuggestion.id);
      else if (canCreate && !exactMatch && searchTerm.trim()) void createAndLink();
    }
  };

  return (
    <>
      <div className="p-2.5 border-b border-border">
        <div className="flex items-center gap-2 px-2.5 h-8 rounded-md bg-muted border border-border focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/30 transition-all">
          <Search size={14} className="text-muted-foreground shrink-0" />
          <Input
            placeholder="Find a record..."
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setActiveIndex(0); setLimit(PICKER_PAGE); }}
            role="combobox"
            aria-expanded="true"
            aria-controls="link-suggestions"
            aria-activedescendant={activeSuggestion ? `link-option-${activeSuggestion.id}` : undefined}
            aria-label="Find a record"
            className="h-full text-xs border-0 shadow-none focus-visible:ring-0 p-0 bg-transparent"
            autoFocus
            onKeyDown={onSearchKeyDown}
          />
        </div>
      </div>

      <div className="max-h-72 overflow-y-auto">
        {linkedRecords.length > 0 && (
          <div className="p-1.5">
            <p className="px-2 py-1.5 text-3xs font-semibold text-muted-foreground uppercase tracking-widest">
              Linked ({linkedRecords.length})
            </p>
            {linkedRecords.map((rec) => (
              <RecordCard
                key={rec.id}
                rec={rec}
                primaryField={primaryField}
                visibleFields={visibleFields}
                action="unlink"
                onAction={unlinkRecord}
                onOpen={(r) => {
                  if (relatedTableId && activeBaseId) {
                    setLinkedRecordExpand({ record: r, tableId: relatedTableId, baseId: activeBaseId });
                    onClose();
                  }
                }}
              />
            ))}
          </div>
        )}

        {suggestions.length > 0 && (
          <div className="p-1.5 border-t border-border" role="listbox" id="link-suggestions" aria-label={searchTerm ? 'Search results' : 'Suggestions'}>
            <p className="px-2 py-1.5 text-3xs font-semibold text-muted-foreground uppercase tracking-widest">
              {searchTerm ? 'Search results' : 'Suggestions'}
            </p>
            {suggestions.map((rec, i) => (
              <RecordCard
                active={i === Math.min(activeIndex, suggestions.length - 1)}
                key={rec.id}
                rec={rec}
                primaryField={primaryField}
                visibleFields={visibleFields}
                action="link"
                onAction={pickRecord}
              />
            ))}
          </div>
        )}

        {searchResults.length >= limit && (
          <div className="p-1.5 border-t border-border">
            <button
              type="button"
              onClick={() => setLimit((n) => n + PICKER_PAGE)}
              className="w-full rounded-md px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              data-show-more-records
            >
              Show more records
            </button>
          </div>
        )}

        {searchTerm && suggestions.length === 0 && (
          <div className="p-4 text-center text-xs text-muted-foreground border-t border-border">
            No matching records found
          </div>
        )}

        {!searchTerm && suggestions.length === 0 && linkedRecords.length === 0 && (
          <div className="p-4 text-center text-xs text-muted-foreground">No records available</div>
        )}
      </div>

      {canCreate && !exactMatch && (
        <div className="p-1.5 border-t border-border">
          <button
            type="button"
            disabled={creating}
            onClick={createAndLink}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-xs-plus font-medium text-primary hover:bg-primary/10 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            data-create-linked-record
          >
            <Plus size={14} aria-hidden="true" />
            <span className="truncate">{searchTerm.trim() ? `Create "${searchTerm.trim()}" and link it` : 'Create a new record and link it'}</span>
          </button>
        </div>
      )}
    </>
  );
}

export function LinkPopover({
  field,
  record,
  children,
  bubbleClick = false,
}: {
  field: FieldMeta;
  record: RecordRow;
  children: React.ReactNode;
  /** In the grid the click must also reach the cell, so it gets selected as well as opening the list. */
  bubbleClick?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <div
          role="button"
          tabIndex={-1}
          aria-label={`Edit ${field.name}`}
          className="flex items-center gap-1 w-full h-full cursor-pointer min-h-[28px]"
          onClick={(e) => { if (!bubbleClick) e.stopPropagation(); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              e.stopPropagation();
              setIsOpen(true);
            }
          }}
        >
          {children}
        </div>
      </PopoverTrigger>
      <PopoverContent
        className="w-96 p-0"
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onClick={(e) => e.stopPropagation()}
      >
        {isOpen && <LinkPickerContent field={field} record={record} onClose={() => setIsOpen(false)} />}
      </PopoverContent>
    </Popover>
  );
}

function EmptyLinkHint() {
  return (
    <span className="flex items-center justify-center w-full h-full opacity-0 group-hover/row:opacity-60 transition-opacity">
      <Plus size={14} className="text-muted-foreground" />
    </span>
  );
}

// ---------------------------------------------------------------------------
// Cells
// ---------------------------------------------------------------------------

/** Used inside a grid that preloads links for the whole column (fast path). */
function BatchedLinkCell({
  field,
  record,
  rowHeight,
  data,
}: LinkCellRendererProps & { data: NonNullable<ReturnType<typeof useLinkData>> }) {
  const colors = useGridColors();
  const items = data.links.get(field.id)?.get(record.id);
  const wrap = rowHeight !== 'short';

  return (
    <LinkPopover field={field} record={record}>
      {items === undefined ? (
        data.isLoading ? (
          <span
            className="h-4 w-16 rounded animate-pulse"
            style={{ backgroundColor: colors.linkPillBg, opacity: 0.6 }}
            aria-label="Loading"
          />
        ) : (
          <EmptyLinkHint />
        )
      ) : items.length > 0 ? (
        <LinkChips items={items} wrap={wrap} lines={linesForRowHeight(rowHeight)} />
      ) : (
        <EmptyLinkHint />
      )}
    </LinkPopover>
  );
}

/** Fallback for views that do not preload links (kanban, gallery, ...): one query per cell. */
function SingleLinkCell({ field, record, rowHeight }: LinkCellRendererProps) {
  const { activeBaseId } = useDatabaseUI();
  const relatedTableId = field.options?.relatedTableId as string | undefined;
  const linkType = field.options?.type as string | undefined;
  const { data: primaryField } = usePrimaryField(relatedTableId, !!relatedTableId);
  const { data: linkedRecords = [], isLoading } = useRecordLinks({
    baseId: activeBaseId,
    sourceTableId: field.table_id,
    targetTableId: relatedTableId,
    fieldId: field.id,
    recordId: relatedTableId ? record.id : null,
    linkType,
    fkColumnName: field.options?.fkColumnName as string | undefined,
  });

  const items = useMemo<LinkedItem[]>(
    () =>
      linkedRecords.map((r) => ({
        id: r.id,
        label: getRecordDisplayValue(r, primaryField),
      })),
    [linkedRecords, primaryField],
  );

  return (
    <LinkPopover field={field} record={record}>
      {isLoading ? (
        <span className="text-xs text-muted-foreground truncate">Loading...</span>
      ) : items.length > 0 ? (
        <LinkChips items={items} wrap={rowHeight !== 'short'} lines={linesForRowHeight(rowHeight)} />
      ) : (
        <EmptyLinkHint />
      )}
    </LinkPopover>
  );
}

export const LinkCellRenderer = React.memo(function LinkCellRenderer(props: LinkCellRendererProps) {
  const data = useLinkData();
  if (data && data.fieldIds.has(props.field.id)) return <BatchedLinkCell {...props} data={data} />;
  return <SingleLinkCell {...props} />;
});

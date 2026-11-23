import React, { useMemo, useState } from 'react';
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
import { useLinkData, type LinkedItem } from '../../hooks/useBatchedLinks';
import { LinkChips } from './LinkChips';
import { useDatabaseUI } from '../../lib/store';
import { useGridColors } from '../../hooks/useGridColors';

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
}: {
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
      className="flex items-start justify-between gap-2 px-2.5 py-2 rounded-md hover:bg-muted group/item cursor-pointer transition-colors"
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
    searchTerm,
    primaryField,
    enabled: true,
  });
  const { data: visibleFields = [] } = useTargetTableFields(relatedTableId, true);
  const { linkRecord, unlinkRecord } = useLinkMutations({
    baseId: activeBaseId,
    field,
    recordId: record.id,
  });

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

  const linkedIds = useMemo(() => new Set(linkedRecords.map((r) => r.id)), [linkedRecords]);
  const suggestions = useMemo(
    () => searchResults.filter((r) => !linkedIds.has(r.id)),
    [searchResults, linkedIds],
  );

  return (
    <>
      <div className="p-2.5 border-b border-border">
        <div className="flex items-center gap-2 px-2.5 h-8 rounded-md bg-muted border border-border focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/30 transition-all">
          <Search size={14} className="text-muted-foreground shrink-0" />
          <Input
            placeholder="Find a record..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-full text-xs border-0 shadow-none focus-visible:ring-0 p-0 bg-transparent"
            autoFocus
            onKeyDown={(e) => e.stopPropagation()}
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
          <div className="p-1.5 border-t border-border">
            <p className="px-2 py-1.5 text-3xs font-semibold text-muted-foreground uppercase tracking-widest">
              {searchTerm ? 'Search results' : 'Suggestions'}
            </p>
            {suggestions.map((rec) => (
              <RecordCard
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

        {searchTerm && suggestions.length === 0 && (
          <div className="p-4 text-center text-xs text-muted-foreground border-t border-border">
            No matching records found
          </div>
        )}

        {!searchTerm && suggestions.length === 0 && linkedRecords.length === 0 && (
          <div className="p-4 text-center text-xs text-muted-foreground">No records available</div>
        )}
      </div>
    </>
  );
}

function LinkPopover({
  field,
  record,
  children,
}: {
  field: FieldMeta;
  record: RecordRow;
  children: React.ReactNode;
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
          onClick={(e) => e.stopPropagation()}
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
        <LinkChips items={items} wrap={wrap} />
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
        <LinkChips items={items} wrap={rowHeight !== 'short'} />
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

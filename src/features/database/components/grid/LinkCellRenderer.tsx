import React, { useState } from 'react';
import { Plus, X, Search } from 'lucide-react';
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
import { useDatabaseUI } from '../../lib/store';
import { useGridColors } from '../../hooks/useGridColors';

interface LinkCellRendererProps {
  value: any;
  field: FieldMeta;
  record: RecordRow;
  rowHeight: 'short' | 'medium' | 'tall' | 'extra-tall';
}

function RecordCard({
  rec,
  primaryField,
  visibleFields,
  action,
  onAction,
  onExpand,
}: {
  rec: RecordRow;
  primaryField: FieldMeta | null | undefined;
  visibleFields: FieldMeta[];
  action: 'link' | 'unlink';
  onAction: (id: string) => void;
  onExpand?: (rec: RecordRow) => void;
}) {
  const displayVal = getRecordDisplayValue(rec, primaryField);
  const extraFields = visibleFields.filter(
    (f) => f.id !== primaryField?.id && rec[f.pg_column_name] != null && String(rec[f.pg_column_name]).trim() !== '',
  ).slice(0, 3);

  const handleClick = () => {
    if (action === 'link') {
      onAction(rec.id);
    } else if (onExpand) {
      onExpand(rec);
    }
  };

  return (
    <div
      className="flex items-start justify-between px-2.5 py-2 rounded-md hover:bg-[#F1F5F9] dark:hover:bg-[hsl(220,20%,14%)] group/item cursor-pointer transition-colors"
      onClick={handleClick}
    >
      <div className="flex-1 min-w-0">
        <div className="text-xs-plus font-medium text-[#1E293B] dark:text-[hsl(210,20%,90%)] truncate leading-snug">
          {displayVal}
        </div>
        {extraFields.length > 0 && (
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
            {extraFields.map((f) => {
              const val = rec[f.pg_column_name];
              const formatted = f.ui_type === 'Currency' || f.ui_type === 'Number' || f.ui_type === 'Decimal'
                ? Number(val).toLocaleString()
                : String(val);
              return (
                <span key={f.id} className="text-2xs text-[#64748B] dark:text-[hsl(215,15%,50%)] truncate max-w-[140px]">
                  <span className="text-[#94A3B8] dark:text-[hsl(215,12%,40%)]">{f.name}: </span>
                  {formatted}
                </span>
              );
            })}
          </div>
        )}
      </div>
      <div className="shrink-0 ml-2 mt-0.5">
        {action === 'unlink' ? (
          <button
            className="opacity-0 group-hover/item:opacity-100 p-1 rounded-md hover:bg-[#FEE2E2] dark:hover:bg-[hsl(0,40%,18%)] transition-all"
            onClick={(e) => { e.stopPropagation(); onAction(rec.id); }}
          >
            <X size={12} className="text-[#EF4444]" />
          </button>
        ) : (
          <div className="opacity-0 group-hover/item:opacity-100 transition-opacity p-0.5 rounded bg-[#2D7FF9]/10">
            <Plus size={13} className="text-[#2D7FF9]" />
          </div>
        )}
      </div>
    </div>
  );
}

export const LinkCellRenderer = React.memo(function LinkCellRenderer({
  value,
  field,
  record,
  rowHeight,
}: LinkCellRendererProps) {
  const colors = useGridColors();
  const { activeBaseId } = useDatabaseUI();
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const relatedTableId = field.options?.relatedTableId as string | undefined;
  const linkType = field.options?.type as string | undefined;
  const hasRelation = !!relatedTableId;

  const { data: primaryField } = usePrimaryField(relatedTableId, hasRelation);

  const { data: linkedRecords = [], isLoading } = useRecordLinks({
    baseId: activeBaseId,
    sourceTableId: field.table_id,
    targetTableId: relatedTableId,
    fieldId: field.id,
    recordId: hasRelation ? record.id : null,
    linkType,
    fkColumnName: field.options?.fkColumnName as string | undefined,
  });

  const { data: searchResults = [] } = useRelatedTableSearch({
    baseId: activeBaseId,
    targetTableId: relatedTableId,
    searchTerm,
    primaryField,
    enabled: isOpen,
  });

  const { data: visibleFields = [] } = useTargetTableFields(relatedTableId, isOpen);

  const setLinkedRecordExpand = useDatabaseUI((s) => s.setLinkedRecordExpand);

  const { linkRecord, unlinkRecord } = useLinkMutations({
    baseId: activeBaseId,
    field,
    recordId: record.id,
  });

  const linkedIds = new Set(linkedRecords.map((r) => r.id));
  const filteredSearchResults = searchResults.filter(
    (r) => !linkedIds.has(r.id),
  );

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) setSearchTerm('');
  };

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <div
          className="flex items-center gap-1 w-full h-full cursor-pointer min-h-[28px]"
          onClick={(e) => e.stopPropagation()}
        >
          {isLoading ? (
            <span className="text-xs truncate" style={{ color: colors.muted }}>
              Loading...
            </span>
          ) : linkedRecords.length > 0 ? (
            <>
              <div className="flex items-center gap-1 overflow-hidden flex-1 min-w-0">
                {linkedRecords.slice(0, 10).map((rec) => {
                  const displayVal = getRecordDisplayValue(rec, primaryField);
                  return (
                    <span
                      key={rec.id}
                      className="inline-flex items-center px-2 py-0.5 rounded text-2xs font-medium shrink-0 max-w-[200px] truncate leading-tight"
                      style={{
                        backgroundColor: colors.linkPillBg,
                        color: colors.linkPillText,
                        letterSpacing: '-0.01em',
                      }}
                    >
                      {displayVal}
                    </span>
                  );
                })}
                {linkedRecords.length > 10 && (
                  <span className="text-xs shrink-0" style={{ color: colors.muted }}>
                    +{linkedRecords.length - 10}
                  </span>
                )}
              </div>
              <Plus
                size={11}
                strokeWidth={2.5}
                className="text-[#9AA2AF] shrink-0 opacity-0 group-hover/row:opacity-100 transition-opacity"
              />
            </>
          ) : (
            <span className="flex items-center justify-center w-full h-full opacity-0 group-hover/row:opacity-60 transition-opacity">
              <Plus size={14} className="text-[#9AA2AF]" />
            </span>
          )}
        </div>
      </PopoverTrigger>
      <PopoverContent
        className="w-96 p-0"
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-2.5 border-b border-[#E5E5E5] dark:border-[hsl(200,25%,18%)]">
          <div className="flex items-center gap-2 px-2.5 h-8 rounded-md bg-[#F5F5F5] dark:bg-[hsl(200,20%,12%)] border border-[#E0E0E0] dark:border-[hsl(200,20%,20%)] focus-within:border-[#2D7FF9] focus-within:ring-1 focus-within:ring-[#2D7FF9]/30 transition-all">
            <Search size={14} className="text-[#9AA2AF] shrink-0" />
            <Input
              placeholder="Find a record..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-full text-xs border-0 shadow-none focus-visible:ring-0 p-0 bg-transparent placeholder:text-[#B0B8C4]"
              autoFocus
              onKeyDown={(e) => e.stopPropagation()}
            />
          </div>
        </div>

        <div className="max-h-72 overflow-y-auto">
          {linkedRecords.length > 0 && (
            <div className="p-1.5">
              <p className="px-2 py-1.5 text-3xs font-semibold text-[#94A3B8] dark:text-[hsl(215,12%,45%)] uppercase tracking-widest">
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
                  onExpand={(r) => {
                    if (relatedTableId && activeBaseId) {
                      setLinkedRecordExpand({ record: r, tableId: relatedTableId, baseId: activeBaseId });
                      setIsOpen(false);
                    }
                  }}
                />
              ))}
            </div>
          )}

          {filteredSearchResults.length > 0 && (
            <div className="p-1.5 border-t border-[#E5E5E5] dark:border-[hsl(220,15%,20%)]">
              <p className="px-2 py-1.5 text-3xs font-semibold text-[#94A3B8] dark:text-[hsl(215,12%,45%)] uppercase tracking-widest">
                {searchTerm ? 'Search results' : 'Suggestions'}
              </p>
              {filteredSearchResults.map((rec) => (
                <RecordCard
                  key={rec.id}
                  rec={rec}
                  primaryField={primaryField}
                  visibleFields={visibleFields}
                  action="link"
                  onAction={linkRecord}
                />
              ))}
            </div>
          )}

          {searchTerm && filteredSearchResults.length === 0 && (
            <div className="p-4 text-center text-xs text-[#94A3B8] dark:text-[hsl(215,12%,45%)] border-t border-[#E5E5E5] dark:border-[hsl(220,15%,20%)]">
              No matching records found
            </div>
          )}

          {!searchTerm && filteredSearchResults.length === 0 && linkedRecords.length === 0 && (
            <div className="p-4 text-center text-xs text-[#94A3B8] dark:text-[hsl(215,12%,45%)]">No records available</div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
});

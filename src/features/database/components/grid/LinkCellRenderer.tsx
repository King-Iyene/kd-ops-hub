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
                      className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium shrink-0 max-w-[200px] truncate leading-tight"
                      style={{
                        backgroundColor: colors.linkPillBg,
                        color: colors.linkPillText,
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
        className="w-80 p-0"
        align="start"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-3 border-b border-[#E5E5E5] dark:border-[hsl(200,25%,18%)]">
          <div className="flex items-center gap-2">
            <Search size={14} className="text-[#9AA2AF]" />
            <Input
              placeholder="Search records to link..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-7 text-xs border-0 shadow-none focus-visible:ring-0 p-0"
              autoFocus
            />
          </div>
        </div>

        <div className="max-h-60 overflow-y-auto">
          {linkedRecords.length > 0 ? (
            <div className="p-1">
              <p className="px-2 py-1 text-[10px] font-medium text-[#9AA2AF] uppercase tracking-wider">
                Linked
              </p>
              {linkedRecords.map((rec) => (
                <div
                  key={rec.id}
                  className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-[#F1F5F9] dark:hover:bg-[hsl(200,25%,14%)] group/item"
                >
                  <span className="text-xs text-[#334155] dark:text-[hsl(200,25%,88%)] truncate">
                    {getRecordDisplayValue(rec, primaryField)}
                  </span>
                  <button
                    className="opacity-0 group-hover/item:opacity-100 p-0.5 rounded hover:bg-[#E5E5E5] dark:hover:bg-[hsl(200,25%,18%)] transition-opacity"
                    onClick={() => unlinkRecord(rec.id)}
                  >
                    <X size={12} className="text-[#9AA2AF]" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-3 text-xs text-[#9AA2AF]">No linked records</div>
          )}

          {searchTerm && filteredSearchResults.length > 0 && (
            <div className="p-1 border-t border-[#E5E5E5] dark:border-[hsl(200,25%,18%)]">
              <p className="px-2 py-1 text-[10px] font-medium text-[#9AA2AF] uppercase tracking-wider">
                Link new
              </p>
              {filteredSearchResults.map((rec) => (
                <div
                  key={rec.id}
                  className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-[#F1F5F9] dark:hover:bg-[hsl(200,25%,14%)] group/item"
                >
                  <span className="text-xs text-[#334155] dark:text-[hsl(200,25%,88%)] truncate">
                    {getRecordDisplayValue(rec, primaryField)}
                  </span>
                  <button
                    className="opacity-0 group-hover/item:opacity-100 p-0.5 rounded hover:bg-[#DBEAFE] dark:hover:bg-[hsl(220,40%,20%)] transition-opacity"
                    onClick={() => linkRecord(rec.id)}
                  >
                    <Plus size={12} className="text-[#2D7FF9]" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {searchTerm && filteredSearchResults.length === 0 && (
            <div className="p-3 text-xs text-[#9AA2AF] border-t border-[#E5E5E5] dark:border-[hsl(200,25%,18%)]">
              No matching records found
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
});

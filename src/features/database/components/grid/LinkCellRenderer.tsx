import React, { useState } from 'react';
import { Link2, Plus, X, Search } from 'lucide-react';
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

interface LinkCellRendererProps {
  value: any;
  field: FieldMeta;
  record: RecordRow;
  rowHeight: 'short' | 'medium' | 'tall' | 'extra-tall';
}

function LinkedRecordsPopover({
  field,
  record,
  linkedCount,
}: {
  field: FieldMeta;
  record: RecordRow;
  linkedCount: number;
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const { activeBaseId } = useDatabaseUI();

  const relatedTableId = field.options?.relatedTableId as string | undefined;
  const linkType = field.options?.type as string | undefined;

  const { data: primaryField } = usePrimaryField(relatedTableId, isOpen);

  const { data: linkedRecords = [], isLoading } = useRecordLinks({
    baseId: activeBaseId,
    sourceTableId: field.table_id,
    targetTableId: relatedTableId,
    fieldId: field.id,
    recordId: isOpen ? record.id : null,
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

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium cursor-pointer hover:opacity-80 transition-opacity bg-[#E0F2FE] text-[#2D7FF9] dark:bg-[hsl(220,40%,20%)] dark:text-[#6699FF]"
          onClick={(e) => e.stopPropagation()}
        >
          <Link2 size={12} />
          {linkedCount} {linkedCount === 1 ? 'record' : 'records'}
        </button>
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
            />
          </div>
        </div>

        <div className="max-h-60 overflow-y-auto">
          {/* Linked records */}
          {isLoading ? (
            <div className="p-3 text-xs text-[#9AA2AF]">Loading...</div>
          ) : linkedRecords.length > 0 ? (
            <div className="p-1">
              <p className="px-2 py-1 text-[10px] font-medium text-[#9AA2AF] uppercase tracking-wider">
                Linked
              </p>
              {linkedRecords.map((rec) => (
                <div
                  key={rec.id}
                  className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-[#F1F5F9] dark:hover:bg-[hsl(200,25%,14%)] group"
                >
                  <span className="text-xs text-[#334155] dark:text-[hsl(200,25%,88%)] truncate">
                    {getRecordDisplayValue(rec, primaryField)}
                  </span>
                  <button
                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-[#E5E5E5] dark:hover:bg-[hsl(200,25%,18%)] transition-opacity"
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

          {/* Search results to link */}
          {searchTerm && filteredSearchResults.length > 0 && (
            <div className="p-1 border-t border-[#E5E5E5] dark:border-[hsl(200,25%,18%)]">
              <p className="px-2 py-1 text-[10px] font-medium text-[#9AA2AF] uppercase tracking-wider">
                Link new
              </p>
              {filteredSearchResults.map((rec) => (
                <div
                  key={rec.id}
                  className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-[#F1F5F9] dark:hover:bg-[hsl(200,25%,14%)] group"
                >
                  <span className="text-xs text-[#334155] dark:text-[hsl(200,25%,88%)] truncate">
                    {getRecordDisplayValue(rec, primaryField)}
                  </span>
                  <button
                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-[#DBEAFE] dark:hover:bg-[hsl(220,40%,20%)] transition-opacity"
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
}

export const LinkCellRenderer = React.memo(function LinkCellRenderer({
  value,
  field,
  record,
  rowHeight,
}: LinkCellRendererProps) {
  const count = Array.isArray(value)
    ? value.length
    : typeof value === 'number'
      ? value
      : 0;

  if (count === 0) {
    return (
      <span className="flex items-center justify-center w-full h-full opacity-0 group-hover/row:opacity-60 transition-opacity cursor-pointer">
        <Plus size={14} className="text-[#9AA2AF]" onClick={(e) => {
          e.stopPropagation();
          const btn = e.currentTarget.closest('[role="gridcell"]')?.querySelector('button');
          btn?.click();
        }} />
      </span>
    );
  }

  return (
    <LinkedRecordsPopover
      field={field}
      record={record}
      linkedCount={count}
    />
  );
});

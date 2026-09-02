import React, { useState, useCallback } from 'react';
import { Link2, Plus, X, Search } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { FieldMeta, RecordRow } from '@/features/database/types';
import { useLinkedRecords } from '../../hooks/useLinks';
import { useDatabaseUI } from '../../lib/store';

interface LinkCellRendererProps {
  value: any;
  field: FieldMeta;
  record: RecordRow;
  rowHeight: 'compact' | 'default' | 'tall' | 'extra-tall';
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
  const qc = useQueryClient();
  const { activeBaseId } = useDatabaseUI();

  const relatedTableId = field.options?.relatedTableId;
  const linkType = field.options?.type;

  const {
    data: linkedData,
    isLoading,
  } = useLinkedRecords({
    baseId: activeBaseId,
    sourceTableId: field.table_id,
    fieldId: field.id,
    recordId: isOpen ? record.id : null,
  });

  const linkedRecords = linkedData?.records ?? [];

  // Get the primary field of the related table for display
  const { data: primaryField } = useQuery({
    queryKey: ['nc', 'primary-field', relatedTableId],
    enabled: !!relatedTableId && isOpen,
    queryFn: async () => {
      const { data, error } = await supabase
        .schema('nc_meta')
        .from('fields')
        .select('*')
        .eq('table_id', relatedTableId)
        .eq('is_primary', true)
        .single();
      if (error) return null;
      return data as FieldMeta;
    },
  });

  // Search for records in the related table to link
  const { data: searchResults = [] } = useQuery({
    queryKey: ['nc', 'link-search', relatedTableId, searchTerm],
    enabled: !!relatedTableId && !!searchTerm && isOpen && !!activeBaseId,
    queryFn: async () => {
      const { data: base } = await supabase
        .schema('nc_meta')
        .from('bases')
        .select('schema_name')
        .eq('id', activeBaseId)
        .single();
      if (!base) return [];

      const { data: table } = await supabase
        .schema('nc_meta')
        .from('tables')
        .select('pg_table_name')
        .eq('id', relatedTableId)
        .single();
      if (!table) return [];

      const pf = primaryField;
      if (!pf || !pf.pg_column_name) {
        const { data, error } = await supabase
          .schema(base.schema_name)
          .from(table.pg_table_name)
          .select('*')
          .limit(20);
        if (error) return [];
        return data ?? [];
      }

      const { data, error } = await supabase
        .schema(base.schema_name)
        .from(table.pg_table_name)
        .select('*')
        .ilike(pf.pg_column_name, `%${searchTerm}%`)
        .limit(20);
      if (error) return [];
      return data ?? [];
    },
  });

  const getDisplayValue = (rec: any) => {
    if (primaryField?.pg_column_name && rec[primaryField.pg_column_name]) {
      return String(rec[primaryField.pg_column_name]);
    }
    return rec.id ? String(rec.id).slice(0, 8) : 'Record';
  };

  const handleLink = useCallback(
    async (targetRecordId: string) => {
      if (!activeBaseId || !relatedTableId) return;

      const { data: base } = await supabase
        .schema('nc_meta')
        .from('bases')
        .select('schema_name')
        .eq('id', activeBaseId)
        .single();
      if (!base) return;

      const { data: srcTable } = await supabase
        .schema('nc_meta')
        .from('tables')
        .select('pg_table_name')
        .eq('id', field.table_id)
        .single();
      const { data: tgtTable } = await supabase
        .schema('nc_meta')
        .from('tables')
        .select('pg_table_name')
        .eq('id', relatedTableId)
        .single();
      if (!srcTable || !tgtTable) return;

      const schema = base.schema_name;

      if (linkType === 'hm') {
        const fkCol = `${srcTable.pg_table_name}_id`;
        await supabase
          .schema(schema)
          .from(tgtTable.pg_table_name)
          .update({ [fkCol]: record.id })
          .eq('id', targetRecordId);
      } else if (linkType === 'bt') {
        const fkCol = `${tgtTable.pg_table_name}_id`;
        await supabase
          .schema(schema)
          .from(srcTable.pg_table_name)
          .update({ [fkCol]: targetRecordId })
          .eq('id', record.id);
      } else if (linkType === 'mm') {
        const { data: linkMeta } = await supabase
          .schema('nc_meta')
          .from('links')
          .select('junction_table_id')
          .eq('field_id', field.id)
          .single();
        if (!linkMeta?.junction_table_id) return;

        const { data: jTable } = await supabase
          .schema('nc_meta')
          .from('tables')
          .select('pg_table_name')
          .eq('id', linkMeta.junction_table_id)
          .single();
        if (!jTable) return;

        await supabase
          .schema(schema)
          .from(jTable.pg_table_name)
          .insert({
            [`${srcTable.pg_table_name}_id`]: record.id,
            [`${tgtTable.pg_table_name}_id`]: targetRecordId,
          });
      }

      qc.invalidateQueries({ queryKey: ['nc', 'linked-records'] });
      qc.invalidateQueries({ queryKey: ['nc', 'records'] });
    },
    [activeBaseId, relatedTableId, field, record.id, linkType, qc],
  );

  const handleUnlink = useCallback(
    async (targetRecordId: string) => {
      if (!activeBaseId || !relatedTableId) return;

      const { data: base } = await supabase
        .schema('nc_meta')
        .from('bases')
        .select('schema_name')
        .eq('id', activeBaseId)
        .single();
      if (!base) return;

      const { data: srcTable } = await supabase
        .schema('nc_meta')
        .from('tables')
        .select('pg_table_name')
        .eq('id', field.table_id)
        .single();
      const { data: tgtTable } = await supabase
        .schema('nc_meta')
        .from('tables')
        .select('pg_table_name')
        .eq('id', relatedTableId)
        .single();
      if (!srcTable || !tgtTable) return;

      const schema = base.schema_name;

      if (linkType === 'hm') {
        const fkCol = `${srcTable.pg_table_name}_id`;
        await supabase
          .schema(schema)
          .from(tgtTable.pg_table_name)
          .update({ [fkCol]: null })
          .eq('id', targetRecordId);
      } else if (linkType === 'bt') {
        const fkCol = `${tgtTable.pg_table_name}_id`;
        await supabase
          .schema(schema)
          .from(srcTable.pg_table_name)
          .update({ [fkCol]: null })
          .eq('id', record.id);
      } else if (linkType === 'mm') {
        const { data: linkMeta } = await supabase
          .schema('nc_meta')
          .from('links')
          .select('junction_table_id')
          .eq('field_id', field.id)
          .single();
        if (!linkMeta?.junction_table_id) return;

        const { data: jTable } = await supabase
          .schema('nc_meta')
          .from('tables')
          .select('pg_table_name')
          .eq('id', linkMeta.junction_table_id)
          .single();
        if (!jTable) return;

        await supabase
          .schema(schema)
          .from(jTable.pg_table_name)
          .delete()
          .eq(`${srcTable.pg_table_name}_id`, record.id)
          .eq(`${tgtTable.pg_table_name}_id`, targetRecordId);
      }

      qc.invalidateQueries({ queryKey: ['nc', 'linked-records'] });
      qc.invalidateQueries({ queryKey: ['nc', 'records'] });
    },
    [activeBaseId, relatedTableId, field, record.id, linkType, qc],
  );

  const linkedIds = new Set(linkedRecords.map((r: any) => r.id));
  const filteredSearchResults = searchResults.filter(
    (r: any) => !linkedIds.has(r.id),
  );

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium cursor-pointer hover:opacity-80 transition-opacity"
          style={{ backgroundColor: '#E0F2FE', color: '#006994' }}
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
        <div className="p-3 border-b border-[#E2E8F0]">
          <div className="flex items-center gap-2">
            <Search size={14} className="text-[#94A3B8]" />
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
            <div className="p-3 text-xs text-[#94A3B8]">Loading...</div>
          ) : linkedRecords.length > 0 ? (
            <div className="p-1">
              <p className="px-2 py-1 text-[10px] font-medium text-[#94A3B8] uppercase tracking-wider">
                Linked
              </p>
              {linkedRecords.map((rec: any) => (
                <div
                  key={rec.id}
                  className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-[#F1F5F9] group"
                >
                  <span className="text-xs text-[#334155] truncate">
                    {getDisplayValue(rec)}
                  </span>
                  <button
                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-[#E2E8F0] transition-opacity"
                    onClick={() => handleUnlink(rec.id)}
                  >
                    <X size={12} className="text-[#94A3B8]" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-3 text-xs text-[#94A3B8]">No linked records</div>
          )}

          {/* Search results to link */}
          {searchTerm && filteredSearchResults.length > 0 && (
            <div className="p-1 border-t border-[#E2E8F0]">
              <p className="px-2 py-1 text-[10px] font-medium text-[#94A3B8] uppercase tracking-wider">
                Link new
              </p>
              {filteredSearchResults.map((rec: any) => (
                <div
                  key={rec.id}
                  className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-[#F1F5F9] group"
                >
                  <span className="text-xs text-[#334155] truncate">
                    {getDisplayValue(rec)}
                  </span>
                  <button
                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-[#DBEAFE] transition-opacity"
                    onClick={() => handleLink(rec.id)}
                  >
                    <Plus size={12} className="text-[#006994]" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {searchTerm && filteredSearchResults.length === 0 && (
            <div className="p-3 text-xs text-[#94A3B8] border-t border-[#E2E8F0]">
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
  // For link fields, `value` may be a count or an array.
  // We show a pill badge with the count.
  const count = Array.isArray(value)
    ? value.length
    : typeof value === 'number'
      ? value
      : 0;

  return (
    <LinkedRecordsPopover
      field={field}
      record={record}
      linkedCount={count}
    />
  );
});

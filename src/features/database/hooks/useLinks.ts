import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { FieldMeta, RecordRow } from '../types';

export interface LinkMeta {
  id: string;
  base_id: string;
  source_table_id: string;
  source_field_id: string;
  target_table_id: string;
  target_field_id: string | null;
  relation_type: 'one_to_one' | 'one_to_many' | 'many_to_many';
  junction_table_id: string | null;
  created_at: string;
}

export function useLinks(tableId: string | null | undefined) {
  return useQuery({
    queryKey: ['nc', 'links', tableId],
    enabled: !!tableId,
    queryFn: async () => {
      const { data, error } = await supabase
        .schema('nc_meta')
        .from('links')
        .select('*')
        .eq('source_table_id', tableId);
      if (error) throw error;
      return data as LinkMeta[];
    },
  });
}

export function useCreateLink() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      base_id: string;
      table_id: string;
      field_name: string;
      target_table_id: string;
      relation_type: 'one_to_one' | 'one_to_many' | 'many_to_many';
    }) => {
      // 1. Create the field metadata with type Links
      const { data: field, error: fieldError } = await supabase
        .schema('nc_meta')
        .from('fields')
        .insert({
          table_id: input.table_id,
          name: input.field_name,
          pg_column_name: '',
          ui_type: 'Links',
          pg_type: '',
          options: {
            relatedTableId: input.target_table_id,
            type: input.relation_type === 'one_to_one'
              ? 'oo'
              : input.relation_type === 'one_to_many'
                ? 'hm'
                : 'mm',
          },
          position: 999,
          width: 180,
          is_primary: false,
          is_required: false,
          is_unique: false,
          is_system: false,
          is_hidden: false,
          description: null,
          default_value: null,
        })
        .select()
        .single();

      if (fieldError) throw fieldError;

      // 2. Create the link metadata record
      const { data: link, error: linkError } = await supabase
        .schema('nc_meta')
        .from('links')
        .insert({
          base_id: input.base_id,
          source_table_id: input.table_id,
          source_field_id: (field as FieldMeta).id,
          target_table_id: input.target_table_id,
          relation_type: input.relation_type,
        })
        .select()
        .single();

      if (linkError) throw linkError;

      return { field: field as FieldMeta, link: link as LinkMeta };
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['nc', 'fields', variables.table_id] });
      qc.invalidateQueries({ queryKey: ['nc', 'links', variables.table_id] });
    },
  });
}

export function useLinkedRecords(
  baseId: string | null | undefined,
  targetTableId: string | null | undefined,
  recordIds?: string[],
) {
  return useQuery({
    queryKey: ['nc', 'linked-records', baseId, targetTableId, recordIds],
    enabled: !!baseId && !!targetTableId,
    queryFn: async (): Promise<RecordRow[]> => {
      // Resolve schema and table name
      const { data: base, error: baseError } = await supabase
        .schema('nc_meta')
        .from('bases')
        .select('schema_name')
        .eq('id', baseId)
        .single();
      if (baseError) throw baseError;

      const { data: table, error: tableError } = await supabase
        .schema('nc_meta')
        .from('tables')
        .select('pg_table_name')
        .eq('id', targetTableId)
        .single();
      if (tableError) throw tableError;

      let query = supabase
        .schema(base.schema_name)
        .from(table.pg_table_name)
        .select('*')
        .order('created_at', { ascending: true })
        .limit(200);

      if (recordIds && recordIds.length > 0) {
        query = query.in('id', recordIds);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as RecordRow[];
    },
  });
}

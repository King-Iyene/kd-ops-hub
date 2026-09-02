import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { ViewMeta } from '../types';

export function useViews(tableId: string | null | undefined) {
  return useQuery({
    queryKey: ['nc', 'views', tableId],
    enabled: !!tableId,
    queryFn: async () => {
      const { data, error } = await supabase
        .schema('nc_meta')
        .from('views')
        .select('*')
        .eq('table_id', tableId)
        .order('position');
      if (error) throw error;
      return data as ViewMeta[];
    },
  });
}

export function useCreateView() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      table_id: string;
      name: string;
      type: ViewMeta['type'];
      filters?: ViewMeta['filters'];
      sorts?: ViewMeta['sorts'];
      groups?: ViewMeta['groups'];
      field_order?: string[];
      field_visibility?: Record<string, boolean>;
      field_widths?: Record<string, number>;
      position?: number;
    }) => {
      const { data, error } = await supabase
        .schema('nc_meta')
        .from('views')
        .insert({
          table_id: input.table_id,
          name: input.name,
          type: input.type,
          filters: input.filters ?? [],
          sorts: input.sorts ?? [],
          groups: input.groups ?? [],
          field_order: input.field_order ?? [],
          field_visibility: input.field_visibility ?? {},
          field_widths: input.field_widths ?? {},
          is_default: false,
          is_locked: false,
          position: input.position ?? 0,
        })
        .select()
        .single();

      if (error) throw error;
      return data as ViewMeta;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['nc', 'views', variables.table_id] });
    },
  });
}

export function useUpdateView() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      id: string;
      table_id: string;
      updates: Partial<Pick<ViewMeta, 'name' | 'filters' | 'sorts' | 'groups' | 'field_order' | 'field_visibility' | 'field_widths' | 'is_locked' | 'position'>>;
    }) => {
      const { data, error } = await supabase
        .schema('nc_meta')
        .from('views')
        .update(input.updates)
        .eq('id', input.id)
        .select()
        .single();

      if (error) throw error;
      return data as ViewMeta;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['nc', 'views', variables.table_id] });
    },
  });
}

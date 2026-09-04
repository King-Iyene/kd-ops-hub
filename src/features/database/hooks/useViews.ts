import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { ViewMeta } from '../types';
import { useDatabaseUI } from '../lib/store';

export function useViews(tableId: string | null | undefined) {
  return useQuery({
    queryKey: ['nc', 'views', tableId],
    enabled: !!tableId,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
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

export function useDeleteView() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: { id: string; table_id: string }) => {
      const { error } = await supabase
        .schema('nc_meta')
        .from('views')
        .delete()
        .eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['nc', 'views', variables.table_id] });
    },
  });
}

function viewConfigFromMeta(view: ViewMeta) {
  const hiddenFieldIds = new Set<string>();
  if (view.field_visibility) {
    for (const [fid, visible] of Object.entries(view.field_visibility)) {
      if (!visible) hiddenFieldIds.add(fid);
    }
  }
  return {
    filters: view.filters ?? [],
    sorts: view.sorts ?? [],
    groups: view.groups ?? [],
    hiddenFieldIds,
    fieldOrder: view.field_order ?? [],
    fieldWidths: view.field_widths ?? {},
  };
}

export function useActiveView(tableId: string | null | undefined) {
  const { data: views } = useViews(tableId);
  const activeViewId = useDatabaseUI((s) => s.activeViewId);
  const setActiveView = useDatabaseUI((s) => s.setActiveView);

  useEffect(() => {
    if (!views || views.length === 0) return;
    if (activeViewId && views.some((v) => v.id === activeViewId)) return;
    const defaultView = views.find((v) => v.is_default) ?? views[0];
    setActiveView(defaultView.id, viewConfigFromMeta(defaultView));
  }, [views, activeViewId, setActiveView]);
}

export function useLoadViewConfig() {
  const { data: views } = useViews(useDatabaseUI((s) => s.activeTableId));
  const setActiveView = useDatabaseUI((s) => s.setActiveView);

  return (viewId: string) => {
    const view = views?.find((v) => v.id === viewId);
    if (view) {
      setActiveView(viewId, viewConfigFromMeta(view));
    } else {
      setActiveView(viewId);
    }
  };
}

export function useSaveViewConfig() {
  const updateView = useUpdateView();
  const activeViewId = useDatabaseUI((s) => s.activeViewId);
  const activeTableId = useDatabaseUI((s) => s.activeTableId);

  return () => {
    if (!activeViewId || !activeTableId) return;
    const state = useDatabaseUI.getState();
    const fieldVisibility: Record<string, boolean> = {};
    for (const fid of state.hiddenFieldIds) {
      fieldVisibility[fid] = false;
    }
    updateView.mutate({
      id: activeViewId,
      table_id: activeTableId,
      updates: {
        filters: state.filters,
        sorts: state.sorts,
        groups: state.groupByLevels,
        field_visibility: fieldVisibility,
      },
    });
  };
}

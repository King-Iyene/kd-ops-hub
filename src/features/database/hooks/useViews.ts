import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/hooks/use-toast';
import type { ViewMeta } from '../types';
import { useDatabaseUI } from '../lib/store';
import { fetchViews, peekBootstrapInFlight } from './tableBootstrap';

export function useViews(tableId: string | null | undefined) {
  return useQuery({
    queryKey: ['nc', 'views', tableId],
    enabled: !!tableId,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      // Same as useFields: share the combined table request when it is already running.
      const inFlight = peekBootstrapInFlight(tableId);
      if (inFlight) {
        try {
          return (await inFlight).views;
        } catch {
          /* fall through to the plain request */
        }
      }
      return fetchViews(tableId as string);
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
      row_height?: ViewMeta['row_height'];
      row_color_rules?: ViewMeta['row_color_rules'];
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
          row_height: input.row_height ?? null,
          row_color_rules: input.row_color_rules ?? [],
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
    onError: (err: any) => {
      toast({ title: 'Failed to create view', description: err?.message ?? 'Unknown error', variant: 'destructive' });
    },
  });
}

export function useUpdateView() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      id: string;
      table_id: string;
      updates: Partial<Pick<ViewMeta, 'name' | 'filters' | 'sorts' | 'groups' | 'field_order' | 'field_visibility' | 'field_widths' | 'row_height' | 'row_color_rules' | 'is_locked' | 'position' | 'form_config'>>;
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
    onError: (err: any) => {
      toast({ title: 'Failed to update view', description: err?.message ?? 'Unknown error', variant: 'destructive' });
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
    onError: (err: any) => {
      toast({ title: 'Failed to delete view', description: err?.message ?? 'Unknown error', variant: 'destructive' });
    },
  });
}

export function viewConfigFromMeta(view: ViewMeta) {
  const hiddenFieldIds = new Set<string>();
  if (view.field_visibility) {
    for (const [fid, visible] of Object.entries(view.field_visibility)) {
      if (!visible) hiddenFieldIds.add(fid);
    }
  }
  return {
    type: view.type,
    filters: view.filters ?? [],
    sorts: view.sorts ?? [],
    groups: view.groups ?? [],
    hiddenFieldIds,
    fieldOrder: view.field_order ?? [],
    fieldWidths: view.field_widths ?? {},
    rowHeight: view.row_height ?? null,
    rowColorRules: view.row_color_rules ?? [],
  };
}

export function useActiveView(tableId: string | null | undefined) {
  const { data: views } = useViews(tableId);
  const activeViewId = useDatabaseUI((s) => s.activeViewId);
  const setActiveView = useDatabaseUI((s) => s.setActiveView);
  // The view whose saved settings are already in the screen's store, as "table:view".
  const appliedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!views || views.length === 0) return;
    const current = activeViewId ? views.find((v) => v.id === activeViewId) : undefined;
    if (!current) {
      const defaultView = views.find((v) => v.is_default) ?? views[0];
      appliedRef.current = `${tableId}:${defaultView.id}`;
      setActiveView(defaultView.id, viewConfigFromMeta(defaultView));
      return;
    }
    // The address (a deep link, or the command palette) can name a view without its settings.
    // Without this the previous view's filters, sorts and hidden fields stay in force and a
    // later change would be saved into the wrong view.
    const key = `${tableId}:${current.id}`;
    if (appliedRef.current !== key) {
      appliedRef.current = key;
      setActiveView(current.id, viewConfigFromMeta(current));
    }
  }, [views, activeViewId, tableId, setActiveView]);
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
        field_order: state.fieldOrder ?? [],
        field_widths: state.fieldWidths ?? {},
        row_height: state.rowHeight,
        row_color_rules: state.rowColorRules ?? [],
      },
    });
  };
}

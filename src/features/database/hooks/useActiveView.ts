import { useEffect, useRef, useCallback } from 'react';
import { useDatabaseUI } from '../lib/store';
import { useViews, useUpdateView } from './useViews';
import type { ViewMeta } from '../types';

/**
 * Syncs the active view's filters/sorts/field_visibility with the Zustand store.
 * When the view loads, its saved state is pushed into the store.
 * When the store's filters/sorts change, they are debounce-saved back to the view.
 */
export function useActiveView(tableId: string | null | undefined) {
  const activeViewId = useDatabaseUI((s) => s.activeViewId);
  const setFilters = useDatabaseUI((s) => s.setFilters);
  const setSorts = useDatabaseUI((s) => s.setSorts);
  const setHiddenFieldIds = useDatabaseUI((s) => s.setHiddenFieldIds);
  const filters = useDatabaseUI((s) => s.filters);
  const sorts = useDatabaseUI((s) => s.sorts);
  const hiddenFieldIds = useDatabaseUI((s) => s.hiddenFieldIds);

  const { data: views } = useViews(tableId);
  const updateView = useUpdateView();

  const activeView = views?.find((v) => v.id === activeViewId) ?? null;

  // Track whether we're currently loading view data into the store
  // to avoid saving it right back.
  const isLoadingRef = useRef(false);
  const prevViewIdRef = useRef<string | null>(null);

  // When activeViewId changes, load view state into store
  useEffect(() => {
    if (!activeView) return;
    if (prevViewIdRef.current === activeView.id) return;
    prevViewIdRef.current = activeView.id;

    isLoadingRef.current = true;
    setFilters(activeView.filters ?? []);
    setSorts(activeView.sorts ?? []);

    // Convert field_visibility to hidden field IDs set
    const hidden = new Set<string>();
    if (activeView.field_visibility) {
      for (const [fieldId, visible] of Object.entries(activeView.field_visibility)) {
        if (!visible) hidden.add(fieldId);
      }
    }
    setHiddenFieldIds(hidden);

    // Allow saves again after a tick
    requestAnimationFrame(() => {
      isLoadingRef.current = false;
    });
  }, [activeView, setFilters, setSorts, setHiddenFieldIds]);

  // Debounced auto-save back to view
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveToView = useCallback(() => {
    if (!activeView || !tableId || isLoadingRef.current) return;

    // Convert hiddenFieldIds set to field_visibility object
    const field_visibility: Record<string, boolean> = {};
    hiddenFieldIds.forEach((id) => {
      field_visibility[id] = false;
    });

    updateView.mutate({
      id: activeView.id,
      table_id: tableId,
      updates: {
        filters,
        sorts,
        field_visibility,
      },
    });
  }, [activeView, tableId, filters, sorts, hiddenFieldIds, updateView]);

  useEffect(() => {
    if (isLoadingRef.current || !activeView) return;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(saveToView, 500);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [filters, sorts, hiddenFieldIds, saveToView, activeView]);

  return activeView;
}

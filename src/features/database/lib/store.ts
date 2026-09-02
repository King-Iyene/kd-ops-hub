import { create } from 'zustand';
import type { Filter, Sort } from '../types';

interface DatabaseUIState {
  activeBaseId: string | null;
  activeTableId: string | null;
  activeViewId: string | null;
  sidebarOpen: boolean;
  selectedCellId: string | null; // "rowId:fieldId"
  editingCellId: string | null;
  rowHeight: 'compact' | 'default' | 'tall' | 'extra-tall';
  filters: Filter[];
  sorts: Sort[];
  hiddenFieldIds: Set<string>;
  searchQuery: string;

  setActiveBase: (id: string | null) => void;
  setActiveTable: (id: string | null) => void;
  setActiveView: (id: string | null) => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setSelectedCell: (id: string | null) => void;
  setEditingCell: (id: string | null) => void;
  setRowHeight: (h: 'compact' | 'default' | 'tall' | 'extra-tall') => void;
  setFilters: (filters: Filter[]) => void;
  setSorts: (sorts: Sort[]) => void;
  setHiddenFieldIds: (ids: Set<string>) => void;
  toggleHiddenField: (id: string) => void;
  setSearchQuery: (q: string) => void;
}

export const useDatabaseUI = create<DatabaseUIState>((set) => ({
  activeBaseId: null,
  activeTableId: null,
  activeViewId: null,
  sidebarOpen: true,
  selectedCellId: null,
  editingCellId: null,
  rowHeight: 'default',
  filters: [],
  sorts: [],
  hiddenFieldIds: new Set(),
  searchQuery: '',

  setActiveBase: (id) => set({
    activeBaseId: id,
    activeTableId: null,
    activeViewId: null,
    filters: [],
    sorts: [],
    hiddenFieldIds: new Set(),
    searchQuery: '',
  }),
  setActiveTable: (id) => set({
    activeTableId: id,
    activeViewId: null,
    filters: [],
    sorts: [],
    hiddenFieldIds: new Set(),
    searchQuery: '',
  }),
  setActiveView: (id) => set({ activeViewId: id }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setSelectedCell: (id) => set({ selectedCellId: id }),
  setEditingCell: (id) => set({ editingCellId: id }),
  setRowHeight: (h) => set({ rowHeight: h }),
  setFilters: (filters) => set({ filters }),
  setSorts: (sorts) => set({ sorts }),
  setHiddenFieldIds: (ids) => set({ hiddenFieldIds: ids }),
  toggleHiddenField: (id) => set((s) => {
    const next = new Set(s.hiddenFieldIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    return { hiddenFieldIds: next };
  }),
  setSearchQuery: (q) => set({ searchQuery: q }),
}));

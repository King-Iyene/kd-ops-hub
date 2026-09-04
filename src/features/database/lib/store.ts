import { create } from 'zustand';
import type { Filter, FilterGroup, Sort, Group, RowColorRule, ConditionalFormatRule } from '../types';

export type SummaryFunction =
  | 'none'
  | 'sum'
  | 'avg'
  | 'min'
  | 'max'
  | 'count'
  | 'countEmpty'
  | 'countFilled'
  | 'percentEmpty'
  | 'percentFilled';

interface DatabaseUIState {
  activeBaseId: string | null;
  activeTableId: string | null;
  activeViewId: string | null;
  activeViewType: string | null;
  sidebarOpen: boolean;
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  selectedCellId: string | null;
  editingCellId: string | null;
  rowHeight: 'short' | 'medium' | 'tall' | 'extra-tall';
  filters: Filter[];
  filterGroups: FilterGroup[];
  sorts: Sort[];
  groupByLevels: Group[];
  hiddenFieldIds: Set<string>;
  fieldOrder: string[];
  searchQuery: string;
  rowColorRules: RowColorRule[];
  conditionalFormats: ConditionalFormatRule[];
  summaryFunctions: Record<string, SummaryFunction>;
  fieldWidths: Record<string, number>;
  frozenColumns: number;
  focusedFilterId: string | null;

  setConditionalFormats: (rules: ConditionalFormatRule[]) => void;
  setActiveBase: (id: string | null) => void;
  setActiveTable: (id: string | null) => void;
  setActiveView: (id: string | null, viewConfig?: {
    type?: string;
    filters?: Filter[];
    sorts?: Sort[];
    groups?: Group[];
    hiddenFieldIds?: Set<string>;
    fieldOrder?: string[];
    fieldWidths?: Record<string, number>;
  }) => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebarCollapsed: () => void;
  setSidebarWidth: (width: number) => void;
  setSelectedCell: (id: string | null) => void;
  setEditingCell: (id: string | null) => void;
  setRowHeight: (h: 'short' | 'medium' | 'tall' | 'extra-tall') => void;
  setFilters: (filters: Filter[]) => void;
  setFilterGroups: (groups: FilterGroup[]) => void;
  setFocusedFilterId: (id: string | null) => void;
  setSorts: (sorts: Sort[]) => void;
  setGroupByLevels: (groups: Group[]) => void;
  toggleHiddenField: (fieldId: string) => void;
  setFieldOrder: (order: string[]) => void;
  setSearchQuery: (query: string) => void;
  setRowColorRules: (rules: RowColorRule[]) => void;
  setSummaryFunction: (fieldId: string, fn: SummaryFunction) => void;
  setFieldWidth: (fieldId: string, width: number) => void;
  setFrozenColumns: (count: number) => void;
}

export const useDatabaseUI = create<DatabaseUIState>((set) => ({
  activeBaseId: null,
  activeTableId: null,
  activeViewId: null,
  activeViewType: null,
  sidebarOpen: true,
  sidebarCollapsed: false,
  sidebarWidth: 260,
  selectedCellId: null,
  editingCellId: null,
  rowHeight: 'medium',
  filters: [],
  filterGroups: [],
  focusedFilterId: null,
  sorts: [],
  groupByLevels: [],
  hiddenFieldIds: new Set(),
  fieldOrder: [],
  searchQuery: '',
  rowColorRules: [],
  conditionalFormats: [],
  summaryFunctions: {},
  fieldWidths: {},
  frozenColumns: 0,

  setActiveBase: (id) =>
    set({
      activeBaseId: id,
      activeTableId: null,
      activeViewId: null,
  activeViewType: null,
      filters: [],
      filterGroups: [],
      focusedFilterId: null,
      sorts: [],
      groupByLevels: [],
      hiddenFieldIds: new Set(),
      fieldOrder: [],
      searchQuery: '',
      rowColorRules: [],
      fieldWidths: {},
      summaryFunctions: {},
    }),
  setActiveTable: (id) =>
    set({
      activeTableId: id,
      activeViewId: null,
  activeViewType: null,
      filters: [],
      filterGroups: [],
      focusedFilterId: null,
      sorts: [],
      groupByLevels: [],
      hiddenFieldIds: new Set(),
      fieldOrder: [],
      searchQuery: '',
      rowColorRules: [],
      fieldWidths: {},
      summaryFunctions: {},
    }),
  setActiveView: (id, viewConfig) => set((state) => ({
    activeViewId: id,
    activeViewType: viewConfig?.type ?? (viewConfig === undefined ? state.activeViewType : null),
    ...(viewConfig ? {
      filters: viewConfig.filters ?? [],
      sorts: viewConfig.sorts ?? [],
      groupByLevels: viewConfig.groups ?? [],
      hiddenFieldIds: viewConfig.hiddenFieldIds ?? new Set(),
      fieldOrder: viewConfig.fieldOrder ?? [],
      fieldWidths: viewConfig.fieldWidths ?? {},
    } : {}),
  })),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  toggleSidebarCollapsed: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setSidebarWidth: (width) => set({ sidebarWidth: Math.min(400, Math.max(200, width)) }),
  setSelectedCell: (id) => set({ selectedCellId: id }),
  setEditingCell: (id) => set({ editingCellId: id }),
  setRowHeight: (h) => set({ rowHeight: h }),
  setFilters: (filters) => set({ filters }),
  setFilterGroups: (groups) => set({ filterGroups: groups }),
  setFocusedFilterId: (id) => set({ focusedFilterId: id }),
  setSorts: (sorts) => set({ sorts }),
  setGroupByLevels: (groups) => set({ groupByLevels: groups }),
  toggleHiddenField: (fieldId) =>
    set((s) => {
      const next = new Set(s.hiddenFieldIds);
      if (next.has(fieldId)) next.delete(fieldId);
      else next.add(fieldId);
      return { hiddenFieldIds: next };
    }),
  setFieldOrder: (order) => set({ fieldOrder: order }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setRowColorRules: (rules) => set({ rowColorRules: rules }),
  setConditionalFormats: (rules) => set({ conditionalFormats: rules }),
  setSummaryFunction: (fieldId, fn) =>
    set((s) => ({
      summaryFunctions: { ...s.summaryFunctions, [fieldId]: fn },
    })),
  setFieldWidth: (fieldId, width) =>
    set((s) => ({
      fieldWidths: { ...s.fieldWidths, [fieldId]: width },
    })),
  setFrozenColumns: (count) => set({ frozenColumns: count }),
}));

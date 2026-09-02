import { create } from 'zustand';
import type { Filter, Sort, Group, RowColorRule, ConditionalFormatRule } from '../types';

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
  sidebarOpen: boolean;
  selectedCellId: string | null;
  editingCellId: string | null;
  rowHeight: 'compact' | 'default' | 'tall' | 'extra-tall';
  filters: Filter[];
  sorts: Sort[];
  groupBy: Group | null;
  hiddenFieldIds: Set<string>;
  fieldOrder: string[];
  searchQuery: string;
  rowColorRules: RowColorRule[];
  conditionalFormats: ConditionalFormatRule[];
  summaryFunctions: Record<string, SummaryFunction>;
  fieldWidths: Record<string, number>;
  frozenColumns: number;

  setConditionalFormats: (rules: ConditionalFormatRule[]) => void;
  setActiveBase: (id: string | null) => void;
  setActiveTable: (id: string | null) => void;
  setActiveView: (id: string | null, viewConfig?: {
    filters?: Filter[];
    sorts?: Sort[];
    groups?: Group[];
    hiddenFieldIds?: Set<string>;
    fieldOrder?: string[];
  }) => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setSelectedCell: (id: string | null) => void;
  setEditingCell: (id: string | null) => void;
  setRowHeight: (h: 'compact' | 'default' | 'tall' | 'extra-tall') => void;
  setFilters: (filters: Filter[]) => void;
  setSorts: (sorts: Sort[]) => void;
  setGroupBy: (group: Group | null) => void;
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
  sidebarOpen: true,
  selectedCellId: null,
  editingCellId: null,
  rowHeight: 'default',
  filters: [],
  sorts: [],
  groupBy: null,
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
      filters: [],
      sorts: [],
      groupBy: null,
      hiddenFieldIds: new Set(),
      fieldOrder: [],
      searchQuery: '',
      rowColorRules: [],
    }),
  setActiveTable: (id) =>
    set({
      activeTableId: id,
      activeViewId: null,
      filters: [],
      sorts: [],
      groupBy: null,
      hiddenFieldIds: new Set(),
      fieldOrder: [],
      searchQuery: '',
      rowColorRules: [],
    }),
  setActiveView: (id, viewConfig) => set({
    activeViewId: id,
    ...(viewConfig ? {
      filters: viewConfig.filters ?? [],
      sorts: viewConfig.sorts ?? [],
      groupBy: viewConfig.groups?.[0] ?? null,
      hiddenFieldIds: viewConfig.hiddenFieldIds ?? new Set(),
      fieldOrder: viewConfig.fieldOrder ?? [],
    } : {}),
  }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setSelectedCell: (id) => set({ selectedCellId: id }),
  setEditingCell: (id) => set({ editingCellId: id }),
  setRowHeight: (h) => set({ rowHeight: h }),
  setFilters: (filters) => set({ filters }),
  setSorts: (sorts) => set({ sorts }),
  setGroupBy: (group) => set({ groupBy: group }),
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

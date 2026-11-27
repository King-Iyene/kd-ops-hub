import { useQueryClient } from '@tanstack/react-query';
import { useState, useCallback, useMemo, useEffect, useRef, lazy, Suspense, useDeferredValue } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Toolbar } from '../components/Toolbar';
import { ViewBar } from '../components/ViewBar';
import { useDatabaseUI } from '../lib/store';
import { useUndoStore } from '../lib/undo';
import {
  useFields,
  useInfiniteRecords,
  useReorderRows,
  useCreateRecord,
  useUpdateRecord,
  useDeleteRecord,
  useSoftDeleteRecord,
  restoreRecords,
  useBulkSoftDeleteRecords,
  useDuplicateRecord,
  useCreateField,
  useDeleteField,
  useDuplicateField,
  useReorderFields,
  useActiveView,
  useViews,
  useUpdateView,
  useUpdateField,
} from '../hooks';
import GridView from '../components/grid/GridView';
import type { FieldMeta, RecordRow } from '../types';
import { useRealtimeRecords } from '../hooks/useRealtime';
import { LinkDataContext, useBatchedLinks, type LinkDataValue } from '../hooks/useBatchedLinks';
import { parseFormula, evaluateFormula } from '../lib/formula';
import { useLinkDisplayLookup } from '../hooks/useLinkDisplayLookup';
import { useFooterTotals } from '../hooks/useFooterTotals';
import { orgToday, orgNowIso } from '@/lib/format';
import { defaultForNewRow } from '../lib/fieldDefaults';
import { isUuid } from '../lib/shortId';
import { createRecordDecorator } from '../lib/recordDecorator';
import { viewGateOpen } from '../lib/prefetch';
import { useEnsureTableBootstrap } from '../hooks/usePrefetchTable';
import { DEFAULT_RECORDS_PAGE_SIZE } from '../hooks/useRecords';
import { describeViewLoad, shouldLoadMoreForView } from '../lib/viewPaging';

const KanbanView = lazy(() => import('../components/views/KanbanView'));
const GalleryView = lazy(() => import('../components/views/GalleryView'));
const FormView = lazy(() => import('../components/views/FormView'));
const CalendarView = lazy(() => import('../components/views/CalendarView'));
const TimelineView = lazy(() => import('../components/views/TimelineView'));
const GanttView = lazy(() => import('../components/views/GanttView'));
const ExpandedRowModal = lazy(() => import('../components/ExpandedRowModal').then(m => ({ default: m.ExpandedRowModal })));
const CreateFieldDialog = lazy(() => import('../components/CreateFieldDialog').then(m => ({ default: m.CreateFieldDialog })));
const FindReplaceDialog = lazy(() => import('../components/FindReplaceDialog').then(m => ({ default: m.FindReplaceDialog })));
const PrintView = lazy(() => import('../components/PrintView').then(m => ({ default: m.PrintView })));

function ViewSkeleton() {
  return (
    <div className="flex-1 flex flex-col animate-pulse p-4 gap-3">
      <div className="flex gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-8 rounded bg-[#E5E5E5]/60 dark:bg-[hsl(220,25%,18%)] flex-1" />
        ))}
      </div>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex gap-3">
          {Array.from({ length: 5 }).map((_, j) => (
            <div key={j} className="h-6 rounded bg-[#E5E5E5]/40 dark:bg-[hsl(220,25%,16%)] flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

function LinkedRecordExpandModal() {
  const linkedRecordExpand = useDatabaseUI((s) => s.linkedRecordExpand);
  const setLinkedRecordExpand = useDatabaseUI((s) => s.setLinkedRecordExpand);
  const { data: linkedFields } = useFields(linkedRecordExpand?.tableId);

  if (!linkedRecordExpand) return null;

  return (
    <ExpandedRowModal
      open={true}
      onOpenChange={(open) => {
        if (!open) setLinkedRecordExpand(null);
      }}
      record={linkedRecordExpand.record}
      fields={linkedFields ?? []}
      baseId={linkedRecordExpand.baseId}
      tableId={linkedRecordExpand.tableId}
    />
  );
}

export function TableView() {
  // Only the settings this screen uses. Subscribing to the whole store re-rendered the table (and, through
  // new callbacks, the whole grid) every time a cell was selected or edited.
  const {
    activeTableId,
    activeBaseId,
    activeViewId,
    filters,
    filterGroups,
    sorts,
    hiddenFieldIds,
    searchQuery,
    fieldWidths,
    fieldOrder,
  } = useDatabaseUI(
    useShallow((s) => ({
      activeTableId: s.activeTableId,
      activeBaseId: s.activeBaseId,
      activeViewId: s.activeViewId,
      filters: s.filters,
      filterGroups: s.filterGroups,
      sorts: s.sorts,
      hiddenFieldIds: s.hiddenFieldIds,
      searchQuery: s.searchQuery,
      fieldWidths: s.fieldWidths,
      fieldOrder: s.fieldOrder,
    })),
  );
  const deferredSearch = useDeferredValue(searchQuery);
  // First, so the combined table request is already on its way when the hooks below ask for the same data.
  useEnsureTableBootstrap(activeBaseId, activeTableId);
  useActiveView(activeTableId);
  useRealtimeRecords(activeBaseId ?? undefined, activeTableId ?? undefined);
  const { data: fields, isPlaceholderData: fieldsArePlaceholder } = useFields(activeTableId);
  const { data: views, isPlaceholderData: viewsArePlaceholder, failureCount: viewsFailureCount } = useViews(activeTableId);
  const pageSize = DEFAULT_RECORDS_PAGE_SIZE;
  const [galleryPage, setGalleryPage] = useState(0);
  const [fieldDialogOpen, setFieldDialogOpenRaw] = useState(false);
  const setEditingCell = useDatabaseUI((s) => s.setEditingCell);
  const setFieldDialogOpen = useCallback((open: boolean) => {
    if (open) setEditingCell(null);
    setFieldDialogOpenRaw(open);
  }, [setEditingCell]);
  const pushUndo = useUndoStore((s) => s.push);
  const [findReplaceOpen, setFindReplaceOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);

  // Listen for print event from toolbar
  useEffect(() => {
    const handler = () => setPrintOpen(true);
    window.addEventListener('kdops:print', handler);
    return () => window.removeEventListener('kdops:print', handler);
  }, []);

  // Ctrl+F / Ctrl+H to open Find & Replace, Ctrl+P for print
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'h')) {
        e.preventDefault();
        setFindReplaceOpen(true);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault();
        setPrintOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const activeView = useMemo(
    () => views?.find((v) => v.id === activeViewId),
    [views, activeViewId],
  );

  const updateView = useUpdateView();
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const groupByLevels = useDatabaseUI((s) => s.groupByLevels);

  // Saving the view's settings must only happen when a person changed something.
  // The old effect saved once for every page load (the saved settings arriving in
  // the store looked like an edit), which is a needless database write each time.
  const hydrateUntilRef = useRef(0);
  const baselineSigRef = useRef<string | null>(null);

  useEffect(() => {
    // A new view: give its saved settings a moment to land in the store.
    hydrateUntilRef.current = Date.now() + 1500;
    baselineSigRef.current = null;
  }, [activeViewId]);

  useEffect(() => {
    if (!activeViewId || !activeTableId) return;
    const fieldVisibility: Record<string, boolean> = {};
    for (const fid of hiddenFieldIds) fieldVisibility[fid] = false;
    const updates = {
      filters,
      sorts,
      groups: groupByLevels,
      field_visibility: fieldVisibility,
      field_widths: fieldWidths,
      field_order: fieldOrder,
    };
    const sig = JSON.stringify(updates);

    // Same as what is already saved on the server: nothing to write.
    if (activeView) {
      const saved = activeView as unknown as Record<string, unknown>;
      const savedSig = JSON.stringify({
        filters: saved.filters ?? [],
        sorts: saved.sorts ?? [],
        groups: saved.groups ?? [],
        field_visibility: saved.field_visibility ?? {},
        field_widths: saved.field_widths ?? {},
        field_order: saved.field_order ?? [],
      });
      if (sig === savedSig) {
        baselineSigRef.current = sig;
        return;
      }
    }
    // Still loading the view's settings into the screen: remember them, do not save them back.
    if (Date.now() < hydrateUntilRef.current || baselineSigRef.current === null) {
      baselineSigRef.current = sig;
      return;
    }
    if (sig === baselineSigRef.current) return;

    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      baselineSigRef.current = sig;
      updateView.mutate({ id: activeViewId, table_id: activeTableId, updates });
    }, 2000);
    return () => clearTimeout(saveTimerRef.current);
  }, [filters, sorts, groupByLevels, hiddenFieldIds, fieldWidths, fieldOrder, activeViewId, activeTableId, updateView, activeView]);

  // The table opens with no filters in the store and learns the default view's saved filters and sorts a
  // moment later. Asking for rows in between wasted a request on the wrong filters and showed rows that then
  // changed. The views arrive together with the columns, so holding back costs no network time (and the
  // first page for the right filters is usually already loading, see prefetchTable).
  const viewsReady = viewGateOpen({
    views,
    viewsArePlaceholder,
    viewsFailed: viewsFailureCount > 0,
    activeViewId,
  });

  const {
    records: infiniteRecords,
    totalCount: infiniteTotalCount,
    data: recordsData,
    isLoading: recordsQueryLoading,
    isPlaceholderData: recordsArePlaceholder,
    isError,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteRecords({
    baseId: activeBaseId!,
    tableId: activeTableId!,
    pageSize,
    filters: filters.length > 0 ? filters : undefined,
    filterGroups: filterGroups.length > 0 ? filterGroups : undefined,
    sorts: sorts.length > 0 ? sorts : undefined,
    search: deferredSearch || undefined,
    enabled: viewsReady,
  });
  // A held-back request is not 'loading' as far as the query knows; the screen still must not call it empty.
  const isLoading = recordsQueryLoading || (!viewsReady && !recordsData);

  // Names for old Airtable-style link ids. Loaded after the first rows so it never delays them.
  const linkLookup = useLinkDisplayLookup(activeBaseId, fields, !isLoading);

  const createRecord = useCreateRecord();
  const updateRecord = useUpdateRecord();
  const deleteRecord = useDeleteRecord();
  const duplicateRecord = useDuplicateRecord();
  const queryClient = useQueryClient();
  const softDeleteRecord = useSoftDeleteRecord();
  const bulkSoftDelete = useBulkSoftDeleteRecords();
  const createField = useCreateField();
  const deleteField = useDeleteField();
  const duplicateField = useDuplicateField();
  const updateField = useUpdateField();
  const reorderFields = useReorderFields();
  const reorderRows = useReorderRows();
  const [expandedRecord, setExpandedRecordRaw] = useState<RecordRow | null>(null);
  const setExpandedRecord = useCallback((record: RecordRow | null) => {
    setExpandedRecordRaw(record);
    const url = new URL(window.location.href);
    if (record) {
      url.searchParams.set('rowId', record.id);
    } else {
      url.searchParams.delete('rowId');
    }
    window.history.replaceState(null, '', url.toString());
  }, []);

  // Patch virtual formula fields with a synthetic pg_column_name so cell
  // renderers can find computed values in the record object.
  const patchedFields = useMemo(
    () =>
      (fields ?? []).map((f) =>
        f.ui_type === 'Formula' && !f.pg_column_name
          ? { ...f, pg_column_name: `__formula_${f.id}` }
          : f,
      ),
    [fields],
  );

  const visibleFields = useMemo(
    () =>
      patchedFields
        .filter((f) => !f.is_hidden && !hiddenFieldIds.has(f.id))
        .sort((a, b) => a.position - b.position),
    [patchedFields, hiddenFieldIds],
  );

  // Footer totals over the whole filtered table, not just the loaded rows. Read after the first rows show.
  const summaryFunctions = useDatabaseUI((s) => s.summaryFunctions);
  const footerTotals = useFooterTotals({
    baseId: activeBaseId,
    tableId: activeTableId,
    filters: filters.length > 0 ? filters : undefined,
    filterGroups: filterGroups.length > 0 ? filterGroups : undefined,
    search: deferredSearch || undefined,
    fields: visibleFields,
    summaryFunctions,
    loadedCount: infiniteRecords.length,
    totalCount: infiniteTotalCount,
    // Not held back while old rows show during a re-sort: the totals do not depend on the sort, and the
    // query is keyed by filters and search, so it can never show another filter's numbers.
    enabled: !isLoading,
  });

  // Link fields get a stable column key even when they have no physical column,
  // so formulas such as {Month} & " — " & {Category} can read them.
  const linkColumnOf = useCallback(
    (f: FieldMeta) => f.pg_column_name || `__link_${f.id}`,
    [],
  );

  // Which link columns to load in bulk: the ones on screen, the ones a formula
  // reads, and (for views that show every field) all of them.
  const storedViewType = useDatabaseUI((s) => s.activeViewType);
  const linkFieldsToLoad = useMemo(() => {
    const all = patchedFields.filter((f) => f.ui_type === 'Links' && !!f.options?.relatedTableId);
    if (all.length === 0) return all;
    const kind = activeView?.type ?? storedViewType ?? 'grid';
    if (kind !== 'grid' && kind !== 'kanban' && kind !== 'gallery') return all;
    const formulaText = patchedFields
      .filter((f) => f.ui_type === 'Formula')
      .map((f) => String(f.options?.expression || f.options?.formula || ''))
      .join('\n');
    const visibleIds = new Set(visibleFields.map((f) => f.id));
    return all.filter((f) => visibleIds.has(f.id) || formulaText.includes(`{${f.name}}`));
  }, [patchedFields, visibleFields, activeView?.type, storedViewType]);

  // Real row ids only (a row being added briefly has a temporary id that is not a uuid), and a
  // list that keeps its identity while rows are edited so the link queries are not rebuilt.
  const idList = useMemo(
    () => infiniteRecords.map((r) => r.id).filter((id) => isUuid(String(id))).join(','),
    [infiniteRecords],
  );
  const recordIds = useMemo(() => (idList ? idList.split(',') : []), [idList]);
  const { links: batchedLinks, isLoading: linksLoading } = useBatchedLinks(
    activeBaseId,
    linkFieldsToLoad,
    recordIds,
  );

  const linkData = useMemo<LinkDataValue>(
    () => ({
      links: batchedLinks,
      isLoading: linksLoading,
      fieldIds: new Set(linkFieldsToLoad.map((f) => f.id)),
    }),
    [batchedLinks, linksLoading, linkFieldsToLoad],
  );

  // id -> readable name for every record the formulas might touch.
  const mergedLookup = useMemo(() => {
    if (batchedLinks.size === 0) return linkLookup;
    const merged: Record<string, string> = { ...linkLookup };
    for (const perRecord of batchedLinks.values()) {
      for (const items of perRecord.values()) {
        for (const item of items) merged[item.id] = item.label;
      }
    }
    return merged;
  }, [linkLookup, batchedLinks]);

  const formulaParsed = useMemo(() => {
    if (!patchedFields || patchedFields.length === 0) return null;
    const formulaFields = patchedFields.filter(
      (f) => f.ui_type === 'Formula' && (f.options?.expression || f.options?.formula),
    );
    if (formulaFields.length === 0) return null;
    const fieldMap: Record<string, string> = {};
    for (const f of patchedFields) {
      if (f.ui_type === 'Links') fieldMap[f.name] = linkColumnOf(f);
      else if (f.pg_column_name) fieldMap[f.name] = f.pg_column_name;
    }
    const parsed = formulaFields.map((f) => {
      try {
        return { col: f.pg_column_name, ast: parseFormula((f.options.expression || f.options.formula)!) };
      } catch {
        return { col: f.pg_column_name, ast: null };
      }
    });
    return { parsed, fieldMap };
  }, [patchedFields, linkColumnOf]);

  // Rows plus what the grid derives for them (link ids, formula results, readable names). The decorator
  // remembers each row with what it was built from, so a page arriving, a link chunk finishing or the names
  // lookup growing only rebuilds the rows it actually touches; unchanged rows keep their identity and the
  // memoised grid rows skip rendering. Formulas are evaluated once per row version, not on every change.
  const decoratorRef = useRef<ReturnType<typeof createRecordDecorator>>();
  if (!decoratorRef.current) decoratorRef.current = createRecordDecorator();

  const records = useMemo(() => {
    const raw = infiniteRecords;
    if (!patchedFields || patchedFields.length === 0) return raw;

    // The links table is the source of truth for link columns, so it replaces the stored ids once loaded.
    // Without formulas nothing reads those columns, so (as before) they are left alone.
    const linkColumns = formulaParsed
      ? linkFieldsToLoad
          .filter((f) => batchedLinks.has(f.id))
          .map((f) => ({ fieldId: f.id, column: linkColumnOf(f) }))
      : [];

    return decoratorRef.current!.decorate(raw, {
      formulas: formulaParsed?.parsed ?? [],
      fieldMap: formulaParsed?.fieldMap ?? {},
      linkColumns,
      getLinkItems: (fieldId, recordId) => batchedLinks.get(fieldId)?.get(recordId),
      lookup: mergedLookup,
      evaluate: evaluateFormula,
      structure: [formulaParsed],
    }) as RecordRow[];
  }, [infiniteRecords, patchedFields, mergedLookup, formulaParsed, linkFieldsToLoad, batchedLinks, linkColumnOf]);

  // Auto-expand record from URL deep link (?rowId=...)
  const deepLinkedRef = useRef(false);
  useEffect(() => {
    if (deepLinkedRef.current || records.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const rowId = params.get('rowId');
    if (rowId) {
      const match = records.find((r) => r.id === rowId);
      if (match) {
        setExpandedRecordRaw(match);
        deepLinkedRef.current = true;
      }
    }
  }, [records]);

  // Read the latest rows and fields through refs so this callback keeps one identity: it is handed to every
  // cell, and a new one on each change of the rows re-rendered every visible cell.
  const recordsRef = useRef(records);
  recordsRef.current = records;
  const fieldsRef = useRef(fields);
  fieldsRef.current = fields;
  const updateRecordMutate = updateRecord.mutate;

  const handleCellUpdate = useCallback(
    (recordId: string, fieldId: string, value: any) => {
      const field = fieldsRef.current?.find((f) => f.id === fieldId);
      if (!field || !activeBaseId || !activeTableId) return;

      const record = recordsRef.current.find((r: RecordRow) => r.id === recordId);
      const oldValue = record?.[field.pg_column_name];

      updateRecordMutate({
        baseId: activeBaseId,
        tableId: activeTableId,
        recordId,
        field: field.pg_column_name,
        value,
      });

      pushUndo({
        type: 'cell_update',
        payload: { recordId, fieldId, oldValue, newValue: value },
        undo: async () => {
          updateRecordMutate({
            baseId: activeBaseId,
            tableId: activeTableId,
            recordId,
            field: field.pg_column_name,
            value: oldValue,
          });
        },
        redo: async () => {
          updateRecordMutate({
            baseId: activeBaseId,
            tableId: activeTableId,
            recordId,
            field: field.pg_column_name,
            value,
          });
        },
      });
    },
    [activeBaseId, activeTableId, updateRecordMutate, pushUndo],
  );

  const handleAddRow = useCallback(
    (record?: Record<string, any>) => {
      if (!activeBaseId || !activeTableId) return;
      const defaults: Record<string, any> = {};
      const today = orgToday();
      const nowIso = orgNowIso();
      for (const f of fields ?? []) {
        const value = defaultForNewRow(f, today, nowIso);
        if (value !== undefined) defaults[f.pg_column_name] = value;
      }
      const merged = { ...defaults, ...record };
      createRecord.mutateAsync({ baseId: activeBaseId, tableId: activeTableId, record: merged }).then((created) => {
        pushUndo({
          type: 'row_create',
          payload: { recordId: created.id },
          undo: async () => {
            deleteRecord.mutate({ baseId: activeBaseId, tableId: activeTableId, recordId: created.id });
          },
          redo: async () => {
            createRecord.mutate({ baseId: activeBaseId, tableId: activeTableId, record: merged });
          },
        });
      });
    },
    [activeBaseId, activeTableId, createRecord, deleteRecord, pushUndo, fields],
  );

  const handlePasteRows = useCallback(
    (rows: Record<string, any>[]) => {
      if (!activeBaseId || !activeTableId) return;
      for (const row of rows) {
        createRecord.mutate({ baseId: activeBaseId, tableId: activeTableId, record: row });
      }
    },
    [activeBaseId, activeTableId, createRecord],
  );

  const handleDeleteRow = useCallback(
    (recordId: string) => {
      if (!activeBaseId || !activeTableId) return;
      softDeleteRecord.mutate(
        { baseId: activeBaseId, tableId: activeTableId, recordId },
        {
          onSuccess: () =>
            pushUndo({
              type: 'row_delete',
              description: 'Delete record',
              payload: { recordId },
              undo: () => restoreRecords(queryClient, activeBaseId, activeTableId, [recordId]),
              redo: async () => { await softDeleteRecord.mutateAsync({ baseId: activeBaseId, tableId: activeTableId, recordId }); },
            }),
        },
      );
    },
    [activeBaseId, activeTableId, softDeleteRecord, pushUndo, queryClient],
  );

  const handleUpdateFieldOptions = useCallback(
    (fieldId: string, options: any) => {
      if (!activeTableId) return;
      updateField.mutate({ id: fieldId, table_id: activeTableId, updates: { options } });
    },
    [updateField, activeTableId],
  );

  const handleDuplicateRow = useCallback(
    (record: RecordRow) => {
      if (!activeBaseId || !activeTableId) return;
      duplicateRecord.mutateAsync({ baseId: activeBaseId, tableId: activeTableId, record }).then((created) => {
        pushUndo({
          type: 'row_create',
          payload: { recordId: created.id },
          undo: async () => {
            deleteRecord.mutate({ baseId: activeBaseId, tableId: activeTableId, recordId: created.id });
          },
          redo: async () => {
            duplicateRecord.mutate({ baseId: activeBaseId, tableId: activeTableId, record });
          },
        });
      });
    },
    [activeBaseId, activeTableId, duplicateRecord, deleteRecord, pushUndo],
  );

  const handleDuplicateAndClose = useCallback(
    (record: RecordRow) => { handleDuplicateRow(record); setExpandedRecord(null); },
    [handleDuplicateRow, setExpandedRecord],
  );

  const handleBulkDeleteRows = useCallback(
    (recordIds: string[]) => {
      if (!activeBaseId || !activeTableId) return;
      bulkSoftDelete.mutate(
        { baseId: activeBaseId, tableId: activeTableId, recordIds },
        {
          onSuccess: () =>
            pushUndo({
              type: 'row_delete',
              description: 'Delete records',
              payload: { recordIds },
              undo: () => restoreRecords(queryClient, activeBaseId, activeTableId, recordIds),
              redo: async () => { await bulkSoftDelete.mutateAsync({ baseId: activeBaseId, tableId: activeTableId, recordIds }); },
            }),
        },
      );
    },
    [activeBaseId, activeTableId, bulkSoftDelete, pushUndo, queryClient],
  );

  const handleDeleteField = useCallback(
    (fieldId: string) => {
      if (!activeTableId) return;
      const field = fields?.find((f) => f.id === fieldId);
      deleteField.mutate({ id: fieldId, table_id: activeTableId });
      if (field) {
        pushUndo({
          type: 'field_delete',
          payload: { fieldId },
          undo: async () => {
            createField.mutate({
              table_id: activeTableId,
              name: field.name,
              ui_type: field.ui_type,
              options: field.options as Record<string, any>,
              position: field.position,
              width: field.width,
              is_required: field.is_required,
              is_unique: field.is_unique,
              default_value: field.default_value,
              description: field.description,
            });
          },
          redo: async () => {
            deleteField.mutate({ id: fieldId, table_id: activeTableId });
          },
        });
      }
    },
    [activeTableId, deleteField, createField, fields, pushUndo],
  );

  const handleDuplicateField = useCallback(
    (fieldId: string) => {
      if (!activeTableId) return;
      duplicateField.mutate({ table_id: activeTableId, source_field_id: fieldId });
    },
    [activeTableId, duplicateField],
  );

  const handleReorderFields = useCallback(
    (fieldIds: string[]) => {
      if (!activeTableId) return;
      reorderFields.mutate({ table_id: activeTableId, fieldIds });
    },
    [activeTableId, reorderFields],
  );

  const handleReorderRows = useCallback(
    (rows: Array<{ id: string; nc_order: number }>) => {
      if (!activeBaseId || !activeTableId) return;
      reorderRows.mutate({ baseId: activeBaseId, tableId: activeTableId, rows });
    },
    [activeBaseId, activeTableId, reorderRows],
  );

  const activeViewType = useDatabaseUI((s) => s.activeViewType);
  const viewType = activeView?.type ?? activeViewType ?? 'grid';

  // Board, calendar, timeline and gantt need every row, so keep loading pages until they have them.
  useEffect(() => {
    if (shouldLoadMoreForView({ viewType, loaded: infiniteRecords.length, hasNextPage: !!hasNextPage && !recordsArePlaceholder, isFetching: isFetchingNextPage || isLoading })) {
      void fetchNextPage();
    }
  }, [viewType, infiniteRecords.length, hasNextPage, recordsArePlaceholder, isFetchingNextPage, isLoading, fetchNextPage]);
  const viewLoad = describeViewLoad({ viewType, loaded: infiniteRecords.length, total: infiniteTotalCount, hasNextPage: !!hasNextPage });
  const handleAddField = useCallback(() => setFieldDialogOpen(true), [setFieldDialogOpen]);

  const renderView = () => {
    switch (viewType) {
      case 'kanban':
        return (
          <KanbanView
            fields={visibleFields}
            records={records}
            totalCount={infiniteTotalCount}
            isLoading={isLoading}
            onCellUpdate={handleCellUpdate}
            onAddRow={(record) => handleAddRow(record)}
            onExpandRow={setExpandedRecord}
            onDeleteRow={handleDeleteRow}
            onUpdateFieldOptions={handleUpdateFieldOptions}
          />
        );
      case 'gallery':
        return (
          <GalleryView
            fields={visibleFields}
            records={records}
            totalCount={infiniteTotalCount}
            isLoading={isLoading}
            onCellUpdate={handleCellUpdate}
            onAddRow={() => handleAddRow()}
            onExpandRow={setExpandedRecord}
            onDeleteRow={handleDeleteRow}
            onDuplicateRow={handleDuplicateRow}
            page={galleryPage}
            pageSize={pageSize}
            onPageChange={setGalleryPage}
          />
        );
      case 'form':
        return (
          <FormView
            fields={patchedFields}
            onAddRow={handleAddRow}
            isLoading={isLoading}
            view={activeView}
          />
        );
      case 'calendar':
        return (
          <CalendarView
            fields={patchedFields}
            records={records}
            totalCount={infiniteTotalCount}
            isLoading={isLoading}
            onExpandRow={setExpandedRecord}
            onAddRow={(record) => handleAddRow(record)}
            onCellUpdate={handleCellUpdate}
          />
        );
      case 'timeline':
        return (
          <TimelineView
            fields={patchedFields}
            records={records}
            totalCount={infiniteTotalCount}
            isLoading={isLoading}
            onExpandRow={setExpandedRecord}
          />
        );
      case 'gantt':
        return (
          <GanttView
            fields={patchedFields}
            records={records}
            totalCount={infiniteTotalCount}
            isLoading={isLoading}
            onCellUpdate={handleCellUpdate}
            onExpandRow={setExpandedRecord}
          />
        );
      default:
        return (
          <GridView
            fields={visibleFields}
            records={records}
            totalCount={infiniteTotalCount}
            isLoading={isLoading}
            onCellUpdate={handleCellUpdate}
            onAddRow={handleAddRow}
            onAddField={handleAddField}
            onExpandRow={setExpandedRecord}
            onDeleteRow={handleDeleteRow}
            onDuplicateRow={handleDuplicateRow}
            onDeleteField={handleDeleteField}
            onDuplicateField={handleDuplicateField}
            onBulkDeleteRows={handleBulkDeleteRows}
            onReorderFields={handleReorderFields}
            onPasteRows={handlePasteRows}
            onLoadMore={fetchNextPage}
            // While the old rows of the previous filter are still showing there is no next page of the new ones.
            hasMore={!!hasNextPage && !recordsArePlaceholder}
            fieldsAreCurrent={!fieldsArePlaceholder}
            isLoadingMore={isFetchingNextPage}
            onReorderRows={handleReorderRows}
            footerRows={footerTotals.rows}
            footerFieldIds={footerTotals.fieldIds}
          />
        );
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <ViewBar />
      <Toolbar />
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {isError ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <p className="text-sm text-muted-foreground">Failed to load records</p>
            <button
              className="px-3 py-1.5 text-sm rounded-md bg-blue-500 text-white hover:bg-blue-600 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => refetch()}
            >
              Retry
            </button>
          </div>
        ) : (
          <LinkDataContext.Provider value={linkData}>
            <div
              className="flex-1 min-h-0 flex flex-col"
              style={recordsArePlaceholder ? { opacity: 0.6, transition: 'opacity 150ms' } : undefined}
              aria-busy={recordsArePlaceholder || undefined}
            >
              {viewLoad && (
                <div role="status" className="shrink-0 px-3 py-1 text-xs text-muted-foreground bg-muted/50 border-b border-border">
                  {viewLoad.text}
                </div>
              )}
              <Suspense fallback={<ViewSkeleton />}>{renderView()}</Suspense>
            </div>
          </LinkDataContext.Provider>
        )}
      </div>
      <Suspense fallback={null}>
        {!!expandedRecord && (
          <ExpandedRowModal
            open={!!expandedRecord}
            onOpenChange={(open) => {
              if (!open) setExpandedRecord(null);
            }}
            record={expandedRecord}
            fields={patchedFields}
            baseId={activeBaseId!}
            tableId={activeTableId!}
            onCellUpdate={handleCellUpdate}
            records={records}
            onNavigate={setExpandedRecord}
            onDeleteRecord={handleDeleteRow}
            onDuplicateRecord={handleDuplicateAndClose}
            onReorderFields={handleReorderFields}
          />
        )}
      </Suspense>
      <LinkedRecordExpandModal />
      <Suspense fallback={null}>
        {fieldDialogOpen && <CreateFieldDialog open={fieldDialogOpen} onOpenChange={setFieldDialogOpen} />}
      </Suspense>
      <Suspense fallback={null}>
        {findReplaceOpen && (
          <FindReplaceDialog
            open={findReplaceOpen}
            onOpenChange={setFindReplaceOpen}
            fields={patchedFields}
            records={records}
            onCellUpdate={handleCellUpdate}
          />
        )}
      </Suspense>
      <Suspense fallback={null}>
        {printOpen && (
          <PrintView
            fields={patchedFields}
            records={records}
            tableName={document.title.split('·')[0]?.trim() || 'Table'}
            onClose={() => setPrintOpen(false)}
          />
        )}
      </Suspense>
    </div>
  );
}

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
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
import KanbanView from '../components/views/KanbanView';
import GalleryView from '../components/views/GalleryView';
import FormView from '../components/views/FormView';
import CalendarView from '../components/views/CalendarView';
import TimelineView from '../components/views/TimelineView';
import GanttView from '../components/views/GanttView';
import { ExpandedRowModal } from '../components/ExpandedRowModal';
import { CreateFieldDialog } from '../components/CreateFieldDialog';
import type { RecordRow } from '../types';
import { useRealtimeRecords } from '../hooks/useRealtime';
import { parseFormula, evaluateFormula } from '../lib/formula';
import { FindReplaceDialog } from '../components/FindReplaceDialog';
import { PrintView } from '../components/PrintView';
import { useLinkDisplayLookup } from '../hooks/useLinkDisplayLookup';

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
  } = useDatabaseUI();
  useActiveView(activeTableId);
  useRealtimeRecords(activeBaseId ?? undefined, activeTableId ?? undefined);
  const { data: fields } = useFields(activeTableId);
  const { data: views } = useViews(activeTableId);
  const linkLookup = useLinkDisplayLookup(activeBaseId, fields);
  const pageSize = 100;
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

  useEffect(() => {
    if (!activeViewId || !activeTableId) return;
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const fieldVisibility: Record<string, boolean> = {};
      for (const fid of hiddenFieldIds) fieldVisibility[fid] = false;
      updateView.mutate({
        id: activeViewId,
        table_id: activeTableId,
        updates: {
          filters,
          sorts,
          groups: groupByLevels,
          field_visibility: fieldVisibility,
          field_widths: fieldWidths,
          field_order: fieldOrder,
        },
      });
    }, 1000);
    return () => clearTimeout(saveTimerRef.current);
  }, [filters, sorts, groupByLevels, hiddenFieldIds, fieldWidths, fieldOrder, activeViewId, activeTableId]);

  const {
    records: infiniteRecords,
    totalCount: infiniteTotalCount,
    isLoading,
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
    search: searchQuery || undefined,
  });

  const createRecord = useCreateRecord();
  const updateRecord = useUpdateRecord();
  const deleteRecord = useDeleteRecord();
  const duplicateRecord = useDuplicateRecord();
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

  const records = useMemo(() => {
    const raw = infiniteRecords;
    if (!patchedFields || patchedFields.length === 0) return raw;

    const formulaFields = patchedFields.filter(
      (f) => f.ui_type === 'Formula' && (f.options?.expression || f.options?.formula),
    );
    if (formulaFields.length === 0) return raw;

    const fieldMap: Record<string, string> = {};
    for (const f of patchedFields) {
      if (f.pg_column_name) fieldMap[f.name] = f.pg_column_name;
    }

    const parsed = formulaFields.map((f) => {
      try {
        return { col: f.pg_column_name, ast: parseFormula((f.options.expression || f.options.formula)!) };
      } catch {
        return { col: f.pg_column_name, ast: null };
      }
    });

    return raw.map((record) => {
      const patched = { ...record, __linkLookup: linkLookup } as any;
      for (const { col, ast } of parsed) {
        if (!ast) {
          patched[col] = '#ERROR';
          continue;
        }
        try {
          patched[col] = evaluateFormula(ast, patched, fieldMap);
        } catch {
          patched[col] = '#ERROR';
        }
      }
      delete patched.__linkLookup;
      return patched as RecordRow;
    });
  }, [infiniteRecords, patchedFields, linkLookup]);

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

  const handleCellUpdate = useCallback(
    (recordId: string, fieldId: string, value: any) => {
      const field = fields?.find((f) => f.id === fieldId);
      if (!field || !activeBaseId || !activeTableId) return;

      const record = records.find((r: RecordRow) => r.id === recordId);
      const oldValue = record?.[field.pg_column_name];

      updateRecord.mutate({
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
          updateRecord.mutate({
            baseId: activeBaseId,
            tableId: activeTableId,
            recordId,
            field: field.pg_column_name,
            value: oldValue,
          });
        },
        redo: async () => {
          updateRecord.mutate({
            baseId: activeBaseId,
            tableId: activeTableId,
            recordId,
            field: field.pg_column_name,
            value,
          });
        },
      });
    },
    [fields, activeBaseId, activeTableId, updateRecord, records, pushUndo],
  );

  const handleAddRow = useCallback(
    (record?: Record<string, any>) => {
      if (!activeBaseId || !activeTableId) return;
      createRecord.mutateAsync({ baseId: activeBaseId, tableId: activeTableId, record: record ?? {} }).then((created) => {
        pushUndo({
          type: 'row_create',
          payload: { recordId: created.id },
          undo: async () => {
            deleteRecord.mutate({ baseId: activeBaseId, tableId: activeTableId, recordId: created.id });
          },
          redo: async () => {
            createRecord.mutate({ baseId: activeBaseId, tableId: activeTableId, record: record ?? {} });
          },
        });
      });
    },
    [activeBaseId, activeTableId, createRecord, deleteRecord, pushUndo],
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
      softDeleteRecord.mutate({ baseId: activeBaseId, tableId: activeTableId, recordId });
    },
    [activeBaseId, activeTableId, softDeleteRecord],
  );

  const handleUpdateFieldOptions = useCallback(
    (fieldId: string, options: any) => {
      updateField.mutate({ id: fieldId, options });
    },
    [updateField],
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

  const handleBulkDeleteRows = useCallback(
    (recordIds: string[]) => {
      if (!activeBaseId || !activeTableId) return;
      bulkSoftDelete.mutate({ baseId: activeBaseId, tableId: activeTableId, recordIds });
    },
    [activeBaseId, activeTableId, bulkSoftDelete],
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
            onAddField={() => setFieldDialogOpen(true)}
            onExpandRow={setExpandedRecord}
            onDeleteRow={handleDeleteRow}
            onDuplicateRow={handleDuplicateRow}
            onDeleteField={handleDeleteField}
            onDuplicateField={handleDuplicateField}
            onBulkDeleteRows={handleBulkDeleteRows}
            onReorderFields={handleReorderFields}
            onPasteRows={handlePasteRows}
            onLoadMore={() => fetchNextPage()}
            hasMore={!!hasNextPage}
            isLoadingMore={isFetchingNextPage}
            onReorderRows={handleReorderRows}
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
            <p className="text-sm text-gray-500 dark:text-[hsl(200,20%,55%)]">Failed to load records</p>
            <button
              className="px-3 py-1.5 text-sm rounded-md bg-blue-500 text-white hover:bg-blue-600"
              onClick={() => refetch()}
            >
              Retry
            </button>
          </div>
        ) : renderView()}
      </div>
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
        onDuplicateRecord={(record) => { handleDuplicateRow(record); setExpandedRecord(null); }}
        onReorderFields={(fieldIds) => {
          if (activeTableId) {
            reorderFields.mutate({ table_id: activeTableId, fieldIds });
          }
        }}
      />
      <LinkedRecordExpandModal />
      <CreateFieldDialog open={fieldDialogOpen} onOpenChange={setFieldDialogOpen} />
      <FindReplaceDialog
        open={findReplaceOpen}
        onOpenChange={setFindReplaceOpen}
        fields={patchedFields}
        records={records}
        onCellUpdate={handleCellUpdate}
      />
      {printOpen && (
        <PrintView
          fields={patchedFields}
          records={records}
          tableName={document.title.split('·')[0]?.trim() || 'Table'}
          onClose={() => setPrintOpen(false)}
        />
      )}
    </div>
  );
}

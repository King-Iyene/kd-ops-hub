import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Toolbar } from '../components/Toolbar';
import { ViewBar } from '../components/ViewBar';
import { useDatabaseUI } from '../lib/store';
import { useUndoStore } from '../lib/undo';
import {
  useFields,
  useRecords,
  useCreateRecord,
  useUpdateRecord,
  useDeleteRecord,
  useBulkDeleteRecords,
  useDuplicateRecord,
  useDeleteField,
  useDuplicateField,
  useReorderFields,
  useActiveView,
  useViews,
  useUpdateView,
} from '../hooks';
import GridView from '../components/grid/GridView';
import KanbanView from '../components/views/KanbanView';
import GalleryView from '../components/views/GalleryView';
import FormView from '../components/views/FormView';
import CalendarView from '../components/views/CalendarView';
import { ExpandedRowModal } from '../components/ExpandedRowModal';
import { CreateFieldDialog } from '../components/CreateFieldDialog';
import type { RecordRow } from '../types';

export function TableView() {
  const {
    activeTableId,
    activeBaseId,
    activeViewId,
    filters,
    sorts,
    hiddenFieldIds,
    searchQuery,
  } = useDatabaseUI();
  useActiveView(activeTableId);
  const { data: fields } = useFields(activeTableId);
  const { data: views } = useViews(activeTableId);
  const [page, setPage] = useState(0);
  const pageSize = 50;
  const [fieldDialogOpen, setFieldDialogOpen] = useState(false);
  const pushUndo = useUndoStore((s) => s.push);

  const activeView = useMemo(
    () => views?.find((v) => v.id === activeViewId),
    [views, activeViewId],
  );

  const updateView = useUpdateView();
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const groupBy = useDatabaseUI((s) => s.groupBy);

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
          groups: groupBy ? [groupBy] : [],
          field_visibility: fieldVisibility,
        },
      });
    }, 1000);
    return () => clearTimeout(saveTimerRef.current);
  }, [filters, sorts, groupBy, hiddenFieldIds, activeViewId, activeTableId]);

  const { data: recordsData, isLoading } = useRecords({
    baseId: activeBaseId!,
    tableId: activeTableId!,
    page,
    pageSize,
    filters: filters.length > 0 ? filters : undefined,
    sorts: sorts.length > 0 ? sorts : undefined,
    search: searchQuery || undefined,
  });

  const createRecord = useCreateRecord();
  const updateRecord = useUpdateRecord();
  const deleteRecord = useDeleteRecord();
  const duplicateRecord = useDuplicateRecord();
  const bulkDeleteRecords = useBulkDeleteRecords();
  const deleteField = useDeleteField();
  const duplicateField = useDuplicateField();
  const reorderFields = useReorderFields();
  const [expandedRecord, setExpandedRecord] = useState<RecordRow | null>(null);

  const visibleFields = useMemo(
    () =>
      (fields ?? [])
        .filter((f) => !f.is_hidden && !hiddenFieldIds.has(f.id))
        .sort((a, b) => a.position - b.position),
    [fields, hiddenFieldIds],
  );

  const handleCellUpdate = useCallback(
    (recordId: string, fieldId: string, value: any) => {
      const field = fields?.find((f) => f.id === fieldId);
      if (!field || !activeBaseId || !activeTableId) return;

      const record = recordsData?.records?.find((r: RecordRow) => r.id === recordId);
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
    [fields, activeBaseId, activeTableId, updateRecord, recordsData, pushUndo],
  );

  const handleAddRow = useCallback(
    (record?: Record<string, any>) => {
      if (!activeBaseId || !activeTableId) return;
      createRecord.mutate({ baseId: activeBaseId, tableId: activeTableId, record: record ?? {} });
    },
    [activeBaseId, activeTableId, createRecord],
  );

  const handleDeleteRow = useCallback(
    (recordId: string) => {
      if (!activeBaseId || !activeTableId) return;
      deleteRecord.mutate({ baseId: activeBaseId, tableId: activeTableId, recordId });
    },
    [activeBaseId, activeTableId, deleteRecord],
  );

  const handleDuplicateRow = useCallback(
    (record: RecordRow) => {
      if (!activeBaseId || !activeTableId) return;
      duplicateRecord.mutate({ baseId: activeBaseId, tableId: activeTableId, record });
    },
    [activeBaseId, activeTableId, duplicateRecord],
  );

  const handleBulkDeleteRows = useCallback(
    (recordIds: string[]) => {
      if (!activeBaseId || !activeTableId) return;
      bulkDeleteRecords.mutate({ baseId: activeBaseId, tableId: activeTableId, recordIds });
    },
    [activeBaseId, activeTableId, bulkDeleteRecords],
  );

  const handleDeleteField = useCallback(
    (fieldId: string) => {
      if (!activeTableId) return;
      deleteField.mutate({ id: fieldId, table_id: activeTableId });
    },
    [activeTableId, deleteField],
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

  const viewType = activeView?.type ?? 'grid';

  const renderView = () => {
    switch (viewType) {
      case 'kanban':
        return (
          <KanbanView
            fields={visibleFields}
            records={recordsData?.records ?? []}
            totalCount={recordsData?.totalCount ?? 0}
            isLoading={isLoading}
            onCellUpdate={handleCellUpdate}
            onAddRow={(record) => handleAddRow(record)}
            onExpandRow={setExpandedRecord}
            onDeleteRow={handleDeleteRow}
          />
        );
      case 'gallery':
        return (
          <GalleryView
            fields={visibleFields}
            records={recordsData?.records ?? []}
            totalCount={recordsData?.totalCount ?? 0}
            isLoading={isLoading}
            onCellUpdate={handleCellUpdate}
            onAddRow={() => handleAddRow()}
            onExpandRow={setExpandedRecord}
            onDeleteRow={handleDeleteRow}
            onDuplicateRow={handleDuplicateRow}
            page={page}
            pageSize={pageSize}
            onPageChange={setPage}
          />
        );
      case 'form':
        return (
          <FormView
            fields={fields ?? []}
            onAddRow={handleAddRow}
            isLoading={isLoading}
          />
        );
      case 'calendar':
        return (
          <CalendarView
            fields={fields ?? []}
            records={recordsData?.records ?? []}
            totalCount={recordsData?.totalCount ?? 0}
            isLoading={isLoading}
            onExpandRow={setExpandedRecord}
            onAddRow={(record) => handleAddRow(record)}
          />
        );
      default:
        return (
          <GridView
            fields={visibleFields}
            records={recordsData?.records ?? []}
            totalCount={recordsData?.totalCount ?? 0}
            isLoading={isLoading}
            onCellUpdate={handleCellUpdate}
            onAddRow={() => handleAddRow()}
            onAddField={() => setFieldDialogOpen(true)}
            page={page}
            pageSize={pageSize}
            onPageChange={setPage}
            onExpandRow={setExpandedRecord}
            onDeleteRow={handleDeleteRow}
            onDuplicateRow={handleDuplicateRow}
            onDeleteField={handleDeleteField}
            onDuplicateField={handleDuplicateField}
            onBulkDeleteRows={handleBulkDeleteRows}
            onReorderFields={handleReorderFields}
          />
        );
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <ViewBar />
      <Toolbar />
      <div className="flex-1 min-h-0">{renderView()}</div>
      <ExpandedRowModal
        open={!!expandedRecord}
        onOpenChange={(open) => {
          if (!open) setExpandedRecord(null);
        }}
        record={expandedRecord}
        fields={fields ?? []}
        baseId={activeBaseId!}
        tableId={activeTableId!}
        onCellUpdate={handleCellUpdate}
        records={recordsData?.records ?? []}
        onNavigate={setExpandedRecord}
        onDeleteRecord={handleDeleteRow}
      />
      <CreateFieldDialog open={fieldDialogOpen} onOpenChange={setFieldDialogOpen} />
    </div>
  );
}

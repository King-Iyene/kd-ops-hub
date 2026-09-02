import { useState, useCallback, useMemo } from 'react';
import { Toolbar } from '../components/Toolbar';
import { ViewBar } from '../components/ViewBar';
import { useDatabaseUI } from '../lib/store';
import { useFields, useRecords, useCreateRecord, useUpdateRecord, useActiveView } from '../hooks';
import GridView from '../components/grid/GridView';
import { ExpandedRowModal } from '../components/ExpandedRowModal';
import type { RecordRow } from '../types';

export function TableView() {
  const { activeTableId, activeBaseId, filters, sorts, hiddenFieldIds, searchQuery } = useDatabaseUI();
  useActiveView(activeTableId);
  const { data: fields } = useFields(activeTableId);
  const [page, setPage] = useState(1);
  const pageSize = 50;

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
  const [expandedRecord, setExpandedRecord] = useState<RecordRow | null>(null);

  const visibleFields = useMemo(
    () =>
      (fields ?? [])
        .filter((f) => !f.is_hidden && !hiddenFieldIds.has(f.id))
        .sort((a, b) => a.position - b.position),
    [fields, hiddenFieldIds],
  );

  const handleCellUpdate = useCallback((recordId: string, fieldId: string, value: any) => {
    const field = fields?.find(f => f.id === fieldId);
    if (!field || !activeBaseId || !activeTableId) return;
    updateRecord.mutate({
      baseId: activeBaseId,
      tableId: activeTableId,
      recordId,
      field: field.pg_column_name,
      value,
    });
  }, [fields, activeBaseId, activeTableId, updateRecord]);

  const handleAddRow = useCallback(() => {
    if (!activeBaseId || !activeTableId) return;
    createRecord.mutate({ baseId: activeBaseId, tableId: activeTableId, record: {} });
  }, [activeBaseId, activeTableId, createRecord]);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <Toolbar />
      <ViewBar />
      <div className="flex-1 min-h-0">
        <GridView
          fields={visibleFields}
          records={recordsData?.records ?? []}
          totalCount={recordsData?.totalCount ?? 0}
          isLoading={isLoading}
          onCellUpdate={handleCellUpdate}
          onAddRow={handleAddRow}
          onAddField={() => {}}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onExpandRow={setExpandedRecord}
        />
      </div>
      <ExpandedRowModal
        open={!!expandedRecord}
        onOpenChange={(open) => { if (!open) setExpandedRecord(null); }}
        record={expandedRecord}
        fields={fields ?? []}
        baseId={activeBaseId!}
        tableId={activeTableId!}
      />
    </div>
  );
}

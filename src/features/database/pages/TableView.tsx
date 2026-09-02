import { useState, useCallback } from 'react';
import { Toolbar } from '../components/Toolbar';
import { useDatabaseUI } from '../lib/store';
import { useFields, useRecords, useCreateRecord, useUpdateRecord } from '../hooks';
import GridView from '../components/grid/GridView';

export function TableView() {
  const { activeTableId, activeBaseId } = useDatabaseUI();
  const { data: fields } = useFields(activeTableId);
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const { data: recordsData, isLoading } = useRecords({
    baseId: activeBaseId!,
    tableId: activeTableId!,
    page,
    pageSize,
  });

  const createRecord = useCreateRecord();
  const updateRecord = useUpdateRecord();

  const visibleFields = (fields ?? []).filter(f => !f.is_hidden).sort((a, b) => a.position - b.position);

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
        />
      </div>
    </div>
  );
}

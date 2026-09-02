import { useCallback, useRef } from 'react';
import { Plus, Rows3, Download, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDatabaseUI } from '../lib/store';
import { useFields, useRecords, useCreateRecord } from '../hooks';
import { CreateFieldDialog } from './CreateFieldDialog';
import { FilterPanel } from './FilterPanel';
import { SortPanel } from './SortPanel';
import { FieldVisibilityPanel } from './FieldVisibilityPanel';
import { GroupPanel } from './GroupPanel';
import { SearchBar } from './SearchBar';
import { exportToCSV, parseCSV, csvToRecords } from '../lib/csv';
import { useState } from 'react';

export function Toolbar() {
  const {
    rowHeight,
    setRowHeight,
    activeTableId,
    activeBaseId,
    filters,
    setFilters,
    sorts,
    setSorts,
    groups,
    setGroups,
    hiddenFieldIds,
    toggleHiddenField,
    setHiddenFieldIds,
  } = useDatabaseUI();
  const [fieldDialogOpen, setFieldDialogOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: fields = [] } = useFields(activeTableId);
  const { data: recordsData } = useRecords({
    baseId: activeBaseId!,
    tableId: activeTableId!,
    page: 1,
    pageSize: 10000,
  });
  const createRecord = useCreateRecord();

  const handleShowAll = useCallback(() => setHiddenFieldIds(new Set()), [setHiddenFieldIds]);

  const handleHideAll = useCallback(() => {
    const ids = new Set(fields.filter((f) => !f.is_system).map((f) => f.id));
    setHiddenFieldIds(ids);
  }, [fields, setHiddenFieldIds]);

  const rowHeightOptions: Array<'compact' | 'default' | 'tall' | 'extra-tall'> = [
    'compact',
    'default',
    'tall',
    'extra-tall',
  ];
  const nextHeight = () => {
    const idx = rowHeightOptions.indexOf(rowHeight);
    setRowHeight(rowHeightOptions[(idx + 1) % rowHeightOptions.length]);
  };

  const handleExport = useCallback(() => {
    if (!recordsData?.records || !fields.length) return;
    const table = fields[0]?.table_id ?? 'export';
    exportToCSV(fields, recordsData.records, table);
  }, [fields, recordsData]);

  const handleImport = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !activeBaseId || !activeTableId) return;

      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = ev.target?.result as string;
        const { headers, rows } = parseCSV(text);
        const records = csvToRecords(headers, rows, fields);

        for (const record of records) {
          createRecord.mutate({ baseId: activeBaseId, tableId: activeTableId, record });
        }
      };
      reader.readAsText(file);

      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    [activeBaseId, activeTableId, fields, createRecord],
  );

  return (
    <>
      <div className="flex items-center justify-between h-10 px-3 bg-[#F8FAFC] border-b border-[#E2E8F0] shrink-0">
        <div className="flex items-center gap-1">
          <FilterPanel
            fields={fields}
            filters={filters}
            onFiltersChange={setFilters}
          />
          <SortPanel
            fields={fields}
            sorts={sorts}
            onSortsChange={setSorts}
          />
          <GroupPanel
            fields={fields}
            groups={groups}
            onGroupsChange={setGroups}
          />
          <FieldVisibilityPanel
            fields={fields}
            hiddenFieldIds={hiddenFieldIds}
            onToggleField={toggleHiddenField}
            onShowAll={handleShowAll}
            onHideAll={handleHideAll}
          />
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-[#475569] gap-1"
            onClick={nextHeight}
          >
            <Rows3 size={14} /> {rowHeight}
          </Button>
        </div>
        <div className="flex items-center gap-1">
          <SearchBar />
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-[#475569] gap-1"
            onClick={handleExport}
            title="Export CSV"
          >
            <Download size={14} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-[#475569] gap-1"
            onClick={() => fileInputRef.current?.click()}
            title="Import CSV"
          >
            <Upload size={14} />
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleImport}
          />
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-[#006994] gap-1 font-medium"
            onClick={() => setFieldDialogOpen(true)}
          >
            <Plus size={14} /> New Field
          </Button>
        </div>
      </div>
      <CreateFieldDialog open={fieldDialogOpen} onOpenChange={setFieldDialogOpen} />
    </>
  );
}

import { useCallback, useRef, useState } from 'react';
import { Plus, Rows3, Download, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDatabaseUI } from '../lib/store';
import { useFields, useRecords, useCreateRecord } from '../hooks';
import { CreateFieldDialog } from './CreateFieldDialog';
import { FilterPanel } from './FilterPanel';
import { SortPanel } from './SortPanel';
import { FieldVisibilityPanel } from './FieldVisibilityPanel';
import { RowColorPanel } from './RowColorPanel';
import { GroupPanel } from './GroupPanel';
import { SearchBar } from './SearchBar';
import { UndoRedoButtons } from './UndoRedoButtons';
import { exportToCSV, parseCSV, csvToRecords } from '../lib/csv';

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
    rowColorRules,
    setRowColorRules,
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
      <div className="flex items-center justify-between h-9 px-3 bg-[#F9F9FA] dark:bg-[hsl(200,30%,8%)] border-b border-[#E7E7E9] dark:border-[hsl(200,25%,18%)] shrink-0">
        <div className="flex items-center gap-0.5">
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
          <RowColorPanel
            fields={fields}
            rules={rowColorRules}
            onRulesChange={setRowColorRules}
          />
          <div className="w-px h-4 bg-[#E7E7E9] mx-1" />
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-[11px] text-[#6A7184] gap-1 px-2 hover:bg-[#E7E7E9]"
            onClick={nextHeight}
          >
            <Rows3 size={13} /> {rowHeight}
          </Button>
        </div>
        <div className="flex items-center gap-0.5">
          <UndoRedoButtons />
          <SearchBar />
          <div className="w-px h-4 bg-[#E7E7E9] mx-1" />
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-[11px] text-[#6A7184] gap-1 px-2 hover:bg-[#E7E7E9]"
            onClick={handleExport}
            title="Export CSV"
          >
            <Download size={13} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-[11px] text-[#6A7184] gap-1 px-2 hover:bg-[#E7E7E9]"
            onClick={() => fileInputRef.current?.click()}
            title="Import CSV"
          >
            <Upload size={13} />
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleImport}
          />
          <div className="w-px h-4 bg-[#E7E7E9] mx-1" />
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-[11px] text-[#3366FF] gap-1 px-2 font-medium hover:bg-[#3366FF]/10"
            onClick={() => setFieldDialogOpen(true)}
          >
            <Plus size={13} /> Field
          </Button>
        </div>
      </div>
      <CreateFieldDialog open={fieldDialogOpen} onOpenChange={setFieldDialogOpen} />
    </>
  );
}

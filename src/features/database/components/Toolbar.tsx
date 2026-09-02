import { useState, useCallback } from 'react';
import { Group, Search, Plus, Rows3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useDatabaseUI } from '../lib/store';
import { useFields } from '../hooks';
import { CreateFieldDialog } from './CreateFieldDialog';
import { FilterPanel } from './FilterPanel';
import { SortPanel } from './SortPanel';
import { FieldVisibilityPanel } from './FieldVisibilityPanel';

export function Toolbar() {
  const {
    rowHeight,
    setRowHeight,
    activeTableId,
    filters,
    setFilters,
    sorts,
    setSorts,
    hiddenFieldIds,
    toggleHiddenField,
    setHiddenFieldIds,
    searchQuery,
    setSearchQuery,
  } = useDatabaseUI();
  const [searchOpen, setSearchOpen] = useState(false);
  const [fieldDialogOpen, setFieldDialogOpen] = useState(false);

  const { data: fields = [] } = useFields(activeTableId);

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
          <Button variant="ghost" size="sm" className="h-7 text-xs text-[#475569] gap-1">
            <Group size={14} /> Group
          </Button>
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
          {searchOpen ? (
            <Input
              autoFocus
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-7 w-48 text-xs"
              onBlur={() => { if (!searchQuery) setSearchOpen(false); }}
              onKeyDown={(e) => { if (e.key === 'Escape') { setSearchQuery(''); setSearchOpen(false); } }}
            />
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-[#475569] gap-1"
              onClick={() => setSearchOpen(true)}
            >
              <Search size={14} />
            </Button>
          )}
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

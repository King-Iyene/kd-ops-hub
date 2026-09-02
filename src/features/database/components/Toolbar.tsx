import { useState } from 'react';
import { Filter, ArrowUpDown, Group, EyeOff, Search, Plus, Rows3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useDatabaseUI } from '../lib/store';
import { CreateFieldDialog } from './CreateFieldDialog';

export function Toolbar() {
  const { rowHeight, setRowHeight } = useDatabaseUI();
  const [searchOpen, setSearchOpen] = useState(false);
  const [fieldDialogOpen, setFieldDialogOpen] = useState(false);

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
          <Button variant="ghost" size="sm" className="h-7 text-xs text-[#475569] gap-1">
            <Filter size={14} /> Filter
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs text-[#475569] gap-1">
            <ArrowUpDown size={14} /> Sort
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs text-[#475569] gap-1">
            <Group size={14} /> Group
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs text-[#475569] gap-1">
            <EyeOff size={14} /> Hide Fields
          </Button>
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
              className="h-7 w-48 text-xs"
              onBlur={() => setSearchOpen(false)}
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
            className="h-7 text-xs text-[#3366FF] gap-1 font-medium"
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

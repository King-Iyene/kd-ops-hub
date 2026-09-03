import { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, X, Link2 } from 'lucide-react';
import { useLinkedRecords } from '../hooks/useLinks';
import { useFields } from '../hooks/useFields';
import type { RecordRow } from '../types';

interface LinkedRecordPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  baseId: string;
  targetTableId: string;
  relationType: 'one_to_one' | 'one_to_many' | 'many_to_many';
  selectedIds: string[];
  onConfirm: (ids: string[]) => void;
}

export function LinkedRecordPicker({
  open,
  onOpenChange,
  baseId,
  targetTableId,
  relationType,
  selectedIds: initialSelectedIds,
  onConfirm,
}: LinkedRecordPickerProps) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string[]>(initialSelectedIds);
  const { data: records = [] } = useLinkedRecords(baseId, targetTableId);
  const { data: fields = [] } = useFields(targetTableId);

  const primaryField = useMemo(
    () => fields.find((f) => f.is_primary),
    [fields],
  );

  const filteredRecords = useMemo(() => {
    if (!search) return records;
    const q = search.toLowerCase();
    return records.filter((r) => {
      if (!primaryField) return true;
      const val = r[primaryField.pg_column_name];
      return val != null && String(val).toLowerCase().includes(q);
    });
  }, [records, search, primaryField]);

  const getPrimaryValue = (record: RecordRow) => {
    if (!primaryField) return record.id.slice(0, 8);
    const val = record[primaryField.pg_column_name];
    return val != null ? String(val) : record.id.slice(0, 8);
  };

  const isSingleSelect = relationType === 'one_to_one';

  const toggle = (id: string) => {
    if (isSingleSelect) {
      setSelected((prev) => (prev.includes(id) ? [] : [id]));
    } else {
      setSelected((prev) =>
        prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
      );
    }
  };

  const handleConfirm = () => {
    onConfirm(selected);
    onOpenChange(false);
  };

  const selectedRecords = records.filter((r) => selected.includes(r.id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px] max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-[15px] font-semibold text-[#374151] dark:text-[hsl(200,25%,88%)] flex items-center gap-2">
            <Link2 size={16} className="text-[#3366FF]" />
            Link Records
          </DialogTitle>
        </DialogHeader>

        {/* Selected pills */}
        {selectedRecords.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pb-2">
            {selectedRecords.map((r) => (
              <span
                key={r.id}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                style={{ backgroundColor: '#DBEAFE', color: '#1E40AF' }}
              >
                {getPrimaryValue(r)}
                <button
                  type="button"
                  className="hover:text-red-500"
                  onClick={() => toggle(r.id)}
                >
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Search */}
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#9AA2AF]" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search records..."
            className="h-8 pl-8 text-xs"
          />
        </div>

        {/* Record list */}
        <div className="flex-1 overflow-y-auto border border-[#E7E7E9] dark:border-[hsl(200,25%,18%)] rounded-lg max-h-[300px]">
          {filteredRecords.length === 0 ? (
            <div className="p-4 text-center text-xs text-[#9AA2AF]">
              No records found
            </div>
          ) : (
            filteredRecords.map((record) => {
              const isChecked = selected.includes(record.id);
              return (
                <button
                  key={record.id}
                  type="button"
                  className="w-full text-left px-3 py-2 flex items-center gap-2.5 hover:bg-[#F4F4F5] dark:hover:bg-[hsl(200,25%,14%)] border-b border-[#E7E7E9] dark:border-[hsl(200,25%,18%)] last:border-b-0 transition-colors"
                  onClick={() => toggle(record.id)}
                >
                  {isSingleSelect ? (
                    <span
                      className="w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0"
                      style={{
                        borderColor: isChecked ? '#3366FF' : '#9AA2AF',
                      }}
                    >
                      {isChecked && (
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: '#3366FF' }}
                        />
                      )}
                    </span>
                  ) : (
                    <span
                      className="w-4 h-4 rounded border-2 flex items-center justify-center text-[10px] shrink-0"
                      style={{
                        borderColor: isChecked ? '#3366FF' : '#9AA2AF',
                        backgroundColor: isChecked ? '#3366FF' : 'transparent',
                        color: isChecked ? '#fff' : 'transparent',
                      }}
                    >
                      {isChecked ? '✓' : ''}
                    </span>
                  )}
                  <span className="text-[13px] text-[#374151] dark:text-[hsl(200,25%,88%)] truncate">
                    {getPrimaryValue(record)}
                  </span>
                </button>
              );
            })
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            style={{ backgroundColor: '#3366FF' }}
            className="hover:opacity-90 text-white gap-1.5"
            onClick={handleConfirm}
          >
            <Link2 size={13} />
            Link {selected.length > 0 ? `(${selected.length})` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

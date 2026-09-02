import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useCreateTable } from '../hooks';
import { useDatabaseUI } from '../lib/store';

interface CreateTableDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateTableDialog({ open, onOpenChange }: CreateTableDialogProps) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const { activeBaseId, setActiveTable } = useDatabaseUI();
  const createTable = useCreateTable();

  const handleCreate = async () => {
    if (!name.trim()) {
      setError('Table name is required');
      return;
    }
    if (!activeBaseId) {
      setError('No base selected');
      return;
    }
    setError('');
    try {
      const result = await createTable.mutateAsync({ base_id: activeBaseId, name: name.trim() });
      setActiveTable(result.id);
      setName('');
      onOpenChange(false);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to create table');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Create Table</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="table-name" className="text-xs">
              Table Name
            </Label>
            <Input
              id="table-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Projects, Contacts"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            className="bg-[#006994] hover:bg-[#005a7d]"
            onClick={handleCreate}
            disabled={createTable.isPending}
          >
            {createTable.isPending ? 'Creating...' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

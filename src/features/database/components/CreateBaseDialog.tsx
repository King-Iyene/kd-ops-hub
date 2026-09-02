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
import { cn } from '@/lib/utils';
import { useCreateBase } from '../hooks';
import { useDatabaseUI } from '../lib/store';

interface CreateBaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const BASE_COLORS = [
  '#3366FF', '#2D9CDB', '#10B981', '#F59E0B', '#EF4444',
  '#8B5CF6', '#EC4899', '#6366F1', '#14B8A6', '#F97316',
];

export function CreateBaseDialog({ open, onOpenChange }: CreateBaseDialogProps) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(BASE_COLORS[0]);
  const [error, setError] = useState('');
  const createBase = useCreateBase();
  const { setActiveBase } = useDatabaseUI();

  const resetForm = () => {
    setName('');
    setColor(BASE_COLORS[0]);
    setError('');
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      setError('Base name is required');
      return;
    }
    setError('');
    try {
      const result = await createBase.mutateAsync({
        name: name.trim(),
        color,
      });
      setActiveBase(result.id);
      resetForm();
      onOpenChange(false);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to create base');
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) resetForm();
        onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">Create Base</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="base-name" className="text-xs font-medium text-[#4A5268]">
              Base name
            </Label>
            <Input
              id="base-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Project Tracker, CRM"
              autoFocus
              className="h-9"
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-[#4A5268]">Color</Label>
            <div className="flex items-center gap-2">
              {BASE_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={cn(
                    'w-6 h-6 rounded-full transition-all',
                    color === c
                      ? 'ring-2 ring-offset-2 ring-[#3366FF] scale-110'
                      : 'hover:scale-105',
                  )}
                  style={{ backgroundColor: c }}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              resetForm();
              onOpenChange(false);
            }}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            className="bg-[#3366FF] hover:bg-[#2952CC] text-white"
            onClick={handleCreate}
            disabled={createBase.isPending || !name.trim()}
          >
            {createBase.isPending ? 'Creating...' : 'Create Base'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

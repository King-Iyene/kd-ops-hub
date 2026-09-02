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

const EMOJI_OPTIONS = [
  '📊', '📁', '📋', '📅', '📦',
  '🚀', '⭐', '💡', '🎯', '🔧',
  '📝', '📚', '🧩', '🌐', '❤️',
];

const COLOR_OPTIONS = [
  '#3366FF', '#0EA5E9', '#10B981', '#F59E0B', '#EF4444',
  '#8B5CF6', '#EC4899', '#6366F1', '#14B8A6', '#F97316',
];

export function CreateBaseDialog({ open, onOpenChange }: CreateBaseDialogProps) {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState(EMOJI_OPTIONS[0]);
  const [color, setColor] = useState('#3366FF');
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
            <Label className="text-xs">Icon</Label>
            <div className="flex flex-wrap gap-1.5">
              {EMOJI_OPTIONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  className={cn(
                    'w-8 h-8 rounded flex items-center justify-center text-base hover:bg-gray-100 transition-colors',
                    icon === emoji && 'ring-2 ring-[#3366FF] bg-[#3366FF]/5'
                  )}
                  onClick={() => setIcon(emoji)}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          {/* Color picker */}
          <div className="space-y-1.5">
            <Label className="text-xs">Color</Label>
            <div className="flex flex-wrap gap-1.5">
              {COLOR_OPTIONS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={cn(
                    'w-7 h-7 rounded-full transition-transform',
                    color === c && 'ring-2 ring-offset-2 ring-[#3366FF] scale-110'
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
            className="bg-[#3366FF] hover:bg-[#2952CC]"
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

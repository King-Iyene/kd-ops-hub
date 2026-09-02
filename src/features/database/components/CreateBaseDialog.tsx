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
import { useCreateBase, useWorkspaces } from '../hooks';
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
  '#006994', '#0EA5E9', '#10B981', '#F59E0B', '#EF4444',
  '#8B5CF6', '#EC4899', '#6366F1', '#14B8A6', '#F97316',
];

export function CreateBaseDialog({ open, onOpenChange }: CreateBaseDialogProps) {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState(EMOJI_OPTIONS[0]);
  const [color, setColor] = useState(COLOR_OPTIONS[0]);
  const [error, setError] = useState('');
  const createBase = useCreateBase();
  const { data: workspaces } = useWorkspaces();
  const { setActiveBase } = useDatabaseUI();

  const handleCreate = async () => {
    if (!name.trim()) {
      setError('Base name is required');
      return;
    }
    setError('');
    try {
      const wsId = workspaces?.[0]?.id;
      if (!wsId) throw new Error('No workspace found');
      const result = await createBase.mutateAsync({ workspace_id: wsId, name: name.trim(), icon, color });
      setActiveBase(result.id);
      setName('');
      onOpenChange(false);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to create base');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Create Base</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="base-name" className="text-xs">
              Base Name
            </Label>
            <Input
              id="base-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Marketing, Engineering"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
          </div>

          {/* Icon picker */}
          <div className="space-y-1.5">
            <Label className="text-xs">Icon</Label>
            <div className="flex flex-wrap gap-1.5">
              {EMOJI_OPTIONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  className={cn(
                    'w-8 h-8 rounded flex items-center justify-center text-base hover:bg-gray-100 transition-colors',
                    icon === emoji && 'ring-2 ring-[#006994] bg-[#006994]/5'
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
                    color === c && 'ring-2 ring-offset-2 ring-[#006994] scale-110'
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
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            className="bg-[#006994] hover:bg-[#005a7d]"
            onClick={handleCreate}
            disabled={createBase.isPending}
          >
            {createBase.isPending ? 'Creating...' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { useState, useEffect, useRef, useCallback } from 'react';
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
import { useCreateBase, useCreateTable } from '../hooks';
import { useDatabaseUI } from '../lib/store';
import { Loader2 } from 'lucide-react';

export interface TemplateConfig {
  baseName: string;
  baseIcon: string;
  baseColor: string;
  tables: Array<{
    name: string;
    icon?: string;
  }>;
}

interface CreateBaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template?: TemplateConfig | null;
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

export function CreateBaseDialog({ open, onOpenChange, template }: CreateBaseDialogProps) {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState(EMOJI_OPTIONS[0]);
  const [color, setColor] = useState('#3366FF');
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const createBase = useCreateBase();
  const createTable = useCreateTable();
  const { setActiveBase, setActiveTable } = useDatabaseUI();
  const templateTriggered = useRef(false);

  const resetForm = useCallback(() => {
    setName('');
    setColor(COLOR_OPTIONS[0]);
    setError('');
    setCreating(false);
    setStatusMsg('');
  }, []);

  const doCreate = useCallback(async (baseName: string, baseIcon: string, baseColor: string, tables: Array<{ name: string; icon?: string }>) => {
    setCreating(true);
    setStatusMsg('Creating base...');
    try {
      const result = await createBase.mutateAsync({
        name: baseName,
        color: baseColor,
        icon: baseIcon,
      });
      setActiveBase(result.id);

      let firstTableId: string | null = null;
      for (let i = 0; i < tables.length; i++) {
        setStatusMsg(`Creating table "${tables[i].name}"... (${i + 1}/${tables.length})`);
        const t = await createTable.mutateAsync({
          base_id: result.id,
          name: tables[i].name,
          icon: tables[i].icon ?? null,
          position: i,
        });
        if (i === 0) firstTableId = t.id;
      }

      if (firstTableId) setActiveTable(firstTableId);
      resetForm();
      onOpenChange(false);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to create base');
      setCreating(false);
      setStatusMsg('');
    }
  }, [createBase, createTable, setActiveBase, setActiveTable, resetForm, onOpenChange]);

  useEffect(() => {
    if (open && template && !templateTriggered.current && !creating) {
      templateTriggered.current = true;
      doCreate(template.baseName, template.baseIcon, template.baseColor, template.tables);
    }
    if (!open) templateTriggered.current = false;
  }, [open, template, creating, doCreate]);

  const handleCreate = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Base name is required');
      return;
    }
    await doCreate(trimmedName, icon, color, [{ name: 'Table 1' }]);
  };

  if (template && creating) {
    return (
      <Dialog open={open} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-[360px]">
          <div className="flex flex-col items-center gap-4 py-8">
            <Loader2 className="h-8 w-8 animate-spin text-[#3366FF]" />
            <div className="text-center">
              <p className="text-sm font-medium text-[#374151] dark:text-[hsl(200,25%,88%)]">
                Setting up {template.baseName}
              </p>
              <p className="text-xs text-[#6A7184] mt-1">{statusMsg}</p>
            </div>
            {error && <p className="text-xs text-red-500">{error}</p>}
          </div>
        </DialogContent>
      </Dialog>
    );
  }

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
            <Label htmlFor="base-name" className="text-xs font-medium text-[#4A5268] dark:text-[hsl(200,20%,55%)]">
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
                    'w-8 h-8 rounded flex items-center justify-center text-base hover:bg-gray-100 dark:hover:bg-[hsl(200,25%,15%)] transition-colors',
                    icon === emoji && 'ring-2 ring-[#3366FF] bg-[#3366FF]/5'
                  )}
                  onClick={() => setIcon(emoji)}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

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
            disabled={creating || !name.trim()}
          >
            {creating ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                Creating...
              </>
            ) : 'Create Base'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useToast } from '@/hooks/use-toast';
import { ColorSwatchPicker } from '../components/ColorSwatchPicker';
import { TASK_DEFAULT_COLOR } from '../theme/taskTheme';
import {
  useCreateStatus,
  useDeleteStatus,
  useStatuses,
  useUpdateStatus,
  type TaskStatusCategory,
} from '../api/statuses';
import { useCreateTag, useDeleteTag, useTags, useUpdateTag } from '../api/tags';

const CATEGORY_LABELS: Record<TaskStatusCategory, string> = {
  not_started: 'Not started',
  active: 'Active',
  done: 'Done',
  closed: 'Closed',
};

function ColorButton({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="h-5 w-5 rounded-full shrink-0 ring-1 ring-border"
          style={{ backgroundColor: value }}
          aria-label="Colour"
        />
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2" align="start">
        <ColorSwatchPicker value={value} onChange={onChange} />
      </PopoverContent>
    </Popover>
  );
}

function StatusesTab({ spaceId }: { spaceId: string }) {
  const { toast } = useToast();
  const { data: statuses } = useStatuses(spaceId);
  const createStatus = useCreateStatus();
  const updateStatus = useUpdateStatus();
  const deleteStatus = useDeleteStatus();
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState<TaskStatusCategory>('active');

  const ordered = [...(statuses ?? [])].sort((a, b) => a.position - b.position);

  const swap = (i: number, j: number) => {
    if (j < 0 || j >= ordered.length) return;
    updateStatus.mutate({ id: ordered[i].id, spaceId, patch: { position: ordered[j].position } });
    updateStatus.mutate({ id: ordered[j].id, spaceId, patch: { position: ordered[i].position } });
  };

  const handleDelete = (id: string) => {
    deleteStatus.mutate(
      { id, spaceId },
      {
        onError: (err) =>
          toast({ title: 'Cannot delete status', description: (err as Error).message, variant: 'destructive' }),
      },
    );
  };

  const handleAdd = () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    createStatus.mutate(
      { spaceId, name: trimmed, color: TASK_DEFAULT_COLOR, category: newCategory, position: ordered.length },
      {
        onSuccess: () => setNewName(''),
        onError: (err) => toast({ title: 'Could not add status', description: (err as Error).message, variant: 'destructive' }),
      },
    );
  };

  return (
    <div className="space-y-1.5">
      {ordered.map((s, i) => (
        <div key={s.id} className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5">
          <ColorButton value={s.color} onChange={(hex) => updateStatus.mutate({ id: s.id, spaceId, patch: { color: hex } })} />
          <Input
            defaultValue={s.name}
            className="h-7 text-xs flex-1"
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v && v !== s.name) updateStatus.mutate({ id: s.id, spaceId, patch: { name: v } });
            }}
          />
          <Select
            value={s.category}
            onValueChange={(category: TaskStatusCategory) => updateStatus.mutate({ id: s.id, spaceId, patch: { category } })}
          >
            <SelectTrigger className="h-7 w-32 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button type="button" onClick={() => swap(i, i - 1)} disabled={i === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30">
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={() => swap(i, i + 1)} disabled={i === ordered.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-30">
            <ArrowDown className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={() => handleDelete(s.id)} className="text-muted-foreground hover:text-destructive">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}

      <div className="flex items-center gap-2 pt-1">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New status"
          className="h-8 text-xs flex-1"
          onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
        />
        <Select value={newCategory} onValueChange={(v: TaskStatusCategory) => setNewCategory(v)}>
          <SelectTrigger className="h-8 w-32 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="button" size="sm" className="h-8" onClick={handleAdd}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add
        </Button>
      </div>
    </div>
  );
}

function TagsTab({ spaceId }: { spaceId: string }) {
  const { toast } = useToast();
  const { data: tags } = useTags(spaceId);
  const createTag = useCreateTag();
  const updateTag = useUpdateTag();
  const deleteTag = useDeleteTag();
  const [newName, setNewName] = useState('');

  const handleAdd = () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    createTag.mutate(
      { spaceId, name: trimmed, color: TASK_DEFAULT_COLOR },
      {
        onSuccess: () => setNewName(''),
        onError: (err) => toast({ title: 'Could not add tag', description: (err as Error).message, variant: 'destructive' }),
      },
    );
  };

  return (
    <div className="space-y-1.5">
      {(tags ?? []).map((t) => (
        <div key={t.id} className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5">
          <ColorButton value={t.color} onChange={(hex) => updateTag.mutate({ id: t.id, spaceId, patch: { color: hex } })} />
          <Input
            defaultValue={t.name}
            className="h-7 text-xs flex-1"
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v && v !== t.name) updateTag.mutate({ id: t.id, spaceId, patch: { name: v } });
            }}
          />
          <button
            type="button"
            onClick={() =>
              deleteTag.mutate(
                { id: t.id, spaceId },
                { onError: (err) => toast({ title: 'Could not delete tag', description: (err as Error).message, variant: 'destructive' }) },
              )
            }
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      {(tags ?? []).length === 0 && <p className="text-xs text-muted-foreground py-2">No tags yet.</p>}

      <div className="flex items-center gap-2 pt-1">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New tag"
          className="h-8 text-xs flex-1"
          onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
        />
        <Button type="button" size="sm" className="h-8" onClick={handleAdd}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add
        </Button>
      </div>
    </div>
  );
}

export function StatusesTagsDialog({
  spaceId,
  open,
  onOpenChange,
}: {
  spaceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Statuses and tags</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="statuses">
          <TabsList>
            <TabsTrigger value="statuses">Statuses</TabsTrigger>
            <TabsTrigger value="tags">Tags</TabsTrigger>
          </TabsList>
          <TabsContent value="statuses" className="pt-2">
            <StatusesTab spaceId={spaceId} />
          </TabsContent>
          <TabsContent value="tags" className="pt-2">
            <TagsTab spaceId={spaceId} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

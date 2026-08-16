import { useCallback, useEffect, useState } from 'react';
import { Plus, GripVertical, Trash2, Pencil, X, Check } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { confirm } from '@/hooks/use-confirm';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import type { SpaceStatus } from '@/lib/task-types';

const STATUS_GROUPS = [
  { value: 'not_started', label: 'Not Started', color: 'bg-slate-400' },
  { value: 'active', label: 'Active', color: 'bg-blue-500' },
  { value: 'done', label: 'Done', color: 'bg-emerald-500' },
  { value: 'closed', label: 'Closed', color: 'bg-gray-500' },
] as const;

const PRESET_COLORS = [
  '#6b7280', '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f97316',
];

interface SpaceStatusManagerProps {
  spaceId: string;
  spaceName: string;
  open: boolean;
  onClose: () => void;
}

export function SpaceStatusManager({ spaceId, spaceName, open, onClose }: SpaceStatusManagerProps) {
  const { toast } = useToast();
  const [statuses, setStatuses] = useState<SpaceStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingNew, setAddingNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#3b82f6');
  const [newGroup, setNewGroup] = useState<SpaceStatus['status_group']>('active');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  const [editGroup, setEditGroup] = useState<SpaceStatus['status_group']>('active');

  const loadStatuses = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('space_statuses')
      .select('*')
      .eq('space_id', spaceId)
      .order('sort_order');
    setStatuses((data as SpaceStatus[]) || []);
    setLoading(false);
  }, [spaceId]);

  useEffect(() => {
    if (open) loadStatuses();
  }, [open, loadStatuses]);

  const addStatus = async () => {
    if (!newName.trim()) return;
    const { error } = await supabase.from('space_statuses').insert({
      space_id: spaceId,
      name: newName.trim(),
      color: newColor,
      status_group: newGroup,
      sort_order: statuses.length,
    });
    if (error) {
      toast({ title: 'Failed', description: error.message, variant: 'destructive' });
      return;
    }
    setNewName('');
    setAddingNew(false);
    await loadStatuses();
  };

  const updateStatus = async (id: string) => {
    if (!editName.trim()) return;
    const { error } = await supabase.from('space_statuses').update({
      name: editName.trim(),
      color: editColor,
      status_group: editGroup,
    }).eq('id', id);
    if (error) {
      toast({ title: 'Failed', description: error.message, variant: 'destructive' });
      return;
    }
    setEditingId(null);
    await loadStatuses();
  };

  const deleteStatus = async (id: string) => {
    if (!(await confirm({ title: 'Delete status?', description: 'Delete this status? Tasks using it will not be affected.', variant: 'destructive' }))) return;
    const { error } = await supabase.from('space_statuses').delete().eq('id', id);
    if (error) {
      toast({ title: 'Failed', description: error.message, variant: 'destructive' });
      return;
    }
    await loadStatuses();
  };

  const startEdit = (status: SpaceStatus) => {
    setEditingId(status.id);
    setEditName(status.name);
    setEditColor(status.color);
    setEditGroup(status.status_group);
  };

  const grouped = STATUS_GROUPS.map((g) => ({
    ...g,
    statuses: statuses.filter((s) => s.status_group === g.value),
  }));

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Manage Statuses — {spaceName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 max-h-[60vh] overflow-y-auto">
          {loading ? (
            <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-8 rounded bg-muted animate-pulse" />)}</div>
          ) : statuses.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No custom statuses yet. Add statuses to create a workflow for this space.
            </p>
          ) : (
            grouped.filter((g) => g.statuses.length > 0).map((group) => (
              <div key={group.value} className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <div className={cn('h-2 w-2 rounded-full', group.color)} />
                  <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{group.label}</Label>
                </div>
                {group.statuses.map((status) => (
                  <div key={status.id} className="flex items-center gap-2 group rounded-md px-2 py-1.5 hover:bg-muted/50 transition-colors">
                    {editingId === status.id ? (
                      <>
                        <input
                          type="color"
                          value={editColor}
                          onChange={(e) => setEditColor(e.target.value)}
                          className="h-5 w-5 rounded cursor-pointer border-0 shrink-0"
                        />
                        <Input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="h-7 text-sm flex-1"
                          autoFocus
                          onKeyDown={(e) => { if (e.key === 'Enter') updateStatus(status.id); if (e.key === 'Escape') setEditingId(null); }}
                        />
                        <Select value={editGroup} onValueChange={(v) => setEditGroup(v as SpaceStatus['status_group'])}>
                          <SelectTrigger className="h-7 w-[100px] text-[11px]"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {STATUS_GROUPS.map((g) => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={() => updateStatus(status.id)}>
                          <Check className="h-3 w-3 text-emerald-500" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={() => setEditingId(null)}>
                          <X className="h-3 w-3" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <GripVertical className="h-3 w-3 text-muted-foreground/30 shrink-0" />
                        <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: status.color }} />
                        <span className="flex-1 text-sm font-medium">{status.name}</span>
                        <span className="text-[10px] text-muted-foreground/60">{group.label}</span>
                        <Button size="icon" variant="ghost" className="h-5 w-5 opacity-0 group-hover:opacity-100 shrink-0" onClick={() => startEdit(status)}>
                          <Pencil className="h-2.5 w-2.5 text-muted-foreground" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-5 w-5 opacity-0 group-hover:opacity-100 shrink-0" onClick={() => deleteStatus(status.id)}>
                          <Trash2 className="h-2.5 w-2.5 text-muted-foreground" />
                        </Button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            ))
          )}

          {addingNew ? (
            <div className="rounded-lg border border-border/60 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={newColor}
                  onChange={(e) => setNewColor(e.target.value)}
                  className="h-6 w-6 rounded cursor-pointer border-0 shrink-0"
                />
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Status name..."
                  className="h-8 text-sm flex-1"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === 'Enter') addStatus(); if (e.key === 'Escape') setAddingNew(false); }}
                />
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <Select value={newGroup} onValueChange={(v) => setNewGroup(v as SpaceStatus['status_group'])}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUS_GROUPS.map((g) => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-1">
                  {PRESET_COLORS.map((c) => (
                    <button key={c} onClick={() => setNewColor(c)}
                      className={cn('h-5 w-5 rounded-full transition-all', newColor === c && 'ring-2 ring-offset-1 ring-primary')}
                      style={{ backgroundColor: c }} />
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" className="h-7 text-xs" onClick={addStatus} disabled={!newName.trim()}>
                  Add Status
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setAddingNew(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="outline" size="sm" className="w-full text-xs" onClick={() => setAddingNew(true)}>
              <Plus className="h-3 w-3 mr-1.5" /> Add status
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

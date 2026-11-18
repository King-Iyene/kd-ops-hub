import { useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuthStore } from '@/store/authStore';
import { useCreateView, type TaskViewConfig, type TaskViewType } from '../api/views';

const TYPE_OPTIONS: { value: TaskViewType; label: string }[] = [
  { value: 'list', label: 'List' },
  { value: 'board', label: 'Board' },
  { value: 'calendar', label: 'Calendar' },
  { value: 'table', label: 'Table' },
];

export function CreateViewDialog({
  listId,
  position,
  currentConfig,
  open,
  onOpenChange,
  onCreated,
}: {
  listId: string;
  position: number;
  currentConfig: TaskViewConfig;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (viewId: string) => void;
}) {
  const { toast } = useToast();
  const userId = useAuthStore((s) => s.user?.id);
  const createView = useCreateView();
  const [name, setName] = useState('');
  const [type, setType] = useState<TaskViewType>('list');
  const [shared, setShared] = useState(true);

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed || !userId) {
      if (!trimmed) toast({ title: 'Name is required', variant: 'destructive' });
      return;
    }
    try {
      const view = await createView.mutateAsync({
        parentType: 'list',
        parentId: listId,
        name: trimmed,
        type,
        config: currentConfig,
        isShared: shared,
        createdBy: userId,
        position,
      });
      toast({ title: 'View created' });
      onOpenChange(false);
      setName('');
      onCreated(view.id);
    } catch (err) {
      toast({ title: 'Could not create view', description: (err as Error).message, variant: 'destructive' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>New view</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="tk-view-name">Name</Label>
            <Input id="tk-view-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={type} onValueChange={(v: TaskViewType) => setType(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Visibility</Label>
            <Select value={shared ? 'shared' : 'private'} onValueChange={(v) => setShared(v === 'shared')}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="shared">Shared</SelectItem>
                <SelectItem value="private">Private</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleCreate} disabled={createView.isPending}>Create view</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

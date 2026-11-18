import { useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useLists } from '../api/lists';
import { useUpdateTask } from '../api/tasks';

export function MoveTaskDialog({
  taskId,
  currentListId,
  spaceId,
  open,
  onOpenChange,
}: {
  taskId: string;
  currentListId: string;
  spaceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const { data: lists } = useLists(spaceId);
  const updateTask = useUpdateTask();
  const [target, setTarget] = useState<string | undefined>();

  const options = (lists ?? []).filter((l) => l.id !== currentListId);

  const handleMove = () => {
    if (!target) return;
    updateTask.mutate(
      { id: taskId, listId: currentListId, patch: { list_id: target } },
      {
        onSuccess: () => { toast({ title: 'Task moved' }); onOpenChange(false); },
        onError: (err) => toast({ title: 'Could not move task', description: (err as Error).message, variant: 'destructive' }),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Move to another list</DialogTitle>
        </DialogHeader>
        {options.length === 0 ? (
          <p className="text-sm text-muted-foreground">There is no other list in this space to move it to.</p>
        ) : (
          <Select value={target} onValueChange={setTarget}>
            <SelectTrigger>
              <SelectValue placeholder="Choose a list" />
            </SelectTrigger>
            <SelectContent>
              {options.map((l) => (
                <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleMove} disabled={!target || updateTask.isPending}>Move</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

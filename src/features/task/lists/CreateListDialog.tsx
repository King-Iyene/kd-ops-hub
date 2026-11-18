import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useAuthStore } from '@/store/authStore';
import { useCreateList } from '../api/lists';
import { friendlyErrorMessage } from '../lib/errors';

export function CreateListDialog({
  spaceId,
  open,
  onOpenChange,
}: {
  spaceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const userId = useAuthStore((s) => s.user?.id);
  const createList = useCreateList();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const reset = () => {
    setName('');
    setDescription('');
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast({ title: 'Name is required', variant: 'destructive' });
      return;
    }
    if (!userId) return;
    try {
      const list = await createList.mutateAsync({
        spaceId,
        name: trimmed,
        description: description.trim() || null,
        createdBy: userId,
      });
      toast({ title: 'List created' });
      handleOpenChange(false);
      navigate(`/task/l/${list.id}`);
    } catch (err) {
      toast({ title: 'Could not create list', description: friendlyErrorMessage(err), variant: 'destructive' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create list</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="tk-list-name">Name</Label>
            <Input id="tk-list-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tk-list-description">Description</Label>
            <Textarea id="tk-list-description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>Cancel</Button>
          <Button onClick={handleCreate} disabled={createList.isPending}>Create list</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

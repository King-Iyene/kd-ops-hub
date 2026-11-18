import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Globe, Lock, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';
import { TASK_DEFAULT_COLOR } from '../theme/taskTheme';
import { ColorSwatchPicker } from '../components/ColorSwatchPicker';
import { PeoplePicker } from '../components/PeoplePicker';
import { TaskAvatar } from '../components/TaskAvatar';
import { useVisiblePeople } from '../api/people';
import { useCreateSpace } from '../api/spaces';

type DraftMember = { userId: string; name: string; photoUrl: string | null; role: 'editor' | 'viewer' };

export function CreateSpaceDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const userId = useAuthStore((s) => s.user?.id);
  const { data: people } = useVisiblePeople();
  const createSpace = useCreateSpace();

  const [name, setName] = useState('');
  const [color, setColor] = useState(TASK_DEFAULT_COLOR);
  const [isPrivate, setIsPrivate] = useState(false);
  const [members, setMembers] = useState<DraftMember[]>([]);

  const reset = () => {
    setName('');
    setColor(TASK_DEFAULT_COLOR);
    setIsPrivate(false);
    setMembers([]);
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
      const space = await createSpace.mutateAsync({
        name: trimmed,
        color,
        isPrivate,
        createdBy: userId,
        members: members.map((m) => ({ userId: m.userId, role: m.role })),
      });
      toast({ title: 'Space created' });
      handleOpenChange(false);
      navigate(`/task/s/${space.id}`);
    } catch (err) {
      toast({ title: 'Could not create space', description: (err as Error).message, variant: 'destructive' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create space</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="tk-space-name">Name</Label>
            <Input
              id="tk-space-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Engineering"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label>Colour</Label>
            <ColorSwatchPicker value={color} onChange={setColor} />
          </div>

          <div className="space-y-1.5">
            <Label>Visibility</Label>
            <div className="inline-flex rounded-lg border border-border p-0.5 bg-muted/40">
              <button
                type="button"
                onClick={() => setIsPrivate(false)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                  !isPrivate ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground',
                )}
              >
                <Globe className="h-3.5 w-3.5" /> Public
              </button>
              <button
                type="button"
                onClick={() => setIsPrivate(true)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                  isPrivate ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground',
                )}
              >
                <Lock className="h-3.5 w-3.5" /> Private
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Members</Label>
            <p className="text-xs text-muted-foreground">You are added as an editor automatically.</p>
            {members.length > 0 && (
              <div className="space-y-1.5 mt-1.5">
                {members.map((m) => (
                  <div key={m.userId} className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5">
                    <TaskAvatar userId={m.userId} name={m.name} photoUrl={m.photoUrl} size={22} />
                    <span className="flex-1 text-xs truncate">{m.name}</span>
                    <Select
                      value={m.role}
                      onValueChange={(role: 'editor' | 'viewer') =>
                        setMembers((prev) => prev.map((x) => (x.userId === m.userId ? { ...x, role } : x)))
                      }
                    >
                      <SelectTrigger className="h-7 w-24 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="editor">Editor</SelectItem>
                        <SelectItem value="viewer">Viewer</SelectItem>
                      </SelectContent>
                    </Select>
                    <button
                      type="button"
                      onClick={() => setMembers((prev) => prev.filter((x) => x.userId !== m.userId))}
                      className="text-muted-foreground hover:text-destructive"
                      aria-label={`Remove ${m.name}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="pt-1">
              <PeoplePicker
                people={people ?? []}
                excludeIds={[userId ?? '', ...members.map((m) => m.userId)]}
                onSelect={(p) =>
                  setMembers((prev) => [...prev, { userId: p.id, name: p.full_name, photoUrl: p.photo_url, role: 'editor' }])
                }
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={createSpace.isPending}>
            Create space
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

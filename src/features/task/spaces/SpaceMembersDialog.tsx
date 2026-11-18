import { X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { TaskAvatar } from '../components/TaskAvatar';
import { PeoplePicker } from '../components/PeoplePicker';
import { useVisiblePeople } from '../api/people';
import {
  useAddSpaceMember,
  useRemoveSpaceMember,
  useSpaceMembersDetailed,
  useUpdateSpaceMemberRole,
} from '../api/spaces';

export function SpaceMembersDialog({
  spaceId,
  open,
  onOpenChange,
}: {
  spaceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const { data: members } = useSpaceMembersDetailed(spaceId);
  const { data: people } = useVisiblePeople();
  const addMember = useAddSpaceMember();
  const updateRole = useUpdateSpaceMemberRole();
  const removeMember = useRemoveSpaceMember();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Members</DialogTitle>
        </DialogHeader>

        <div className="space-y-1.5">
          {(members ?? []).map((m) => (
            <div key={m.user_id} className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5">
              <TaskAvatar userId={m.user_id} name={m.full_name} photoUrl={m.photo_url} size={22} />
              <span className="flex-1 text-xs truncate">{m.full_name}</span>
              <Select
                value={m.role}
                onValueChange={(role: 'editor' | 'viewer') =>
                  updateRole.mutate(
                    { spaceId, userId: m.user_id, role },
                    { onError: (err) => toast({ title: 'Could not change role', description: (err as Error).message, variant: 'destructive' }) },
                  )
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
                onClick={() =>
                  removeMember.mutate(
                    { spaceId, userId: m.user_id },
                    { onError: (err) => toast({ title: 'Could not remove member', description: (err as Error).message, variant: 'destructive' }) },
                  )
                }
                className="text-muted-foreground hover:text-destructive"
                aria-label={`Remove ${m.full_name}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {(members ?? []).length === 0 && (
            <p className="text-xs text-muted-foreground py-2">No members yet.</p>
          )}
        </div>

        <div className="pt-1">
          <PeoplePicker
            people={people ?? []}
            excludeIds={(members ?? []).map((m) => m.user_id)}
            onSelect={(p) =>
              addMember.mutate(
                { spaceId, userId: p.id, role: 'editor' },
                { onError: (err) => toast({ title: 'Could not add member', description: (err as Error).message, variant: 'destructive' }) },
              )
            }
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

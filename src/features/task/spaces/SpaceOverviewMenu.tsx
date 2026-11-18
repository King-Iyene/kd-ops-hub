import { useState } from 'react';
import { Archive, ArchiveRestore, MoreHorizontal, Palette, Pencil, Tags, Users } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ToastAction } from '@/components/ui/toast';
import { useToast } from '@/hooks/use-toast';
import { prompt } from '@/hooks/use-prompt';
import { ColorSwatchPicker } from '../components/ColorSwatchPicker';
import { SpaceMembersDialog } from './SpaceMembersDialog';
import { StatusesTagsDialog } from './StatusesTagsDialog';
import { useRecolorSpace, useRenameSpace, useSetSpaceArchived, type TaskSpace } from '../api/spaces';
import { friendlyErrorMessage } from '../lib/errors';

export function SpaceOverviewMenu({ space, canManage }: { space: TaskSpace; canManage: boolean }) {
  const { toast } = useToast();
  const renameSpace = useRenameSpace();
  const recolorSpace = useRecolorSpace();
  const setArchived = useSetSpaceArchived();

  const [membersOpen, setMembersOpen] = useState(false);
  const [statusesOpen, setStatusesOpen] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);

  const isArchived = !!space.archived_at;

  const handleRename = async () => {
    const next = await prompt({ title: 'Rename space', description: 'Enter a new name.', placeholder: space.name, minLength: 1 });
    if (next) renameSpace.mutate({ spaceId: space.id, name: next });
  };

  const handleArchiveToggle = () => {
    const nextArchived = !isArchived;
    setArchived.mutate(
      { spaceId: space.id, archived: nextArchived },
      {
        onSuccess: () => {
          if (nextArchived) {
            toast({
              title: 'Space archived',
              description: 'Its lists, tables and records are hidden too.',
              duration: 8000,
              action: (
                <ToastAction altText="Undo" onClick={() => setArchived.mutate({ spaceId: space.id, archived: false })}>
                  Undo
                </ToastAction>
              ),
            });
          } else {
            toast({ title: 'Space unarchived' });
          }
        },
        onError: (err) =>
          toast({ title: 'Could not update the space', description: friendlyErrorMessage(err), variant: 'destructive' }),
      },
    );
  };

  // Someone who can't edit this space (not an admin, not an editor member)
  // gets no menu at all, archived or not — a capability they don't hold is
  // not shown, never just disabled.
  if (!canManage) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" className="h-8 w-8" aria-label="Space options">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {!isArchived && (
            <>
              <DropdownMenuItem onSelect={handleRename}>
                <Pencil className="h-3.5 w-3.5 mr-2" /> Rename
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setColorOpen(true)}>
                <Palette className="h-3.5 w-3.5 mr-2" /> Colour
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setMembersOpen(true)}>
                <Users className="h-3.5 w-3.5 mr-2" /> Members
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setStatusesOpen(true)}>
                <Tags className="h-3.5 w-3.5 mr-2" /> Statuses and tags
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem onSelect={handleArchiveToggle}>
            {isArchived ? (
              <>
                <ArchiveRestore className="h-3.5 w-3.5 mr-2" /> Unarchive
              </>
            ) : (
              <>
                <Archive className="h-3.5 w-3.5 mr-2" /> Archive
              </>
            )}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <SpaceMembersDialog spaceId={space.id} open={membersOpen} onOpenChange={setMembersOpen} />
      <StatusesTagsDialog spaceId={space.id} open={statusesOpen} onOpenChange={setStatusesOpen} />

      <Dialog open={colorOpen} onOpenChange={setColorOpen}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>Colour</DialogTitle>
          </DialogHeader>
          <ColorSwatchPicker
            value={space.color}
            onChange={(hex) => {
              recolorSpace.mutate({ spaceId: space.id, color: hex });
              setColorOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

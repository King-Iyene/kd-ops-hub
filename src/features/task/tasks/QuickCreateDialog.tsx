import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuthStore } from '@/store/authStore';
import { EmptyState } from '../components/EmptyState';
import { PeoplePicker } from '../components/PeoplePicker';
import { TaskAvatar } from '../components/TaskAvatar';
import { TaskDatePicker } from '../components/TaskDatePicker';
import { useAllAccessibleLists } from '../api/lists';
import { useActiveSpaces } from '../api/spaces';
import { useVisiblePeople } from '../api/people';
import { useStatuses } from '../api/statuses';
import { useCreateTask, type TaskPriority } from '../api/tasks';
import { isTaskAdmin, useTaskRole } from '../api/workspace';
import { getLastUsedListId, setLastUsedListId } from '../lib/lastUsedList';
import { parseTitleDate } from '../lib/naturalLanguageDate';
import { CreateSpaceDialog } from '../spaces/CreateSpaceDialog';
import { CreateListDialog } from '../lists/CreateListDialog';
import { friendlyErrorMessage } from '../lib/errors';

const PRIORITY_OPTIONS: { value: TaskPriority; label: string }[] = [
  { value: 'urgent', label: 'Urgent' },
  { value: 'high', label: 'High' },
  { value: 'normal', label: 'Normal' },
  { value: 'low', label: 'Low' },
];

export function QuickCreateDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const userId = useAuthStore((s) => s.user?.id);
  const { data: role } = useTaskRole();
  const { data: lists, isLoading: listsLoading } = useAllAccessibleLists();
  const { data: spaces } = useActiveSpaces();
  const { data: people } = useVisiblePeople();
  const createTask = useCreateTask();

  const [title, setTitle] = useState('');
  const [listId, setListId] = useState<string | null>(null);
  const [assignee, setAssignee] = useState<{ id: string; full_name: string; photo_url: string | null } | null>(null);
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [dueTouched, setDueTouched] = useState(false);
  const [priority, setPriority] = useState<TaskPriority>('normal');
  const [createSpaceOpen, setCreateSpaceOpen] = useState(false);
  const [createListOpen, setCreateListOpen] = useState(false);

  const effectiveListId = listId ?? getLastUsedListId() ?? lists?.[0]?.id ?? null;
  const effectiveSpaceId = lists?.find((l) => l.id === effectiveListId)?.space_id;
  // A task needs a real status to show up in its list's grouped view at
  // all — default to the space's first status by position, the same one
  // the "+ Add task" ghost row in the To Do group would use.
  const { data: spaceStatuses } = useStatuses(effectiveSpaceId);
  const defaultStatusId = [...(spaceStatuses ?? [])].sort((a, b) => a.position - b.position)[0]?.id ?? null;
  const parsedTitle = useMemo(() => parseTitleDate(title), [title]);

  const reset = () => {
    setTitle('');
    setListId(null);
    setAssignee(null);
    setDueDate(null);
    setDueTouched(false);
    setPriority('normal');
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const handleCreate = async () => {
    const trimmed = parsedTitle.cleanTitle || title.trim();
    if (!trimmed || !effectiveListId || !userId) {
      if (!trimmed) toast({ title: 'Title is required', variant: 'destructive' });
      return;
    }
    const finalDue = dueTouched ? dueDate : (dueDate ?? (parsedTitle.dueDate ? parsedTitle.dueDate.toISOString().slice(0, 10) : null));
    try {
      await createTask.mutateAsync({
        listId: effectiveListId,
        title: trimmed,
        statusId: defaultStatusId,
        priority,
        dueDate: finalDue,
        dueHasTime: dueTouched ? false : parsedTitle.hasTime,
        assigneeIds: assignee ? [assignee.id] : [],
        createdBy: userId,
      });
      setLastUsedListId(effectiveListId);
      toast({ title: 'Task created' });
      handleOpenChange(false);
      navigate(`/task/l/${effectiveListId}`);
    } catch (err) {
      toast({ title: 'Could not create task', description: friendlyErrorMessage(err), variant: 'destructive' });
    }
  };

  const noListsYet = !listsLoading && (!lists || lists.length === 0);

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-md" onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleCreate();
        }}>
          <DialogHeader>
            <DialogTitle>New task</DialogTitle>
          </DialogHeader>

          {noListsYet ? (
            <EmptyState
              title="You need a list first."
              description={isTaskAdmin(role) ? undefined : 'Ask an admin to set up a space and a list.'}
              action={isTaskAdmin(role) && (
                <Button
                  size="sm"
                  onClick={() => {
                    handleOpenChange(false);
                    if (spaces && spaces.length > 0) setCreateListOpen(true);
                    else setCreateSpaceOpen(true);
                  }}
                >
                  Create a list
                </Button>
              )}
            />
          ) : (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="tk-quick-title">Title</Label>
                <Input id="tk-quick-title" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Task title (try: tomorrow 3pm)" />
                {parsedTitle.dueDate && !dueTouched && (
                  <p className="text-2xs text-muted-foreground">
                    Due {parsedTitle.dueDate.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}
                    {parsedTitle.hasTime ? ` at ${parsedTitle.dueDate.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}` : ''}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label>List</Label>
                <Select value={effectiveListId ?? undefined} onValueChange={setListId}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Choose a list" />
                  </SelectTrigger>
                  <SelectContent>
                    {(lists ?? []).map((l) => (
                      <SelectItem key={l.id} value={l.id}>{l.space_name} · {l.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-4">
                <div className="space-y-1.5 flex-1">
                  <Label>Assignee</Label>
                  {assignee ? (
                    <button
                      type="button"
                      onClick={() => setAssignee(null)}
                      className="flex items-center gap-1.5 h-8 px-2 rounded-md border border-border text-xs"
                    >
                      <TaskAvatar userId={assignee.id} name={assignee.full_name} photoUrl={assignee.photo_url} size={18} />
                      {assignee.full_name}
                    </button>
                  ) : (
                    <PeoplePicker
                      people={people ?? []}
                      excludeIds={[]}
                      label="Assign"
                      onSelect={(p) => setAssignee({ id: p.id, full_name: p.full_name, photo_url: p.photo_url })}
                    />
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>Due date</Label>
                  <TaskDatePicker value={dueDate} onChange={(d) => { setDueDate(d); setDueTouched(true); }} />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Select value={priority} onValueChange={(v: TaskPriority) => setPriority(v)}>
                  <SelectTrigger className="h-9 w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITY_OPTIONS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {!noListsYet && (
            <DialogFooter>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={createTask.isPending}>Create task</Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      <CreateSpaceDialog open={createSpaceOpen} onOpenChange={setCreateSpaceOpen} />
      {spaces && spaces[0] && (
        <CreateListDialog spaceId={spaces[0].id} open={createListOpen} onOpenChange={setCreateListOpen} />
      )}
    </>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { CalendarClock, Loader2, Plus, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuthStore } from '@/store/authStore';
import { errorMessage } from '@/lib/db-errors';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  useAssignablePeople, useCreateTask, useTaskFolders, useTaskLists,
  type TaskPriority,
} from '@/queries/useTaskModule';
import { AssigneePicker, DuePicker, PriorityPicker } from './pickers';
import { dueLabel, parseDueFromName } from './taskDates';
import { useOpenTask } from './useOpenTask';

const LAST_LIST_KEY = 'kdops.task.lastList';

function readLastList(): string | null {
  try { return localStorage.getItem(LAST_LIST_KEY); } catch { return null; }
}
function writeLastList(id: string) {
  try { localStorage.setItem(LAST_LIST_KEY, id); } catch { /* private mode: just don't remember */ }
}

// The always-visible "+ Task" in the top bar, on every page.
export function NewTaskButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" className="h-8 gap-1 px-2.5 sm:px-3" onClick={() => setOpen(true)} aria-label="New task">
        <Plus className="h-4 w-4" /> <span className="hidden sm:inline">Task</span>
      </Button>
      {open && <NewTaskDialog open={open} onOpenChange={setOpen} />}
    </>
  );
}

export function NewTaskDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { toast } = useToast();
  const { profile } = useAuthStore();
  const location = useLocation();
  const { open: openTask } = useOpenTask();
  const { data: lists } = useTaskLists();
  const { data: folders } = useTaskFolders();
  const { data: people } = useAssignablePeople();
  const createTask = useCreateTask();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [listId, setListId] = useState<string>('');
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [pickedDue, setPickedDue] = useState<string | null>(null);
  const [priority, setPriority] = useState<TaskPriority | null>(null);
  const [ignoreParsed, setIgnoreParsed] = useState(false);

  // Default list: the one you're looking at, else the one you used last, else the first.
  useEffect(() => {
    if (listId || !lists?.length) return;
    const here = location.pathname.match(/^\/task\/list\/([^/]+)/)?.[1];
    const last = readLastList();
    const pick = [here, last].find((id) => id && lists.some((l) => l.id === id)) ?? lists[0].id;
    setListId(pick);
  }, [lists, listId, location.pathname]);

  const parsed = useMemo(() => parseDueFromName(name), [name]);
  const useParsed = !ignoreParsed && !pickedDue && !!parsed.due;
  const finalTitle = useParsed ? parsed.title : name.trim();
  const finalDue = pickedDue ?? (useParsed ? parsed.due : null);

  const grouped = useMemo(() => {
    return (folders ?? []).map((f) => ({ folder: f, lists: (lists ?? []).filter((l) => l.folder_id === f.id) }))
      .filter((g) => g.lists.length > 0);
  }, [folders, lists]);

  const submit = (andOpen: boolean) => {
    if (!finalTitle || !listId || !profile?.id) return;
    createTask.mutate(
      {
        listId,
        title: finalTitle,
        createdBy: profile.id,
        description: description.trim() || null,
        assigneeId,
        dueDate: finalDue,
        priority,
      },
      {
        onSuccess: (row) => {
          writeLastList(listId);
          onOpenChange(false);
          toast({ title: 'Task created' });
          if (andOpen && row?.id) openTask(row.id);
        },
        onError: (err) => toast({ title: 'Could not create task', description: errorMessage(err), variant: 'destructive' }),
      },
    );
  };

  const noLists = lists && lists.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent hideClose className="md:max-w-md p-4 gap-3">
        <div className="flex items-center justify-between">
          <DialogTitle className="text-sm font-semibold">New task</DialogTitle>
          <button type="button" onClick={() => onOpenChange(false)} className="text-muted-foreground hover:text-foreground" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        {noLists ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            There are no lists yet. An admin needs to create a space and a list first.
          </p>
        ) : (
          <>
            <div className="space-y-1">
              <label htmlFor="new-task-name" className="text-xs font-semibold">Task name</label>
              <Input
                id="new-task-name"
                autoFocus
                placeholder="Draft the weekly report tomorrow 3pm"
                value={name}
                onChange={(e) => { setName(e.target.value); setIgnoreParsed(false); }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); submit(e.ctrlKey || e.metaKey); }
                }}
              />
              {useParsed ? (
                <p className="text-2xs text-primary inline-flex items-center gap-1">
                  <CalendarClock className="h-3 w-3" /> Due {dueLabel(parsed.due!)} · saved as "{parsed.title}"
                  <button type="button" className="ml-1 underline text-muted-foreground hover:text-foreground" onClick={() => setIgnoreParsed(true)}>
                    keep the name as typed
                  </button>
                </p>
              ) : (
                <p className="text-2xs text-muted-foreground">
                  Write a time into the name — "tomorrow 3pm", "next Friday" — and it becomes the due date.
                </p>
              )}
            </div>

            <div className="space-y-1">
              <label htmlFor="new-task-desc" className="text-xs font-semibold">Description</label>
              <Textarea
                id="new-task-desc"
                placeholder="Optional"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(true); } }}
              />
            </div>

            <div className="space-y-1">
              <span className="text-xs font-semibold">List</span>
              <Select value={listId} onValueChange={setListId}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Choose a list" /></SelectTrigger>
                <SelectContent>
                  {grouped.map((g) => (
                    <SelectGroup key={g.folder.id}>
                      <SelectLabel className="text-2xs text-muted-foreground">{g.folder.name}</SelectLabel>
                      {g.lists.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">Assignee <AssigneePicker value={assigneeId} people={people ?? []} onChange={setAssigneeId} compact /></span>
              <span className="inline-flex items-center gap-1">Due <DuePicker value={finalDue} onChange={(d) => { setPickedDue(d); if (!d) setIgnoreParsed(true); }} /></span>
              <span className="inline-flex items-center gap-1">Priority <PriorityPicker value={priority} onChange={setPriority} /></span>
            </div>

            <div className="flex items-center justify-between gap-2 pt-1">
              <span className="text-2xs text-muted-foreground">Enter to save · Ctrl + Enter to save and open</span>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
                <Button size="sm" disabled={!finalTitle || !listId || createTask.isPending} onClick={() => submit(false)}>
                  {createTask.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />} Create task
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

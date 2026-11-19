import { useState } from 'react';
import { ChevronRight, Eye, EyeOff, Link2, Loader2, MoreHorizontal, Plus, Trash2, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuthStore } from '@/store/authStore';
import { errorMessage } from '@/lib/db-errors';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  useTask, useUpdateTask, useDeleteTask, useAssignablePeople, useTaskLists, useTaskFolders,
  useWatchers, useToggleWatch,
  type PersonOption, type TaskPatch, type TaskRow,
} from '@/queries/useTaskModule';
import { AssigneePicker, DuePicker, PriorityPicker, StatusPicker } from './pickers';
import { AttachmentsSection, ChecklistsSection, FieldsSection, SubtasksSection } from './TaskSections';
import { TaskTimeline } from './TaskTimeline';
import { isOverdue } from './taskDates';
import { taskLink, useOpenTask } from './useOpenTask';

// Mounted once in the app layout: whenever the address has ?task=<id>,
// that task opens over the current page.
export function TaskModalHost() {
  const { openTaskId, close } = useOpenTask();
  const { data: task, isLoading } = useTask(openTaskId);
  const { data: people } = useAssignablePeople();

  return (
    <Dialog open={!!openTaskId} onOpenChange={(o) => !o && close()}>
      <DialogContent hideClose className="p-0 gap-0 md:max-w-5xl md:h-[85vh] max-md:h-[92vh] flex flex-col overflow-hidden">
        <DialogTitle className="sr-only">{task?.title ?? 'Task'}</DialogTitle>
        {task ? (
          <TaskView key={task.id} task={task} people={people ?? []} onClose={close} />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
            {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'This task no longer exists.'}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function TaskView({ task, people, onClose }: { task: TaskRow; people: PersonOption[]; onClose: () => void }) {
  const { toast } = useToast();
  const { profile } = useAuthStore();
  const { open } = useOpenTask();
  const { data: lists } = useTaskLists();
  const { data: folders } = useTaskFolders();
  const { data: parent } = useTask(task.parent_id);
  const { data: watchers } = useWatchers(task.id);
  const toggleWatch = useToggleWatch(task.id);
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? '');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const list = (lists ?? []).find((l) => l.id === task.list_id);
  const space = list ? (folders ?? []).find((f) => f.id === list.folder_id) : undefined;
  const watching = (watchers ?? []).some((w) => w.user_id === profile?.id);

  const save = (patch: TaskPatch) =>
    updateTask.mutate({ task, patch }, {
      onError: (err) => toast({ title: 'Could not update task', description: errorMessage(err), variant: 'destructive' }),
    });

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(taskLink(task.id));
      toast({ title: 'Link copied' });
    } catch {
      toast({ title: 'Could not copy the link', variant: 'destructive' });
    }
  };

  const iconBtn = 'h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60';

  return (
    <>
      <header className="flex items-center gap-2 px-4 h-11 border-b border-border/70 shrink-0">
        <nav className="flex items-center gap-1 text-2xs text-muted-foreground min-w-0 flex-1">
          {space && <span className="truncate">{space.name}</span>}
          {space && list && <ChevronRight className="h-3 w-3 shrink-0" />}
          {list && <span className="truncate">{list.name}</span>}
          {parent && (
            <>
              <ChevronRight className="h-3 w-3 shrink-0" />
              <button type="button" className="truncate hover:text-foreground" onClick={() => open(parent.id)}>{parent.title}</button>
            </>
          )}
        </nav>
        <button type="button" className={iconBtn} onClick={copyLink} aria-label="Copy link" title="Copy link">
          <Link2 className="h-4 w-4" />
        </button>
        <button
          type="button"
          className={cn(iconBtn, watching && 'text-primary')}
          aria-label={watching ? 'Stop watching' : 'Watch'}
          title={watching ? 'Watching — click to stop' : 'Watch this task'}
          onClick={() => profile?.id && toggleWatch.mutate({ userId: profile.id, watch: !watching }, {
            onError: (err) => toast({ title: 'Could not update watching', description: errorMessage(err), variant: 'destructive' }),
          })}
        >
          {watching ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className={iconBtn} aria-label="More"><MoreHorizontal className="h-4 w-4" /></button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={copyLink}><Link2 className="h-3.5 w-3.5 mr-2" /> Copy link</DropdownMenuItem>
            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete task
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <button type="button" className={iconBtn} onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></button>
      </header>

      <div className="flex-1 min-h-0 flex max-md:flex-col">
        <div className="flex-1 min-w-0 overflow-y-auto px-5 py-4 space-y-5">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => { if (title.trim() && title.trim() !== task.title) save({ title: title.trim() }); else setTitle(task.title); }}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            className="border-0 shadow-none px-0 h-auto text-xl font-bold focus-visible:ring-0 bg-transparent"
          />

          <div className="grid grid-cols-[110px_1fr] items-center gap-y-2 text-xs">
            <span className="text-muted-foreground">Status</span>
            <div><StatusPicker value={task.status} onChange={(status) => save({ status })} /></div>
            <span className="text-muted-foreground">Assignees</span>
            <div><AssigneePicker value={task.assignee_id} people={people} onChange={(assignee_id) => save({ assignee_id })} /></div>
            <span className="text-muted-foreground">Due date</span>
            <div><DuePicker value={task.due_date} onChange={(due_date) => save({ due_date })} placeholder="Set date" overdue={isOverdue(task)} /></div>
            <span className="text-muted-foreground">Priority</span>
            <div><PriorityPicker value={task.priority} onChange={(priority) => save({ priority })} showLabel={!!task.priority} /></div>
            <span className="text-muted-foreground">Tags</span>
            <TagsEditor tags={task.tags ?? []} onChange={(tags) => save({ tags })} />
          </div>

          <div className="border-t border-border/70" />

          <section>
            <h3 className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Description</h3>
            <Textarea
              placeholder="Add a description…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={() => { if (description !== (task.description ?? '')) save({ description: description || null }); }}
              rows={3}
              className="text-sm"
            />
          </section>

          <FieldsSection task={task} people={people} />
          {!task.parent_id && <SubtasksSection task={task} people={people} />}
          <ChecklistsSection task={task} />
          <AttachmentsSection task={task} />
        </div>

        <aside className="md:w-[38%] md:border-l max-md:border-t border-border/70 flex flex-col min-h-0 max-md:h-[45%] bg-muted/10">
          <TaskTimeline taskId={task.id} people={people} />
        </aside>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete task?</AlertDialogTitle>
            <AlertDialogDescription>
              "{task.title}" and its subtasks, checklists, comments and attachments are deleted permanently.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                deleteTask.mutate(task.id, {
                  onError: (err) => toast({ title: 'Could not delete task', description: errorMessage(err), variant: 'destructive' }),
                });
                onClose();
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function TagsEditor({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const [adding, setAdding] = useState(false);
  const [value, setValue] = useState('');
  const add = () => {
    const t = value.trim();
    setValue('');
    setAdding(false);
    if (t && !tags.some((x) => x.toLowerCase() === t.toLowerCase())) onChange([...tags, t]);
  };
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {tags.map((t) => (
        <span key={t} className="group inline-flex items-center gap-1 rounded bg-primary/10 text-primary px-1.5 py-0.5 text-2xs font-medium">
          {t}
          <button type="button" aria-label={`Remove tag ${t}`} className="opacity-60 hover:opacity-100" onClick={() => onChange(tags.filter((x) => x !== t))}>
            <X className="h-2.5 w-2.5" />
          </button>
        </span>
      ))}
      {adding ? (
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={add}
          onKeyDown={(e) => { if (e.key === 'Enter') add(); if (e.key === 'Escape') { e.stopPropagation(); setAdding(false); setValue(''); } }}
          placeholder="Tag name"
          className="h-6 w-24 rounded border border-border bg-transparent px-1.5 text-2xs focus:outline-none focus:ring-1 focus:ring-primary/50"
        />
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-2xs font-medium hover:bg-muted/60">
          <Plus className="h-3 w-3" /> Tag
        </button>
      )}
    </div>
  );
}

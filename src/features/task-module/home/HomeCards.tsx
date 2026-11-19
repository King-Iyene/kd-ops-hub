import { Link } from 'react-router-dom';
import {
  addDays, endOfDay, format, formatDistanceToNow, isSameDay, parseISO, startOfDay, startOfWeek, subDays,
} from 'date-fns';
import { Flag, Table2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { initialsOf } from '@/lib/name';
import { AvatarBubble } from '@/components/AvatarBubble';
import {
  useMyCommentFeed, useMyRecords, STATUS_META, STAGE_OF,
  type TaskRow, type PersonOption, type StatusStage,
} from '@/queries/useTaskModule';
import { dueDateOf, dueLabel, isOverdue } from '../taskDates';

type OpenTask = (taskId: string) => void;

function EmptyCard({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center px-6 py-8">
      <p className="text-sm font-semibold">{title}</p>
      <p className="text-xs text-muted-foreground mt-1 max-w-xs">{hint}</p>
    </div>
  );
}

function StatusTag({ task }: { task: TaskRow }) {
  const meta = STATUS_META[task.status];
  return (
    <span className="flex items-center gap-1.5 shrink-0">
      <span className={cn('h-1.5 w-1.5 rounded-full', meta.dot)} />
      <span className={cn('text-3xs font-bold uppercase tracking-wide', meta.text)}>{meta.label}</span>
    </span>
  );
}

function DueText({ task, className }: { task: TaskRow; className?: string }) {
  if (!task.due_date) return null;
  return (
    <span className={cn('text-2xs tabular-nums shrink-0', isOverdue(task) ? 'text-destructive font-medium' : 'text-muted-foreground', className)}>
      {dueLabel(task.due_date)}
    </span>
  );
}

function TaskRowButton({ task, onOpen, children }: { task: TaskRow; onOpen: OpenTask; children?: React.ReactNode }) {
  const done = task.status === 'done';
  return (
    <button
      type="button"
      onClick={() => onOpen(task.id)}
      className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-muted/40 kd-transition"
    >
      <StatusTag task={task} />
      <span className={cn('flex-1 min-w-0 truncate text-xs-plus', done && 'line-through text-muted-foreground')}>{task.title}</span>
      <DueText task={task} />
      {children}
    </button>
  );
}

function SectionLabel({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center gap-1.5 px-3 pt-2 pb-1">
      <span className="text-3xs font-bold uppercase tracking-[0.12em] text-muted-foreground">{label}</span>
      <span className="text-3xs text-muted-foreground/60 tabular-nums">{count}</span>
    </div>
  );
}

// ── Summary ────────────────────────────────────────────────────────────

export function SummaryCard({ mine }: { mine: TaskRow[] }) {
  const today = startOfDay(new Date());
  const weekStart = startOfWeek(today, { weekStartsOn: 1 });
  const stats = [
    { label: 'Overdue', value: mine.filter((t) => isOverdue(t, today)).length, tone: 'text-red-500' },
    {
      label: 'Due today',
      value: mine.filter((t) => t.status !== 'done' && dueDateOf(t) && isSameDay(dueDateOf(t)!, today)).length,
      tone: 'text-amber-500',
    },
    { label: 'In progress', value: mine.filter((t) => STAGE_OF[t.status] === 'active').length, tone: 'text-blue-500' },
    {
      label: 'Completed this week',
      value: mine.filter((t) => t.status === 'done' && t.completed_at && new Date(t.completed_at) >= weekStart).length,
      tone: 'text-emerald-500',
    },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-border/60">
      {stats.map((s) => (
        <div key={s.label} className="px-4 py-3">
          <p className="text-3xs font-bold uppercase tracking-[0.12em] text-muted-foreground">{s.label}</p>
          <p className={cn('text-2xl font-bold tabular-nums mt-1', s.tone)}>{s.value}</p>
        </div>
      ))}
    </div>
  );
}

// ── My Work ────────────────────────────────────────────────────────────

export function MyWorkCard({ mine, onOpen }: { mine: TaskRow[]; onOpen: OpenTask }) {
  const today = startOfDay(new Date());
  const in7 = endOfDay(addDays(today, 7));
  const open = mine.filter((t) => t.status !== 'done');
  const groups: { label: string; items: TaskRow[] }[] = [
    { label: 'Overdue', items: [] },
    { label: 'Today', items: [] },
    { label: 'Next 7 days', items: [] },
    { label: 'Later', items: [] },
    { label: 'No due date', items: [] },
  ];
  for (const t of open) {
    const due = dueDateOf(t);
    if (!due) groups[4].items.push(t);
    else if (due < today) groups[0].items.push(t);
    else if (isSameDay(due, today)) groups[1].items.push(t);
    else if (due <= in7) groups[2].items.push(t);
    else groups[3].items.push(t);
  }
  if (open.length === 0) return <EmptyCard title="Nothing on your plate" hint="Open tasks assigned to you show up here, grouped by when they're due." />;
  return (
    <div className="pb-2">
      {groups.filter((g) => g.items.length > 0).map((g) => (
        <div key={g.label}>
          <SectionLabel label={g.label} count={g.items.length} />
          {g.items.map((t) => <TaskRowButton key={t.id} task={t} onOpen={onOpen} />)}
        </div>
      ))}
    </div>
  );
}

// ── My Board ───────────────────────────────────────────────────────────

const STAGES: { key: StatusStage; label: string; dot: string }[] = [
  { key: 'not_started', label: 'Not started', dot: 'bg-slate-400' },
  { key: 'active', label: 'Active', dot: 'bg-blue-500' },
  { key: 'done', label: 'Done', dot: 'bg-emerald-500' },
];

export function MyBoardCard({ mine, onOpen, peopleById }: { mine: TaskRow[]; onOpen: OpenTask; peopleById: Map<string, PersonOption> }) {
  // Done only shows the last two weeks, so the column doesn't keep growing forever.
  const recentCutoff = subDays(new Date(), 14);
  const visible = mine.filter((t) => t.status !== 'done' || (t.completed_at && new Date(t.completed_at) >= recentCutoff));
  return (
    <div className="flex gap-3 p-3 h-full overflow-x-auto">
      {STAGES.map((stage) => {
        const items = visible.filter((t) => STAGE_OF[t.status] === stage.key);
        return (
          <div key={stage.key} className="w-52 shrink-0 flex flex-col rounded-lg bg-muted/30 p-2">
            <div className="flex items-center gap-1.5 px-1 pb-2">
              <span className={cn('h-1.5 w-1.5 rounded-full', stage.dot)} />
              <span className="text-3xs font-bold uppercase tracking-[0.12em] text-muted-foreground">{stage.label}</span>
              <span className="text-3xs text-muted-foreground/60 tabular-nums">{items.length}</span>
            </div>
            <div className="space-y-2 overflow-y-auto">
              {items.map((t) => {
                const assignee = t.assignee_id ? peopleById.get(t.assignee_id) : undefined;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => onOpen(t.id)}
                    className="w-full text-left rounded-md border border-border/70 bg-card p-2.5 hover:border-primary/50 kd-transition space-y-2"
                  >
                    <p className={cn('text-xs-plus font-medium line-clamp-2', t.status === 'done' && 'line-through text-muted-foreground')}>{t.title}</p>
                    <div className="flex items-center gap-1.5">
                      <Flag className="h-3 w-3 text-muted-foreground/50 shrink-0" />
                      <DueText task={t} className="flex-1" />
                      {!t.due_date && <span className="flex-1" />}
                      <AvatarBubble photoUrl={assignee?.photo_url ?? null} initials={initialsOf(undefined, undefined, assignee?.full_name || '?')} size={18} />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── This Week ──────────────────────────────────────────────────────────

export function ThisWeekCard({ mine, onOpen }: { mine: TaskRow[]; onOpen: OpenTask }) {
  const today = startOfDay(new Date());
  const weekStart = startOfWeek(today, { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  return (
    <div className="grid grid-cols-7 h-full min-w-[560px]">
      {days.map((day) => {
        const isToday = isSameDay(day, today);
        const items = mine.filter((t) => t.due_date && isSameDay(parseISO(t.due_date), day));
        return (
          <div key={day.toISOString()} className="border-r border-border/50 last:border-r-0 flex flex-col min-w-0">
            <div className={cn(
              'px-2 py-1.5 border-b border-border/50 text-2xs',
              isToday ? 'text-primary font-bold' : 'text-muted-foreground',
            )}>
              {format(day, 'EEE d')}
            </div>
            <div className="p-1 space-y-1 overflow-y-auto">
              {items.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onOpen(t.id)}
                  title={t.title}
                  className={cn(
                    'w-full flex items-center gap-1 rounded border border-border/70 bg-card px-1.5 py-1 text-left text-2xs hover:border-primary/50 kd-transition',
                    t.status === 'done' && 'line-through text-muted-foreground',
                  )}
                >
                  <Flag className="h-2.5 w-2.5 shrink-0 text-muted-foreground/60" />
                  <span className="truncate">{t.title}</span>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Delegated ──────────────────────────────────────────────────────────

export function DelegatedCard({ delegated, onOpen, peopleById }: { delegated: TaskRow[]; onOpen: OpenTask; peopleById: Map<string, PersonOption> }) {
  if (delegated.length === 0) {
    return <EmptyCard title="Nothing delegated" hint="Tasks you create and assign to someone else show up here, so you can follow them." />;
  }
  const sorted = [...delegated].sort((a, b) => {
    const ad = a.status === 'done' ? 1 : 0;
    const bd = b.status === 'done' ? 1 : 0;
    if (ad !== bd) return ad - bd;
    return (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999');
  });
  return (
    <div className="pb-2">
      <SectionLabel label="All tasks" count={delegated.length} />
      {sorted.map((t) => {
        const assignee = t.assignee_id ? peopleById.get(t.assignee_id) : undefined;
        return (
          <TaskRowButton key={t.id} task={t} onOpen={onOpen}>
            <span title={assignee?.full_name}>
              <AvatarBubble photoUrl={assignee?.photo_url ?? null} initials={initialsOf(undefined, undefined, assignee?.full_name || '?')} size={18} />
            </span>
          </TaskRowButton>
        );
      })}
    </div>
  );
}

// ── Mentions and comments ──────────────────────────────────────────────

export function MentionsCard({ onOpen }: { onOpen: OpenTask }) {
  const { data: feed } = useMyCommentFeed();
  if (!feed || feed.length === 0) {
    return <EmptyCard title="Nothing in the last week" hint="Comments that mention you, or land on a task you watch, show up here." />;
  }
  return (
    <div className="divide-y divide-border/50">
      {feed.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => onOpen(c.task_id)}
          className="w-full flex gap-2.5 px-3 py-2.5 text-left hover:bg-muted/40 kd-transition"
        >
          <AvatarBubble photoUrl={null} initials={initialsOf(undefined, undefined, c.author_name || '?')} size={22} />
          <div className="flex-1 min-w-0">
            <p className="text-2xs text-muted-foreground truncate">
              <span className="font-semibold text-foreground">{c.author_name ?? 'Someone'}</span> on{' '}
              <span className="text-foreground">{c.task_title}</span> · {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
            </p>
            <p className="text-xs-plus line-clamp-2 mt-0.5">{c.body}</p>
          </div>
          {c.mentioned && (
            <span className="self-start shrink-0 rounded px-1.5 py-0.5 text-3xs font-semibold bg-primary/10 text-primary">Mentioned you</span>
          )}
        </button>
      ))}
    </div>
  );
}

// ── My records ─────────────────────────────────────────────────────────

export function MyRecordsCard() {
  const { data: records } = useMyRecords();
  if (!records || records.length === 0) {
    return <EmptyCard title="Nothing yet" hint="Rows that name you in a People field will show up here." />;
  }
  return (
    <div className="divide-y divide-border/50">
      {records.map((r) => (
        <Link
          key={r.id}
          to={`/task/table/${r.table_id}`}
          className="flex items-center gap-2.5 px-3 py-2 hover:bg-muted/40 kd-transition"
        >
          <Table2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="flex-1 min-w-0 truncate text-xs-plus">{r.label || 'Untitled row'}</span>
          <span className="text-2xs text-muted-foreground shrink-0 truncate max-w-[40%]">{r.table_name}</span>
          <span className="text-2xs text-muted-foreground/70 shrink-0">{formatDistanceToNow(new Date(r.updated_at), { addSuffix: true })}</span>
        </Link>
      ))}
    </div>
  );
}

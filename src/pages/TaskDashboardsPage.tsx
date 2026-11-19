import { useMemo, useState } from 'react';
import { format, subDays } from 'date-fns';
import type { DateRange as DayRange } from 'react-day-picker';
import { AlertTriangle, CalendarClock, CalendarRange, CheckCircle2, CircleDot, Loader2, PlusCircle, Users, UserX } from 'lucide-react';
import { usePageTitle } from '@/hooks/usePageTitle';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import {
  DASHBOARD_TASK_LIMIT, STATUS_META, useAllTasksForDashboard, useAssignablePeople, useTaskFolders, useTaskLists,
  type PersonOption,
} from '@/queries/useTaskModule';
import { computeDashboard, daysOverdue, type DashboardStats, type DateRange } from '@/features/task-module/dashboardStats';
import { PersonAvatar } from '@/features/task-module/pickers';
import { useOpenTask } from '@/features/task-module/useOpenTask';

// Company-wide view of every task. Admins only (route guard + hidden nav
// link); everyone else's overview is their personal Home.

const PRESETS = [7, 30, 90] as const;
type Preset = (typeof PRESETS)[number];
const UNASSIGNED = 'unassigned';

const card = 'min-w-0 rounded-xl border border-border/70 bg-card p-4';
const cardTitle = 'text-sm font-semibold';

const TaskDashboardsPage = () => {
  usePageTitle('Task Dashboard');
  const { data: tasks, isLoading } = useAllTasksForDashboard(true);
  const { data: lists } = useTaskLists();
  const { data: folders } = useTaskFolders();
  const { data: people } = useAssignablePeople();
  const { open } = useOpenTask();
  const [preset, setPreset] = useState<Preset | 'custom'>(30);
  const [custom, setCustom] = useState<DayRange | undefined>();
  const [space, setSpace] = useState<string>('all');
  const [who, setWho] = useState<string[]>([]);

  const range: DateRange = useMemo(() => {
    const now = new Date();
    if (preset === 'custom' && custom?.from) return { from: custom.from, to: custom.to ?? custom.from };
    return { from: subDays(now, (preset === 'custom' ? 30 : preset) - 1), to: now };
  }, [preset, custom]);
  const rangeLabel = preset === 'custom' && custom?.from
    ? `${format(range.from, 'd MMM yyyy')} – ${format(range.to, 'd MMM yyyy')}`
    : `last ${preset === 'custom' ? 30 : preset} days`;

  const listById = useMemo(() => new Map((lists ?? []).map((l) => [l.id, l])), [lists]);
  const folderById = useMemo(() => new Map((folders ?? []).map((f) => [f.id, f])), [folders]);
  const peopleById = useMemo(() => new Map((people ?? []).map((p) => [p.id, p])), [people]);

  const scoped = useMemo(
    () => (tasks ?? []).filter((t) =>
      (space === 'all' || listById.get(t.list_id)?.folder_id === space)
      && (who.length === 0 || who.includes(t.assignee_id ?? UNASSIGNED))),
    [tasks, space, listById, who],
  );
  const stats = useMemo(() => computeDashboard(scoped, range), [scoped, range]);
  const rangeShort = preset === 'custom' ? 'in range' : `${preset}d`;

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-bold tracking-tight">Dashboard</h1>
          <p className="text-xs text-muted-foreground">Every task across the company. Only admins can see this page.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={space} onValueChange={setSpace}>
            <SelectTrigger className="h-8 w-40 sm:w-44 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All spaces</SelectItem>
              {(folders ?? []).map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <PeopleFilter people={people ?? []} value={who} onChange={setWho} />
          <div className="inline-flex rounded-md border border-border p-0.5" role="group" aria-label="Date range">
            {PRESETS.map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={preset === r}
                onClick={() => setPreset(r)}
                className={cn('h-7 px-2.5 rounded text-xs', preset === r ? 'bg-secondary text-secondary-foreground font-medium' : 'text-muted-foreground hover:text-foreground')}
              >
                {r} days
              </button>
            ))}
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-pressed={preset === 'custom'}
                  className={cn('h-7 px-2.5 rounded text-xs inline-flex items-center gap-1', preset === 'custom' ? 'bg-secondary text-secondary-foreground font-medium' : 'text-muted-foreground hover:text-foreground')}
                >
                  <CalendarRange className="h-3.5 w-3.5" /> {preset === 'custom' && custom?.from ? rangeLabel : 'Custom'}
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-auto p-0">
                <Calendar
                  mode="range"
                  numberOfMonths={2}
                  selected={custom}
                  defaultMonth={custom?.from ?? subDays(new Date(), 30)}
                  onSelect={(r) => { setCustom(r); if (r?.from) setPreset('custom'); }}
                  disabled={{ after: new Date() }}
                />
                <div className="flex items-center justify-between border-t border-border px-3 py-2 text-2xs text-muted-foreground">
                  <span>{custom?.from ? rangeLabel : 'Pick a start and an end date.'}</span>
                  {preset === 'custom' && <button type="button" className="hover:text-foreground" onClick={() => { setCustom(undefined); setPreset(30); }}>Reset</button>}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="py-20 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : stats.total === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-16">No tasks{space !== 'all' || who.length ? ' for this selection' : ' yet'}.</p>
      ) : (
        <>
          {(tasks?.length ?? 0) >= DASHBOARD_TASK_LIMIT && (
            <p className="text-2xs text-muted-foreground">Showing the newest {DASHBOARD_TASK_LIMIT.toLocaleString()} tasks.</p>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
            <Tile icon={CircleDot} label="Open tasks" value={stats.open} />
            <Tile icon={AlertTriangle} label="Overdue" value={stats.overdue} tone={stats.overdue > 0 ? 'critical' : undefined} />
            <Tile icon={CalendarClock} label="Due in next 7 days" value={stats.dueSoon} />
            <Tile icon={UserX} label="Open and unassigned" value={stats.unassignedOpen} />
            <Tile icon={CheckCircle2} label={`Completed, ${rangeLabel}`} value={stats.completedInRange} />
            <Tile icon={PlusCircle} label={`Created, ${rangeLabel}`} value={stats.createdInRange} />
          </div>

          <div className="grid lg:grid-cols-2 gap-3">
            <StatusBreakdown stats={stats} />
            <WeeklyCompleted stats={stats} />
          </div>

          <div className="grid xl:grid-cols-2 gap-3">
            <section className={card}>
              <h2 className={cardTitle}>Workload by person</h2>
              <p className="text-2xs text-muted-foreground mb-3">Open tasks per person, busiest first.</p>
              <PeopleTable stats={stats} peopleById={peopleById} rangeShort={rangeShort} />
            </section>
            <section className={card}>
              <h2 className={cardTitle}>Lists</h2>
              <p className="text-2xs text-muted-foreground mb-3">Progress is completed tasks out of all tasks in the list.</p>
              <ListsTable
                stats={stats}
                rangeShort={rangeShort}
                nameOf={(id) => {
                  const l = listById.get(id);
                  return { list: l?.name ?? 'Unknown list', space: l ? folderById.get(l.folder_id)?.name ?? '' : '' };
                }}
              />
            </section>
          </div>

          <section className={card}>
            <h2 className={cardTitle}>Overdue tasks</h2>
            <p className="text-2xs text-muted-foreground mb-2">Longest overdue first.</p>
            {stats.overdueTasks.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4">Nothing is overdue.</p>
            ) : (
              <div className="divide-y divide-border/50">
                {stats.overdueTasks.slice(0, 15).map((t) => {
                  const who = t.assignee_id ? peopleById.get(t.assignee_id) : undefined;
                  const days = daysOverdue(t);
                  return (
                    <button key={t.id} type="button" onClick={() => open(t.id)} className="w-full flex items-center gap-3 py-2 text-left hover:bg-muted/30 px-1 rounded">
                      <span className={cn('h-2 w-2 rounded-full shrink-0', STATUS_META[t.status].dot)} />
                      <span className="text-sm truncate min-w-0 flex-1">{t.title}</span>
                      <span className="text-2xs text-muted-foreground truncate max-w-[25%] hidden sm:inline">{listById.get(t.list_id)?.name}</span>
                      <span className="text-2xs text-destructive font-medium tabular-nums shrink-0 w-24 text-right">
                        {days === 1 ? '1 day late' : `${days} days late`}
                      </span>
                      <span className="w-5 shrink-0">{who ? <PersonAvatar person={who} size={20} /> : <span className="text-2xs text-muted-foreground">—</span>}</span>
                    </button>
                  );
                })}
                {stats.overdueTasks.length > 15 && (
                  <p className="text-2xs text-muted-foreground pt-2">and {stats.overdueTasks.length - 15} more.</p>
                )}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
};

export default TaskDashboardsPage;

function Tile({ icon: Icon, label, value, tone }: { icon: React.ElementType; label: string; value: number; tone?: 'critical' }) {
  return (
    <div className={cn(card, 'p-3')}>
      <div className={cn('flex items-center gap-1.5 text-2xs', tone === 'critical' ? 'text-destructive' : 'text-muted-foreground')}>
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <div className={cn('mt-1 text-2xl font-bold tabular-nums', tone === 'critical' && 'text-destructive')}>{value.toLocaleString()}</div>
    </div>
  );
}

// Part-to-whole: one segmented bar (2px gaps), legend with counts beneath.
function StatusBreakdown({ stats }: { stats: DashboardStats }) {
  const shown = stats.byStatus.filter((s) => s.count > 0);
  return (
    <section className={card}>
      <h2 className={cardTitle}>All tasks by status</h2>
      <p className="text-2xs text-muted-foreground mb-3">{stats.total.toLocaleString()} tasks in total.</p>
      <div className="flex h-3 gap-0.5" role="img" aria-label={shown.map((s) => `${STATUS_META[s.status].label}: ${s.count}`).join(', ')}>
        {shown.map((s) => (
          <Tooltip key={s.status}>
            <TooltipTrigger asChild>
              <span className={cn('h-full first:rounded-l last:rounded-r min-w-[3px]', STATUS_META[s.status].dot)} style={{ flexGrow: s.count, flexBasis: 0 }} />
            </TooltipTrigger>
            <TooltipContent>{STATUS_META[s.status].label}: {s.count} ({Math.round((s.count / stats.total) * 100)}%)</TooltipContent>
          </Tooltip>
        ))}
      </div>
      <ul className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5">
        {stats.byStatus.map((s) => (
          <li key={s.status} className="flex items-center gap-2 text-xs">
            <span className={cn('h-2 w-2 rounded-full shrink-0', STATUS_META[s.status].dot)} />
            <span className="text-muted-foreground">{STATUS_META[s.status].label}</span>
            <span className="ml-auto font-medium tabular-nums">{s.count}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// One series over time: thin bars on a hairline baseline, hover for values,
// only the latest week labelled directly.
function WeeklyCompleted({ stats }: { stats: DashboardStats }) {
  const max = Math.max(1, ...stats.weekly.map((w) => w.completed));
  const last = stats.weekly.length - 1;
  return (
    <section className={card}>
      <h2 className={cardTitle}>Tasks completed per week</h2>
      <p className="text-2xs text-muted-foreground mb-3">{stats.weekly.length} weeks ending {format(stats.weekly[stats.weekly.length - 1].weekStart, 'd MMM')}, weeks start on Monday.</p>
      <div className="relative flex items-end gap-2 h-32 border-b border-border/70" aria-hidden>
        {/* Recessive scale: one hairline at the busiest week. */}
        <span className="absolute inset-x-0 top-0 border-t border-dashed border-border/60" />
        <span className="absolute -top-2 left-0 bg-card pr-1 text-3xs text-muted-foreground tabular-nums">{max}</span>
        {stats.weekly.map((w, i) => (
          <Tooltip key={w.weekStart.toISOString()}>
            <TooltipTrigger asChild>
              <div className="flex-1 h-full flex flex-col justify-end items-center group cursor-default">
                {i === last && <span className="text-2xs font-medium tabular-nums mb-0.5">{w.completed}</span>}
                <div
                  className="w-full max-w-[28px] rounded-t bg-primary/80 group-hover:bg-primary kd-transition"
                  style={{ height: `${(w.completed / max) * 100}%`, minHeight: w.completed ? 3 : 0 }}
                />
              </div>
            </TooltipTrigger>
            <TooltipContent>Week of {format(w.weekStart, 'd MMM')}: {w.completed} completed</TooltipContent>
          </Tooltip>
        ))}
      </div>
      <div className="flex gap-2 mt-1">
        {stats.weekly.map((w) => (
          <span key={w.weekStart.toISOString()} className="flex-1 text-center text-3xs text-muted-foreground tabular-nums">{format(w.weekStart, 'd MMM')}</span>
        ))}
      </div>
      <table className="sr-only">
        <caption>Tasks completed per week</caption>
        <tbody>{stats.weekly.map((w) => <tr key={w.weekStart.toISOString()}><th>{format(w.weekStart, 'd MMM yyyy')}</th><td>{w.completed}</td></tr>)}</tbody>
      </table>
    </section>
  );
}

const th = 'py-1.5 pr-3 text-left text-3xs font-bold uppercase tracking-wide text-muted-foreground whitespace-nowrap';
const td = 'py-1.5 pr-3 text-xs tabular-nums whitespace-nowrap';

function PeopleTable({ stats, peopleById, rangeShort }: { stats: DashboardStats; peopleById: Map<string, PersonOption>; rangeShort: string }) {
  const max = Math.max(1, ...stats.people.map((p) => p.open));
  if (stats.people.length === 0) return <p className="text-xs text-muted-foreground">No one has tasks yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead><tr><th className={th}>Person</th><th className={cn(th, 'w-[35%]')}>Open</th><th className={th}>Overdue</th><th className={th}>Due ≤ 7d</th><th className={th}>Done {rangeShort}</th></tr></thead>
        <tbody className="divide-y divide-border/40">
          {stats.people.map((p) => {
            const who = p.id ? peopleById.get(p.id) : undefined;
            return (
              <tr key={p.id ?? 'none'}>
                <td className={cn(td, 'max-w-[180px]')}>
                  <span className="inline-flex items-center gap-2 min-w-0">
                    {who ? <PersonAvatar person={who} size={20} /> : <span className="h-5 w-5 rounded-full border border-dashed border-muted-foreground/50" />}
                    <span className="truncate">{p.id ? who?.full_name ?? 'Former member' : 'Unassigned'}</span>
                  </span>
                </td>
                <td className={td}>
                  <span className="flex items-center gap-2">
                    <span className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden"><span className="block h-full rounded-full bg-primary" style={{ width: `${(p.open / max) * 100}%` }} /></span>
                    <span className="w-6 text-right">{p.open}</span>
                  </span>
                </td>
                <td className={cn(td, p.overdue > 0 ? 'text-destructive font-medium' : 'text-muted-foreground')}>{p.overdue}</td>
                <td className={td}>{p.dueSoon}</td>
                <td className={td}>{p.completed}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ListsTable({ stats, rangeShort, nameOf }: { stats: DashboardStats; rangeShort: string; nameOf: (id: string) => { list: string; space: string } }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead><tr><th className={th}>List</th><th className={th}>Open</th><th className={th}>Overdue</th><th className={th}>Done {rangeShort}</th><th className={cn(th, 'w-[30%]')}>Progress</th></tr></thead>
        <tbody className="divide-y divide-border/40">
          {stats.lists.map((l) => {
            const n = nameOf(l.listId);
            const pct = l.total ? Math.round((l.done / l.total) * 100) : 0;
            return (
              <tr key={l.listId}>
                <td className={cn(td, 'max-w-[200px]')}>
                  <span className="block truncate">{n.list}</span>
                  {n.space && <span className="block truncate text-3xs text-muted-foreground">{n.space}</span>}
                </td>
                <td className={td}>{l.open}</td>
                <td className={cn(td, l.overdue > 0 ? 'text-destructive font-medium' : 'text-muted-foreground')}>{l.overdue}</td>
                <td className={td}>{l.completed}</td>
                <td className={td}>
                  <span className="flex items-center gap-2">
                    <span className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden"><span className="block h-full rounded-full bg-primary" style={{ width: `${pct}%` }} /></span>
                    <span className="w-9 text-right">{pct}%</span>
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PeopleFilter({ people, value, onChange }: { people: PersonOption[]; value: string[]; onChange: (v: string[]) => void }) {
  const [q, setQ] = useState('');
  const shown = people.filter((p) => p.full_name.toLowerCase().includes(q.trim().toLowerCase()));
  const toggle = (id: string, on: boolean) => onChange(on ? [...value, id] : value.filter((x) => x !== id));
  const label = value.length === 0 ? 'Everyone' : value.length === 1
    ? (value[0] === UNASSIGNED ? 'Unassigned' : people.find((p) => p.id === value[0])?.full_name ?? '1 person')
    : `${value.length} people`;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" variant={value.length ? 'secondary' : 'outline'} className="h-8 text-xs gap-1.5 max-w-[200px]">
          <Users className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search people…"
          className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs mb-1.5 outline-none focus:ring-1 focus:ring-primary/50"
        />
        <div className="max-h-64 overflow-y-auto space-y-0.5">
          <label className="flex items-center gap-2 rounded px-1 py-1 text-xs hover:bg-muted/50 cursor-pointer">
            <Checkbox checked={value.includes(UNASSIGNED)} onCheckedChange={(c) => toggle(UNASSIGNED, !!c)} /> Unassigned
          </label>
          {shown.map((p) => (
            <label key={p.id} className="flex items-center gap-2 rounded px-1 py-1 text-xs hover:bg-muted/50 cursor-pointer">
              <Checkbox checked={value.includes(p.id)} onCheckedChange={(c) => toggle(p.id, !!c)} />
              <PersonAvatar person={p} size={18} /> <span className="truncate">{p.full_name}</span>
            </label>
          ))}
        </div>
        {value.length > 0 && (
          <button type="button" onClick={() => onChange([])} className="w-full text-left px-1 pt-1.5 text-2xs text-muted-foreground hover:text-foreground">Show everyone</button>
        )}
      </PopoverContent>
    </Popover>
  );
}

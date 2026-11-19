import { useMemo, useState } from 'react';
import type { DateRange as DayRange } from 'react-day-picker';
import {
  endOfDay, endOfMonth, endOfWeek, format, parseISO, startOfDay, startOfMonth, startOfWeek, subDays,
} from 'date-fns';
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Calendar, GripVertical, MoreHorizontal, Plus, RotateCcw, Check } from 'lucide-react';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useToast } from '@/hooks/use-toast';
import { useAuthStore, useEffectiveRole } from '@/store/authStore';
import { errorMessage } from '@/lib/db-errors';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as DayCalendar } from '@/components/ui/calendar';
import { useOpenTask } from '@/features/task-module/useOpenTask';
import {
  SummaryCard, MyWorkCard, MyBoardCard, ThisWeekCard, DelegatedCard, MentionsCard, MyRecordsCard,
} from '@/features/task-module/home/HomeCards';
import {
  useHomeTasks, useHomeLayout, useSaveHomeLayout, useAssignablePeople,
  HOME_CARDS, DEFAULT_HOME_LAYOUT,
  type HomeCardKey, type HomeDateRange, type HomeLayout, type HomeLayoutRow, type TaskRow,
} from '@/queries/useTaskModule';

const CARD_META: Record<HomeCardKey, { title: string; wide?: boolean; flush?: boolean }> = {
  summary:    { title: 'Summary', wide: true },
  my_work:    { title: 'My Work' },
  my_board:   { title: 'My Board', flush: true },
  this_week:  { title: 'This Week', flush: true },
  delegated:  { title: 'Delegated' },
  mentions:   { title: 'Mentions and comments' },
  my_records: { title: 'My records' },
};

const RANGE_LABELS: Record<HomeDateRange, string> = {
  all: 'All time',
  week: 'This week',
  month: 'This month',
  last30: 'Last 30 days',
  custom: 'Custom range',
};
const PRESET_RANGES: Exclude<HomeDateRange, 'custom'>[] = ['all', 'week', 'month', 'last30'];

// Tables are admin-only, so the card that lists table rows is too.
const ADMIN_ONLY_CARDS: HomeCardKey[] = ['my_records'];

function rangeBounds(layout: HomeLayout): [Date, Date] | null {
  const now = new Date();
  switch (layout.dateRange) {
    case 'custom': return layout.rangeFrom && layout.rangeTo
      ? [startOfDay(parseISO(layout.rangeFrom)), endOfDay(parseISO(layout.rangeTo))]
      : null;
    case 'week': return [startOfWeek(now, { weekStartsOn: 1 }), endOfWeek(now, { weekStartsOn: 1 })];
    case 'month': return [startOfMonth(now), endOfMonth(now)];
    case 'last30': return [startOfDay(subDays(now, 30)), endOfDay(now)];
    default: return null;
  }
}

// A saved layout can name a card that no longer exists (or repeat one) —
// keep only known cards, once each.
function sanitize(row: Partial<HomeLayoutRow> | null | undefined): HomeLayout {
  if (!row) return DEFAULT_HOME_LAYOUT;
  const cards = [...new Set(row.cards ?? [])].filter((c): c is HomeCardKey => (HOME_CARDS as readonly string[]).includes(c));
  let dateRange = (Object.keys(RANGE_LABELS) as HomeDateRange[]).includes(row.date_range as HomeDateRange)
    ? (row.date_range as HomeDateRange)
    : 'all';
  // A custom range without both dates can't be shown; fall back to all time.
  if (dateRange === 'custom' && !(row.range_from && row.range_to)) dateRange = 'all';
  return dateRange === 'custom'
    ? { cards, dateRange, rangeFrom: row.range_from, rangeTo: row.range_to }
    : { cards, dateRange };
}

function rangeLabel(layout: HomeLayout): string {
  if (layout.dateRange === 'custom' && layout.rangeFrom && layout.rangeTo) {
    return `${format(parseISO(layout.rangeFrom), 'd MMM')} – ${format(parseISO(layout.rangeTo), 'd MMM yyyy')}`;
  }
  return RANGE_LABELS[layout.dateRange];
}

function greeting(hour: number) {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

const TaskHub = () => {
  usePageTitle('Task');
  const { toast } = useToast();
  const { profile } = useAuthStore();
  const me = profile?.id ?? '';
  const effectiveRole = useEffectiveRole();
  const isAdmin = effectiveRole === 'admin' || effectiveRole === 'super_admin';
  const allowed = (c: HomeCardKey) => isAdmin || !ADMIN_ONLY_CARDS.includes(c);

  const { data: tasks } = useHomeTasks(me);
  const { data: people } = useAssignablePeople();
  const { data: savedLayout, isLoading: layoutLoading } = useHomeLayout(me);
  const saveLayout = useSaveHomeLayout(me);
  const { open: openTask } = useOpenTask();

  const layout = sanitize(savedLayout);

  // Saves only in response to the person changing something — never on load.
  const apply = (next: HomeLayout) => {
    saveLayout.mutate(next, {
      onError: (err) => toast({ title: 'Could not save your layout', description: errorMessage(err), variant: 'destructive' }),
    });
  };

  const peopleById = useMemo(() => new Map((people ?? []).map((p) => [p.id, p])), [people]);

  const { mineAll, mine, delegated } = useMemo(() => {
    const bounds = rangeBounds(layout);
    const inRange = (t: TaskRow) => {
      if (!bounds) return true;
      if (!t.due_date) return false;
      const d = parseISO(t.due_date);
      return d >= bounds[0] && d <= bounds[1];
    };
    const all = tasks ?? [];
    const assignedToMe = all.filter((t) => t.assignee_id === me);
    return {
      mineAll: assignedToMe,
      mine: assignedToMe.filter(inRange),
      delegated: all.filter((t) => t.created_by === me && t.assignee_id && t.assignee_id !== me).filter(inRange),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, me, layout.dateRange, layout.rangeFrom, layout.rangeTo]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = layout.cards.indexOf(active.id as HomeCardKey);
    const to = layout.cards.indexOf(over.id as HomeCardKey);
    if (from < 0 || to < 0) return;
    apply({ ...layout, cards: arrayMove(layout.cards, from, to) });
  };

  const shownCards = layout.cards.filter(allowed);
  const missing = HOME_CARDS.filter((c) => allowed(c) && !layout.cards.includes(c));
  const isDefault = layout.dateRange === 'all' && shownCards.join() === DEFAULT_HOME_LAYOUT.cards.filter(allowed).join();
  const firstName = profile?.full_name?.trim().split(/\s+/)[0] || 'there';
  const now = new Date();

  const renderBody = (key: HomeCardKey) => {
    switch (key) {
      case 'summary': return <SummaryCard mine={mine} />;
      case 'my_work': return <MyWorkCard mine={mine} onOpen={openTask} />;
      case 'my_board': return <MyBoardCard mine={mine} onOpen={openTask} peopleById={peopleById} />;
      case 'this_week': return <ThisWeekCard mine={mineAll} onOpen={openTask} />;
      case 'delegated': return <DelegatedCard delegated={delegated} onOpen={openTask} peopleById={peopleById} />;
      case 'mentions': return <MentionsCard onOpen={openTask} />;
      case 'my_records': return <MyRecordsCard />;
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-bold tracking-tight">{greeting(now.getHours())}, {firstName}</h1>
          <p className="text-2xs text-muted-foreground">{format(now, 'EEEE d MMMM')}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <HomeRangePicker layout={layout} onChange={apply} />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" className="h-8 text-xs" disabled={missing.length === 0}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add card
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {missing.map((c) => (
                <DropdownMenuItem key={c} onClick={() => apply({ ...layout, cards: [...layout.cards, c] })}>
                  {CARD_META[c].title}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            disabled={isDefault}
            onClick={() => apply(DEFAULT_HOME_LAYOUT)}
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Reset to default
          </Button>
        </div>
      </div>

      {layoutLoading ? null : shownCards.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/70 py-16 text-center">
          <p className="text-sm font-semibold">No cards on your Home</p>
          <p className="text-xs text-muted-foreground mt-1">Use Add card, or Reset to default to bring them all back.</p>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={shownCards} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {shownCards.map((key) => (
                <HomeCard
                  key={key}
                  id={key}
                  title={CARD_META[key].title}
                  wide={CARD_META[key].wide}
                  flush={CARD_META[key].flush}
                  onRemove={() => apply({ ...layout, cards: layout.cards.filter((c) => c !== key) })}
                >
                  {renderBody(key)}
                </HomeCard>
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

    </div>
  );
};

function HomeCard({
  id, title, wide, flush, onRemove, children,
}: {
  id: HomeCardKey;
  title: string;
  wide?: boolean;
  flush?: boolean;
  onRemove: () => void;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <section
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'rounded-lg border border-border/70 bg-card flex flex-col overflow-hidden',
        wide ? 'lg:col-span-2' : 'h-[360px]',
        isDragging && 'relative z-10 shadow-lg opacity-90',
      )}
    >
      <header className="flex items-center gap-1.5 px-2 py-1.5 border-b border-border/60">
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={`Move ${title}`}
          className="text-muted-foreground/50 hover:text-foreground cursor-grab active:cursor-grabbing touch-none"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
        <h2 className="flex-1 text-xs font-semibold">{title}</h2>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" aria-label={`${title} options`} className="text-muted-foreground/60 hover:text-foreground px-1">
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onRemove}>Remove card</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>
      <div className={cn('flex-1 min-h-0', flush ? 'overflow-auto' : 'overflow-y-auto')}>{children}</div>
    </section>
  );
}

export default TaskHub;

// Presets, or a custom start and end. Saves only when a choice is made, and
// a custom range only once both ends are picked.
function HomeRangePicker({ layout, onChange }: { layout: HomeLayout; onChange: (l: HomeLayout) => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DayRange | undefined>();
  const current: DayRange | undefined = layout.dateRange === 'custom' && layout.rangeFrom && layout.rangeTo
    ? { from: parseISO(layout.rangeFrom), to: parseISO(layout.rangeTo) }
    : undefined;
  const pickPreset = (r: Exclude<HomeDateRange, 'custom'>) => {
    setOpen(false);
    if (r !== layout.dateRange) onChange({ cards: layout.cards, dateRange: r });
  };
  const pickDays = (r: DayRange | undefined) => {
    setDraft(r);
    if (!r?.from || !r.to) return;
    const from = format(r.from, 'yyyy-MM-dd');
    const to = format(r.to, 'yyyy-MM-dd');
    setOpen(false);
    setDraft(undefined);
    if (layout.dateRange !== 'custom' || layout.rangeFrom !== from || layout.rangeTo !== to) {
      onChange({ cards: layout.cards, dateRange: 'custom', rangeFrom: from, rangeTo: to });
    }
  };
  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setDraft(undefined); }}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" className="h-8 text-xs">
          <Calendar className="h-3.5 w-3.5 mr-1.5" /> {rangeLabel(layout)}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto p-0 flex flex-col sm:flex-row">
        <div className="p-1.5 sm:border-r border-b sm:border-b-0 border-border sm:w-40 flex sm:flex-col gap-0.5 flex-wrap">
          {PRESET_RANGES.map((r) => (
            <button key={r} type="button" onClick={() => pickPreset(r)}
              className="flex items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-muted text-left">
              <Check className={cn('h-3.5 w-3.5', r === layout.dateRange ? 'opacity-100' : 'opacity-0')} /> {RANGE_LABELS[r]}
            </button>
          ))}
          <span className="flex items-center gap-2 rounded px-2 py-1.5 text-xs text-muted-foreground">
            <Check className={cn('h-3.5 w-3.5', layout.dateRange === 'custom' ? 'opacity-100 text-foreground' : 'opacity-0')} /> Custom range
          </span>
        </div>
        <div>
          <DayCalendar
            mode="range"
            numberOfMonths={2}
            selected={draft ?? current}
            defaultMonth={(draft ?? current)?.from ?? subDays(new Date(), 30)}
            onSelect={pickDays}
          />
          <p className="px-3 pb-2 text-2xs text-muted-foreground">
            {draft?.from && !draft.to ? 'Now pick the end date.' : 'Pick a start and an end date for a custom range.'}
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}

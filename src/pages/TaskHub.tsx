import { useMemo, useState } from 'react';
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
import { useAuthStore } from '@/store/authStore';
import { errorMessage } from '@/lib/db-errors';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { TaskDetailSheet } from '@/features/task-module/TaskDetailSheet';
import {
  SummaryCard, MyWorkCard, MyBoardCard, ThisWeekCard, DelegatedCard, MentionsCard, MyRecordsCard,
} from '@/features/task-module/home/HomeCards';
import {
  useHomeTasks, useHomeLayout, useSaveHomeLayout, useAssignablePeople,
  HOME_CARDS, DEFAULT_HOME_LAYOUT,
  type HomeCardKey, type HomeDateRange, type HomeLayout, type TaskRow,
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
};

function rangeBounds(range: HomeDateRange): [Date, Date] | null {
  const now = new Date();
  switch (range) {
    case 'week': return [startOfWeek(now, { weekStartsOn: 1 }), endOfWeek(now, { weekStartsOn: 1 })];
    case 'month': return [startOfMonth(now), endOfMonth(now)];
    case 'last30': return [startOfDay(subDays(now, 30)), endOfDay(now)];
    default: return null;
  }
}

// A saved layout can name a card that no longer exists (or repeat one) —
// keep only known cards, once each.
function sanitize(row: { cards: string[]; date_range: string } | null | undefined): HomeLayout {
  if (!row) return DEFAULT_HOME_LAYOUT;
  const cards = [...new Set(row.cards)].filter((c): c is HomeCardKey => (HOME_CARDS as readonly string[]).includes(c));
  const dateRange = (Object.keys(RANGE_LABELS) as HomeDateRange[]).includes(row.date_range as HomeDateRange)
    ? (row.date_range as HomeDateRange)
    : 'all';
  return { cards, dateRange };
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

  const { data: tasks } = useHomeTasks(me);
  const { data: people } = useAssignablePeople();
  const { data: savedLayout, isLoading: layoutLoading } = useHomeLayout(me);
  const saveLayout = useSaveHomeLayout(me);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);

  const layout = sanitize(savedLayout);

  // Saves only in response to the person changing something — never on load.
  const apply = (next: HomeLayout) => {
    saveLayout.mutate(next, {
      onError: (err) => toast({ title: 'Could not save your layout', description: errorMessage(err), variant: 'destructive' }),
    });
  };

  const peopleById = useMemo(() => new Map((people ?? []).map((p) => [p.id, p])), [people]);

  const { mineAll, mine, delegated } = useMemo(() => {
    const bounds = rangeBounds(layout.dateRange);
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
  }, [tasks, me, layout.dateRange]);

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

  const missing = HOME_CARDS.filter((c) => !layout.cards.includes(c));
  const isDefault = layout.dateRange === 'all' && layout.cards.join() === DEFAULT_HOME_LAYOUT.cards.join();
  const firstName = profile?.full_name?.trim().split(/\s+/)[0] || 'there';
  const now = new Date();

  const renderBody = (key: HomeCardKey) => {
    switch (key) {
      case 'summary': return <SummaryCard mine={mine} />;
      case 'my_work': return <MyWorkCard mine={mine} onOpen={setOpenTaskId} />;
      case 'my_board': return <MyBoardCard mine={mine} onOpen={setOpenTaskId} peopleById={peopleById} />;
      case 'this_week': return <ThisWeekCard mine={mineAll} onOpen={setOpenTaskId} />;
      case 'delegated': return <DelegatedCard delegated={delegated} onOpen={setOpenTaskId} peopleById={peopleById} />;
      case 'mentions': return <MentionsCard onOpen={setOpenTaskId} />;
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="h-8 text-xs">
                <Calendar className="h-3.5 w-3.5 mr-1.5" /> {RANGE_LABELS[layout.dateRange]}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {(Object.keys(RANGE_LABELS) as HomeDateRange[]).map((r) => (
                <DropdownMenuItem key={r} onClick={() => r !== layout.dateRange && apply({ ...layout, dateRange: r })}>
                  <Check className={cn('h-3.5 w-3.5 mr-2', r === layout.dateRange ? 'opacity-100' : 'opacity-0')} />
                  {RANGE_LABELS[r]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

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

      {layoutLoading ? null : layout.cards.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/70 py-16 text-center">
          <p className="text-sm font-semibold">No cards on your Home</p>
          <p className="text-xs text-muted-foreground mt-1">Use Add card, or Reset to default to bring them all back.</p>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={layout.cards} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {layout.cards.map((key) => (
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

      <TaskDetailSheet taskId={openTaskId} onClose={() => setOpenTaskId(null)} />
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

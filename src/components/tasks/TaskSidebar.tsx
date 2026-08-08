import { useState } from 'react';
import {
  Plus, Layers, FolderOpen, ChevronRight, ChevronDown,
  LayoutGrid, List, BarChart3, User, CalendarClock,
  AlertTriangle, MoreHorizontal, Pencil, Trash2, Hash,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';

export type TaskView = 'my-tasks' | 'board' | 'list' | 'dashboard';

export interface Space {
  id: string;
  name: string;
  description: string | null;
  color: string;
  icon: string;
  owner_id: string | null;
  sort_order: number;
  created_at: string;
}

interface TaskSidebarProps {
  spaces: Space[];
  selectedSpace: string | null;
  currentView: TaskView;
  taskCounts: {
    myTasks: number;
    overdue: number;
    total: number;
  };
  spaceTaskCounts: Map<string, number>;
  onSelectSpace: (spaceId: string | null) => void;
  onChangeView: (view: TaskView) => void;
  onCreateSpace: () => void;
  onEditSpace: (space: Space) => void;
  onDeleteSpace: (space: Space) => void;
  unorganizedCount: number;
}

export function TaskSidebar({
  spaces, selectedSpace, currentView, taskCounts, spaceTaskCounts,
  onSelectSpace, onChangeView, onCreateSpace, onEditSpace, onDeleteSpace,
  unorganizedCount,
}: TaskSidebarProps) {
  const [spacesExpanded, setSpacesExpanded] = useState(true);

  return (
    <div className="flex flex-col h-full">
      {/* ─── Personal Section ─────────────────────────── */}
      <div className="space-y-0.5 mb-4">
        <SidebarItem
          icon={User}
          label="My Tasks"
          count={taskCounts.myTasks}
          active={currentView === 'my-tasks' && !selectedSpace}
          onClick={() => { onSelectSpace(null); onChangeView('my-tasks'); }}
          badge={taskCounts.overdue > 0 ? (
            <span className="text-[9px] bg-destructive/15 text-destructive rounded-full px-1.5 py-0.5 font-medium tabular-nums">
              {taskCounts.overdue}
            </span>
          ) : undefined}
        />
      </div>

      {/* ─── Views Section ────────────────────────────── */}
      <div className="space-y-0.5 mb-4">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest px-2 mb-1.5">
          Views
        </p>
        <SidebarItem icon={LayoutGrid} label="Board" active={currentView === 'board'} onClick={() => onChangeView('board')} />
        <SidebarItem icon={List} label="List" active={currentView === 'list'} onClick={() => onChangeView('list')} />
        <SidebarItem icon={BarChart3} label="Dashboard" active={currentView === 'dashboard'} onClick={() => onChangeView('dashboard')} />
      </div>

      {/* ─── Spaces Section ───────────────────────────── */}
      <div className="flex-1 min-h-0 space-y-0.5">
        <div className="flex items-center justify-between px-2 mb-1.5">
          <button
            onClick={() => setSpacesExpanded(!spacesExpanded)}
            className="flex items-center gap-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest hover:text-foreground transition-colors"
          >
            {spacesExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            Spaces
          </button>
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="icon" variant="ghost" className="h-5 w-5" onClick={onCreateSpace}>
                  <Plus className="h-3 w-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">New space</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {spacesExpanded && (
          <div className="space-y-0.5 overflow-y-auto max-h-[calc(100vh-400px)]">
            <SidebarItem
              icon={Layers}
              label="Everything"
              count={taskCounts.total}
              active={selectedSpace === null && currentView !== 'my-tasks' && currentView !== 'dashboard'}
              onClick={() => { onSelectSpace(null); if (currentView === 'my-tasks' || currentView === 'dashboard') onChangeView('board'); }}
            />

            {spaces.map((space) => (
              <SpaceItem
                key={space.id}
                space={space}
                count={spaceTaskCounts.get(space.id) ?? 0}
                active={selectedSpace === space.id}
                onClick={() => {
                  onSelectSpace(space.id);
                  if (currentView === 'my-tasks' || currentView === 'dashboard') onChangeView('board');
                }}
                onEdit={() => onEditSpace(space)}
                onDelete={() => onDeleteSpace(space)}
              />
            ))}

            {unorganizedCount > 0 && (
              <SidebarItem
                icon={FolderOpen}
                label="No Space"
                count={unorganizedCount}
                active={selectedSpace === '__unassigned__'}
                onClick={() => {
                  onSelectSpace('__unassigned__');
                  if (currentView === 'my-tasks' || currentView === 'dashboard') onChangeView('board');
                }}
                muted
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SidebarItem({
  icon: Icon, label, count, active, onClick, badge, muted,
}: {
  icon: typeof Layers;
  label: string;
  count?: number;
  active?: boolean;
  onClick: () => void;
  badge?: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-2.5 w-full px-2.5 py-1.5 rounded-md text-[13px] font-medium transition-all text-left',
        active
          ? 'bg-primary/10 text-primary'
          : 'text-muted-foreground hover:text-foreground hover:bg-muted/60',
        muted && !active && 'opacity-60',
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="flex-1 truncate">{label}</span>
      {badge}
      {count !== undefined && !badge && (
        <span className="text-[10px] tabular-nums opacity-50">{count}</span>
      )}
    </button>
  );
}

function SpaceItem({
  space, count, active, onClick, onEdit, onDelete,
}: {
  space: Space;
  count: number;
  active: boolean;
  onClick: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="group flex items-center">
      <button
        onClick={onClick}
        className={cn(
          'flex items-center gap-2.5 flex-1 min-w-0 px-2.5 py-1.5 rounded-md text-[13px] font-medium transition-all text-left',
          active
            ? 'bg-primary/10 text-primary'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted/60',
        )}
      >
        <div className="h-3 w-3 rounded shrink-0" style={{ backgroundColor: space.color }} />
        <span className="flex-1 truncate">{space.name}</span>
        <span className="text-[10px] tabular-nums opacity-50">{count}</span>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            className="h-5 w-5 opacity-0 group-hover:opacity-100 shrink-0 ml-0.5"
          >
            <MoreHorizontal className="h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-36">
          <DropdownMenuItem onClick={onEdit}><Pencil className="h-3.5 w-3.5 mr-2" /> Edit</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-destructive" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5 mr-2" /> Remove
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

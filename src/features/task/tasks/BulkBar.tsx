import { Archive, Move, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { StatusDot } from '../components/StatusDot';
import { PeoplePicker } from '../components/PeoplePicker';
import { TaskDatePicker } from '../components/TaskDatePicker';
import type { TaskList } from '../api/lists';
import type { TaskPerson } from '../api/people';
import type { TaskStatus } from '../api/statuses';
import type { TaskPriority, TaskRow } from '../api/tasks';

const PRIORITIES: { value: TaskPriority; label: string }[] = [
  { value: 'urgent', label: 'Urgent' },
  { value: 'high', label: 'High' },
  { value: 'normal', label: 'Normal' },
  { value: 'low', label: 'Low' },
];

export function BulkBar({
  selected,
  statuses,
  people,
  sameSpaceLists,
  spanningMultipleSpaces,
  onChangeStatus,
  onChangePriority,
  onChangeDueDate,
  onAddAssignee,
  onMove,
  onArchive,
  onClear,
}: {
  selected: TaskRow[];
  statuses: TaskStatus[];
  people: TaskPerson[];
  sameSpaceLists: TaskList[];
  spanningMultipleSpaces: boolean;
  onChangeStatus: (statusId: string) => void;
  onChangePriority: (priority: TaskPriority) => void;
  onChangeDueDate: (date: string | null) => void;
  onAddAssignee: (userId: string) => void;
  onMove: (listId: string) => void;
  onArchive: () => void;
  onClear: () => void;
}) {
  if (selected.length === 0) return null;

  return (
    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 rounded-lg border border-border bg-card shadow-lg px-2 py-1.5 z-20">
      <span className="text-xs font-semibold text-foreground px-2">{selected.length} selected</span>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 text-xs">Status</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {statuses.map((s) => (
            <DropdownMenuItem key={s.id} onSelect={() => onChangeStatus(s.id)} className="gap-2">
              <StatusDot color={s.color} /> {s.name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 text-xs">Priority</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {PRIORITIES.map((p) => (
            <DropdownMenuItem key={p.value} onSelect={() => onChangePriority(p.value)}>{p.label}</DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <TaskDatePicker value={null} onChange={(d) => d && onChangeDueDate(d)} placeholder="Due date" className="h-8" />

      <PeoplePicker people={people} excludeIds={[]} label="Assignees" onSelect={(p) => onAddAssignee(p.id)} />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 text-xs">
            <Move className="h-3.5 w-3.5 mr-1.5" /> Move
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {spanningMultipleSpaces ? (
            <p className="px-2 py-1.5 text-xs text-muted-foreground max-w-[200px]">This selection has no common destination.</p>
          ) : sameSpaceLists.length === 0 ? (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">No other list in this space.</p>
          ) : (
            sameSpaceLists.map((l) => (
              <DropdownMenuItem key={l.id} onSelect={() => onMove(l.id)}>{l.name}</DropdownMenuItem>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={onArchive}>
        <Archive className="h-3.5 w-3.5 mr-1.5" /> Archive
      </Button>

      <button onClick={onClear} className="text-muted-foreground hover:text-foreground ml-1" aria-label="Clear selection">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

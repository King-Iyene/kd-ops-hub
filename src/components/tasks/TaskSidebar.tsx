import { useState } from 'react';
import {
  Plus, Layers, FolderOpen, ChevronRight, ChevronDown,
  LayoutGrid, List, BarChart3, User, Table2,
  MoreHorizontal, Pencil, Trash2,
  Lock, Users, FolderKanban, ListTodo,
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
import type { TaskList, SpaceFolder } from '@/lib/task-types';

export type TaskView = 'my-tasks' | 'board' | 'list' | 'table' | 'dashboard';

export interface Space {
  id: string;
  name: string;
  description: string | null;
  color: string;
  icon: string;
  owner_id: string | null;
  is_private: boolean;
  sort_order: number;
  created_at: string;
}

export interface SpaceMember {
  space_id: string;
  user_id: string;
  role: string;
  added_by: string | null;
  created_at: string;
}

interface TaskSidebarProps {
  spaces: Space[];
  folders: SpaceFolder[];
  lists: TaskList[];
  selectedSpace: string | null;
  selectedList: string | null;
  currentView: TaskView;
  taskCounts: {
    myTasks: number;
    overdue: number;
    total: number;
  };
  spaceTaskCounts: Map<string, number>;
  listTaskCounts: Map<string, number>;
  onSelectSpace: (spaceId: string | null) => void;
  onSelectList: (listId: string | null) => void;
  onChangeView: (view: TaskView) => void;
  onCreateSpace: () => void;
  onEditSpace: (space: Space) => void;
  onDeleteSpace: (space: Space) => void;
  onManageMembers?: (space: Space) => void;
  onCreateFolder?: (spaceId: string) => void;
  onCreateList?: (spaceId: string, folderId?: string) => void;
  unorganizedCount: number;
}

export function TaskSidebar({
  spaces, folders, lists, selectedSpace, selectedList, currentView,
  taskCounts, spaceTaskCounts, listTaskCounts,
  onSelectSpace, onSelectList, onChangeView, onCreateSpace,
  onEditSpace, onDeleteSpace, onManageMembers,
  onCreateFolder, onCreateList, unorganizedCount,
}: TaskSidebarProps) {
  const [spacesExpanded, setSpacesExpanded] = useState(true);
  const [expandedSpaces, setExpandedSpaces] = useState<Set<string>>(new Set());
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  const toggleSpace = (id: string) => {
    setExpandedSpaces((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleFolder = (id: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const ensureTaskView = () => {
    if (currentView === 'my-tasks' || currentView === 'dashboard') onChangeView('board');
  };

  return (
    <div className="flex flex-col h-full">
      {/* ─── Personal Section ─────────────────────────── */}
      <div className="space-y-0.5 mb-4">
        <SidebarItem
          icon={User}
          label="My Tasks"
          count={taskCounts.myTasks}
          active={currentView === 'my-tasks' && !selectedSpace}
          onClick={() => { onSelectSpace(null); onSelectList(null); onChangeView('my-tasks'); }}
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
        <SidebarItem icon={Table2} label="Table" active={currentView === 'table'} onClick={() => onChangeView('table')} />
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
          <div className="space-y-0.5 overflow-y-auto max-h-[calc(100vh-380px)]">
            <SidebarItem
              icon={Layers}
              label="Everything"
              count={taskCounts.total}
              active={selectedSpace === null && !selectedList && currentView !== 'my-tasks' && currentView !== 'dashboard'}
              onClick={() => { onSelectSpace(null); onSelectList(null); ensureTaskView(); }}
            />

            {spaces.map((space) => {
              const isExpanded = expandedSpaces.has(space.id);
              const spaceFolders = folders.filter((f) => f.space_id === space.id).sort((a, b) => a.sort_order - b.sort_order);
              const folderlessLists = lists.filter((l) => l.space_id === space.id && !l.folder_id).sort((a, b) => a.sort_order - b.sort_order);
              const hasChildren = spaceFolders.length > 0 || folderlessLists.length > 0;

              return (
                <div key={space.id}>
                  <SpaceItem
                    space={space}
                    count={spaceTaskCounts.get(space.id) ?? 0}
                    active={selectedSpace === space.id && !selectedList}
                    expanded={isExpanded}
                    hasChildren={hasChildren}
                    onToggle={() => toggleSpace(space.id)}
                    onClick={() => { onSelectSpace(space.id); onSelectList(null); ensureTaskView(); }}
                    onEdit={() => onEditSpace(space)}
                    onDelete={() => onDeleteSpace(space)}
                    onManageMembers={onManageMembers ? () => onManageMembers(space) : undefined}
                    onCreateFolder={onCreateFolder ? () => onCreateFolder(space.id) : undefined}
                    onCreateList={onCreateList ? () => onCreateList(space.id) : undefined}
                  />

                  {isExpanded && (
                    <div className="ml-3 pl-2 border-l border-border/40 space-y-0.5 mt-0.5">
                      {spaceFolders.map((folder) => {
                        const isFolderExpanded = expandedFolders.has(folder.id);
                        const folderLists = lists.filter((l) => l.folder_id === folder.id).sort((a, b) => a.sort_order - b.sort_order);
                        return (
                          <div key={folder.id}>
                            <button
                              onClick={() => toggleFolder(folder.id)}
                              className="flex items-center gap-2 w-full px-2 py-1 rounded-md text-[12px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                            >
                              {isFolderExpanded ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
                              <FolderKanban className="h-3 w-3 shrink-0" style={folder.color ? { color: folder.color } : undefined} />
                              <span className="flex-1 truncate text-left">{folder.name}</span>
                              <span className="text-[10px] tabular-nums opacity-40">{folderLists.length}</span>
                            </button>
                            {isFolderExpanded && folderLists.length > 0 && (
                              <div className="ml-3 pl-2 border-l border-border/30 space-y-0.5 mt-0.5">
                                {folderLists.map((list) => (
                                  <ListItem
                                    key={list.id}
                                    list={list}
                                    count={listTaskCounts.get(list.id) ?? 0}
                                    active={selectedList === list.id}
                                    onClick={() => { onSelectList(list.id); onSelectSpace(space.id); ensureTaskView(); }}
                                  />
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {folderlessLists.map((list) => (
                        <ListItem
                          key={list.id}
                          list={list}
                          count={listTaskCounts.get(list.id) ?? 0}
                          active={selectedList === list.id}
                          onClick={() => { onSelectList(list.id); onSelectSpace(space.id); ensureTaskView(); }}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {unorganizedCount > 0 && (
              <SidebarItem
                icon={FolderOpen}
                label="No Space"
                count={unorganizedCount}
                active={selectedSpace === '__unassigned__'}
                onClick={() => {
                  onSelectSpace('__unassigned__');
                  onSelectList(null);
                  ensureTaskView();
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

function ListItem({ list, count, active, onClick }: {
  list: TaskList;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 w-full px-2 py-1 rounded-md text-[12px] font-medium transition-all text-left',
        active
          ? 'bg-primary/10 text-primary'
          : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
      )}
    >
      <ListTodo className="h-3 w-3 shrink-0" style={list.color ? { color: list.color } : undefined} />
      <span className="flex-1 truncate">{list.name}</span>
      <span className="text-[10px] tabular-nums opacity-40">{count}</span>
    </button>
  );
}

function SpaceItem({
  space, count, active, expanded, hasChildren,
  onToggle, onClick, onEdit, onDelete, onManageMembers,
  onCreateFolder, onCreateList,
}: {
  space: Space;
  count: number;
  active: boolean;
  expanded: boolean;
  hasChildren: boolean;
  onToggle: () => void;
  onClick: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onManageMembers?: () => void;
  onCreateFolder?: () => void;
  onCreateList?: () => void;
}) {
  return (
    <div className="group flex items-center">
      <button
        onClick={onToggle}
        className="h-5 w-5 flex items-center justify-center shrink-0 text-muted-foreground/50 hover:text-muted-foreground"
      >
        {hasChildren ? (
          expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />
        ) : (
          <span className="h-3 w-3" />
        )}
      </button>
      <button
        onClick={onClick}
        className={cn(
          'flex items-center gap-2 flex-1 min-w-0 px-1.5 py-1.5 rounded-md text-[13px] font-medium transition-all text-left',
          active
            ? 'bg-primary/10 text-primary'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted/60',
        )}
      >
        <div className="h-3 w-3 rounded shrink-0" style={{ backgroundColor: space.color }} />
        <span className="flex-1 truncate">{space.name}</span>
        {space.is_private && <Lock className="h-2.5 w-2.5 text-muted-foreground/60 shrink-0" />}
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
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onClick={onEdit}><Pencil className="h-3.5 w-3.5 mr-2" /> Edit</DropdownMenuItem>
          {onManageMembers && (
            <DropdownMenuItem onClick={onManageMembers}><Users className="h-3.5 w-3.5 mr-2" /> Members</DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          {onCreateFolder && (
            <DropdownMenuItem onClick={onCreateFolder}><FolderKanban className="h-3.5 w-3.5 mr-2" /> New folder</DropdownMenuItem>
          )}
          {onCreateList && (
            <DropdownMenuItem onClick={onCreateList}><ListTodo className="h-3.5 w-3.5 mr-2" /> New list</DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-destructive" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5 mr-2" /> Remove
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  Home, Inbox, ListTodo, LayoutDashboard, Plus, ChevronDown, ChevronRight,
  ListChecks, Table2, Trash2, Loader2,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuthStore } from '@/store/authStore';
import { errorMessage } from '@/lib/db-errors';
import { cn } from '@/lib/utils';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  useTaskFolders, useTaskLists, useTaskTables,
  useCreateTaskFolder, useDeleteTaskFolder,
  useCreateTaskList, useDeleteTaskList,
  useCreateTaskTable, useDeleteTaskTable,
  type TaskFolder, type TaskListRow, type TaskTable,
} from '@/queries/useTaskModule';

const NAV_LINKS = [
  { to: '/task', label: 'Home', icon: Home, end: true },
  { to: '/task/inbox', label: 'Inbox', icon: Inbox, end: false },
  { to: '/task/my-tasks', label: 'My Tasks', icon: ListTodo, end: false },
  { to: '/task/dashboards', label: 'Dashboards', icon: LayoutDashboard, end: false },
];

// Two skins for the same tree: the dark desktop sidebar (AppSidebar's Task
// Management hub panel) and the light mobile "More" sheet (MobileNav).
const TONES = {
  sidebar: {
    link: 'text-sidebar-foreground/65 hover:bg-white/[0.06] hover:text-sidebar-foreground',
    linkActive: 'bg-white/[0.11] text-white',
    icon: 'text-sidebar-foreground/40',
    iconActive: 'text-[hsl(var(--sidebar-ring))]',
    heading: 'text-sidebar-foreground/35',
    muted: 'text-sidebar-foreground/45 hover:text-sidebar-foreground',
    row: 'hover:bg-white/[0.06] text-sidebar-foreground/80',
    input: 'bg-white/[0.06] border border-white/[0.08] text-sidebar-foreground placeholder:text-sidebar-foreground/30 focus:ring-[hsl(var(--sidebar-ring)/0.5)]',
    button: 'bg-white/[0.1] text-sidebar-foreground hover:bg-white/[0.16]',
  },
  mobile: {
    link: 'text-foreground hover:bg-muted/60',
    linkActive: 'bg-primary/10 text-primary font-medium',
    icon: 'text-muted-foreground',
    iconActive: 'text-primary',
    heading: 'text-muted-foreground/60',
    muted: 'text-muted-foreground hover:text-foreground',
    row: 'hover:bg-muted/60 text-foreground',
    input: 'bg-background border border-border text-foreground placeholder:text-muted-foreground focus:ring-primary/40',
    button: 'bg-primary text-primary-foreground hover:bg-primary/90',
  },
} as const;

export function TaskSidebarNav({
  variant = 'sidebar',
  onNavigate,
}: {
  variant?: keyof typeof TONES;
  onNavigate?: () => void;
}) {
  const t = TONES[variant];
  const { toast } = useToast();
  const { profile } = useAuthStore();
  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin';

  const { data: folders } = useTaskFolders();
  const { data: lists } = useTaskLists();
  const { data: tables } = useTaskTables();
  const createFolder = useCreateTaskFolder();
  const deleteFolder = useDeleteTaskFolder();
  const createList = useCreateTaskList();
  const deleteList = useDeleteTaskList();
  const createTable = useCreateTaskTable();
  const deleteTable = useDeleteTaskTable();

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [creatingListIn, setCreatingListIn] = useState<string | null>(null);
  const [newListName, setNewListName] = useState('');
  const [creatingTableIn, setCreatingTableIn] = useState<string | null>(null);
  const [newTableName, setNewTableName] = useState('');
  const [confirmDeleteFolder, setConfirmDeleteFolder] = useState<TaskFolder | null>(null);
  const [confirmDeleteList, setConfirmDeleteList] = useState<TaskListRow | null>(null);
  const [confirmDeleteTable, setConfirmDeleteTable] = useState<TaskTable | null>(null);

  const listsByFolder = new Map<string, TaskListRow[]>();
  for (const l of lists ?? []) {
    const arr = listsByFolder.get(l.folder_id) ?? [];
    arr.push(l);
    listsByFolder.set(l.folder_id, arr);
  }
  const tablesByFolder = new Map<string, TaskTable[]>();
  for (const tb of tables ?? []) {
    const arr = tablesByFolder.get(tb.folder_id) ?? [];
    arr.push(tb);
    tablesByFolder.set(tb.folder_id, arr);
  }

  const toggle = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const submitNewFolder = () => {
    const name = newFolderName.trim();
    if (!name || !profile?.id) return;
    createFolder.mutate(
      { name, createdBy: profile.id },
      {
        onSuccess: () => { setNewFolderName(''); setCreatingFolder(false); },
        onError: (err) => toast({ title: 'Could not create space', description: errorMessage(err), variant: 'destructive' }),
      },
    );
  };

  const submitNewList = (folderId: string) => {
    const name = newListName.trim();
    if (!name || !profile?.id) return;
    createList.mutate(
      { folderId, name, createdBy: profile.id },
      {
        onSuccess: () => { setNewListName(''); setCreatingListIn(null); },
        onError: (err) => toast({ title: 'Could not create list', description: errorMessage(err), variant: 'destructive' }),
      },
    );
  };

  const submitNewTable = (folderId: string) => {
    const name = newTableName.trim();
    if (!name || !profile?.id) return;
    createTable.mutate(
      { folderId, name, createdBy: profile.id },
      {
        onSuccess: () => { setNewTableName(''); setCreatingTableIn(null); },
        onError: (err) => toast({ title: 'Could not create table', description: errorMessage(err), variant: 'destructive' }),
      },
    );
  };

  const inputCls = cn('w-full h-7 rounded-md px-2 text-xs focus:outline-none focus:ring-1', t.input);
  const addBtnCls = cn('h-7 w-7 shrink-0 rounded-md flex items-center justify-center disabled:opacity-40', t.button);

  return (
    <div className="px-2 space-y-4">
      <nav className="space-y-0.5">
        {NAV_LINKS.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.end}
            onClick={onNavigate}
            className={({ isActive }) => cn(
              'flex items-center gap-2.5 rounded-lg px-2 py-[7px] text-xs-plus font-medium kd-transition',
              isActive ? t.linkActive : t.link,
            )}
          >
            {({ isActive }) => (
              <>
                <l.icon className={cn('h-[15px] w-[15px] shrink-0', isActive ? t.iconActive : t.icon)} />
                {l.label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="space-y-0.5">
        <div className="flex items-center justify-between px-2 pb-1">
          <span className={cn('text-3xs font-bold uppercase tracking-[0.14em]', t.heading)}>Spaces</span>
          {isAdmin && (
            <button type="button" aria-label="New space" onClick={() => setCreatingFolder(true)} className={t.muted}>
              <Plus className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {creatingFolder && (
          <div className="flex items-center gap-1 px-1 pb-1">
            <input
              autoFocus
              placeholder="Space name…"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submitNewFolder(); if (e.key === 'Escape') setCreatingFolder(false); }}
              className={inputCls}
            />
            <button type="button" className={addBtnCls} disabled={createFolder.isPending || !newFolderName.trim()} onClick={submitNewFolder}>
              {createFolder.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            </button>
          </div>
        )}

        {(folders ?? []).length === 0 && !creatingFolder && (
          <p className={cn('px-2 py-1 text-2xs', t.heading)}>
            {isAdmin ? 'No spaces yet — click + to add one.' : 'No spaces yet.'}
          </p>
        )}

        {(folders ?? []).map((folder) => {
          const isOpen = !collapsed.has(folder.id);
          const folderLists = listsByFolder.get(folder.id) ?? [];
          const folderTables = tablesByFolder.get(folder.id) ?? [];
          return (
            <div key={folder.id}>
              <div className={cn('group flex items-center gap-1.5 px-1.5 py-1 rounded-lg kd-transition', t.row)}>
                <button type="button" onClick={() => toggle(folder.id)} className={cn('shrink-0', t.icon)} aria-label={isOpen ? 'Collapse' : 'Expand'}>
                  {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                </button>
                <button type="button" onClick={() => toggle(folder.id)} className="flex-1 min-w-0 text-left text-xs-plus font-semibold truncate">
                  {folder.name}
                </button>
                {isAdmin && (
                  <button
                    type="button"
                    aria-label={`Delete space ${folder.name}`}
                    className="shrink-0 opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:text-destructive kd-transition"
                    onClick={() => setConfirmDeleteFolder(folder)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>

              {isOpen && (
                <div className="pl-5 space-y-0.5">
                  {folderLists.map((list) => (
                    <div key={list.id} className="group flex items-center gap-1">
                      <NavLink
                        to={`/task/list/${list.id}`}
                        onClick={onNavigate}
                        className={({ isActive }) => cn(
                          'flex-1 min-w-0 flex items-center gap-2 px-2 py-1 rounded-md text-xs kd-transition',
                          isActive ? t.linkActive : t.link,
                        )}
                      >
                        <ListChecks className="h-3 w-3 shrink-0 opacity-70" /> <span className="truncate">{list.name}</span>
                      </NavLink>
                      {isAdmin && (
                        <button type="button" aria-label={`Delete list ${list.name}`} className="shrink-0 opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:text-destructive kd-transition" onClick={() => setConfirmDeleteList(list)}>
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  ))}
                  {folderTables.map((tbl) => (
                    <div key={tbl.id} className="group flex items-center gap-1">
                      <NavLink
                        to={`/task/table/${tbl.id}`}
                        onClick={onNavigate}
                        className={({ isActive }) => cn(
                          'flex-1 min-w-0 flex items-center gap-2 px-2 py-1 rounded-md text-xs kd-transition',
                          isActive ? t.linkActive : t.link,
                        )}
                      >
                        <Table2 className="h-3 w-3 shrink-0 opacity-70" /> <span className="truncate">{tbl.name}</span>
                      </NavLink>
                      {isAdmin && (
                        <button type="button" aria-label={`Delete table ${tbl.name}`} className="shrink-0 opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:text-destructive kd-transition" onClick={() => setConfirmDeleteTable(tbl)}>
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  ))}

                  {isAdmin && creatingListIn !== folder.id && creatingTableIn !== folder.id && (
                    <div className="flex items-center gap-3 px-2 pt-0.5">
                      <button type="button" onClick={() => setCreatingListIn(folder.id)} className={cn('text-2xs', t.muted)}>+ Add list</button>
                      <button type="button" onClick={() => setCreatingTableIn(folder.id)} className={cn('text-2xs', t.muted)}>+ Add table</button>
                    </div>
                  )}
                  {creatingListIn === folder.id && (
                    <div className="flex items-center gap-1 pt-0.5">
                      <input
                        autoFocus
                        placeholder="List name…"
                        value={newListName}
                        onChange={(e) => setNewListName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') submitNewList(folder.id); if (e.key === 'Escape') setCreatingListIn(null); }}
                        className={inputCls}
                      />
                      <button type="button" className={addBtnCls} disabled={createList.isPending || !newListName.trim()} onClick={() => submitNewList(folder.id)}>
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                  {creatingTableIn === folder.id && (
                    <div className="flex items-center gap-1 pt-0.5">
                      <input
                        autoFocus
                        placeholder="Table name…"
                        value={newTableName}
                        onChange={(e) => setNewTableName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') submitNewTable(folder.id); if (e.key === 'Escape') setCreatingTableIn(null); }}
                        className={inputCls}
                      />
                      <button type="button" className={addBtnCls} disabled={createTable.isPending || !newTableName.trim()} onClick={() => submitNewTable(folder.id)}>
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <AlertDialog open={!!confirmDeleteFolder} onOpenChange={(open) => !open && setConfirmDeleteFolder(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete space?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes "{confirmDeleteFolder?.name}" and every list, table and task inside it. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (!confirmDeleteFolder) return;
                deleteFolder.mutate(confirmDeleteFolder.id, {
                  onError: (err) => toast({ title: 'Could not delete space', description: errorMessage(err), variant: 'destructive' }),
                });
                setConfirmDeleteFolder(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confirmDeleteList} onOpenChange={(open) => !open && setConfirmDeleteList(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete list?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes "{confirmDeleteList?.name}" and every task inside it. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (!confirmDeleteList) return;
                deleteList.mutate(confirmDeleteList.id, {
                  onError: (err) => toast({ title: 'Could not delete list', description: errorMessage(err), variant: 'destructive' }),
                });
                setConfirmDeleteList(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confirmDeleteTable} onOpenChange={(open) => !open && setConfirmDeleteTable(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete table?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes "{confirmDeleteTable?.name}" and every column and row inside it. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (!confirmDeleteTable) return;
                deleteTable.mutate(confirmDeleteTable.id, {
                  onError: (err) => toast({ title: 'Could not delete table', description: errorMessage(err), variant: 'destructive' }),
                });
                setConfirmDeleteTable(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

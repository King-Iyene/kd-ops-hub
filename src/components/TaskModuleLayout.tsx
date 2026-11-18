import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import {
  Home, Inbox, ListTodo, LayoutDashboard, Plus, ChevronDown, ChevronRight,
  ListChecks, Table2, Trash2, Loader2,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuthStore } from '@/store/authStore';
import { errorMessage } from '@/lib/db-errors';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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

export function TaskModuleLayout() {
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

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
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
  for (const t of tables ?? []) {
    const arr = tablesByFolder.get(t.folder_id) ?? [];
    arr.push(t);
    tablesByFolder.set(t.folder_id, arr);
  }

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
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
        onSuccess: (row) => { setNewFolderName(''); setCreatingFolder(false); setExpanded((p) => new Set(p).add(row.id)); },
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

  return (
    <div className="flex gap-4 -m-4 sm:-m-6 min-h-[calc(100vh-4rem)]">
      <aside className="w-56 shrink-0 border-r border-border/70 py-4 px-2 hidden md:flex flex-col gap-4 overflow-y-auto">
        <nav className="space-y-0.5">
          {NAV_LINKS.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) => cn(
                'flex items-center gap-2 px-2.5 py-1.5 rounded-md text-sm kd-transition',
                isActive ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
              )}
            >
              <l.icon className="h-4 w-4" /> {l.label}
            </NavLink>
          ))}
        </nav>

        <div className="space-y-1">
          <div className="flex items-center justify-between px-2.5">
            <span className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground/80">Spaces</span>
            {isAdmin && (
              <button type="button" onClick={() => setCreatingFolder(true)} className="text-muted-foreground/60 hover:text-foreground">
                <Plus className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {creatingFolder && (
            <div className="flex items-center gap-1 px-2">
              <Input
                autoFocus
                placeholder="Space name…"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') submitNewFolder(); if (e.key === 'Escape') setCreatingFolder(false); }}
                className="h-7 text-xs"
              />
              <Button size="icon" className="h-7 w-7 shrink-0" disabled={createFolder.isPending || !newFolderName.trim()} onClick={submitNewFolder}>
                {createFolder.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              </Button>
            </div>
          )}

          {(folders ?? []).map((folder) => {
            const isOpen = expanded.has(folder.id);
            const folderLists = listsByFolder.get(folder.id) ?? [];
            const folderTables = tablesByFolder.get(folder.id) ?? [];
            return (
              <div key={folder.id}>
                <div className="group flex items-center gap-1 px-1.5 py-1 rounded-md hover:bg-muted/50">
                  <button type="button" onClick={() => toggleExpanded(folder.id)} className="shrink-0 text-muted-foreground">
                    {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  </button>
                  <button type="button" onClick={() => toggleExpanded(folder.id)} className="flex-1 min-w-0 text-left text-sm truncate">
                    {folder.name}
                  </button>
                  {isAdmin && (
                    <button
                      type="button"
                      className="shrink-0 text-muted-foreground/0 group-hover:text-muted-foreground/50 hover:!text-destructive kd-transition"
                      onClick={() => setConfirmDeleteFolder(folder)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>

                {isOpen && (
                  <div className="pl-6 space-y-0.5">
                    {folderLists.map((list) => (
                      <div key={list.id} className="group flex items-center gap-1.5">
                        <NavLink
                          to={`/task/list/${list.id}`}
                          className={({ isActive }) => cn(
                            'flex-1 min-w-0 flex items-center gap-1.5 px-1.5 py-1 rounded-md text-xs truncate kd-transition',
                            isActive ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
                          )}
                        >
                          <ListChecks className="h-3 w-3 shrink-0" /> <span className="truncate">{list.name}</span>
                        </NavLink>
                        {isAdmin && (
                          <button type="button" className="shrink-0 text-muted-foreground/0 group-hover:text-muted-foreground/50 hover:!text-destructive" onClick={() => setConfirmDeleteList(list)}>
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    ))}
                    {folderTables.map((tbl) => (
                      <div key={tbl.id} className="group flex items-center gap-1.5">
                        <NavLink
                          to={`/task/table/${tbl.id}`}
                          className={({ isActive }) => cn(
                            'flex-1 min-w-0 flex items-center gap-1.5 px-1.5 py-1 rounded-md text-xs truncate kd-transition',
                            isActive ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
                          )}
                        >
                          <Table2 className="h-3 w-3 shrink-0" /> <span className="truncate">{tbl.name}</span>
                        </NavLink>
                        {isAdmin && (
                          <button type="button" className="shrink-0 text-muted-foreground/0 group-hover:text-muted-foreground/50 hover:!text-destructive" onClick={() => setConfirmDeleteTable(tbl)}>
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    ))}

                    {isAdmin && creatingListIn !== folder.id && creatingTableIn !== folder.id && (
                      <div className="flex items-center gap-2 pt-0.5">
                        <button type="button" onClick={() => setCreatingListIn(folder.id)} className="text-2xs text-muted-foreground/70 hover:text-foreground">+ Add list</button>
                        <button type="button" onClick={() => setCreatingTableIn(folder.id)} className="text-2xs text-muted-foreground/70 hover:text-foreground">+ Add table</button>
                      </div>
                    )}
                    {creatingListIn === folder.id && (
                      <div className="flex items-center gap-1 pt-0.5">
                        <Input
                          autoFocus
                          placeholder="List name…"
                          value={newListName}
                          onChange={(e) => setNewListName(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') submitNewList(folder.id); if (e.key === 'Escape') setCreatingListIn(null); }}
                          className="h-6 text-2xs"
                        />
                        <Button size="icon" className="h-6 w-6 shrink-0" disabled={createList.isPending || !newListName.trim()} onClick={() => submitNewList(folder.id)}>
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                    {creatingTableIn === folder.id && (
                      <div className="flex items-center gap-1 pt-0.5">
                        <Input
                          autoFocus
                          placeholder="Table name…"
                          value={newTableName}
                          onChange={(e) => setNewTableName(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') submitNewTable(folder.id); if (e.key === 'Escape') setCreatingTableIn(null); }}
                          className="h-6 text-2xs"
                        />
                        <Button size="icon" className="h-6 w-6 shrink-0" disabled={createTable.isPending || !newTableName.trim()} onClick={() => submitNewTable(folder.id)}>
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </aside>

      <div className="flex-1 min-w-0 p-4 sm:p-6">
        <Outlet />
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

export default TaskModuleLayout;

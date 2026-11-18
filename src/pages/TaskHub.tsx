import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Folder, ListChecks, Trash2, Loader2 } from 'lucide-react';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useToast } from '@/hooks/use-toast';
import { useAuthStore } from '@/store/authStore';
import { errorMessage } from '@/lib/db-errors';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { EmptyState } from '@/components/ui-kit/EmptyState';
import { TableSkeleton } from '@/components/ui-kit/TableSkeleton';
import {
  useTaskFolders,
  useTaskLists,
  useCreateTaskFolder,
  useDeleteTaskFolder,
  useCreateTaskList,
  useDeleteTaskList,
  type TaskFolder,
  type TaskListRow,
} from '@/queries/useTaskModule';

const TaskHub = () => {
  usePageTitle('Task');
  const { toast } = useToast();
  const { profile } = useAuthStore();
  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin';

  const { data: folders, isLoading: foldersLoading } = useTaskFolders();
  const { data: lists, isLoading: listsLoading } = useTaskLists();
  const createFolder = useCreateTaskFolder();
  const deleteFolder = useDeleteTaskFolder();
  const createList = useCreateTaskList();
  const deleteList = useDeleteTaskList();

  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [creatingListIn, setCreatingListIn] = useState<string | null>(null);
  const [newListName, setNewListName] = useState('');
  const [confirmDeleteFolder, setConfirmDeleteFolder] = useState<TaskFolder | null>(null);
  const [confirmDeleteList, setConfirmDeleteList] = useState<TaskListRow | null>(null);

  const listsByFolder = new Map<string, TaskListRow[]>();
  for (const l of lists ?? []) {
    const arr = listsByFolder.get(l.folder_id) ?? [];
    arr.push(l);
    listsByFolder.set(l.folder_id, arr);
  }

  const submitNewFolder = () => {
    const name = newFolderName.trim();
    if (!name || !profile?.id) return;
    createFolder.mutate(
      { name, createdBy: profile.id },
      {
        onSuccess: () => { setNewFolderName(''); setCreatingFolder(false); },
        onError: (err) => toast({ title: 'Could not create folder', description: errorMessage(err), variant: 'destructive' }),
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

  const loading = foldersLoading || listsLoading;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="kd-display text-2xl font-bold tracking-tight kd-text-gradient">Task Management</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Folders, lists and tasks for the whole team</p>
        </div>
        {isAdmin && !creatingFolder && (
          <Button size="sm" className="h-9" onClick={() => setCreatingFolder(true)}>
            <Plus className="mr-2 h-4 w-4" /> New Folder
          </Button>
        )}
      </div>

      {creatingFolder && (
        <Card className="border-border/70">
          <CardContent className="p-3 flex items-center gap-2">
            <Input
              autoFocus
              placeholder="Folder name…"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submitNewFolder(); if (e.key === 'Escape') setCreatingFolder(false); }}
              className="h-9"
            />
            <Button size="sm" className="h-9" disabled={createFolder.isPending || !newFolderName.trim()} onClick={submitNewFolder}>
              {createFolder.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create'}
            </Button>
            <Button size="sm" variant="ghost" className="h-9" onClick={() => { setCreatingFolder(false); setNewFolderName(''); }}>
              Cancel
            </Button>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <TableSkeleton rows={4} />
      ) : (folders ?? []).length === 0 ? (
        <EmptyState
          illustration="ghost"
          title="No folders yet"
          description={isAdmin ? 'Create a folder to start organizing lists for the team.' : 'An admin hasn’t set up any folders yet.'}
          action={isAdmin ? (
            <Button onClick={() => setCreatingFolder(true)}><Plus className="mr-2 h-4 w-4" /> New Folder</Button>
          ) : undefined}
        />
      ) : (
        <div className="space-y-3">
          {(folders ?? []).map((folder) => {
            const folderLists = listsByFolder.get(folder.id) ?? [];
            return (
              <Card key={folder.id} className="border-border/70">
                <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 space-y-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <Folder className="h-4 w-4 text-muted-foreground shrink-0" />
                    <h2 className="font-semibold text-sm truncate">{folder.name}</h2>
                  </div>
                  {isAdmin && (
                    <div className="flex items-center gap-1 shrink-0">
                      <Button size="sm" variant="outline" className="h-7 text-2xs" onClick={() => setCreatingListIn(folder.id)}>
                        <Plus className="mr-1 h-3 w-3" /> List
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => setConfirmDeleteFolder(folder)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </CardHeader>
                <CardContent className="pt-0 space-y-1">
                  {creatingListIn === folder.id && (
                    <div className="flex items-center gap-2 pb-2">
                      <Input
                        autoFocus
                        placeholder="List name…"
                        value={newListName}
                        onChange={(e) => setNewListName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') submitNewList(folder.id); if (e.key === 'Escape') setCreatingListIn(null); }}
                        className="h-8 text-sm"
                      />
                      <Button size="sm" className="h-8" disabled={createList.isPending || !newListName.trim()} onClick={() => submitNewList(folder.id)}>
                        {createList.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add'}
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8" onClick={() => { setCreatingListIn(null); setNewListName(''); }}>
                        Cancel
                      </Button>
                    </div>
                  )}
                  {folderLists.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-1">No lists yet{isAdmin ? ' — add one above.' : '.'}</p>
                  ) : (
                    <div className="divide-y divide-border/50">
                      {folderLists.map((list) => (
                        <div key={list.id} className="flex items-center justify-between gap-2 py-1.5 group">
                          <Link to={`/task/list/${list.id}`} className="flex items-center gap-2 min-w-0 text-sm hover:text-primary kd-transition">
                            <ListChecks className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span className="truncate">{list.name}</span>
                          </Link>
                          {isAdmin && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6 shrink-0 text-muted-foreground/40 hover:text-destructive opacity-0 group-hover:opacity-100 kd-transition"
                              onClick={() => setConfirmDeleteList(list)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <AlertDialog open={!!confirmDeleteFolder} onOpenChange={(open) => !open && setConfirmDeleteFolder(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete folder?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes "{confirmDeleteFolder?.name}" and every list and task inside it. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (!confirmDeleteFolder) return;
                deleteFolder.mutate(confirmDeleteFolder.id, {
                  onError: (err) => toast({ title: 'Could not delete folder', description: errorMessage(err), variant: 'destructive' }),
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
    </div>
  );
};

export default TaskHub;

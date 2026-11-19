import { useParams } from 'react-router-dom';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useToast } from '@/hooks/use-toast';
import { useAuthStore } from '@/store/authStore';
import { errorMessage } from '@/lib/db-errors';
import { TaskViews } from '@/features/task-module/TaskViews';
import {
  useAssignablePeople, useCreateTask, useTaskFolders, useTaskLists, useTasks,
  type TaskStatus,
} from '@/queries/useTaskModule';

const TaskListPage = () => {
  const { listId = '' } = useParams<{ listId: string }>();
  const { toast } = useToast();
  const { profile } = useAuthStore();
  const { data: lists } = useTaskLists();
  const { data: folders } = useTaskFolders();
  const { data: tasks, isLoading } = useTasks(listId);
  const { data: people } = useAssignablePeople();
  const createTask = useCreateTask();

  const list = (lists ?? []).find((l) => l.id === listId);
  const space = list ? (folders ?? []).find((f) => f.id === list.folder_id) : undefined;
  usePageTitle(list ? `${list.name} · Task` : 'Task');

  const addTask = (status: TaskStatus, title: string) =>
    createTask.mutateAsync({ listId, title, status, createdBy: profile?.id ?? '' }).catch((err) => {
      toast({ title: 'Could not add task', description: errorMessage(err), variant: 'destructive' });
      throw err;
    });

  return (
    <div className="space-y-3">
      <h1 className="text-lg font-bold tracking-tight">
        {space ? `${space.name} · ` : ''}{list?.name ?? 'List'}
      </h1>
      <TaskViews
        key={listId}
        tasks={tasks ?? []}
        mode="list"
        people={people ?? []}
        lists={lists ?? []}
        prefsKey={`list.${listId}`}
        defaultGroup="status"
        loading={isLoading}
        onAddTask={addTask}
      />
    </div>
  );
};

export default TaskListPage;

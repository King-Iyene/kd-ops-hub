import { useParams } from 'react-router-dom';
import { usePageTitle } from '@/hooks/usePageTitle';
import { TaskViews } from '@/features/task-module/TaskViews';
import { useAssignablePeople, useTaskFolders, useTaskLists, useTasks } from '@/queries/useTaskModule';

const TaskListPage = () => {
  const { listId = '' } = useParams<{ listId: string }>();
  const { data: lists } = useTaskLists();
  const { data: folders } = useTaskFolders();
  const { data: tasks, isLoading } = useTasks(listId);
  const { data: people } = useAssignablePeople();

  const list = (lists ?? []).find((l) => l.id === listId);
  const space = list ? (folders ?? []).find((f) => f.id === list.folder_id) : undefined;
  usePageTitle(list ? `${list.name} · Task` : 'Task');

  return (
    <div className="space-y-3">
      <h1 className="text-lg font-bold tracking-tight">
        {space ? `${space.name} · ` : ''}{list?.name ?? 'List'}
      </h1>
      {/* "+ Add task" under each group opens the New task dialog for this list. */}
      <TaskViews
        key={listId}
        tasks={tasks ?? []}
        mode="list"
        people={people ?? []}
        lists={lists ?? []}
        prefsKey={`list.${listId}`}
        defaultGroup="status"
        loading={isLoading}
        listId={listId}
      />
    </div>
  );
};

export default TaskListPage;

import { usePageTitle } from '@/hooks/usePageTitle';
import { useAuthStore } from '@/store/authStore';
import { TaskViews } from '@/features/task-module/TaskViews';
import { useAssignablePeople, useMyTasks, useTaskLists } from '@/queries/useTaskModule';

// Only ever the signed-in person's own tasks — there is deliberately no
// "whose tasks" filter on this page.
const TaskMyTasksPage = () => {
  usePageTitle('My Tasks');
  const { profile } = useAuthStore();
  const { data: tasks, isLoading } = useMyTasks(profile?.id ?? '');
  const { data: lists } = useTaskLists();
  const { data: people } = useAssignablePeople();

  return (
    <div className="space-y-3">
      <h1 className="text-lg font-bold tracking-tight">My Tasks</h1>
      <TaskViews
        tasks={tasks ?? []}
        mode="mine"
        people={people ?? []}
        lists={lists ?? []}
        prefsKey="my-tasks"
        defaultGroup="due"
        loading={isLoading}
      />
    </div>
  );
};

export default TaskMyTasksPage;

import { usePageTitle } from '@/hooks/usePageTitle';
import { useAuthStore } from '@/store/authStore';
import { useTaskFolders, useMyTasks, STATUS_META } from '@/queries/useTaskModule';

const TaskHub = () => {
  usePageTitle('Task');
  const { profile } = useAuthStore();
  const { data: folders } = useTaskFolders();
  const { data: myTasks } = useMyTasks(profile?.id ?? '');

  const openCount = (myTasks ?? []).filter((t) => t.status !== 'done').length;
  const firstName = profile?.full_name?.split(' ')[0] || 'there';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="kd-display text-2xl font-bold tracking-tight kd-text-gradient">
          {new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 18 ? 'Good afternoon' : 'Good evening'}, {firstName}
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {openCount > 0
            ? `You have ${openCount} open task${openCount === 1 ? '' : 's'} across the team.`
            : 'You’re all caught up.'}
        </p>
      </div>

      {(folders ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No Spaces yet — an admin can create one from the sidebar to start organizing lists and tables.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {Object.entries(STATUS_META).map(([status, meta]) => {
            const count = (myTasks ?? []).filter((t) => t.status === status).length;
            return (
              <div key={status} className="rounded-lg border border-border/70 px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
                  <span className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">{meta.label}</span>
                </div>
                <p className="text-2xl font-bold tabular-nums mt-1">{count}</p>
                <p className="text-2xs text-muted-foreground">assigned to you</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default TaskHub;

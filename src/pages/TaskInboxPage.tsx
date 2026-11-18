import { usePageTitle } from '@/hooks/usePageTitle';
import { EmptyState } from '@/components/ui-kit/EmptyState';

const TaskInboxPage = () => {
  usePageTitle('Inbox');
  return (
    <div className="space-y-4">
      <h1 className="kd-display text-2xl font-bold tracking-tight kd-text-gradient">Inbox</h1>
      <EmptyState
        illustration="ghost"
        title="You're all caught up"
        description="Mentions, assignments and comments on your tasks will show up here. This is coming in a later phase."
      />
    </div>
  );
};

export default TaskInboxPage;

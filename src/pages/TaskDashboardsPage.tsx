import { usePageTitle } from '@/hooks/usePageTitle';
import { EmptyState } from '@/components/ui-kit/EmptyState';

const TaskDashboardsPage = () => {
  usePageTitle('Dashboards');
  return (
    <div className="space-y-4">
      <h1 className="kd-display text-2xl font-bold tracking-tight kd-text-gradient">Dashboards</h1>
      <EmptyState
        illustration="satellite"
        title="Dashboards are coming next"
        description="Workload by person, overdue tracking, and completion charts are planned for the next phase of this module."
      />
    </div>
  );
};

export default TaskDashboardsPage;

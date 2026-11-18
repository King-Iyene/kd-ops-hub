import { useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { EmptyState } from '../components/EmptyState';
import { SpaceOverviewMenu } from '../spaces/SpaceOverviewMenu';
import { useCanManageSpace, useSpace } from '../api/spaces';
import { isTaskAdmin, useTaskRole } from '../api/workspace';

export default function SpaceOverview() {
  const { spaceId } = useParams<{ spaceId: string }>();
  const { data: space, isLoading } = useSpace(spaceId);
  const { data: role } = useTaskRole();
  const canManage = useCanManageSpace(spaceId, isTaskAdmin(role));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!space) {
    return <EmptyState title="Not found" description="This space does not exist, or you do not have access to it." />;
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-3 mb-1">
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className="h-6 w-6 rounded-md flex items-center justify-center text-xs font-bold text-white shrink-0"
            style={{ backgroundColor: space.color }}
          >
            {space.name.charAt(0).toUpperCase()}
          </span>
          <h1 className="text-lg font-semibold text-foreground truncate">{space.name}</h1>
        </div>
        <SpaceOverviewMenu space={space} canManage={canManage} />
      </div>

      {space.archived_at && (
        <div className="mb-4 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          This space is archived.
        </div>
      )}

      <div className="rounded-lg border border-border">
        <EmptyState
          title="This space is empty."
          description="Create a list to track tasks, or a table to collect structured data."
        />
      </div>
    </div>
  );
}

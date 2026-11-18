import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '../components/EmptyState';
import { SpaceOverviewMenu } from '../spaces/SpaceOverviewMenu';
import { useCanManageSpace, useSpace } from '../api/spaces';
import { useLists } from '../api/lists';
import { isTaskAdmin, useTaskRole } from '../api/workspace';
import { CreateListDialog } from '../lists/CreateListDialog';

export default function SpaceOverview() {
  const { spaceId } = useParams<{ spaceId: string }>();
  const navigate = useNavigate();
  const { data: space, isLoading } = useSpace(spaceId);
  const { data: lists } = useLists(spaceId);
  const { data: role } = useTaskRole();
  const canManage = useCanManageSpace(spaceId, isTaskAdmin(role));
  const [createListOpen, setCreateListOpen] = useState(false);

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

      {lists && lists.length > 0 ? (
        <div className="rounded-lg border border-border divide-y divide-border">
          {lists.map((list) => (
            <button
              key={list.id}
              onClick={() => navigate(`/task/l/${list.id}`)}
              className="w-full flex items-center px-4 py-3 text-sm text-foreground hover:bg-muted/40 kd-transition text-left"
            >
              {list.name}
            </button>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-border">
          <EmptyState
            title="This space is empty."
            description="Create a list to track tasks, or a table to collect structured data."
            action={canManage && (
              <Button size="sm" onClick={() => setCreateListOpen(true)}>
                <Plus className="h-3.5 w-3.5 mr-1.5" /> Add list
              </Button>
            )}
          />
        </div>
      )}

      {spaceId && <CreateListDialog spaceId={spaceId} open={createListOpen} onOpenChange={setCreateListOpen} />}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '../components/EmptyState';
import { CreateSpaceDialog } from '../spaces/CreateSpaceDialog';
import { useActiveSpaces } from '../api/spaces';
import { isTaskAdmin, useTaskRole } from '../api/workspace';

export default function TaskLanding() {
  const navigate = useNavigate();
  const { data: spaces, isLoading } = useActiveSpaces();
  const { data: role } = useTaskRole();
  const [createOpen, setCreateOpen] = useState(false);
  const canCreate = isTaskAdmin(role);

  useEffect(() => {
    if (spaces && spaces.length > 0) {
      navigate(`/task/s/${spaces[0].id}`, { replace: true });
    }
  }, [spaces, navigate]);

  if (isLoading || (spaces && spaces.length > 0)) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
      <EmptyState
        title="No spaces yet."
        description={canCreate ? 'Click + to create your first space.' : 'Ask an admin to create one.'}
        action={canCreate && (
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Create space
          </Button>
        )}
      />
      <CreateSpaceDialog open={createOpen} onOpenChange={setCreateOpen} />
    </>
  );
}

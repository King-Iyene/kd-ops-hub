import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useActiveSpaces, useCanManageSpace, type TaskSpace } from '../api/spaces';
import { useLists } from '../api/lists';
import { isTaskAdmin, useTaskRole } from '../api/workspace';
import { CreateSpaceDialog } from '../spaces/CreateSpaceDialog';
import { CreateListDialog } from '../lists/CreateListDialog';

function MobileSpaceItem({
  space,
  isExpanded,
  isAdmin,
  active,
  onToggle,
  onNavigate,
}: {
  space: TaskSpace;
  isExpanded: boolean;
  isAdmin: boolean;
  active: boolean;
  onToggle: () => void;
  onNavigate: () => void;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { data: lists } = useLists(space.id);
  const canManage = useCanManageSpace(space.id, isAdmin);
  const [createListOpen, setCreateListOpen] = useState(false);

  return (
    <div>
      <div
        onClick={onNavigate}
        className={cn(
          'w-full flex items-center gap-2 rounded-lg px-2 py-2 text-sm',
          active ? 'bg-primary/10 text-primary font-medium' : 'text-foreground',
        )}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          aria-label={isExpanded ? 'Collapse' : 'Expand'}
          className="shrink-0 text-muted-foreground"
        >
          {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
        <span
          className="h-4 w-4 rounded-sm flex items-center justify-center text-[9px] font-bold text-white shrink-0"
          style={{ backgroundColor: space.color }}
        >
          {space.name.charAt(0).toUpperCase()}
        </span>
        <span className="flex-1 truncate">{space.name}</span>
      </div>

      {isExpanded && (
        <div className="ml-6 pl-2 border-l border-border space-y-0.5 mt-0.5">
          {(lists ?? []).map((list) => {
            const listActive = location.pathname === `/task/l/${list.id}`;
            return (
              <button
                key={list.id}
                onClick={() => navigate(`/task/l/${list.id}`)}
                className={cn(
                  'w-full text-left rounded-lg px-2 py-1.5 text-sm truncate',
                  listActive ? 'bg-primary/10 text-primary font-medium' : 'text-foreground',
                )}
              >
                {list.name}
              </button>
            );
          })}
          {canManage && (
            <button
              onClick={() => setCreateListOpen(true)}
              className="w-full flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-muted-foreground"
            >
              <Plus className="h-3 w-3" /> Add list
            </button>
          )}
        </div>
      )}

      <CreateListDialog spaceId={space.id} open={createListOpen} onOpenChange={setCreateListOpen} />
    </div>
  );
}

/** The Task hub's content inside MobileNav's "More" bottom-sheet accordion
 *  — same data and structure as the desktop TaskSidebarPanel, in the plain
 *  anchor/button idiom the rest of that sheet already uses. */
export function TaskMobilePanel({ onNavigate }: { onNavigate: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { data: spaces, isLoading } = useActiveSpaces();
  const { data: role } = useTaskRole();
  const canCreate = isTaskAdmin(role);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    const match = location.pathname.match(/^\/task\/s\/([^/]+)/);
    if (match) setExpanded((prev) => ({ ...prev, [match[1]]: true }));
  }, [location.pathname]);

  const go = (url: string) => {
    onNavigate();
    navigate(url);
  };

  return (
    <div className="space-y-2 px-1.5 pb-1.5">
      <div className="flex items-center justify-between px-1.5">
        <span className="text-3xs font-bold uppercase tracking-[0.14em] text-muted-foreground/60">Spaces</span>
        {canCreate && (
          <button onClick={() => setCreateOpen(true)} aria-label="Add space" className="text-muted-foreground hover:text-foreground">
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {isLoading ? null : spaces && spaces.length > 0 ? (
        <div className="space-y-0.5">
          {spaces.map((space) => (
            <MobileSpaceItem
              key={space.id}
              space={space}
              isExpanded={!!expanded[space.id]}
              isAdmin={canCreate}
              active={location.pathname === `/task/s/${space.id}`}
              onToggle={() => setExpanded((prev) => ({ ...prev, [space.id]: !prev[space.id] }))}
              onNavigate={() => { setExpanded((prev) => ({ ...prev, [space.id]: true })); go(`/task/s/${space.id}`); }}
            />
          ))}
        </div>
      ) : (
        <div className="px-2 py-1">
          <p className="text-xs text-muted-foreground">No spaces yet.</p>
          <p className="text-xs text-muted-foreground/70 mt-0.5">
            {canCreate ? 'Click + to create your first space.' : 'Ask an admin to create one.'}
          </p>
        </div>
      )}

      <CreateSpaceDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

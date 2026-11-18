import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CheckCircle2, ChevronDown, ChevronRight, Clock, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useActiveSpaces } from '../api/spaces';
import { isTaskAdmin, useTaskRole } from '../api/workspace';
import { CreateSpaceDialog } from '../spaces/CreateSpaceDialog';

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
      <div className="inline-flex rounded-lg border border-border p-0.5 bg-muted/40 w-full">
        <button className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium bg-background shadow-sm text-foreground">
          <CheckCircle2 className="h-3.5 w-3.5" /> Task
        </button>
        <button
          onClick={() => go('/timetrack')}
          className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium text-muted-foreground"
        >
          <Clock className="h-3.5 w-3.5" /> Track
        </button>
      </div>

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
          {spaces.map((space) => {
            const isExpanded = !!expanded[space.id];
            const active = location.pathname === `/task/s/${space.id}`;
            return (
              <div key={space.id}>
                <div
                  onClick={() => {
                    setExpanded((prev) => ({ ...prev, [space.id]: true }));
                    go(`/task/s/${space.id}`);
                  }}
                  className={cn(
                    'w-full flex items-center gap-2 rounded-lg px-2 py-2 text-sm',
                    active ? 'bg-primary/10 text-primary font-medium' : 'text-foreground',
                  )}
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpanded((prev) => ({ ...prev, [space.id]: !prev[space.id] }));
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
              </div>
            );
          })}
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

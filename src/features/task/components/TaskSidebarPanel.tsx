import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, LogOut, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar';
import { SIDEBAR_HUBS } from '@/lib/navConfig';
import { useActiveSpaces } from '../api/spaces';
import { isTaskAdmin, useTaskRole } from '../api/workspace';
import { CreateSpaceDialog } from '../spaces/CreateSpaceDialog';

const TASK_HUB = SIDEBAR_HUBS.find((h) => h.key === 'task')!;

export function TaskSidebarPanel({ onBack, onSignOut }: { onBack: () => void; onSignOut: () => void }) {
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

  return (
    <Sidebar collapsible="icon">
      {/* Same header shape every other hub uses (icon, label, description)
          — not the workspace name, and no Task/Track switch: KD Ops's own
          hub picker (the back chevron below) already gets you to Track. */}
      <div className="px-3 pt-3.5 pb-2 border-b border-sidebar-border/40">
        <button
          onClick={onBack}
          className="flex items-center gap-2.5 px-1.5 py-1.5 rounded-lg w-full text-left kd-transition hover:bg-white/[0.06] group/back"
        >
          <ChevronLeft className="h-3.5 w-3.5 text-sidebar-foreground/40 group-hover/back:text-sidebar-foreground/70 kd-transition shrink-0" />
          <div className="h-7 w-7 flex items-center justify-center shrink-0">
            <CheckCircle2 className={cn('h-4 w-4', TASK_HUB.color)} />
          </div>
          <div className="min-w-0">
            <p className="text-xs-plus font-semibold text-sidebar-primary leading-none tracking-tight">
              {TASK_HUB.label}
            </p>
            <p className="text-3xs text-sidebar-foreground/40 mt-0.5 leading-none truncate">
              {TASK_HUB.description}
            </p>
          </div>
        </button>
      </div>

      <SidebarContent className="pt-2 pb-2 px-2">
        <div className="flex items-center justify-between px-1.5 mb-1">
          <span className="text-3xs font-bold uppercase tracking-[0.14em] text-sidebar-foreground/35">Spaces</span>
          {canCreate && (
            <button
              onClick={() => setCreateOpen(true)}
              aria-label="Add space"
              className="text-sidebar-foreground/40 hover:text-sidebar-foreground/80 kd-transition"
            >
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
                    className={cn(
                      'w-full flex items-center gap-1.5 rounded-md px-1.5 py-1.5 text-xs-plus kd-transition cursor-pointer',
                      active ? 'bg-white/[0.11] text-sidebar-primary' : 'text-sidebar-foreground/75 hover:bg-white/[0.06]',
                    )}
                    onClick={() => {
                      setExpanded((prev) => ({ ...prev, [space.id]: true }));
                      navigate(`/task/s/${space.id}`);
                    }}
                  >
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpanded((prev) => ({ ...prev, [space.id]: !prev[space.id] }));
                      }}
                      aria-label={isExpanded ? 'Collapse' : 'Expand'}
                      className="shrink-0 text-sidebar-foreground/40 hover:text-sidebar-foreground/70"
                    >
                      {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    </button>
                    <span
                      className="h-4 w-4 rounded-sm flex items-center justify-center text-[9px] font-bold text-white shrink-0"
                      style={{ backgroundColor: space.color }}
                    >
                      {space.name.charAt(0).toUpperCase()}
                    </span>
                    <span className="flex-1 truncate">{space.name}</span>
                  </div>
                  {isExpanded && <div className="ml-[22px] pl-2 border-l border-sidebar-border/30" />}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="px-1.5 py-1">
            <p className="text-3xs text-sidebar-foreground/40">No spaces yet.</p>
            <p className="text-3xs text-sidebar-foreground/30 mt-0.5">
              {canCreate ? 'Click + to create your first space.' : 'Ask an admin to create one.'}
            </p>
          </div>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border/40 pt-1.5 pb-2.5 px-2">
        <SidebarMenu>
          <SidebarMenuItem className="list-none">
            <SidebarMenuButton
              onClick={onSignOut}
              className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-xs-plus font-medium text-sidebar-foreground/55 hover:bg-destructive/10 hover:text-destructive kd-transition w-full"
            >
              <LogOut className="h-3.5 w-3.5 shrink-0" />
              <span>Sign Out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />

      <CreateSpaceDialog open={createOpen} onOpenChange={setCreateOpen} />
    </Sidebar>
  );
}

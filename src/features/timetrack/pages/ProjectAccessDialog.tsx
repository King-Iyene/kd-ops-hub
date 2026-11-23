import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Users } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/db-errors';
import { useToast } from '@/hooks/use-toast';
import { useActiveEmployees } from '@/queries/useEmployees';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { TimeProject } from '../lib/types';

// The new table and functions are not in the generated types until the next sync, so they are called through this narrow shape.
type Untyped = {
  from: (t: string) => { select: (c: string) => { eq: (c: string, v: string) => Promise<{ data: { employee_id: string }[] | null; error: { message?: string } | null }> } };
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>;
};
const db = () => supabase as unknown as Untyped;

export const MEMBERS_KEY = ['timetrack', 'project-members'] as const;

/** Who is assigned to each project (admins see all of it; a project manager sees their own projects). */
export async function fetchProjectMembers(projectId: string): Promise<string[]> {
  const { data, error } = await db().from('time_project_members').select('employee_id').eq('project_id', projectId);
  if (error) throw new Error(error.message ?? 'Could not load the assigned people');
  return (data ?? []).map((r) => r.employee_id);
}

/**
 * Assign people to a project and choose whether only they (and the project manager) see it in the time tracker.
 * Everyone keeps seeing the projects that were there before; nothing changes for a project until this is switched on for it.
 */
export function ProjectAccessDialog({ project, open, onOpenChange }: { project: TimeProject | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: employees } = useActiveEmployees();
  const projectId = project?.id ?? '';
  const { data: current, isLoading } = useQuery({
    queryKey: [...MEMBERS_KEY, projectId],
    queryFn: () => fetchProjectMembers(projectId),
    enabled: open && !!projectId,
  });
  const [assignedOnly, setAssignedOnly] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  // load once per opening: from the project and the saved list (never written back from here)
  useEffect(() => {
    if (!open || !project) return;
    setAssignedOnly(project.assigned_only ?? false);
    setSearch('');
    setNote(null);
  }, [open, project]);
  useEffect(() => { if (open && current) setSelected(new Set(current)); }, [open, current]);

  const people = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (employees ?? []).filter((e) => !q || e.full_name.toLowerCase().includes(q));
  }, [employees, search]);

  const toggle = (id: string, on: boolean) => setSelected((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });

  const addRecent = async (auto = false) => {
    if (!projectId) return;
    const { data, error } = await db().rpc('time_project_recent_trackers', { p_project: projectId });
    if (error) { if (!auto) toast({ title: 'Could not load recent trackers', description: error.message, variant: 'destructive' }); return; }
    const ids = (Array.isArray(data) ? data : []).map(String);
    setSelected((s) => new Set([...s, ...ids]));
    setNote(ids.length ? `Added the ${ids.length} ${ids.length === 1 ? 'person' : 'people'} who tracked time on this project in the last 90 days. Remove anyone who should not see it.` : 'Nobody tracked time on this project in the last 90 days.');
  };

  // Switching it on for a project people already use: start from the people who track on it, so nobody loses it by surprise.
  const onSwitch = (on: boolean) => {
    setAssignedOnly(on);
    if (on && !(project?.assigned_only ?? false) && selected.size === 0) void addRecent(true);
  };

  const save = async () => {
    if (!projectId) return;
    setSaving(true);
    try {
      const { error } = await db().rpc('time_project_set_access', { p_project: projectId, p_assigned_only: assignedOnly, p_employee_ids: [...selected] });
      if (error) throw new Error(error.message ?? 'Could not save');
      toast({ title: assignedOnly ? `Only assigned people see "${project?.name}"` : `Everyone sees "${project?.name}"` });
      qc.invalidateQueries({ queryKey: ['timetrack', 'projects'] });
      qc.invalidateQueries({ queryKey: ['timetrack', 'all-tasks'] });
      qc.invalidateQueries({ queryKey: MEMBERS_KEY });
      onOpenChange(false);
    } catch (err) {
      toast({ title: 'Could not save', description: errorMessage(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="project-access">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Users className="h-4 w-4" /> People on {project?.name ?? 'project'}</DialogTitle>
          <DialogDescription>Choose who sees this project in the time tracker. The project manager and admins always do.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex items-start gap-3 rounded-md border p-3">
            <Switch id="assigned-only" checked={assignedOnly} onCheckedChange={onSwitch} data-testid="assigned-only-switch" />
            <div className="min-w-0">
              <Label htmlFor="assigned-only">Only assigned people see this project</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                {assignedOnly
                  ? 'Anyone not on the list below will not find it when they start a timer. Time already tracked on it stays in their timesheets and reports.'
                  : 'Off: everyone sees this project in the time tracker, whoever is on the list.'}
              </p>
            </div>
          </div>
          {assignedOnly && selected.size === 0 && !isLoading && (
            <p className="text-xs text-amber-600 dark:text-amber-400" data-testid="nobody-assigned">Nobody is assigned yet: only the project manager and admins will see this project.</p>
          )}
          {note && <p className="text-xs text-muted-foreground" data-testid="access-note">{note}</p>}
          <div className="flex items-center gap-2">
            <Input placeholder="Search people" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search people" className="h-8" />
            <Button type="button" variant="outline" size="sm" onClick={() => void addRecent()} className="shrink-0">Add recent trackers</Button>
          </div>
          <div className="max-h-64 overflow-y-auto rounded-md border divide-y" role="group" aria-label="Assigned people">
            {isLoading ? (
              <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
            ) : people.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">No one found.</p>
            ) : people.map((e) => (
              <label key={e.id} className="flex items-center gap-2.5 px-3 py-2 text-sm cursor-pointer hover:bg-muted/50">
                <Checkbox checked={selected.has(e.id)} onCheckedChange={(c) => toggle(e.id, c === true)} aria-label={e.full_name} />
                <span className="flex-1 truncate">{e.full_name}</span>
                {e.id === project?.manager_id && <span className="text-2xs text-muted-foreground">project manager</span>}
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground tabular-nums">{selected.size} assigned</p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving || isLoading}>{saving && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

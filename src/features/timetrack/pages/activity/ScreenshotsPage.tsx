import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Loader2, Image as ImageIcon, Trash2, CheckSquare } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/db-errors';
import { useToast } from '@/hooks/use-toast';
import { useActiveEmployees } from '@/queries/useEmployees';
import { useTimetrackCapabilities } from '../../lib/capabilities';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface ScreenshotRow { id: string; employee_id: string; storage_path: string; captured_at: string }

/** TimeCamp's "Screenshots" report. Thumbnails are loaded lazily via short-lived signed URLs from
 * the private timetrack-screenshots bucket — never public, matching the RLS on time_screenshots. */
export default function ScreenshotsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { has } = useTimetrackCapabilities();
  const canManage = has('manage_activity_tracking');
  const { data: employees } = useActiveEmployees();
  const [employeeId, setEmployeeId] = useState('');
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data: retentionDays } = useQuery({
    queryKey: ['timetrack', 'agent-retention', employeeId],
    queryFn: async () => {
      if (!employeeId) return null;
      const { data } = await supabase.from('time_agent_settings').select('retention_days').eq('employee_id', employeeId).maybeSingle();
      return data?.retention_days ?? 30;
    },
  });

  const { data: rows, isLoading } = useQuery({
    queryKey: ['timetrack', 'screenshots', employeeId],
    queryFn: async () => {
      let q = supabase.from('time_screenshots').select('id, employee_id, storage_path, captured_at').order('captured_at', { ascending: false }).limit(60);
      if (employeeId) q = q.eq('employee_id', employeeId);
      const { data, error } = await q;
      if (error) throw error;
      return data as ScreenshotRow[];
    },
  });

  useEffect(() => {
    setSelected(new Set());
  }, [employeeId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const pending = (rows ?? []).filter((r) => !urls[r.id]);
      if (pending.length === 0) return;
      const entries = await Promise.all(pending.map(async (r) => {
        const { data } = await supabase.storage.from('timetrack-screenshots').createSignedUrl(r.storage_path, 300);
        return [r.id, data?.signedUrl ?? ''] as const;
      }));
      if (!cancelled) setUrls((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleAll = () => {
    setSelected((prev) => (prev.size === (rows ?? []).length ? new Set() : new Set((rows ?? []).map((r) => r.id))));
  };

  const removeSelected = async () => {
    try {
      const toRemove = (rows ?? []).filter((r) => selected.has(r.id));
      if (toRemove.length === 0) return;
      const { error: storageErr } = await supabase.storage.from('timetrack-screenshots').remove(toRemove.map((r) => r.storage_path));
      if (storageErr) throw storageErr;
      const { error } = await supabase.from('time_screenshots').delete().in('id', toRemove.map((r) => r.id));
      if (error) throw error;
      toast({ title: `Removed ${toRemove.length} screenshot${toRemove.length === 1 ? '' : 's'}` });
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ['timetrack', 'screenshots'] });
    } catch (err) {
      toast({ title: 'Could not remove screenshots', description: errorMessage(err), variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-3 sm:space-y-6">
      <PageHeader title="Screenshots" description="Captured only for employees with screenshots enabled under Agent & policy" icon={ImageIcon} />

      {employeeId && retentionDays != null && (
        <div className="rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          Screenshots for this employee are kept for <strong>{retentionDays} days</strong>, then deleted automatically. Use the retention setting under Agent &amp; policy to change this.
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Select value={employeeId} onValueChange={setEmployeeId}>
          <SelectTrigger className="w-64"><SelectValue placeholder="All employees" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">All employees</SelectItem>
            {(employees ?? []).map((e) => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}
          </SelectContent>
        </Select>

        {canManage && (rows ?? []).length > 0 && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={toggleAll}>
              <CheckSquare className="h-3.5 w-3.5 mr-1.5" />
              {selected.size === (rows ?? []).length ? 'Deselect all' : 'Toggle all checkboxes'}
            </Button>
            {selected.size > 0 && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm"><Trash2 className="h-3.5 w-3.5 mr-1.5" /> Remove selected ({selected.size})</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Remove {selected.size} screenshot{selected.size === 1 ? '' : 's'}?</AlertDialogTitle>
                    <AlertDialogDescription>This permanently deletes the selected screenshots. This cannot be undone.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={removeSelected} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Remove</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        )}
      </div>

      {isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {(rows ?? []).map((r) => (
            <div key={r.id} className={`relative rounded-md border overflow-hidden ${selected.has(r.id) ? 'border-primary ring-1 ring-primary' : 'border-border/60'}`}>
              {canManage && (
                <div className="absolute top-1.5 left-1.5 z-10 bg-background/80 rounded">
                  <Checkbox checked={selected.has(r.id)} onCheckedChange={() => toggleOne(r.id)} />
                </div>
              )}
              {urls[r.id] ? (
                <img src={urls[r.id]} alt="" className="w-full aspect-video object-cover bg-muted" loading="lazy" />
              ) : (
                <div className="w-full aspect-video bg-muted flex items-center justify-center"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
              )}
              <div className="p-2 text-xs text-muted-foreground flex items-center justify-between">
                <span>{employees?.find((e) => e.id === r.employee_id)?.full_name ?? r.employee_id}</span>
                <span>{format(new Date(r.captured_at), 'MMM d, HH:mm')}</span>
              </div>
            </div>
          ))}
          {(rows ?? []).length === 0 && (
            <p className="col-span-full text-center text-muted-foreground py-6">
              No screenshots yet — only captured when an employee has screenshots enabled under Agent &amp; policy.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
